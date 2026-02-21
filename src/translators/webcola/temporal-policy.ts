import type { NodePositionHint, TransformInfo } from './webcolatranslator';

export type Position = { x: number; y: number };
export type Positions = Map<string, Position>;
export type IterationMode = 'default' | 'reduced';

export type TemporalPolicyCanonicalName = 'ignore_history' | 'stability' | 'change_emphasis';

// Legacy names kept for backwards compatibility.
export type TemporalPolicyLegacyName =
  | 'seed_default'
  | 'seed_continuity_raw'
  | 'seed_continuity_transport'
  | 'seed_change_emphasis'
  | 'baseline'
  | 'transport_pan_zoom';

export type TemporalPolicyName = TemporalPolicyCanonicalName | TemporalPolicyLegacyName;

export interface TemporalPolicy {
  name: TemporalPolicyCanonicalName;
  makeHints(args: {
    prevPositions: Positions | null;
    prevTransform: TransformInfo | null;
    nodes: Array<{ id: string }>;
    defaultSeeds: Positions;
    viewport?: { width: number; height: number };
  }): { hints: NodePositionHint[]; iterationMode: IterationMode };
}

export interface TemporalPolicyConfig {
  changedIds?: Iterable<string>;
}

const CHANGE_EMPHASIS_JITTER_RADIUS = 18;
const DEFAULT_TEMPORAL_POLICY_NAME: TemporalPolicyCanonicalName = 'ignore_history';

function toHint(id: string, point: Position): NodePositionHint {
  return { id, x: point.x, y: point.y };
}

function ignoreHistoryHints(args: {
  nodes: Array<{ id: string }>;
  defaultSeeds: Positions;
}): NodePositionHint[] {
  const hints: NodePositionHint[] = [];

  for (const node of args.nodes) {
    const seed = args.defaultSeeds.get(node.id);
    if (seed) {
      hints.push(toHint(node.id, seed));
    }
  }

  return hints;
}

function stabilityHints(args: {
  prevPositions: Positions | null;
  nodes: Array<{ id: string }>;
  defaultSeeds: Positions;
}): NodePositionHint[] {
  const hints: NodePositionHint[] = [];

  for (const node of args.nodes) {
    const previous = args.prevPositions?.get(node.id);
    if (previous) {
      hints.push(toHint(node.id, previous));
      continue;
    }

    const seed = args.defaultSeeds.get(node.id);
    if (seed) {
      hints.push(toHint(node.id, seed));
    }
  }

  return hints;
}

function ignoreHistoryPolicy(): TemporalPolicy {
  return {
    name: 'ignore_history',
    makeHints(args) {
      return {
        hints: ignoreHistoryHints(args),
        iterationMode: 'default'
      };
    }
  };
}

function stabilityPolicy(): TemporalPolicy {
  return {
    name: 'stability',
    makeHints(args) {
      return {
        hints: stabilityHints(args),
        iterationMode: args.prevPositions ? 'reduced' : 'default'
      };
    }
  };
}

function randomJitter(radius: number): Position {
  const angle = Math.random() * Math.PI * 2;
  const magnitude = Math.random() * radius;
  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude
  };
}

function centroid(points: Position[]): Position | null {
  if (points.length === 0) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }

  return {
    x: sumX / points.length,
    y: sumY / points.length
  };
}

function changeEmphasisPolicy(config?: TemporalPolicyConfig): TemporalPolicy {
  const changedIds = config?.changedIds ? new Set(config.changedIds) : null;

  return {
    name: 'change_emphasis',
    makeHints(args) {
      const stableHints = stabilityPolicy().makeHints(args).hints;
      const stableMap = new Map<string, Position>(
        stableHints.map(hint => [hint.id, { x: hint.x, y: hint.y }])
      );

      const matchedIds = args.nodes
        .map(node => node.id)
        .filter(id => args.prevPositions?.has(id));

      const effectiveChangedIds = changedIds
        ? new Set(changedIds)
        : new Set(args.nodes.map(node => node.id).filter(id => !args.prevPositions?.has(id)));

      const matchedPoints = matchedIds
        .map(id => stableMap.get(id))
        .filter((point): point is Position => !!point);

      const defaultPoints = args.nodes
        .map(node => args.defaultSeeds.get(node.id))
        .filter((point): point is Position => !!point);

      const anchor = centroid(matchedPoints) || centroid(defaultPoints) || { x: 0, y: 0 };
      const hints: NodePositionHint[] = [];

      for (const node of args.nodes) {
        if (!effectiveChangedIds.has(node.id)) {
          const stable = stableMap.get(node.id) || args.defaultSeeds.get(node.id);
          if (stable) {
            hints.push(toHint(node.id, stable));
          }
          continue;
        }

        const jitter = randomJitter(CHANGE_EMPHASIS_JITTER_RADIUS);
        hints.push(toHint(node.id, {
          x: anchor.x + jitter.x,
          y: anchor.y + jitter.y
        }));
      }

      return {
        hints,
        iterationMode: 'default'
      };
    }
  };
}

/**
 * Temporal realization policies preserve Spytial semantics and only affect
 * solver initialization hints and iteration mode selection.
 */
export function normalizeTemporalPolicyName(
  name: TemporalPolicyName = DEFAULT_TEMPORAL_POLICY_NAME
): TemporalPolicyCanonicalName {
  switch (name) {
    case 'seed_default':
      return 'ignore_history';
    case 'seed_continuity_raw':
    case 'seed_continuity_transport':
    case 'baseline':
    case 'transport_pan_zoom':
      return 'stability';
    case 'seed_change_emphasis':
      return 'change_emphasis';
    default:
      return name;
  }
}

export function resolveTemporalPolicy(
  name: TemporalPolicyName = DEFAULT_TEMPORAL_POLICY_NAME,
  config?: TemporalPolicyConfig
): TemporalPolicy {
  switch (normalizeTemporalPolicyName(name)) {
    case 'stability':
      return stabilityPolicy();
    case 'change_emphasis':
      return changeEmphasisPolicy(config);
    case 'ignore_history':
    default:
      return ignoreHistoryPolicy();
  }
}
