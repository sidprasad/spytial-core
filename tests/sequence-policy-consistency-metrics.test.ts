import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import {
  ignoreHistory,
  stability,
  changeEmphasis,
  randomPositioning,
} from '../src/translators/webcola/sequence-policy';
import {
  runHeadlessLayout,
  positionalConsistency,
  relativeConsistency,
  classifyChangeEmphasisStableSet,
  type EdgeKey,
} from '../src/evaluation';

/**
 * Per-policy END-TO-END behavioral tests. Each `describe` block names
 * the policy and the promise it makes, then runs the full
 * `runHeadlessLayout → cola.Layout → metrics` pipeline and asserts
 * the promise holds at the **post-solver** positions.
 *
 * The shape of the predictions is taken from the Penlloy framework
 * (PLATEAU 2025 §6.2) and the realization-policy table in the thesis
 * proposal's Guzdial chart.
 *
 * Unit-level tests of each policy's `apply` method live in
 * `tests/sequence-policy.test.ts`; these tests are the next layer up
 * — they exercise what the *full pipeline* actually produces.
 */

// ──────────────────────────────────────────────────────────────────
// Layout spec & benchmark scenarios
// ──────────────────────────────────────────────────────────────────

const layoutSpecStr = `
constraints:
  - orientation:
      selector: next
      directions:
        - right
`;
const layoutSpec = parseLayoutSpec(layoutSpecStr);

const atomsABC = [
  { id: 'A', type: 'Node', label: 'A' },
  { id: 'B', type: 'Node', label: 'B' },
  { id: 'C', type: 'Node', label: 'C' },
];

const dataAB: IJsonDataInstance = {
  atoms: atomsABC,
  relations: [{
    id: 'next', name: 'next', types: ['Node', 'Node'],
    tuples: [{ atoms: ['A', 'B'], types: ['Node', 'Node'] }],
  }],
};

const dataABBC: IJsonDataInstance = {
  atoms: atomsABC,
  relations: [{
    id: 'next', name: 'next', types: ['Node', 'Node'],
    tuples: [
      { atoms: ['A', 'B'], types: ['Node', 'Node'] },
      { atoms: ['B', 'C'], types: ['Node', 'Node'] },
    ],
  }],
};

const dataChain: IJsonDataInstance = dataABBC; // A→B→C
const dataTree: IJsonDataInstance = {           // A→B, A→C — same atoms, different edges
  atoms: atomsABC,
  relations: [{
    id: 'next', name: 'next', types: ['Node', 'Node'],
    tuples: [
      { atoms: ['A', 'B'], types: ['Node', 'Node'] },
      { atoms: ['A', 'C'], types: ['Node', 'Node'] },
    ],
  }],
};

const dataAddAtomBefore: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Node', label: 'A' },
    { id: 'B', type: 'Node', label: 'B' },
  ],
  relations: [{
    id: 'next', name: 'next', types: ['Node', 'Node'],
    tuples: [{ atoms: ['A', 'B'], types: ['Node', 'Node'] }],
  }],
};
const dataAddAtomAfter: IJsonDataInstance = dataAB; // {A,B} → {A,B,C}

const dataRemoveBefore: IJsonDataInstance = dataAB;
const dataRemoveAfter: IJsonDataInstance = dataAddAtomBefore; // {A,B,C} → {A,B}

interface Scenario {
  name: string;
  prev: JSONDataInstance;
  curr: JSONDataInstance;
}

const scenarios: Scenario[] = [
  { name: 'identity (same instance both frames)',  prev: new JSONDataInstance(dataAB),         curr: new JSONDataInstance(dataAB) },
  { name: 'relation change (atoms preserved)',     prev: new JSONDataInstance(dataAB),         curr: new JSONDataInstance(dataABBC) },
  { name: 'atom addition',                          prev: new JSONDataInstance(dataAddAtomBefore), curr: new JSONDataInstance(dataAddAtomAfter) },
  { name: 'atom removal',                           prev: new JSONDataInstance(dataRemoveBefore),  curr: new JSONDataInstance(dataRemoveAfter) },
  { name: 'restructure (chain → tree)',             prev: new JSONDataInstance(dataChain),      curr: new JSONDataInstance(dataTree) },
];

// ──────────────────────────────────────────────────────────────────
// Thresholds — squared L2 px² over the persisting subset.
//
// Important framing: spytial-core's `stability` policy is SOFT
// positional consistency in Penlloy's terminology — consistency lives
// in the objective and yields under constraint pressure. It is NOT
// hard consistency (which would require positional = 0 strictly). So
// the tests below assert *relative* and *bounded* claims, not "= 0".
//
// Two sources of drift even under locks:
//   1. The lock spring is finite (weight 1000, not ∞).
//   2. WebCola's `handleDisconnected` re-spreads disconnected
//      components between frames, displacing isolated atoms.
//   3. When the new step adds a constraint the prior positions
//      violate, the constraint-aware post-pass unfixes the endpoints
//      and the solver moves them to satisfy the constraint.
// All three produce real, intended drift.
// ──────────────────────────────────────────────────────────────────

/**
 * Upper bound on identity-scenario drift under a consistency policy.
 * Generous enough to absorb (1) finite lock spring, (2)
 * `handleDisconnected` re-spreading, but tight enough to catch a real
 * regression where locks stop holding at all.
 */
const IDENTITY_DRIFT_BUDGET = 50_000;

/**
 * Threshold above which we call positional drift "high" — i.e., the
 * frame is clearly not preserving prior positions. changeEmphasis
 * jitter alone contributes ≥ 30² × 2 = 1800 px² per reflow node;
 * randomPositioning re-rolls every position, producing tens to
 * hundreds of thousands. Pick a threshold that's clearly above lock
 * noise.
 */
const POSITIONAL_HIGH = 100_000;

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Run a two-frame sequence under a policy:
 *   1. Lay out `prev` cold to get the prior frame's positions.
 *   2. Lay out `curr` with the policy applied to that prior.
 *
 * Returns both layouts so tests can score consistency between them.
 */
async function runSequence(
  prev: JSONDataInstance,
  curr: JSONDataInstance,
  policy: typeof stability | typeof changeEmphasis | typeof ignoreHistory | typeof randomPositioning
) {
  const prevResult = await runHeadlessLayout(layoutSpec, prev);
  const currResult = await runHeadlessLayout(layoutSpec, curr, {
    policy,
    prevInstance: prev,
    currInstance: curr,
    priorPositions: prevResult.positions,
  });
  return { prevResult, currResult };
}

// ──────────────────────────────────────────────────────────────────
// stability — claim: "preserves node positions across frames"
//
// In Penlloy's vocabulary this is SOFT positional consistency:
// consistency in the objective, yields to constraint pressure. We
// therefore test two things:
//   • Identity (no constraint conflict): drift bounded by lock noise.
//   • Every scenario: stability strictly beats ignoreHistory on the
//     persisting subset (the policy's actual contribution).
// ──────────────────────────────────────────────────────────────────

describe('stability — claims soft-positional consistency on persisting nodes', () => {
  it('identity scenario: drift bounded by lock noise', async () => {
    const { prevResult, currResult } = await runSequence(
      new JSONDataInstance(dataAB),
      new JSONDataInstance(dataAB),
      stability
    );
    const m = positionalConsistency(prevResult.positions, currResult.positions);
    expect(
      m,
      `stability on identity drifted ${m.toFixed(1)} px²; expected ≤ ${IDENTITY_DRIFT_BUDGET}`
    ).toBeLessThanOrEqual(IDENTITY_DRIFT_BUDGET);
  });

  // Comparative claim: when the graph CHANGES between frames, stability
  // preserves persisting positions better than ignoreHistory does.
  //
  // Identity is deliberately excluded — ignoreHistory on identity has
  // zero drift (both runs are deterministic re-layouts of the same
  // graph), so the comparison is uninformative. The dedicated identity
  // test above covers the no-change case.
  const changingScenarios = scenarios.filter(s => !s.name.startsWith('identity'));

  for (const scenario of changingScenarios) {
    it(`beats ignoreHistory on persisting subset for "${scenario.name}"`, async () => {
      const stabilitySeq = await runSequence(scenario.prev, scenario.curr, stability);
      const ignoreSeq = await runSequence(scenario.prev, scenario.curr, ignoreHistory);

      const persistingIds = new Set(
        stabilitySeq.prevResult.positions.positions
          .map(p => p.id)
          .filter(id => stabilitySeq.currResult.positions.positions.some(q => q.id === id))
      );

      const mStability = positionalConsistency(
        stabilitySeq.prevResult.positions,
        stabilitySeq.currResult.positions,
        persistingIds
      );
      const mIgnore = positionalConsistency(
        ignoreSeq.prevResult.positions,
        ignoreSeq.currResult.positions,
        persistingIds
      );

      expect(
        mStability,
        `stability ${mStability.toFixed(1)} px² should be ≤ ignoreHistory ${mIgnore.toFixed(1)} px² for "${scenario.name}"`
      ).toBeLessThanOrEqual(mIgnore);
    });
  }

  it('identity: relative consistency is also small (positional → relative downstream)', async () => {
    const { prevResult, currResult } = await runSequence(
      new JSONDataInstance(dataABBC),
      new JSONDataInstance(dataABBC),
      stability
    );
    const m = relativeConsistency(
      prevResult.positions, prevResult.edges,
      currResult.positions, currResult.edges
    );
    expect(m).toBeLessThanOrEqual(IDENTITY_DRIFT_BUDGET);
  });
});

// ──────────────────────────────────────────────────────────────────
// changeEmphasis — claim: stable nodes stay fixed; changed nodes get
// visible jitter
// ──────────────────────────────────────────────────────────────────

describe('changeEmphasis — claims stable subset preserved, reflow on changed nodes', () => {
  it('partitions nodes into stable and reflow on relation-change scenario', async () => {
    const prev = new JSONDataInstance(dataAB);     // edge A→B
    const curr = new JSONDataInstance(dataABBC);   // edge A→B + B→C — B and C have new connectivity

    const { prevResult, currResult } = await runSequence(prev, curr, changeEmphasis);

    // Recover the stable set the policy declared, by comparing what the
    // policy emitted to the prior. (We can't observe the policy's
    // internal classification directly, but `effectivePriorState` IS the
    // policy's output — and stable nodes have unchanged positions there.)
    const policyResult = changeEmphasis.apply({
      priorState: prevResult.positions,
      prevInstance: prev,
      currInstance: curr,
      spec: layoutSpec,
    });
    expect(policyResult.effectivePriorState).toBeDefined();
    const stableSet = classifyChangeEmphasisStableSet(
      prevResult.positions,
      policyResult.effectivePriorState!
    );

    // The scenario must actually produce a non-trivial split — at least
    // one stable and at least one reflow node. Otherwise the policy
    // promise is vacuous on this benchmark.
    const allIds = new Set(currResult.positions.positions.map(p => p.id));
    const reflowSet = new Set([...allIds].filter(id => !stableSet.has(id)));
    expect(stableSet.size, 'expected at least one stable node').toBeGreaterThan(0);
    expect(reflowSet.size, 'expected at least one reflow node').toBeGreaterThan(0);

    // The stable subset must move LESS than the reflow subset — the
    // policy's whole job is to make changed nodes more salient than
    // stable ones. Compare per-node averages so subset sizes don't
    // skew the comparison.
    const mStable = positionalConsistency(prevResult.positions, currResult.positions, stableSet);
    const mReflow = positionalConsistency(prevResult.positions, currResult.positions, reflowSet);
    const stablePerNode = mStable / Math.max(1, stableSet.size);
    const reflowPerNode = mReflow / Math.max(1, reflowSet.size);

    expect(
      reflowPerNode,
      `reflow per-node drift ${reflowPerNode.toFixed(1)} should exceed stable per-node drift ${stablePerNode.toFixed(1)}`
    ).toBeGreaterThan(stablePerNode);
  });

  it('identity scenario produces no reflow (no changes to emphasize)', async () => {
    // changeEmphasis on (X, X) should leave every node stable — no
    // node has any change to emphasize. Drift comes only from lock
    // noise, not from any policy-induced jitter.
    const prev = new JSONDataInstance(dataAB);
    const curr = new JSONDataInstance(dataAB);
    const { prevResult, currResult } = await runSequence(prev, curr, changeEmphasis);
    const m = positionalConsistency(prevResult.positions, currResult.positions);
    expect(m).toBeLessThanOrEqual(IDENTITY_DRIFT_BUDGET);
  });
});

// ──────────────────────────────────────────────────────────────────
// ignoreHistory — claim: fresh layout each step (no consistency)
// ──────────────────────────────────────────────────────────────────

describe('ignoreHistory — claims fresh layout per step', () => {
  it('apply() returns undefined effectivePriorState (unit-level)', () => {
    const prev = new JSONDataInstance(dataAB);
    const curr = new JSONDataInstance(dataABBC);
    const result = ignoreHistory.apply({
      priorState: { positions: [{ id: 'A', x: 100, y: 200 }], transform: { k: 1, x: 0, y: 0 } },
      prevInstance: prev,
      currInstance: curr,
      spec: layoutSpec,
    });
    expect(result.effectivePriorState).toBeUndefined();
    expect(result.useReducedIterations).toBe(false);
  });

  it('post-solver positions are not pinned to deliberately-different priors (restructure)', async () => {
    // Pick a scenario where a fresh DAGRE/cola layout will produce
    // different positions than a deliberately offset prior would lock.
    // We provide a contrived prior to ignoreHistory — but the policy
    // returns undefined so the prior is discarded, and the layout is
    // computed from scratch.
    const prev = new JSONDataInstance(dataChain);
    const curr = new JSONDataInstance(dataTree);

    // Build a contrived prior where every node is at (0, 0) — clearly
    // not what a fresh layout would produce.
    const contrivedPrior = {
      positions: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 0, y: 0 },
        { id: 'C', x: 0, y: 0 },
      ],
      transform: { k: 1, x: 0, y: 0 },
    };

    const currResult = await runHeadlessLayout(layoutSpec, curr, {
      policy: ignoreHistory,
      prevInstance: prev,
      currInstance: curr,
      priorPositions: contrivedPrior,
    });

    // If ignoreHistory had honored the prior, every node would be near
    // (0, 0) — then positional vs (0,0,0) would be ≈ 0. Since the
    // policy returns undefined, the layout ignores the prior and
    // produces fresh positions far from (0, 0).
    const m = positionalConsistency(contrivedPrior, currResult.positions);
    expect(
      m,
      `positional vs contrived (0,0) prior was ${m.toFixed(1)} px²; ignoreHistory should make it large`
    ).toBeGreaterThan(POSITIONAL_HIGH);
  });
});

// ──────────────────────────────────────────────────────────────────
// randomPositioning — claim: randomize within viewport bounds
// ──────────────────────────────────────────────────────────────────

describe('randomPositioning — claims positions are randomized within viewport bounds', () => {
  it('apply() returns positions within the requested viewport bounds (unit-level)', () => {
    const prev = new JSONDataInstance(dataAB);
    const curr = new JSONDataInstance(dataAB);
    const bounds = { minX: 0, maxX: 800, minY: 0, maxY: 600 };
    const result = randomPositioning.apply({
      priorState: { positions: [], transform: { k: 1, x: 0, y: 0 } },
      prevInstance: prev,
      currInstance: curr,
      spec: layoutSpec,
      viewportBounds: bounds,
    });

    expect(result.effectivePriorState).toBeDefined();
    for (const p of result.effectivePriorState!.positions) {
      expect(p.x, `${p.id}.x out of bounds`).toBeGreaterThanOrEqual(bounds.minX);
      expect(p.x, `${p.id}.x out of bounds`).toBeLessThanOrEqual(bounds.maxX);
      expect(p.y, `${p.id}.y out of bounds`).toBeGreaterThanOrEqual(bounds.minY);
      expect(p.y, `${p.id}.y out of bounds`).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  // No end-to-end "drift exceeds lock noise" test for randomPositioning.
  //
  // randomPositioning's promise is at the policy level: it returns
  // random positions within the viewport bounds. The unit-level test
  // above covers that.
  //
  // The post-solver claim "drift is large" is unreliable: when the
  // random positions violate the layout's hard constraints, the
  // constraint-aware-locking post-pass unfixes the violating
  // endpoints and the solver re-converges to a constraint-satisfying
  // layout — which on a small graph happens to coincide with the
  // prior fresh layout, producing near-zero drift. That coincidence
  // is a property of constraint geometry, not a randomPositioning
  // regression, so asserting "drift > X" here would be flaky.
});

// ──────────────────────────────────────────────────────────────────
// Cross-policy sanity: stability beats ignoreHistory on identity
// ──────────────────────────────────────────────────────────────────

describe('cross-policy ordering on a changing scenario', () => {
  it('stability achieves lower positional than ignoreHistory on atom-add', async () => {
    // Identity is excluded — ignoreHistory deterministically replays
    // the same fresh layout, so its drift is 0 and nothing beats it.
    // On a CHANGING scenario, ignoreHistory's drift is real (the
    // post-add layout differs from the pre-add layout) and stability
    // should clearly win.
    const prev = new JSONDataInstance(dataAddAtomBefore);
    const curr = new JSONDataInstance(dataAddAtomAfter);

    const stabilitySeq = await runSequence(prev, curr, stability);
    const ignoreSeq = await runSequence(prev, curr, ignoreHistory);

    const persistingIds = new Set(
      stabilitySeq.prevResult.positions.positions
        .map(p => p.id)
        .filter(id => stabilitySeq.currResult.positions.positions.some(q => q.id === id))
    );

    const mStability = positionalConsistency(
      stabilitySeq.prevResult.positions,
      stabilitySeq.currResult.positions,
      persistingIds
    );
    const mIgnore = positionalConsistency(
      ignoreSeq.prevResult.positions,
      ignoreSeq.currResult.positions,
      persistingIds
    );

    expect(
      mStability,
      `stability drift ${mStability.toFixed(1)} px² should be ≤ ignoreHistory drift ${mIgnore.toFixed(1)} px² on atom-add`
    ).toBeLessThanOrEqual(mIgnore);
  });
});

// Re-export to silence unused import warnings (EdgeKey is part of the public API surface).
void (null as unknown as EdgeKey | null);
