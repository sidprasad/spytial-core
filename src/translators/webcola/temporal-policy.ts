import type { NodePositionHint, TransformInfo } from './webcolatranslator';

export type Position = { x: number; y: number };
export type Positions = Map<string, Position>;
export type IterationMode = 'default' | 'reduced';
export type TemporalPolicyCanonicalName =
  | 'seed_default'
  | 'seed_continuity_raw'
  | 'seed_continuity_transport'
  | 'seed_change_emphasis';

export type TemporalPolicyLegacyName = 'baseline' | 'transport_pan_zoom' | 'change_emphasis';
export type TemporalPolicyName = TemporalPolicyCanonicalName | TemporalPolicyLegacyName;

export interface TemporalPolicy {
  name: string;
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

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface SimilarityTransform {
  scale: number;
  sourceCenter: Position;
  targetCenter: Position;
}

const EPSILON = 1e-6;
const CHANGE_EMPHASIS_JITTER_RADIUS = 18;
const DEFAULT_TEMPORAL_POLICY_NAME: TemporalPolicyCanonicalName = 'seed_continuity_raw';

function toHint(id: string, point: Position): NodePositionHint {
  return { id, x: point.x, y: point.y };
}

function defaultSeedHints(args: {
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

function continuityRawHints(args: {
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

function seedDefaultPolicy(): TemporalPolicy {
  return {
    name: 'seed_default',
    makeHints(args) {
      return {
        hints: defaultSeedHints(args),
        iterationMode: 'default'
      };
    }
  };
}

function seedContinuityRawPolicy(): TemporalPolicy {
  return {
    name: 'seed_continuity_raw',
    makeHints(args) {
      return {
        hints: continuityRawHints(args),
        iterationMode: args.prevPositions ? 'reduced' : 'default'
      };
    }
  };
}

function computeBounds(points: Position[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, maxX, minY, maxY };
}

function isDegenerate(bounds: Bounds): boolean {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return width <= EPSILON || height <= EPSILON;
}

function centerOf(bounds: Bounds): Position {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function buildSimilarityTransform(source: Bounds, target: Bounds): SimilarityTransform {
  const sourceWidth = source.maxX - source.minX;
  const sourceHeight = source.maxY - source.minY;
  const targetWidth = target.maxX - target.minX;
  const targetHeight = target.maxY - target.minY;

  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;

  return {
    scale: Math.min(scaleX, scaleY),
    sourceCenter: centerOf(source),
    targetCenter: centerOf(target)
  };
}

function applySimilarityTransform(point: Position, transform: SimilarityTransform): Position {
  return {
    x: (point.x - transform.sourceCenter.x) * transform.scale + transform.targetCenter.x,
    y: (point.y - transform.sourceCenter.y) * transform.scale + transform.targetCenter.y
  };
}

function seedContinuityTransportPolicy(): TemporalPolicy {
  return {
    name: 'seed_continuity_transport',
    makeHints(args) {
      const fallback = seedContinuityRawPolicy().makeHints(args);
      if (!args.prevPositions) {
        return fallback;
      }

      const persistentIds = args.nodes
        .map(node => node.id)
        .filter(id => args.prevPositions!.has(id));

      if (persistentIds.length === 0) {
        return fallback;
      }

      const sourcePoints = persistentIds
        .map(id => args.prevPositions!.get(id))
        .filter((point): point is Position => !!point);
      const sourceBounds = computeBounds(sourcePoints);
      if (!sourceBounds || isDegenerate(sourceBounds)) {
        return fallback;
      }

      const targetPoints = persistentIds
        .map(id => args.defaultSeeds.get(id))
        .filter((point): point is Position => !!point);

      let targetBounds = computeBounds(targetPoints);
      if (!targetBounds && args.viewport) {
        targetBounds = {
          minX: 0,
          minY: 0,
          maxX: args.viewport.width,
          maxY: args.viewport.height
        };
      }

      if (!targetBounds || isDegenerate(targetBounds)) {
        return fallback;
      }

      const transform = buildSimilarityTransform(sourceBounds, targetBounds);
      const hints: NodePositionHint[] = [];

      for (const node of args.nodes) {
        const previous = args.prevPositions.get(node.id);
        if (previous) {
          hints.push(toHint(node.id, applySimilarityTransform(previous, transform)));
          continue;
        }

        const seed = args.defaultSeeds.get(node.id);
        if (seed) {
          hints.push(toHint(node.id, seed));
        }
      }

      return {
        hints,
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
    name: 'seed_change_emphasis',
    makeHints(args) {
      const continuityHints = seedContinuityRawPolicy().makeHints(args).hints;
      const continuityMap = new Map<string, Position>(
        continuityHints.map(hint => [hint.id, { x: hint.x, y: hint.y }])
      );

      const matchedIds = args.nodes
        .map(node => node.id)
        .filter(id => args.prevPositions?.has(id));

      const effectiveChangedIds = changedIds
        ? new Set(changedIds)
        : new Set(args.nodes.map(node => node.id).filter(id => !args.prevPositions?.has(id)));

      const matchedPoints = matchedIds
        .map(id => continuityMap.get(id))
        .filter((point): point is Position => !!point);

      const defaultPoints = args.nodes
        .map(node => args.defaultSeeds.get(node.id))
        .filter((point): point is Position => !!point);

      const anchor = centroid(matchedPoints) || centroid(defaultPoints) || { x: 0, y: 0 };
      const hints: NodePositionHint[] = [];

      for (const node of args.nodes) {
        if (!effectiveChangedIds.has(node.id)) {
          const stable = continuityMap.get(node.id) || args.defaultSeeds.get(node.id);
          if (stable) {
            hints.push(toHint(node.id, stable));
          }
          continue;
        }

        const base = anchor;
        const jitter = randomJitter(CHANGE_EMPHASIS_JITTER_RADIUS);
        hints.push(toHint(node.id, {
          x: base.x + jitter.x,
          y: base.y + jitter.y
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
    case 'baseline':
      return 'seed_continuity_raw';
    case 'transport_pan_zoom':
      return 'seed_continuity_transport';
    case 'change_emphasis':
      return 'seed_change_emphasis';
    default:
      return name;
  }
}

export function resolveTemporalPolicy(
  name: TemporalPolicyName = DEFAULT_TEMPORAL_POLICY_NAME,
  config?: TemporalPolicyConfig
): TemporalPolicy {
  switch (normalizeTemporalPolicyName(name)) {
    case 'seed_default':
      return seedDefaultPolicy();
    case 'seed_continuity_transport':
      return seedContinuityTransportPolicy();
    case 'seed_change_emphasis':
      return changeEmphasisPolicy(config);
    case 'seed_continuity_raw':
    default:
      return seedContinuityRawPolicy();
  }
}
