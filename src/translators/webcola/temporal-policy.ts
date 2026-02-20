import type { NodePositionHint, TransformInfo } from './webcolatranslator';

export type Position = { x: number; y: number };
export type Positions = Map<string, Position>;
export type IterationMode = 'default' | 'reduced';
export type TemporalPolicyName = 'baseline' | 'transport_pan_zoom' | 'change_emphasis';

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

function toHint(id: string, point: Position): NodePositionHint {
  return { id, x: point.x, y: point.y };
}

function baselineHints(args: {
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

function baselinePolicy(): TemporalPolicy {
  return {
    name: 'baseline',
    makeHints(args) {
      return {
        hints: baselineHints(args),
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

function transportPanZoomPolicy(): TemporalPolicy {
  return {
    name: 'transport_pan_zoom',
    makeHints(args) {
      const fallback = baselinePolicy().makeHints(args);
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

function hashString(input: string): number {
  // FNV-1a 32-bit hash
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicJitter(id: string, radius: number): Position {
  const hash = hashString(id);
  const angle = ((hash & 0xffff) / 0xffff) * Math.PI * 2;
  const magnitude = (((hash >>> 16) & 0xffff) / 0xffff) * radius;
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
      const transportedHints = transportPanZoomPolicy().makeHints(args).hints;
      const transportedMap = new Map<string, Position>(
        transportedHints.map(hint => [hint.id, { x: hint.x, y: hint.y }])
      );

      const matchedIds = args.nodes
        .map(node => node.id)
        .filter(id => args.prevPositions?.has(id));

      const effectiveChangedIds = changedIds
        ? new Set(changedIds)
        : new Set(args.nodes.map(node => node.id).filter(id => !args.prevPositions?.has(id)));

      const matchedPoints = matchedIds
        .map(id => transportedMap.get(id))
        .filter((point): point is Position => !!point);

      const defaultPoints = args.nodes
        .map(node => args.defaultSeeds.get(node.id))
        .filter((point): point is Position => !!point);

      const anchor = centroid(matchedPoints) || centroid(defaultPoints) || { x: 0, y: 0 };
      const hints: NodePositionHint[] = [];

      for (const node of args.nodes) {
        if (!effectiveChangedIds.has(node.id)) {
          const stable = transportedMap.get(node.id);
          if (stable) {
            hints.push(toHint(node.id, stable));
          }
          continue;
        }

        const base = args.defaultSeeds.get(node.id) || anchor;
        const jitter = deterministicJitter(node.id, CHANGE_EMPHASIS_JITTER_RADIUS);
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
export function resolveTemporalPolicy(
  name: TemporalPolicyName = 'baseline',
  config?: TemporalPolicyConfig
): TemporalPolicy {
  switch (name) {
    case 'transport_pan_zoom':
      return transportPanZoomPolicy();
    case 'change_emphasis':
      return changeEmphasisPolicy(config);
    case 'baseline':
    default:
      return baselinePolicy();
  }
}
