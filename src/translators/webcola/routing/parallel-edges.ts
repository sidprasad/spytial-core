import type { Point, RoutedEdge } from './types';
import { closestPointOnRect } from './bounds';
import { dominantDirection } from './geometry';
import { applyPortBasedOffset } from './ports';

/**
 * Fanning several edges that share the same pair of nodes, so they read as
 * distinct edges rather than one thick line.
 *
 * Two mechanisms, applied together: an endpoint OFFSET moves where each edge
 * meets its nodes, and a CURVATURE bows the interior of the route. Both are
 * obstacle-blind — a router that cares has to re-validate the result.
 */

/** Curvature per parallel-edge step, before the count multiplier. */
export const CURVATURE_BASE_MULTIPLIER = 0.15;

/** Endpoint offset per parallel-edge step, and the floor on the offset cap. */
export const MIN_EDGE_DISTANCE = 10;

/** Offsets are capped at this fraction of the edge length. */
export const MAX_EDGE_OFFSET_RATIO = 0.35;

/** Curvature is capped here so dense bundles don't balloon. */
export const MAX_EDGE_CURVATURE_RATIO = 0.6;

/**
 * How far edge `edgeIndex` of `allEdges` should bow.
 *
 * Curvature direction follows the edge's port offset from the side centreline:
 * a port above centre curves further up, one below curves further down. Without
 * that alignment, two parallel edges assigned alternating ports get curves that
 * bulge *toward* each other across the midline — the very crossings the port
 * assignment exists to prevent. The legacy alternating-sign formula stays as
 * the fallback for edges with no port stamps.
 */
export function calculateCurvatureWithIndex(
  allEdges: RoutedEdge[],
  edgeIndex: number
): number {
  const edgeCount = allEdges.length;
  if (edgeCount <= 1) {
    return 0;
  }

  // Prefer port-aligned curvature. Parallel edges get the same sort order at
  // both ends, so the source-side port index also aligns the target end.
  const edge = allEdges[edgeIndex];
  const portIndex = edge?._sourcePortIndex;
  const portCount = edge?._sourcePortCount;
  if (
    typeof portIndex === 'number' &&
    typeof portCount === 'number' &&
    portCount > 1
  ) {
    // Port index → signed offset in [-1, +1] from the centreline. The scale
    // matches the legacy peak magnitude of count × BASE: 2 ports give the outer
    // edge ±1 × 2 × 0.15 = ±0.3, 4 ports give ±0.6 (the clamped legacy value).
    const centerOffset = (portIndex - (portCount - 1) / 2) / ((portCount - 1) / 2);
    return centerOffset * portCount * CURVATURE_BASE_MULTIPLIER;
  }

  // Legacy fallback: alternating sign by edge index.
  return (edgeIndex % 2 === 0 ? 1 : -1) *
          (Math.floor(edgeIndex / 2) + 1) *
          CURVATURE_BASE_MULTIPLIER *
          edgeCount;
}

/**
 * Moves an edge's endpoints off their nodes' side centres so parallel siblings
 * don't overlap. Prefers port distribution; falls back to a legacy alternating
 * offset for edges with no port stamps. Mutates and returns `route`.
 */
export function applyEdgeOffsetWithIndex(
  edgeData: RoutedEdge,
  route: Point[],
  angle: number,
  edgeIndex: number,
  distance: number
): Point[] {
  const direction = dominantDirection(angle);

  const sourcePortCount = edgeData._sourcePortCount;
  const targetPortCount = edgeData._targetPortCount;
  const hasPortInfo = edgeData._sourcePortIndex !== undefined &&
                      sourcePortCount !== undefined && sourcePortCount > 1;
  const hasTargetPortInfo = edgeData._targetPortIndex !== undefined &&
                            targetPortCount !== undefined && targetPortCount > 1;

  if (hasPortInfo || hasTargetPortInfo) {
    applyPortBasedOffset(route, edgeData, direction, hasPortInfo, hasTargetPortInfo);
  } else {
    const offset = (edgeIndex % 2 === 0 ? 1 : -1) *
                    (Math.floor(edgeIndex / 2) + 1) *
                    MIN_EDGE_DISTANCE;
    const cappedOffset = clampOffset(offset, distance);

    if (direction === 'right' || direction === 'left') {
      route[0].y += cappedOffset;
      route[route.length - 1].y += cappedOffset;
    } else if (direction === 'up' || direction === 'down') {
      route[0].x += cappedOffset;
      route[route.length - 1].x += cappedOffset;
    }
  }

  // Offsetting can push an endpoint off its node — pull it back on.
  if (edgeData.source.innerBounds) {
    route[0] = closestPointOnRect(edgeData.source.innerBounds, route[0]);
  }
  if (edgeData.target.innerBounds) {
    route[route.length - 1] = closestPointOnRect(edgeData.target.innerBounds, route[route.length - 1]);
  }

  return route;
}

/** Caps an endpoint offset so dense bundles don't fan out past the edge itself. */
export function clampOffset(offset: number, distance: number): number {
  const maxOffset = Math.max(MIN_EDGE_DISTANCE, distance * MAX_EDGE_OFFSET_RATIO);
  return Math.max(-maxOffset, Math.min(maxOffset, offset));
}

/** Caps curvature so many parallel edges don't bulge without limit. */
export function clampCurvature(curvature: number): number {
  return Math.max(-MAX_EDGE_CURVATURE_RATIO, Math.min(MAX_EDGE_CURVATURE_RATIO, curvature));
}

/**
 * Bows a route's interior points by `curvature`, scaled by the edge length and
 * shared out between the axes by the edge angle. Endpoints stay put — they are
 * already on their node perimeters. Mutates and returns `route`.
 */
export function applyCurvatureToRoute(
  route: Point[],
  curvature: number,
  angle: number,
  distance: number
): Point[] {
  if (curvature === 0) return route;

  route.forEach((point, index) => {
    if (index > 0 && index < route.length - 1) {
      point.x += curvature * Math.abs(Math.sin(angle)) * distance;
      point.y += curvature * Math.abs(Math.cos(angle)) * distance;
    }
  });

  return route;
}
