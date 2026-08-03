import type { ObstacleRect, Point } from './types';
import { anyObstacleBlocks, clipLineToRectExit, getRouteLength, simplifyCollinear } from './geometry';
import {
  EDGE_CLEARANCE_PX,
  EDGE_STUB_LENGTH_PX,
  routeTautPolyline,
  TAUT_BEND_PENALTY_PX,
} from './taut-router';

/**
 * Obstacle-aware port side selection.
 *
 * The component historically attached every edge where the center-to-center
 * ray leaves each rect — blind to obstacles. For a long edge over a chain of
 * blockers (a linked list's skip pointer), that commits the port to the side
 * facing the first blocker, and the router can only hook around it: exit
 * horizontally, kink up, run across, kink back down. The right rendering is
 * an arc — leave from the top (or bottom), run over the chain, land on the
 * matching side.
 *
 * choosePortSides keeps the natural (ray-clip) sides for every unblocked
 * edge, and only when the straight port-to-port line is blocked does it
 * score perpendicular same-side pairs against the natural pair. Scoring
 * routes each candidate with the taut router and charges length, bends, and
 * S-curves (turn-direction alternations — the "hook" signature); a flip must
 * beat natural by a small bias so marginal cases keep today's behavior.
 */

export type RectSide = 'top' | 'bottom' | 'left' | 'right';

/** Visible (uninflated) rectangle in min/max form. */
export interface SideRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PortSideChoice {
  exitSide: RectSide;
  entrySide: RectSide;
  /** True when an alternative pair beat the natural ray-clip sides. */
  flipped: boolean;
}

export const SIDE_NORMALS: Record<RectSide, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** Extra cost per turn-direction alternation (an S-curve reads as a hook). */
export const PORT_SIDE_SCURVE_PENALTY_PX = 40;
/** How much cheaper an alternative pair must be before it replaces natural. */
export const PORT_SIDE_FLIP_BIAS_PX = 10;

const center = (r: SideRect): Point => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });

/** The side the center→`toward` ray exits through (aspect-ratio aware). */
export function naturalExitSide(rect: SideRect, toward: Point): RectSide {
  const c = center(rect);
  const hw = Math.max(1e-6, (rect.maxX - rect.minX) / 2);
  const hh = Math.max(1e-6, (rect.maxY - rect.minY) / 2);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (Math.abs(dx) / hw >= Math.abs(dy) / hh) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** Midpoint of one side of a rect. */
export function sideCenter(rect: SideRect, side: RectSide): Point {
  const c = center(rect);
  switch (side) {
    case 'left': return { x: rect.minX, y: c.y };
    case 'right': return { x: rect.maxX, y: c.y };
    case 'top': return { x: c.x, y: rect.minY };
    case 'bottom': return { x: c.x, y: rect.maxY };
  }
}

/** Count of turn-direction sign changes along a polyline (S-curve measure). */
function turnAlternations(route: Point[]): number {
  let count = 0, prev = 0;
  for (let i = 0; i + 2 < route.length; i++) {
    const v1x = route[i + 1].x - route[i].x, v1y = route[i + 1].y - route[i].y;
    const v2x = route[i + 2].x - route[i + 1].x, v2y = route[i + 2].y - route[i + 1].y;
    const z = v1x * v2y - v1y * v2x;
    if (Math.abs(z) < 1e-6) continue;
    const s = z > 0 ? 1 : -1;
    if (prev !== 0 && s !== prev) count++;
    prev = s;
  }
  return count;
}

function routeCost(route: Point[]): number {
  return getRouteLength(route)
    + Math.max(0, route.length - 2) * TAUT_BEND_PENALTY_PX
    + turnAlternations(route) * PORT_SIDE_SCURVE_PENALTY_PX;
}

const asBounds = (r: SideRect) => ({
  x: r.minX,
  y: r.minY,
  width: () => r.maxX - r.minX,
  height: () => r.maxY - r.minY,
});

const inflateRect = (r: SideRect): ObstacleRect => ({
  minX: r.minX - EDGE_CLEARANCE_PX,
  minY: r.minY - EDGE_CLEARANCE_PX,
  maxX: r.maxX + EDGE_CLEARANCE_PX,
  maxY: r.maxY + EDGE_CLEARANCE_PX,
});

/**
 * Scores one candidate side pair. The route is anchored at stub points
 * pushed OUTSIDE the clearance zone, with both endpoint rects included as
 * obstacles for the middle — otherwise a side-center candidate could score
 * a "straight" line that actually passes through its own node (endpoints are
 * never obstacles for their own edge in the real router), which would make
 * impossible routes look cheap.
 */
function scorePair(
  p: Point, exit: RectSide,
  q: Point, entry: RectSide,
  obstaclesWithEndpoints: ObstacleRect[]
): number {
  const out = EDGE_CLEARANCE_PX + EDGE_STUB_LENGTH_PX;
  const n1 = SIDE_NORMALS[exit], n2 = SIDE_NORMALS[entry];
  const pOut = { x: p.x + n1.x * out, y: p.y + n1.y * out };
  const qOut = { x: q.x + n2.x * out, y: q.y + n2.y * out };
  const mid = routeTautPolyline(
    { point: pOut, normal: n1 },
    { point: qOut, normal: n2 },
    obstaclesWithEndpoints
  );
  return routeCost(simplifyCollinear([p, ...mid, q]));
}

/**
 * Picks the exit/entry sides for an edge from `src` to `tgt`.
 * `obstacles` is the edge's obstacle set (every other node's inflated rect,
 * WITHOUT the endpoints themselves). Pure — callable outside the component.
 */
export function choosePortSides(
  src: SideRect,
  tgt: SideRect,
  obstacles: ObstacleRect[]
): PortSideChoice {
  const sc = center(src), tc = center(tgt);
  const exitN = naturalExitSide(src, tc);
  const entryN = naturalExitSide(tgt, sc);
  const natural: PortSideChoice = { exitSide: exitN, entrySide: entryN, flipped: false };

  // Real natural attachments: where the center-to-center ray clips each rect.
  const pN = clipLineToRectExit(sc, tc, asBounds(src));
  const qN = clipLineToRectExit(tc, sc, asBounds(tgt));

  // Unblocked edges keep their obvious sides — one cheap test, no routing.
  if (!anyObstacleBlocks(pN, qN, obstacles, -1, -1)) return natural;

  const withEndpoints = [...obstacles, inflateRect(src), inflateRect(tgt)];
  const horizontal = exitN === 'left' || exitN === 'right';
  const alternatives: Array<[RectSide, RectSide]> = horizontal
    ? [['top', 'top'], ['bottom', 'bottom']]
    : [['left', 'left'], ['right', 'right']];

  let best = natural;
  let bestCost = scorePair(pN, exitN, qN, entryN, withEndpoints);
  for (const [e1, e2] of alternatives) {
    const cost = scorePair(sideCenter(src, e1), e1, sideCenter(tgt, e2), e2, withEndpoints);
    if (cost + PORT_SIDE_FLIP_BIAS_PX < bestCost) {
      best = { exitSide: e1, entrySide: e2, flipped: true };
      bestCost = cost;
    }
  }
  return best;
}
