import type { NodePositionHint, LayoutState } from './webcolatranslator';

/**
 * Temporal modes control how prior layout state affects the next render.
 * These preserve Spytial semantics -- they only affect solver initialization
 * hints and iteration mode selection.
 *
 * - `ignore_history`: Fresh layout, no prior state used (default)
 * - `stability`: Preserve prior node positions across time
 * - `change_emphasis`: Preserve stable regions, destabilize changed regions
 */
export type TemporalMode = 'ignore_history' | 'stability' | 'change_emphasis';

/**
 * Result of applying a temporal policy to a prior layout state.
 */
export interface TemporalPolicyResult {
  /** Effective prior state to pass to the translator, or undefined for fresh layout */
  effectivePriorState: LayoutState | undefined;
  /** Whether to use reduced solver iterations to better preserve hint positions */
  useReducedIterations: boolean;
}

const CHANGE_EMPHASIS_JITTER_RADIUS = 18;

function randomJitter(radius: number): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const magnitude = Math.random() * radius;
  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude
  };
}

function centroid(points: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  if (points.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

/**
 * Apply change_emphasis transformation: keep stable node positions,
 * jitter changed nodes around the centroid of stable positions.
 */
function applyChangeEmphasis(
  priorState: LayoutState,
  changedNodeIds?: string[]
): LayoutState {
  if (!changedNodeIds || changedNodeIds.length === 0) {
    // No explicit changes -- fall back to stability (preserve all positions)
    return priorState;
  }

  const changedSet = new Set(changedNodeIds);
  const stablePositions = priorState.positions.filter(p => !changedSet.has(p.id));
  const anchor = centroid(stablePositions) ?? centroid(priorState.positions) ?? { x: 0, y: 0 };

  const newPositions: NodePositionHint[] = priorState.positions.map(p => {
    if (!changedSet.has(p.id)) return p;
    const jitter = randomJitter(CHANGE_EMPHASIS_JITTER_RADIUS);
    return { id: p.id, x: anchor.x + jitter.x, y: anchor.y + jitter.y };
  });

  return { positions: newPositions, transform: priorState.transform };
}

/**
 * Apply a temporal policy to compute the effective prior state for a render.
 *
 * This only affects solver initialization and iteration mode --
 * Spytial semantics are unchanged.
 *
 * @param priorState - Layout state captured from a previous render (if any)
 * @param mode - Temporal mode to apply (default: `ignore_history`)
 * @param changedNodeIds - Node IDs that changed, for `change_emphasis` mode
 */
export function applyTemporalPolicy(
  priorState: LayoutState | undefined,
  mode: TemporalMode = 'ignore_history',
  changedNodeIds?: string[]
): TemporalPolicyResult {
  // No prior state -- always fresh layout regardless of mode
  if (!priorState || priorState.positions.length === 0) {
    return { effectivePriorState: undefined, useReducedIterations: false };
  }

  switch (mode) {
    case 'ignore_history':
      return { effectivePriorState: undefined, useReducedIterations: false };

    case 'stability':
      return { effectivePriorState: priorState, useReducedIterations: true };

    case 'change_emphasis':
      return {
        effectivePriorState: applyChangeEmphasis(priorState, changedNodeIds),
        useReducedIterations: false
      };

    default:
      return { effectivePriorState: undefined, useReducedIterations: false };
  }
}
