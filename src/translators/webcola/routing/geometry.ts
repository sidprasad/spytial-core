import type { BoundsRect, ObstacleRect, Point } from './types';

/**
 * Pure geometry shared by routers and the component's port machinery.
 * Everything here is stateless and directly unit-testable.
 */

/**
 * Given a point `inside` a rectangle and another point `outside` (or at
 * least farther along the ray direction), returns the point where the line
 * from `inside` toward `outside` exits the rectangle.
 *
 * Used to clip the source-center → target-center line to the source and
 * target rectangle perimeters so the arrowhead lands on the rendered
 * boundary.
 */
export function clipLineToRectExit(
  inside: Point,
  outside: Point,
  rect: BoundsRect
): Point {
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  if (dx === 0 && dy === 0) return { x: inside.x, y: inside.y };

  const left = rect.x;
  const right = rect.x + rect.width();
  const top = rect.y;
  const bottom = rect.y + rect.height();

  const candidates: number[] = [];
  if (dx > 0) candidates.push((right - inside.x) / dx);
  else if (dx < 0) candidates.push((left - inside.x) / dx);
  if (dy > 0) candidates.push((bottom - inside.y) / dy);
  else if (dy < 0) candidates.push((top - inside.y) / dy);

  // Smallest positive t is the first boundary crossing from `inside`.
  let t = Infinity;
  for (const c of candidates) {
    if (c > 0 && c < t) t = c;
  }
  if (!Number.isFinite(t)) return { x: inside.x, y: inside.y };

  return { x: inside.x + t * dx, y: inside.y + t * dy };
}

/** True if `point` lies on the perimeter of `rect`, within `tolerance` px. */
export function isPointOnRectPerimeter(
  point: Point,
  rect: BoundsRect,
  tolerance: number = 1
): boolean {
  const left = rect.x;
  const right = rect.x + rect.width();
  const top = rect.y;
  const bottom = rect.y + rect.height();
  const withinX = point.x >= left - tolerance && point.x <= right + tolerance;
  const withinY = point.y >= top - tolerance && point.y <= bottom + tolerance;
  if (!withinX || !withinY) return false;
  return (
    Math.abs(point.x - left) <= tolerance ||
    Math.abs(point.x - right) <= tolerance ||
    Math.abs(point.y - top) <= tolerance ||
    Math.abs(point.y - bottom) <= tolerance
  );
}

/**
 * Outward unit normal of the rect side that `point` lies on (nearest side).
 */
export function sideNormal(point: Point, bounds: BoundsRect): Point {
  const left = bounds.x, right = bounds.x + bounds.width();
  const top = bounds.y, bottom = bounds.y + bounds.height();
  const dL = Math.abs(point.x - left);
  const dR = Math.abs(point.x - right);
  const dT = Math.abs(point.y - top);
  const dB = Math.abs(point.y - bottom);
  const min = Math.min(dL, dR, dT, dB);
  if (min === dL) return { x: -1, y: 0 };
  if (min === dR) return { x: 1, y: 0 };
  if (min === dT) return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

/**
 * Liang–Barsky test: true only if a→b penetrates the rect's open interior.
 * Touching an edge or corner returns false (so corner-incident routing
 * segments aren't spuriously blocked).
 */
export function segmentEntersRect(a: Point, b: Point, r: ObstacleRect): boolean {
  const EPS = 1e-6;
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.minX, r.maxX - a.x, a.y - r.minY, r.maxY - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < 0) return false; // parallel to this slab and outside it
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  if (t1 - t0 <= EPS) return false; // only touches the boundary
  const mx = a.x + ((t0 + t1) / 2) * dx;
  const my = a.y + ((t0 + t1) / 2) * dy;
  return mx > r.minX + EPS && mx < r.maxX - EPS && my > r.minY + EPS && my < r.maxY - EPS;
}

/**
 * True if segment a→b passes through the OPEN interior of any obstacle, except
 * those at index `ownerA`/`ownerB` (the obstacles owning a's/b's corners —
 * their perimeters legitimately touch the segment). Merely grazing an edge or
 * corner is not a block.
 */
export function anyObstacleBlocks(
  a: Point,
  b: Point,
  obstacles: ObstacleRect[],
  ownerA: number,
  ownerB: number
): boolean {
  for (let i = 0; i < obstacles.length; i++) {
    if (i === ownerA || i === ownerB) continue;
    if (segmentEntersRect(a, b, obstacles[i])) return true;
  }
  return false;
}

/** True if `p` is strictly inside any obstacle. */
export function pointInAnyObstacle(p: Point, obstacles: ObstacleRect[]): boolean {
  for (const o of obstacles) {
    if (p.x > o.minX && p.x < o.maxX && p.y > o.minY && p.y < o.maxY) return true;
  }
  return false;
}

/**
 * True if any segment of `route` passes through the interior of any obstacle.
 * Used to reject obstacle-blind post-steps (e.g. parallel-edge fanning) that
 * would push a route back through a node.
 */
export function routePolylineClips(route: Point[], obstacles: ObstacleRect[]): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    if (anyObstacleBlocks(route[i], route[i + 1], obstacles, -1, -1)) return true;
  }
  return false;
}

/** Drops duplicate and collinear interior waypoints from a polyline. */
export function simplifyCollinear(route: Point[]): Point[] {
  if (route.length <= 2) return route;
  const out = [route[0]];
  for (let i = 1; i < route.length - 1; i++) {
    const a = out[out.length - 1], b = route[i], c = route[i + 1];
    const dup = Math.abs(b.x - a.x) < 1e-6 && Math.abs(b.y - a.y) < 1e-6;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (!dup && Math.abs(cross) > 1e-6) out.push(b);
  }
  out.push(route[route.length - 1]);
  return out;
}

/** Total polyline length in px. */
export function getRouteLength(route: Point[]): number {
  if (route.length < 2) {
    return 0;
  }

  return route.slice(1).reduce((total, point, index) => {
    const prev = route[index];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    return total + Math.sqrt(dx * dx + dy * dy);
  }, 0);
}

/**
 * The compass direction an edge at `angle` (radians) mostly runs in, or null if
 * the angle is not finite. Drives which axis ports distribute along and which
 * way an offset pushes an endpoint.
 */
export function dominantDirection(angle: number): 'right' | 'up' | 'left' | 'down' | null {
  // Normalize to (-π, π].
  const a = ((angle + Math.PI) % (2 * Math.PI)) - Math.PI;

  if (a >= -Math.PI / 4 && a <= Math.PI / 4) {
    return 'right';
  } else if (a > Math.PI / 4 && a < 3 * Math.PI / 4) {
    return 'up';
  } else if (a >= 3 * Math.PI / 4 || a <= -3 * Math.PI / 4) {
    return 'left';
  } else if (a > -3 * Math.PI / 4 && a < -Math.PI / 4) {
    return 'down';
  }

  return null;
}

/**
 * Inserts "tangent guide" points near each endpoint of a multi-point route so
 * that d3.curveBasis leaves and enters along the actual first/final segment.
 * Without them, interior control points pull the endpoint tangent off-axis and
 * arrowhead markers (orient="auto") render at odd angles.
 *
 * TWO collinear guides go in at each end (far + near) so the spline's last two
 * or three control points all sit on the desired tangent line; a single guide
 * left enough slack for interior bends to still skew the tangent. Straight
 * 2-point routes already have the right tangent and are returned as-is.
 */
export function addTangentGuides(route: Point[]): Point[] {
  if (route.length <= 2) return route;

  // The far guide steers the cubic block's far control; the near guide locks
  // the immediate tangent. Both must be collinear with their segment.
  const FAR_MAX = 8;   // px
  const NEAR_MAX = 2;  // px
  const result = [...route];

  // ── End: guides along the final segment direction ──
  const last = result.length - 1;
  const dxE = result[last].x - result[last - 1].x;
  const dyE = result[last].y - result[last - 1].y;
  const lenE = Math.sqrt(dxE * dxE + dyE * dyE);
  if (lenE > 0.5) {
    const ux = dxE / lenE;
    const uy = dyE / lenE;
    // Cap each guide at a fraction of the segment so very short final segments
    // still get guides — those are exactly the cases where the arrow looks
    // worst, and the legacy 6px cutoff dropped them.
    const farDist = Math.min(FAR_MAX, lenE * 0.5);
    const nearDist = Math.min(NEAR_MAX, lenE * 0.2);
    if (farDist > nearDist + 0.1) {
      // Order: ..., farGuide, nearGuide, last
      result.splice(last, 0,
        { x: result[last].x - ux * farDist, y: result[last].y - uy * farDist },
        { x: result[last].x - ux * nearDist, y: result[last].y - uy * nearDist }
      );
    } else {
      // Segment too short for two distinct guides — emit just the near one.
      result.splice(last, 0,
        { x: result[last].x - ux * nearDist, y: result[last].y - uy * nearDist }
      );
    }
  }

  // ── Start: guides along the first segment direction ──
  const dx0 = result[1].x - result[0].x;
  const dy0 = result[1].y - result[0].y;
  const len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
  if (len0 > 0.5) {
    const ux = dx0 / len0;
    const uy = dy0 / len0;
    const farDist = Math.min(FAR_MAX, len0 * 0.5);
    const nearDist = Math.min(NEAR_MAX, len0 * 0.2);
    if (farDist > nearDist + 0.1) {
      // Order: 0, nearGuide, farGuide, ...
      result.splice(1, 0,
        { x: result[0].x + ux * nearDist, y: result[0].y + uy * nearDist },
        { x: result[0].x + ux * farDist, y: result[0].y + uy * farDist }
      );
    } else {
      result.splice(1, 0,
        { x: result[0].x + ux * nearDist, y: result[0].y + uy * nearDist }
      );
    }
  }

  return result;
}
