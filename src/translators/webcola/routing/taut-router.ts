import type { EdgeRouter, ObstacleRect, Point, PortAttachment, RouterHost } from './types';
import {
  anyObstacleBlocks,
  getRouteLength,
  pointInAnyObstacle,
  routePolylineClips,
  simplifyCollinear,
} from './geometry';

// ── Taut edge router (consolidated curved routing) ──────────────────
//
// One obstacle model (visible rectangles + EDGE_CLEARANCE_PX), one port pass
// (owned by the component and exposed via RouterHost.portAttachment), one
// geometric router (corner-visibility shortest path), one interpolating
// smoother (filletPath). Replaced the legacy stack of WebCola routeEdge +
// direct-line fast path + perpendicular reroute + curveBasis/tangent-guides,
// all of which disagreed about where nodes are.

// Uniform clearance (px) added around each node's *visible* rectangle to form
// the router's obstacle set. Also caps the corner-fillet radius so the
// smoothed curve never bows back onto a node.
export const EDGE_CLEARANCE_PX = 6;
// Length (px) of the perpendicular exit/entry stub forced at each endpoint
// when the straight path is blocked, so arrows leave/enter normal to the node
// side (clean exit angle — the dominant readability factor).
export const EDGE_STUB_LENGTH_PX = 10;
// Per-edge cap on candidate obstacles for the visibility graph. Above this the
// router degrades to an L-bend/straight fallback, bounding worst-case
// O(V²·k) cost (V ≈ 2 + 4·obstacles).
export const MAX_ROUTER_OBSTACLES = 24;
// Extra path cost (px) charged per intermediate vertex (= per bend) in the
// visibility-graph shortest path. Pure Euclidean cost treats a 2-bend
// staircase and a 1-bend detour of equal length as ties; charging each bend
// makes the router prefer fewer, more deliberate corners when the length
// difference is small.
export const TAUT_BEND_PENALTY_PX = 15;
// Corner-fillet radius cap (px) for taut routes. May exceed EDGE_CLEARANCE_PX
// safely: a quadratic fillet of radius r deviates from its vertex toward the
// wrapped obstacle corner by at most r/2, and the vertex sits a diagonal
// EDGE_CLEARANCE_PX·√2 ≈ 8.5px away from that corner — so r = 10 keeps the
// curve clear of the node while reading much softer than a 6px fillet.
export const TAUT_FILLET_RADIUS_PX = 10;
// Successive curvature scales tried when fanning parallel edges between the
// same node pair. The fan post-step is obstacle-blind, so each scale is
// validated against the obstacle set and the first clear one wins; if even
// the smallest fan clips a node, the obstacle-aware base route is used.
export const TAUT_FAN_SCALES = [1, 0.6, 0.35];
// Corridor separation: two routes from DIFFERENT node pairs that run
// near-parallel closer than this for a long stretch read as one line
// ("tram-lining"). The separation pass bows one of them perpendicular so the
// pair ends up at least this far apart.
export const TAUT_CORRIDOR_SEPARATION_PX = 10;
// Minimum length (px) of the near-parallel overlap before it counts as a
// shared corridor — short brushes are left alone.
export const TAUT_CORRIDOR_MIN_OVERLAP_PX = 40;
/**
 * Edge-count gate above which the O(E²) post-routing polish passes (corridor
 * separation, and the grid bend flattener that shares this threshold) are
 * skipped. At E=50 there are C(50,2)=1225 pairs × ~10 segment-segment tests
 * each (still sub-millisecond on commodity hardware). The hard skip keeps
 * worst-case cost bounded.
 * See MAX_CROSSING_OPTIMIZATION_BUDGET_MS for the wall-clock safety net.
 */
export const CROSSING_OPTIMIZATION_EDGE_THRESHOLD = 50;
/**
 * Wall-clock budget (ms) for the corridor-separation pass. If it exceeds
 * this, we abort and accept the current routing. Acts as a safety net for
 * pathological graphs that fall below the edge-count gate but still take
 * long (e.g. very long polyline routes).
 */
export const MAX_CROSSING_OPTIMIZATION_BUDGET_MS = 30;

/**
 * Routes a taut, obstacle-avoiding polyline from src to tgt.
 *
 *   1. If the straight src→tgt segment is clear → [src, tgt].
 *   2. Otherwise build a corner-visibility graph over the inflated obstacle
 *      corners (+ perpendicular exit stubs) and return the shortest path
 *      (Dijkstra). The result hugs corners, so it never snakes and never
 *      crosses an obstacle by construction.
 *
 * The edge's own source/target are NOT in `obstacles`, so their perimeters
 * never block. Pure (no component state) for straightforward unit testing.
 */
export function routeTautPolyline(
  src: PortAttachment,
  tgt: PortAttachment,
  obstacles: ObstacleRect[]
): Point[] {
  const S = src.point, T = tgt.point;

  // (1) Straight test against all obstacles.
  if (!anyObstacleBlocks(S, T, obstacles, -1, -1)) {
    return [{ x: S.x, y: S.y }, { x: T.x, y: T.y }];
  }

  // Candidate obstacles: those intersecting the src/tgt AABB expanded by a
  // clearance + stub pad (where any relevant blocker/detour-corner lives).
  const stub = EDGE_STUB_LENGTH_PX;
  const pad = EDGE_CLEARANCE_PX + stub;
  const bbMinX = Math.min(S.x, T.x) - pad, bbMaxX = Math.max(S.x, T.x) + pad;
  const bbMinY = Math.min(S.y, T.y) - pad, bbMaxY = Math.max(S.y, T.y) + pad;
  const cand: ObstacleRect[] = [];
  for (const o of obstacles) {
    if (o.maxX < bbMinX || o.minX > bbMaxX || o.maxY < bbMinY || o.minY > bbMaxY) continue;
    cand.push(o);
  }
  if (cand.length === 0 || cand.length > MAX_ROUTER_OBSTACLES) {
    return lBendFallback(S, T, obstacles);
  }

  // Vertices: endpoints/stubs (owner −1) + four corners of each candidate
  // obstacle (owner = candidate index).
  type V = { x: number; y: number; owner: number };
  const sStub = { x: S.x + src.normal.x * stub, y: S.y + src.normal.y * stub };
  const tStub = { x: T.x + tgt.normal.x * stub, y: T.y + tgt.normal.y * stub };
  const sStubOk = !pointInAnyObstacle(sStub, cand) && !anyObstacleBlocks(S, sStub, cand, -1, -1);
  const tStubOk = !pointInAnyObstacle(tStub, cand) && !anyObstacleBlocks(T, tStub, cand, -1, -1);
  const startV: V = sStubOk ? { ...sStub, owner: -1 } : { x: S.x, y: S.y, owner: -1 };
  const endV: V = tStubOk ? { ...tStub, owner: -1 } : { x: T.x, y: T.y, owner: -1 };
  const verts: V[] = [startV, endV];
  cand.forEach((o, i) => {
    verts.push(
      { x: o.minX, y: o.minY, owner: i },
      { x: o.maxX, y: o.minY, owner: i },
      { x: o.maxX, y: o.maxY, owner: i },
      { x: o.minX, y: o.maxY, owner: i },
    );
  });

  const n = verts.length;
  const START = 0, END = 1;

  // Visibility must be tested against every obstacle a graph segment could
  // touch — not just `cand`. A detour corner can sit far outside the src/tgt
  // AABB (e.g. above a tall blocker), so a segment between two vertices may
  // cross an obstacle that the AABB pre-filter dropped from `cand`. Expand to
  // all obstacles intersecting the bounding box of the vertices — which bounds
  // every possible segment — so Dijkstra never routes through a node that the
  // candidate filter ignored. (`cand` is still what seeds the graph vertices.)
  let vbMinX = Infinity, vbMinY = Infinity, vbMaxX = -Infinity, vbMaxY = -Infinity;
  for (const v of verts) {
    if (v.x < vbMinX) vbMinX = v.x;
    if (v.x > vbMaxX) vbMaxX = v.x;
    if (v.y < vbMinY) vbMinY = v.y;
    if (v.y > vbMaxY) vbMaxY = v.y;
  }
  const visObstacles = obstacles.filter(o =>
    !(o.maxX < vbMinX || o.minX > vbMaxX || o.maxY < vbMinY || o.minY > vbMaxY));

  // A segment is visible iff it never penetrates an obstacle's OPEN interior.
  // segmentEntersRect treats boundary contact (corner/edge grazing) as
  // non-blocking, so corners lying on their own obstacle's perimeter — and
  // adjacent-corner segments running along an edge — are allowed, while a
  // diagonal through a rect, or a segment that leaves a corner and re-enters
  // the same rect, is correctly rejected. (Owner-skipping is unsound: leaving
  // a corner can dip back into the very obstacle that owns it.)
  const visible = (a: V, b: V): boolean => !anyObstacleBlocks(a, b, visObstacles, -1, -1);

  // Dijkstra over the (dense) visibility graph. Every intermediate vertex on
  // a path is an obstacle corner the route bends around, so each is charged
  // TAUT_BEND_PENALTY_PX on top of Euclidean length — between near-equal
  // candidates, the path with fewer corners wins (no staircase ties).
  const bendPenalty = TAUT_BEND_PENALTY_PX;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[START] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u === -1 || u === END) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u || !visible(verts[u], verts[v])) continue;
      const dx = verts[u].x - verts[v].x, dy = verts[u].y - verts[v].y;
      const w = Math.sqrt(dx * dx + dy * dy) + (v === END ? 0 : bendPenalty);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }

  if (!Number.isFinite(dist[END])) {
    return lBendFallback(S, T, obstacles);
  }

  const path: Point[] = [];
  for (let at = END; at !== -1; at = prev[at]) path.push({ x: verts[at].x, y: verts[at].y });
  path.reverse();

  // Prepend/append the true endpoints if we routed from stubs.
  const out: Point[] = [];
  if (sStubOk) out.push({ x: S.x, y: S.y });
  out.push(...path);
  if (tStubOk) out.push({ x: T.x, y: T.y });

  return simplifyCollinear(out);
}

/**
 * Fallback when the visibility graph is unusable (no candidates, over the cap,
 * or disconnected): try the two axis-aligned L-bends, pick a clear one, else
 * return the straight segment.
 */
export function lBendFallback(S: Point, T: Point, obstacles: ObstacleRect[]): Point[] {
  for (const c of [{ x: T.x, y: S.y }, { x: S.x, y: T.y }]) {
    if (
      !pointInAnyObstacle(c, obstacles) &&
      !anyObstacleBlocks(S, c, obstacles, -1, -1) &&
      !anyObstacleBlocks(c, T, obstacles, -1, -1)
    ) {
      return simplifyCollinear([{ x: S.x, y: S.y }, c, { x: T.x, y: T.y }]);
    }
  }
  return [{ x: S.x, y: S.y }, { x: T.x, y: T.y }];
}

/**
 * Builds an SVG path for a polyline with bounded-radius rounded corners. Each
 * interior vertex is rounded with a quadratic Bézier whose trim radius is
 * capped at TAUT_FILLET_RADIUS_PX and half of each adjacent segment — the
 * radius constant documents why that cap can't bow the curve onto a node.
 * Unlike d3.curveBasis (which approximates and can bulge inward), the
 * polyline is interpolated exactly: endpoints and straight runs are
 * preserved, giving clean perpendicular exits.
 */
export function filletPath(route: Point[]): string {
  if (!route || route.length === 0) return '';
  if (route.length === 1) return `M ${route[0].x} ${route[0].y}`;
  if (route.length === 2) {
    return `M ${route[0].x} ${route[0].y} L ${route[1].x} ${route[1].y}`;
  }
  const rMax = TAUT_FILLET_RADIUS_PX;
  let d = `M ${route[0].x} ${route[0].y}`;
  for (let i = 1; i < route.length - 1; i++) {
    const p0 = route[i - 1], p1 = route[i], p2 = route[i + 1];
    const v1x = p0.x - p1.x, v1y = p0.y - p1.y;
    const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) { d += ` L ${p1.x} ${p1.y}`; continue; }
    const rad = Math.min(rMax, l1 / 2, l2 / 2);
    const a = { x: p1.x + (v1x / l1) * rad, y: p1.y + (v1y / l1) * rad };
    const b = { x: p1.x + (v2x / l2) * rad, y: p1.y + (v2y / l2) * rad };
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = route[route.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// ── Corridor separation ──────────────────────────────────────────────

interface ParallelOverlap {
  segA: number;
  segB: number;
  dir: Point;
  sStart: number;
  sEnd: number;
  lateral: number;
  side: number;
}

/**
 * Finds the longest near-parallel close approach between two polylines: the
 * window along one of A's segments where B's segment runs within
 * TAUT_CORRIDOR_SEPARATION_PX on one side. Because the segments may be
 * slightly skew, the lateral distance is linear along the window — the
 * window is wherever it stays under the threshold (this catches both true
 * parallel corridors and "pinches" where two routes converge).
 *
 * Returns the A-segment index, B-segment index, A's unit direction, the
 * window [sStart, sEnd] in px along A's segment, the mean lateral distance
 * inside the window, and which side of A the approach is on (+1/-1) — or
 * null if no window of at least TAUT_CORRIDOR_MIN_OVERLAP_PX exists.
 */
export function findParallelOverlap(
  routeA: Point[],
  routeB: Point[]
): ParallelOverlap | null {
  const SEP = TAUT_CORRIDOR_SEPARATION_PX;
  const MIN_OVERLAP = TAUT_CORRIDOR_MIN_OVERLAP_PX;
  const SIN_MAX_ANGLE = 0.15; // ≈ 8.6° — segments more skewed than this aren't a corridor
  let best: (ParallelOverlap & { windowLen: number }) | null = null;

  for (let i = 0; i < routeA.length - 1; i++) {
    const a1 = routeA[i], a2 = routeA[i + 1];
    const ax = a2.x - a1.x, ay = a2.y - a1.y;
    const aLen = Math.hypot(ax, ay);
    if (aLen < MIN_OVERLAP) continue;
    const ux = ax / aLen, uy = ay / aLen;

    for (let j = 0; j < routeB.length - 1; j++) {
      const b1 = routeB[j], b2 = routeB[j + 1];
      const bx = b2.x - b1.x, by = b2.y - b1.y;
      const bLen = Math.hypot(bx, by);
      if (bLen < MIN_OVERLAP) continue;
      // Near-parallel in either direction.
      const sinAngle = Math.abs(ux * (by / bLen) - uy * (bx / bLen));
      if (sinAngle > SIN_MAX_ANGLE) continue;

      // B's endpoints in A's frame: longitudinal t (along u), lateral (along
      // the perpendicular n = (uy, -ux)). Lateral varies linearly with t.
      const t1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
      const t2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
      const lat1 = (b1.x - a1.x) * uy - (b1.y - a1.y) * ux;
      const lat2 = (b2.x - a1.x) * uy - (b2.y - a1.y) * ux;
      if (Math.abs(t2 - t1) < 1e-6) continue;

      // lat(s) = lat1 + (s - t1) * slope over s in the projected span.
      const slope = (lat2 - lat1) / (t2 - t1);
      const spanMin = Math.max(0, Math.min(t1, t2));
      const spanMax = Math.min(aLen, Math.max(t1, t2));
      if (spanMax - spanMin < MIN_OVERLAP) continue;
      const latAt = (s: number) => lat1 + (s - t1) * slope;

      // Window where |lat(s)| < SEP, intersected with the span. Since lat is
      // linear, solve at the boundaries. Also require one consistent side
      // (no sign flip inside the window — a flip means the routes cross;
      // crossing is not a corridor).
      let w1 = spanMin, w2 = spanMax;
      if (Math.abs(slope) > 1e-9) {
        const sAtPlus = t1 + (SEP - lat1) / slope;
        const sAtMinus = t1 + (-SEP - lat1) / slope;
        const lo = Math.min(sAtPlus, sAtMinus);
        const hi = Math.max(sAtPlus, sAtMinus);
        w1 = Math.max(w1, lo);
        w2 = Math.min(w2, hi);
      } else if (Math.abs(lat1) >= SEP) {
        continue;
      }
      if (w2 - w1 < MIN_OVERLAP) continue;
      const latMid = latAt((w1 + w2) / 2);
      if (latMid === 0) continue;
      // Trim the window to where lat keeps the mid's sign (cross-over guard).
      if (Math.abs(slope) > 1e-9) {
        const sZero = t1 - lat1 / slope;
        if (sZero > w1 && sZero < w2) {
          if (latMid > 0 === slope > 0) w1 = Math.max(w1, sZero);
          else w2 = Math.min(w2, sZero);
        }
      }
      if (w2 - w1 < MIN_OVERLAP) continue;

      const windowLen = w2 - w1;
      if (!best || windowLen > best.windowLen) {
        best = {
          segA: i, segB: j,
          dir: { x: ux, y: uy },
          sStart: w1, sEnd: w2,
          lateral: Math.abs(latAt((w1 + w2) / 2)),
          side: latMid > 0 ? 1 : -1,
          windowLen,
        };
      }
    }
  }
  if (!best) return null;
  const { windowLen: _drop, ...result } = best;
  return result;
}

/**
 * Bows the [sStart, sEnd] window (px along the segment) of segment `segIdx`
 * perpendicular by `amount` px on `sideSign`'s side: the window's interior
 * is shifted sideways, joined by diagonal ramps at each end (which
 * filletPath rounds into a gentle S). The route's endpoints — and therefore
 * ports and arrowheads — are untouched. Returns the new route, or null if
 * the bow would clip an obstacle or the window is degenerate.
 */
export function tryBowRouteAside(
  route: Point[],
  segIdx: number,
  sideSign: number,
  amount: number,
  sStart: number,
  sEnd: number,
  obstacles: ObstacleRect[]
): Point[] | null {
  if (segIdx < 0 || segIdx >= route.length - 1) return null;
  const p1 = route[segIdx], p2 = route[segIdx + 1];
  const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (segLen < 1e-6) return null;
  const ux = (p2.x - p1.x) / segLen, uy = (p2.y - p1.y) / segLen;

  // Clamp the window inside the segment, keeping a small margin off the
  // segment ends so corners with adjacent segments stay clean.
  const MARGIN = 6;
  const w1 = Math.max(MARGIN, sStart);
  const w2 = Math.min(segLen - MARGIN, sEnd);
  if (w2 - w1 < TAUT_CORRIDOR_MIN_OVERLAP_PX / 2) return null;

  const off = Math.min(Math.max(amount, 4), 12) * sideSign;
  const nx = uy * off, ny = -ux * off; // perpendicular shift (n = (uy, -ux))
  // Ramps eat into the window from each end — long enough that the
  // entry/exit tilt stays shallow (≤ ~17° at the 12px max offset).
  const ramp = Math.min((w2 - w1) / 4, 40);

  const q1 = { x: p1.x + ux * w1, y: p1.y + uy * w1 };
  const q2 = { x: p1.x + ux * w2, y: p1.y + uy * w2 };
  const m1 = { x: q1.x + ux * ramp + nx, y: q1.y + uy * ramp + ny };
  const m2 = { x: q2.x - ux * ramp + nx, y: q2.y - uy * ramp + ny };

  const inserted: Point[] = [];
  if (w1 > MARGIN + 1) inserted.push(q1); // skip if it collapses onto p1
  inserted.push(m1, m2);
  if (w2 < segLen - MARGIN - 1) inserted.push(q2);

  const bowed = [
    ...route.slice(0, segIdx + 1),
    ...inserted,
    ...route.slice(segIdx + 1),
  ];
  if (routePolylineClips(bowed, obstacles)) return null;
  return simplifyCollinear(bowed);
}

/**
 * Separates routes from DIFFERENT node pairs that run near-parallel within
 * TAUT_CORRIDOR_SEPARATION_PX of each other for at least
 * TAUT_CORRIDOR_MIN_OVERLAP_PX ("tram-lining"). One route of each pair is
 * bowed perpendicular, away from the other, by just enough to restore the
 * separation — validated against the edge's obstacle set so the bow never
 * clips a node. Same-pair edges are skipped (fanning owns those), as are
 * routes that are already complex.
 *
 * Cost: O(E²·S²) pairwise segment scan, gated by the same edge-count
 * threshold and wall-clock budget as the other polish passes.
 */
function separateCorridors(host: RouterHost): void {
  if (host.routes.size < 2) return;

  type Item = { id: string; edge: any; route: Point[]; len: number };
  const items: Item[] = [];
  for (const edge of host.routerEdges()) {
    const route = host.routes.get(edge.id);
    if (!route || route.length < 2 || route.length > 6) continue;
    items.push({ id: edge.id, edge, route, len: getRouteLength(route) });
  }
  if (items.length < 2 || items.length > CROSSING_OPTIMIZATION_EDGE_THRESHOLD) return;

  const budgetMs = MAX_CROSSING_OPTIMIZATION_BUDGET_MS;
  const now = (): number =>
    (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
  const startedAt = now();

  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (now() - startedAt > budgetMs) return;
        const a = items[i], b = items[j];
        // Same-pair edges only ever separate via fanning/ports.
        const samePair =
          (a.edge.source.id === b.edge.source.id && a.edge.target.id === b.edge.target.id) ||
          (a.edge.source.id === b.edge.target.id && a.edge.target.id === b.edge.source.id);
        if (samePair) continue;

        const overlap = findParallelOverlap(a.route, b.route);
        if (!overlap) continue;

        // Bow the shorter route first (less visual distortion); fall back to
        // the longer one if the shorter can't move without hitting a node.
        const needed = TAUT_CORRIDOR_SEPARATION_PX - overlap.lateral + 2;
        const ordered: Array<[Item, number]> = a.len <= b.len
          ? [[a, overlap.segA], [b, overlap.segB]]
          : [[b, overlap.segB], [a, overlap.segA]];
        for (const [item, segIdx] of ordered) {
          // Push away from the other route. `side` is which side of A the
          // corridor lies on, in A's frame: A moves to -side along its own
          // normal. B moves to +side — but tryBowRouteAside offsets along the
          // bowed segment's OWN normal, which flips when B runs anti-parallel
          // to A (findParallelOverlap accepts both directions), so B's sign
          // carries sign(u_B · u_A).
          let sideSign = -overlap.side;
          // The window is in A's segment frame; convert for B by projecting
          // its endpoints onto B's segment.
          let sStart = overlap.sStart, sEnd = overlap.sEnd;
          if (item === b) {
            const aSeg = a.route[overlap.segA];
            const bSeg1 = b.route[overlap.segB], bSeg2 = b.route[overlap.segB + 1];
            const bdx = bSeg2.x - bSeg1.x, bdy = bSeg2.y - bSeg1.y;
            const bLen = Math.hypot(bdx, bdy);
            if (bLen < 1e-6) continue;
            const ubx = bdx / bLen, uby = bdy / bLen;
            sideSign = (ubx * overlap.dir.x + uby * overlap.dir.y < 0 ? -1 : 1) * overlap.side;
            const proj = (s: number) => {
              const px = aSeg.x + overlap.dir.x * s, py = aSeg.y + overlap.dir.y * s;
              return Math.max(0, Math.min(bLen, (px - bSeg1.x) * ubx + (py - bSeg1.y) * uby));
            };
            const pA = proj(overlap.sStart), pB = proj(overlap.sEnd);
            sStart = Math.min(pA, pB);
            sEnd = Math.max(pA, pB);
          }
          const nudged = tryBowRouteAside(
            item.route, segIdx, sideSign, needed, sStart, sEnd, host.obstaclesFor(item.edge)
          );
          if (nudged) {
            host.routes.set(item.id, nudged);
            item.route = nudged;
            item.len = getRouteLength(nudged);
            changed = true;
            break;
          }
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * The taut router: obstacle-avoiding corner-visibility shortest path between
 * port attachment points, with parallel edges fanned as a post-step and
 * corridor separation as a finalize pass.
 */
export class TautRouter implements EdgeRouter {
  routeEdge(edge: any, host: RouterHost): Point[] {
    const src = host.portAttachment(edge, 'source');
    const tgt = host.portAttachment(edge, 'target');
    const obstacles = host.obstaclesFor(edge);
    const base = routeTautPolyline(src, tgt, obstacles);
    // Parallel edges between the same pair: fan via curvature/offset. That
    // post-step is obstacle-blind — it offsets/curves every waypoint without
    // re-checking collisions, so a fanned route can bow back into a node.
    // Try the fan at successively smaller curvatures and keep the first one
    // that stays clear; if even the smallest clips, the obstacle-aware base
    // wins (port distribution still separates siblings at the endpoints).
    // (For non-parallel edges the fan is a no-op, so the first iteration
    // returns base unchanged and passes the clip check.)
    for (const scale of TAUT_FAN_SCALES) {
      const fanned = host.fanParallel(edge, base.map(p => ({ ...p })), scale);
      if (!routePolylineClips(fanned, obstacles)) return fanned;
    }
    return base;
  }

  finalize(host: RouterHost): void {
    separateCorridors(host);
  }
}
