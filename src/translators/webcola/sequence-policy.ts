import type { LayoutState } from './webcolatranslator';
import type { IDataInstance } from '../../data-instance/interfaces';
import type { LayoutSpec } from '../../layout/layoutspec';

// ---------------------------------------------------------------------------
// Sequence policy interface
// ---------------------------------------------------------------------------

/**
 * Context provided to a sequence policy when computing how prior layout
 * state should be carried forward between consecutive steps.
 */
export interface SequencePolicyContext {
  /** Layout state captured from the previous step's render */
  priorState: LayoutState;
  /** The previous data instance */
  prevInstance: IDataInstance;
  /** The current data instance being laid out */
  currInstance: IDataInstance;
  /** Parsed layout specification (available for future policies) */
  spec: LayoutSpec;
}

/**
 * Result of applying a sequence policy.
 */
export interface SequencePolicyResult {
  /** Effective prior state to pass to the solver, or undefined for fresh layout */
  effectivePriorState: LayoutState | undefined;
  /** Whether to use reduced solver iterations to better preserve hint positions */
  useReducedIterations: boolean;
}

/**
 * A sequence policy controls how prior layout state is transformed when
 * rendering a sequence of data instances.
 *
 * Policies are pairwise — they receive the prior layout state plus the
 * previous and current data instances, and return the effective state
 * that the solver should use as initialization hints.
 *
 * The application pattern is identical for every policy; only the
 * transformation logic differs.  New policies can be added by
 * implementing this interface and registering them with
 * `registerSequencePolicy`.
 */
export interface SequencePolicy {
  /** Human-readable policy name, used for serialization and debugging */
  readonly name: string;
  /** Compute effective prior state for the solver */
  apply(context: SequencePolicyContext): SequencePolicyResult;
}

// ---------------------------------------------------------------------------
// Instance diffing (internal to change_emphasis)
// ---------------------------------------------------------------------------

/**
 * Build a per-atom connectivity fingerprint from a data instance.
 *
 * For each atom the fingerprint is the sorted set of edge descriptors
 * (`"relationName:a0->a1->..."`) for every tuple the atom participates in.
 */
function buildEdgeFingerprints(instance: IDataInstance): Map<string, Set<string>> {
  const fingerprints = new Map<string, Set<string>>();

  for (const atom of instance.getAtoms()) {
    fingerprints.set(atom.id, new Set());
  }

  for (const relation of instance.getRelations()) {
    for (const tuple of relation.tuples) {
      const descriptor = `${relation.name}:${tuple.atoms.join('->')}`;
      for (const atomId of tuple.atoms) {
        let set = fingerprints.get(atomId);
        if (!set) {
          set = new Set();
          fingerprints.set(atomId, set);
        }
        set.add(descriptor);
      }
    }
  }

  return fingerprints;
}

function fingerprintKey(s: Set<string>): string {
  return [...s].sort().join('\n');
}

/**
 * Compute atom IDs whose connectivity changed between two instances.
 * A node is "changed" if it is new, was removed, or its incident edges differ.
 */
function computeChangedNodeIds(
  prev: IDataInstance,
  curr: IDataInstance
): string[] {
  const prevFP = buildEdgeFingerprints(prev);
  const currFP = buildEdgeFingerprints(curr);
  const changed: string[] = [];

  for (const [atomId, currSet] of currFP) {
    const prevSet = prevFP.get(atomId);
    if (!prevSet || fingerprintKey(prevSet) !== fingerprintKey(currSet)) {
      changed.push(atomId);
    }
  }

  for (const atomId of prevFP.keys()) {
    if (!currFP.has(atomId)) {
      changed.push(atomId);
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Built-in policies
// ---------------------------------------------------------------------------

/**
 * Fresh layout every time — no prior state used.
 */
export const ignoreHistory: SequencePolicy = {
  name: 'ignore_history',
  apply: () => ({ effectivePriorState: undefined, useReducedIterations: false }),
};

/**
 * Preserve all prior node positions.  The solver uses reduced iterations
 * so hint positions are largely maintained.
 */
export const stability: SequencePolicy = {
  name: 'stability',
  apply: ({ priorState }) => ({
    effectivePriorState: priorState,
    useReducedIterations: true,
  }),
};

/**
 * Pin nodes whose connectivity is unchanged between steps.
 * Nodes whose in/out edges changed are omitted from the prior state
 * so the solver places them freely among the stable anchors.
 *
 * The diff is computed automatically from the provided instances.
 */
export const changeEmphasis: SequencePolicy = {
  name: 'change_emphasis',
  apply: ({ priorState, prevInstance, currInstance }) => {
    const changedIds = computeChangedNodeIds(prevInstance, currInstance);
    if (changedIds.length === 0) {
      return { effectivePriorState: priorState, useReducedIterations: true };
    }
    const changedSet = new Set(changedIds);
    const stablePositions = priorState.positions.filter(p => !changedSet.has(p.id));
    return {
      effectivePriorState: { positions: stablePositions, transform: priorState.transform },
      useReducedIterations: true,
    };
  },
};

// ---------------------------------------------------------------------------
// Policy registry
// ---------------------------------------------------------------------------

const policyRegistry = new Map<string, SequencePolicy>([
  ['ignore_history', ignoreHistory],
  ['stability', stability],
  ['change_emphasis', changeEmphasis],
]);

/**
 * Look up a built-in policy by name.  Returns `ignoreHistory` for
 * unrecognized names.
 */
export function getSequencePolicy(name: string): SequencePolicy {
  return policyRegistry.get(name) ?? ignoreHistory;
}

/**
 * Register a custom sequence policy.  This is intended for internal use
 * to experiment with new policies without modifying this file.
 */
export function registerSequencePolicy(policy: SequencePolicy): void {
  policyRegistry.set(policy.name, policy);
}
