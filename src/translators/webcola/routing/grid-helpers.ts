import type { Point } from './types';

/**
 * Pure route-cleanup helpers for the grid (orthogonal) pipeline. The pipeline
 * itself — WebCola's GridRouter, the SVG updaters, fallbacks — stays in the
 * component; these functions only rewrite polylines.
 */

/** Flattens Cola GridRouter segment output ([start, end] pairs) into a point list. */
export function gridRouteToPoints(route: any[]): Point[] {
  const points: Point[] = [];
  route.forEach((segment: any, index: number) => {
    if (index === 0) {
      points.push({ x: segment[0].x, y: segment[0].y });
    }
    points.push({ x: segment[1].x, y: segment[1].y });
  });
  return points;
}

/** Inverse of gridRouteToPoints: point list back to [start, end] segment pairs. */
export function pointsToGridRoute(points: Point[]): Point[][] {
  const segments: Point[][] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push([points[i], points[i + 1]]);
  }
  return segments;
}

/**
 * Drops interior points that are collinear with their immediate neighbors.
 * For an orthogonal route, "collinear" means three consecutive points share
 * the same X (vertical line) or the same Y (horizontal line), to a small
 * float tolerance. This also removes backtrack spurs (a middle point lying
 * BEYOND its successor on the shared axis): the direct segment covers a
 * subset of the line the two original segments covered, so the drop can
 * never introduce a collision.
 */
export function dropCollinearGridPoints(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const EPS = 0.01;
  const eq = (a: number, b: number) => Math.abs(a - b) < EPS;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const cur = points[i];
    const next = points[i + 1];
    const collinearX = eq(prev.x, cur.x) && eq(cur.x, next.x);
    const collinearY = eq(prev.y, cur.y) && eq(cur.y, next.y);
    const duplicate = eq(prev.x, cur.x) && eq(prev.y, cur.y);
    if (collinearX || collinearY || duplicate) continue; // cur is redundant
    result.push(cur);
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Returns true if an axis-aligned segment from `a` to `b` doesn't pass through
 * any node's bounds (with a small margin), excluding nodes whose ids are in
 * `excludeIds` (typically the segment's edge endpoints).
 *
 * Returns false on non-axis-aligned input — flattenGridRouteZShapes only ever
 * produces axis-aligned segments, so this is a defensive guard.
 */
export function isOrthogonalSegmentClearOfNodes(
  a: Point,
  b: Point,
  nodes: any[],
  excludeIds: Set<string>,
  margin: number
): boolean {
  const isHorizontal = a.y === b.y;
  const isVertical = a.x === b.x;
  if (!isHorizontal && !isVertical) return false;

  for (const node of nodes) {
    if (excludeIds.has(node.id)) continue;
    const bounds = node.bounds || node.innerBounds;
    if (!bounds) continue;

    const widthFn = typeof bounds.width === 'function' ? bounds.width() : 0;
    const heightFn = typeof bounds.height === 'function' ? bounds.height() : 0;
    const nx = (typeof bounds.x === 'number' ? bounds.x : 0) - margin;
    const nX = (bounds.X !== undefined ? bounds.X : (bounds.x || 0) + widthFn) + margin;
    const ny = (typeof bounds.y === 'number' ? bounds.y : 0) - margin;
    const nY = (bounds.Y !== undefined ? bounds.Y : (bounds.y || 0) + heightFn) + margin;

    if (isHorizontal) {
      if (a.y < ny || a.y > nY) continue; // Outside node's y-range
      const xMin = Math.min(a.x, b.x);
      const xMax = Math.max(a.x, b.x);
      if (xMax < nx || xMin > nX) continue; // No x-overlap
      return false; // Segment passes through this node
    } else {
      if (a.x < nx || a.x > nX) continue;
      const yMin = Math.min(a.y, b.y);
      const yMax = Math.max(a.y, b.y);
      if (yMax < ny || yMin > nY) continue;
      return false;
    }
  }
  return true;
}

/**
 * Replaces 4-point Z-shapes with 2-point L-shapes when the alternate corner
 * is collision-free. See flattenGridRouteBends for the surrounding context.
 * Cap is per-call; the caller iterates this with the collinear pass until
 * stable, so the per-call cap mainly bounds worst-case work on a single
 * pathological route.
 */
export function flattenGridRouteZShapes(
  points: Point[],
  nodes: any[],
  edge: any
): Point[] {
  const MAX_FLATTEN_ATTEMPTS = 16;
  const NODE_COLLISION_MARGIN = 2; // px

  // Endpoints belong to the edge's source/target; excluded from collision checks.
  const excludeIds = new Set<string>();
  if (edge?.source?.id) excludeIds.add(edge.source.id);
  if (edge?.target?.id) excludeIds.add(edge.target.id);

  const result = points.slice();
  let flattens = 0;
  let i = 0;
  while (i + 3 < result.length && flattens < MAX_FLATTEN_ATTEMPTS) {
    const a = result[i];
    const b = result[i + 1];
    const c = result[i + 2];
    const d = result[i + 3];

    // Z-shape requires AB and CD to be parallel-and-offset (segments alternate
    // orthogonal axes). After collinear merge, axes alternate by construction,
    // so the structural test is "AB parallel to CD" → A.y === B.y matches C.y === D.y.
    const abHorizontal = a.y === b.y;
    const cdHorizontal = c.y === d.y;
    const isZ = abHorizontal === cdHorizontal && (
      abHorizontal ? a.y !== d.y : a.x !== d.x
    );
    if (!isZ) {
      i++;
      continue;
    }

    // Try both alternate corners for the replacement L.
    const candidates: Point[] = [
      { x: a.x, y: d.y },
      { x: d.x, y: a.y },
    ];
    let replaced = false;
    for (const m of candidates) {
      if (
        isOrthogonalSegmentClearOfNodes(a, m, nodes, excludeIds, NODE_COLLISION_MARGIN) &&
        isOrthogonalSegmentClearOfNodes(m, d, nodes, excludeIds, NODE_COLLISION_MARGIN)
      ) {
        result.splice(i + 1, 2, m); // Replace b, c with m → removes one bend.
        flattens++;
        replaced = true;
        break;
      }
    }
    if (!replaced) i++;
    // If replaced, don't advance i — re-check from the same position in case
    // the new L can be flattened further with the next neighbor.
  }
  return result;
}

/**
 * Flattens 5-point "U-bump" patterns A→B→C→D→E where A and E are collinear
 * (same X or same Y, i.e. the bump is a detour off a straight line) and the
 * direct A→E segment is clear of non-endpoint nodes. Replaces B,C,D with
 * nothing — removes two bends in one shot.
 *
 * Companion to flattenGridRouteZShapes: Z-flatten removes one bend per
 * 4-point window; U-flatten removes two when the bump was just an avoidable
 * detour. Common after Z-flatten exposes a collinear endpoint pair.
 */
export function flattenGridRouteUBumps(
  points: Point[],
  nodes: any[],
  edge: any
): Point[] {
  if (points.length < 5) return points;
  const MAX_FLATTEN_ATTEMPTS = 16;
  const NODE_COLLISION_MARGIN = 2;

  const excludeIds = new Set<string>();
  if (edge?.source?.id) excludeIds.add(edge.source.id);
  if (edge?.target?.id) excludeIds.add(edge.target.id);

  const result = points.slice();
  let flattens = 0;
  let i = 0;
  while (i + 4 < result.length && flattens < MAX_FLATTEN_ATTEMPTS) {
    const a = result[i];
    const e = result[i + 4];

    // U-bump: A and E share an axis (so A→E is itself orthogonal).
    const sameX = Math.abs(a.x - e.x) < 0.001;
    const sameY = Math.abs(a.y - e.y) < 0.001;
    if (!(sameX || sameY)) {
      i++;
      continue;
    }
    // Reject degenerate case: A == E.
    if (sameX && sameY) {
      i++;
      continue;
    }

    if (isOrthogonalSegmentClearOfNodes(a, e, nodes, excludeIds, NODE_COLLISION_MARGIN)) {
      result.splice(i + 1, 3); // drop B, C, D
      flattens++;
      // Don't advance — the new A→E neighborhood may itself participate in
      // another U-bump or Z with the next point.
    } else {
      i++;
    }
  }
  return result;
}

/**
 * Removes redundant bends from an orthogonal grid route (Tier 1.4).
 *
 * Two passes:
 *   1. Collinear merge — drop interior points that are collinear with their
 *      immediate neighbors. Always safe (no geometry change), no collision
 *      check needed.
 *   2. Z-shape flattening — for each 4-point Z (A→B→C→D where AB and CD are
 *      parallel and offset), try replacing B and C with a single corner M at
 *      either (A.x, D.y) or (D.x, A.y). Accept whichever produces an
 *      orthogonal L that doesn't pass through any non-endpoint node bounds.
 *      Each successful replacement removes one bend.
 *
 * Performance guardrails:
 *   - Caller already gates on edge count ≤ CROSSING_OPTIMIZATION_EDGE_THRESHOLD.
 *   - Z-shape pass is capped at MAX_FLATTEN_ATTEMPTS successful flattens per
 *     edge — diminishing returns past 2.
 *   - Returns the original route unchanged on any error (defensive).
 *
 * @param route - Cola GridRouter output (array of [start, end] segments)
 * @param nodes - All current layout nodes (for collision checks)
 * @param edge - The edge being flattened (its endpoints are excluded from collision checks)
 */
export function flattenGridRouteBends(route: any[], nodes: any[], edge: any): any[] {
  try {
    if (!route || route.length < 2) return route;

    const original = gridRouteToPoints(route);
    if (original.length < 3) return route;

    // Iterate (collinear-merge → Z-flatten → U-flatten) until no pass
    // changes the route. Each flatten can expose new collinear points or
    // new flatten targets, so a single pass leaves easy wins on the table.
    // Bounded by a hard MAX_ITERATIONS so a pathological route can't loop.
    const MAX_ITERATIONS = 6;
    let points = original;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const before = points.length;
      points = dropCollinearGridPoints(points);
      points = flattenGridRouteZShapes(points, nodes, edge);
      points = flattenGridRouteUBumps(points, nodes, edge);
      if (points.length === before) break; // converged
    }

    // No changes? Return original route to avoid pointless allocation churn.
    if (points.length === original.length) return route;

    return pointsToGridRoute(points);
  } catch (e) {
    console.warn('[flattenGridRouteBends] Failed; returning original route:', e);
    return route;
  }
}

/**
 * Draw-time cleanup for a fully adjusted orthogonal polyline (after endpoint
 * clipping and port shifts). Iterates collinear/backtrack-spur removal with
 * the Z- and U-flatten passes until stable, mirroring flattenGridRouteBends —
 * which runs earlier, on the raw GridRouter output, and therefore can't see
 * artifacts introduced by the draw-time adjustments.
 *
 * The collinear/spur pass is O(points) and always runs. The Z/U passes scan
 * nodes per candidate segment, so `allowFlatten` should carry the same
 * edge-count gate as the other O(E·N) polish passes
 * (CROSSING_OPTIMIZATION_EDGE_THRESHOLD).
 */
export function cleanupOrthogonalRoute(
  points: Point[],
  nodes: any[],
  edge: any,
  allowFlatten: boolean
): Point[] {
  if (!points || points.length < 3) return points;
  const MAX_ITERATIONS = 6;
  let out = points;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const before = out.length;
    out = dropCollinearGridPoints(out);
    if (allowFlatten) {
      out = flattenGridRouteZShapes(out, nodes, edge);
      out = flattenGridRouteUBumps(out, nodes, edge);
    }
    if (out.length === before) break; // converged
  }
  return out;
}
