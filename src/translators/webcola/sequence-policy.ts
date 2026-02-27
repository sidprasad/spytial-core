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
  /**
   * Optional visible viewport bounds in layout coordinates.
   * When present, policies should keep generated positions in these bounds.
   */
  viewportBounds?: SequenceViewportBounds;
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
 * Visible viewport bounds in layout coordinates.
 */
export interface SequenceViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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

function symmetricDifferenceSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const value of a) {
    if (!b.has(value)) count += 1;
  }
  for (const value of b) {
    if (!a.has(value)) count += 1;
  }
  return count;
}

interface NodeChangeDetails {
  changedIds: Set<string>;
  intensityById: Map<string, number>;
  signatureById: Map<string, string>;
}

function computeRemovedNeighborLoss(prev: IDataInstance, curr: IDataInstance): Map<string, number> {
  const currAtomIds = new Set(curr.getAtoms().map(atom => atom.id));
  const removedAtomIds = new Set(
    prev.getAtoms().map(atom => atom.id).filter(atomId => !currAtomIds.has(atomId))
  );

  const lossById = new Map<string, number>();
  if (removedAtomIds.size === 0) {
    return lossById;
  }

  for (const relation of prev.getRelations()) {
    for (const tuple of relation.tuples) {
      const hasRemovedAtom = tuple.atoms.some(atomId => removedAtomIds.has(atomId));
      if (!hasRemovedAtom) continue;

      for (const atomId of tuple.atoms) {
        if (!currAtomIds.has(atomId)) continue;
        lossById.set(atomId, (lossById.get(atomId) ?? 0) + 1);
      }
    }
  }

  return lossById;
}

/**
 * Analyze per-node change between two adjacent instances.
 *
 * A node is "changed" if it is new, removed, or its incident tuples differ.
 * Intensity is based on tuple symmetric-difference size to scale emphasis.
 */
function analyzeNodeChanges(
  prev: IDataInstance,
  curr: IDataInstance
): NodeChangeDetails {
  const prevFP = buildEdgeFingerprints(prev);
  const currFP = buildEdgeFingerprints(curr);
  const changedIds = new Set<string>();
  const intensityById = new Map<string, number>();
  const signatureById = new Map<string, string>();
  const removedNeighborLoss = computeRemovedNeighborLoss(prev, curr);

  for (const [atomId, currSet] of currFP) {
    const prevSet = prevFP.get(atomId);
    if (!prevSet) {
      changedIds.add(atomId);
      intensityById.set(atomId, Math.max(1, currSet.size));
      signatureById.set(atomId, `new|${fingerprintKey(currSet)}`);
      continue;
    }

    const prevKey = fingerprintKey(prevSet);
    const currKey = fingerprintKey(currSet);
    if (prevKey !== currKey) {
      changedIds.add(atomId);
      const diffIntensity = Math.max(1, symmetricDifferenceSize(prevSet, currSet));
      const removedLoss = removedNeighborLoss.get(atomId) ?? 0;
      intensityById.set(atomId, diffIntensity + removedLoss);
      signatureById.set(atomId, `diff|${prevKey}|${currKey}|removed_loss:${removedLoss}`);
    }
  }

  for (const [atomId, prevSet] of prevFP) {
    if (!currFP.has(atomId)) {
      changedIds.add(atomId);
      intensityById.set(atomId, Math.max(1, prevSet.size));
      signatureById.set(atomId, `removed|${fingerprintKey(prevSet)}`);
    }
  }

  return { changedIds, intensityById, signatureById };
}

/**
 * Deterministic pseudo-random number in [0, 1] from a string seed.
 * Used so change-emphasis jitter is stable for the same instance pair.
 */
function seededUnit(seed: string): number {
  // FNV-1a 32-bit hash
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeFallbackBounds(priorState: LayoutState): SequenceViewportBounds {
  if (priorState.positions.length === 0) {
    return { minX: 0, maxX: 800, minY: 0, maxY: 600 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const position of priorState.positions) {
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
  }

  const width = Math.max(320, maxX - minX);
  const height = Math.max(240, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const padding = Math.max(60, Math.min(width, height) * 0.15);

  return {
    minX: cx - width / 2 - padding,
    maxX: cx + width / 2 + padding,
    minY: cy - height / 2 - padding,
    maxY: cy + height / 2 + padding,
  };
}

function resolveViewportBounds(
  priorState: LayoutState,
  viewportBounds?: SequenceViewportBounds
): SequenceViewportBounds {
  if (!viewportBounds) {
    return computeFallbackBounds(priorState);
  }

  const { minX, maxX, minY, maxY } = viewportBounds;
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    return computeFallbackBounds(priorState);
  }

  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
  };
}

function jitterChangedPosition(
  id: string,
  x: number,
  y: number,
  intensity: number,
  signature: string,
  bounds: SequenceViewportBounds
): { x: number; y: number } {
  const theta = 2 * Math.PI * seededUnit(`theta|${id}|${signature}`);
  const intensityFactor = Math.min(1, intensity / 4);
  const baseRadius = 36 + (30 * intensityFactor); // 36..66
  const radiusScale = 0.85 + (0.30 * seededUnit(`radius|${id}|${signature}`));
  const radius = baseRadius * radiusScale;

  let nextX = clamp(x + Math.cos(theta) * radius, bounds.minX, bounds.maxX);
  let nextY = clamp(y + Math.sin(theta) * radius, bounds.minY, bounds.maxY);

  // If clamping nullified movement, push toward viewport center so change stays visible.
  if (nextX === x && nextY === y) {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const nudge = 24;
    nextX = clamp(x + (cx >= x ? nudge : -nudge), bounds.minX, bounds.maxX);
    nextY = clamp(y + (cy >= y ? nudge : -nudge), bounds.minY, bounds.maxY);
  }

  return { x: nextX, y: nextY };
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
 * Preserve prior positions for nodes present in the current step.
 *
 * This policy is intentionally pairwise/pure: if a node disappears for one
 * step and later reappears, it is treated as new unless the caller supplies
 * explicit historical hints via `priorPositions`.
 */
export const stability: SequencePolicy = {
  name: 'stability',
  apply: ({ priorState, currInstance }) => {
    const currAtomIds = new Set(currInstance.getAtoms().map(atom => atom.id));
    const stablePositions = priorState.positions.filter(position => currAtomIds.has(position.id));

    return {
      effectivePriorState: {
        positions: stablePositions,
        transform: priorState.transform,
      },
      useReducedIterations: true,
    };
  },
};

/**
 * Emphasize changed nodes with deterministic, visible jitter while keeping
 * stable nodes fixed. Jitter is clamped to the viewport bounds.
 *
 * The diff is computed automatically from the provided instances.
 */
export const changeEmphasis: SequencePolicy = {
  name: 'change_emphasis',
  apply: ({ priorState, prevInstance, currInstance, viewportBounds }) => {
    const analysis = analyzeNodeChanges(prevInstance, currInstance);
    if (analysis.changedIds.size === 0) {
      return { effectivePriorState: priorState, useReducedIterations: true };
    }

    const bounds = resolveViewportBounds(priorState, viewportBounds);
    const currAtomIds = new Set(currInstance.getAtoms().map(atom => atom.id));
    const emphasizedPositions = priorState.positions
      .filter(position => currAtomIds.has(position.id))
      .map(position => {
        if (!analysis.changedIds.has(position.id)) {
          return position;
        }

        const intensity = analysis.intensityById.get(position.id) ?? 1;
        const signature = analysis.signatureById.get(position.id) ?? position.id;
        const jittered = jitterChangedPosition(
          position.id,
          position.x,
          position.y,
          intensity,
          signature,
          bounds
        );

        return {
          id: position.id,
          x: jittered.x,
          y: jittered.y,
        };
      });

    return {
      effectivePriorState: { positions: emphasizedPositions, transform: priorState.transform },
      useReducedIterations: true,
    };
  },
};

/**
 * Completely randomize positions of all current nodes each step.
 * Positions are sampled uniformly within viewport bounds.
 */
export const randomPositioning: SequencePolicy = {
  name: 'random_positioning',
  apply: ({ priorState, currInstance, viewportBounds }) => {
    const bounds = resolveViewportBounds(priorState, viewportBounds);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const randomizedPositions = currInstance.getAtoms().map(atom => ({
      id: atom.id,
      x: bounds.minX + Math.random() * width,
      y: bounds.minY + Math.random() * height,
    }));

    return {
      effectivePriorState: {
        positions: randomizedPositions,
        transform: priorState.transform,
      },
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
  ['random_positioning', randomPositioning],
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
