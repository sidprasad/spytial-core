import type { Point } from './types';

export interface LabelRect { x: number; y: number; width: number; height: number }
export interface LabelRoute { id: string; points: readonly Point[]; bundleId?: string }
export interface EdgeLabelBox { id: string; width: number; height: number; route: LabelRoute }
export interface LabelPlacement extends Point { box: LabelRect; leader?: { from: Point; to: Point } }

// A text halo is part of the occupied space, not just the glyph bounding box.
export const LABEL_CLEARANCE = 3;
const FRACTIONS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9, 0.05, 0.95];
const MAX_PASSES = 4;
// Limit how far a label can detach from its route, even in impossible layouts.
const SIDE_GAPS = [3, 13, 27, 43];

export function labelOverlap(a: LabelRect, b: LabelRect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function intersects(a: Point, b: Point, box: LabelRect): boolean {
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, box.x, box.x + box.width],
    [a.y, b.y - a.y, box.y, box.y + box.height],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
    } else {
      const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}

function bounds(points: readonly Point[]): LabelRect {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function touches(a: LabelRect, b: LabelRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x
    && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function routeSampler(points: readonly Point[]) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const length = distances[distances.length - 1];
  const at = (distance: number): Point => {
    const d = Math.max(0, Math.min(length, distance));
    for (let i = 1; i < points.length; i++) {
      const span = distances[i] - distances[i - 1];
      if (distances[i] >= d && span > 1e-9) {
        const t = (d - distances[i - 1]) / span;
        return { x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
          y: points[i - 1].y + t * (points[i].y - points[i - 1].y) };
      }
    }
    return points[0];
  };
  return { length, at };
}

/** Stagger sibling labels in geometric lane order, including reverse edges. */
function bundleFractions(labels: readonly EdgeLabelBox[]): Map<string, number> {
  const bundles = new Map<string, EdgeLabelBox[]>();
  for (const label of labels) {
    if (!label.route.bundleId) continue;
    const siblings = bundles.get(label.route.bundleId) ?? [];
    siblings.push(label);
    bundles.set(label.route.bundleId, siblings);
  }
  const fractions = new Map<string, number>();
  for (const siblings of bundles.values()) {
    if (siblings.length < 2) continue;
    // IDs make the reference direction independent of insertion order.
    siblings.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const points = siblings[0].route.points;
    const first = points[0], last = points[points.length - 1];
    let dx = last.x - first.x, dy = last.y - first.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue; // Self-loops have no common forward direction.
    if (dx < 0 || (Math.abs(dx) < 1e-6 && dy < 0)) { dx = -dx; dy = -dy; }
    const ordered = siblings.map(label => {
      const sample = routeSampler(label.route.points), center = sample.at(sample.length / 2);
      return { label, lane: (-dy * center.x + dx * center.y) / length,
        box: { x: center.x - label.width / 2 - LABEL_CLEARANCE, y: center.y - label.height / 2 - LABEL_CLEARANCE,
          width: label.width + 2 * LABEL_CLEARANCE, height: label.height + 2 * LABEL_CLEARANCE } };
    }).sort((a, b) => a.lane - b.lane || (a.label.id < b.label.id ? -1 : 1));
    if (!ordered.some((item, i) => ordered.slice(i + 1).some(other => labelOverlap(item.box, other.box) > 0))) continue;
    ordered.forEach(({ label }, i) => {
      const p = label.route.points;
      const forward = (p[p.length - 1].x - p[0].x) * dx + (p[p.length - 1].y - p[0].y) * dy >= 0;
      const fraction = 0.2 + 0.6 * i / (ordered.length - 1);
      fractions.set(label.id, forward ? fraction : 1 - fraction);
    });
  }
  return fractions;
}

interface Candidate extends LabelPlacement {
  fixedOverlap: number;
  hiddenAnchor: number;
  attachmentConflicts: number;
  crossings: number;
  preference: number;
}

function candidates(label: EdgeLabelBox, allObstacles: readonly LabelRect[], allRoutes: readonly (LabelRoute & { bounds: LabelRect })[], preferredFraction = 0.5): Candidate[] {
  const sample = routeSampler(label.route.points);
  const width = label.width + 2 * LABEL_CLEARANCE, height = label.height + 2 * LABEL_CLEARANCE;
  // Cull objects outside the entire candidate neighborhood before repeated
  // text/attachment checks. The diagonal bounds every possible normal offset.
  const reach = (Math.hypot(width, height) + Math.max(width, height)) / 2 + SIDE_GAPS[SIDE_GAPS.length - 1];
  const routeBounds = bounds(label.route.points);
  const neighborhood = { x: routeBounds.x - reach, y: routeBounds.y - reach,
    width: routeBounds.width + 2 * reach, height: routeBounds.height + 2 * reach };
  const obstacles = allObstacles.filter(o => touches(neighborhood, o));
  const routes = allRoutes.filter(route => touches(neighborhood, route.bounds));
  const result: Candidate[] = [];
  for (const fraction of FRACTIONS) {
    const distance = fraction * sample.length;
    const anchor = sample.at(distance);
    const before = sample.at(distance - 2), after = sample.at(distance + 2);
    const dx = after.x - before.x, dy = after.y - before.y;
    const magnitude = Math.hypot(dx, dy);
    const nx = magnitude > 1e-9 ? -dy / magnitude : 0;
    const ny = magnitude > 1e-9 ? dx / magnitude : 1;
    const hiddenAnchor = obstacles.filter(o => anchor.x > o.x && anchor.x < o.x + o.width
      && anchor.y > o.y && anchor.y < o.y + o.height).length;
    // Offset the box until its nearest side is just beside the edge. A wide
    // label on a short vertical edge needs horizontal room, not a longer edge.
    const offset = Math.min(Math.abs(nx) > 1e-9 ? width / (2 * Math.abs(nx)) : Infinity,
      Math.abs(ny) > 1e-9 ? height / (2 * Math.abs(ny)) : Infinity);
    for (const shift of [0, ...SIDE_GAPS.flatMap(gap => [offset + gap, -offset - gap])]) {
      const x = anchor.x + nx * shift, y = anchor.y + ny * shift;
      const box = { x: x - width / 2, y: y - height / 2, width, height };
      const gap = Math.abs(shift) - offset;
      const leader = gap > 6 ? { from: anchor,
        to: { x: anchor.x + nx * Math.sign(shift) * gap, y: anchor.y + ny * Math.sign(shift) * gap } } : undefined;
      const fixedOverlap = obstacles.reduce((sum, obstacle) => sum + labelOverlap(box, obstacle), 0);
      let crossings = 0;
      for (const route of routes) {
        if (route.id === label.route.id || !touches(box, route.bounds)) continue;
        for (let i = 1; i < route.points.length; i++) {
          if (intersects(route.points[i - 1], route.points[i], box)) { crossings++; break; }
        }
      }
      result.push({ x, y, box, leader, fixedOverlap, crossings, hiddenAnchor,
        attachmentConflicts: leader ? obstacles.filter(o => intersects(leader.from, leader.to,
          { x: o.x + 0.01, y: o.y + 0.01, width: o.width - 0.02, height: o.height - 0.02 })).length : 0,
        preference: Math.abs(distance - sample.length * preferredFraction) + Math.abs(shift) * 3 });
    }
  }
  return result;
}

/**
 * Choose bounded, edge-attached positions for measured labels. Does not move
 * nodes, reroute edges, resize text or add solver constraints. All geometry is
 * in diagram coordinates, so zoom cannot change the answer.
 *
 * Coordinate descent starts from the existing midpoint arrangement. Each move
 * reduces (lexicographically) overlap area, hidden attachment points, blocked
 * leaders, foreign edges through text, then displacement from the preferred
 * position (midpoint, or staggered along crowded sibling routes).
 * Since the current candidate is always retained,
 * even an impossible crowded diagram cannot increase total overlap area.
 * Static obstacle/crossing costs are computed once; at most four passes inspect
 * label pairs. Stable IDs break ties, rather than SVG insertion order.
 */
export function placeEdgeLabels(
  labels: readonly EdgeLabelBox[], obstacles: readonly LabelRect[], routes: readonly LabelRoute[],
): Map<string, LabelPlacement> {
  const boundedRoutes = routes.map(route => ({ ...route, bounds: bounds(route.points) }));
  const validLabels = labels.filter(label => label.width > 0 && label.height > 0
    && Number.isFinite(label.width + label.height) && label.route.points.length > 0
    && label.route.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const fractions = bundleFractions(validLabels);
  const work = validLabels.map(label => {
    const choices = candidates(label, obstacles, boundedRoutes, fractions.get(label.id));
    return { label, choices, bounds: bounds(choices.flatMap(c => [
      { x: c.box.x, y: c.box.y }, { x: c.box.x + c.box.width, y: c.box.y + c.box.height },
    ])) };
  });
  work.sort((a, b) => {
    const free = (item: typeof a) => item.choices.filter(c => c.fixedOverlap === 0).length;
    return free(a) - free(b) || b.label.width * b.label.height - a.label.width * a.label.height
      || (a.label.id < b.label.id ? -1 : a.label.id > b.label.id ? 1 : 0);
  });
  const selected = new Map(work.map(item => [item.label.id, item.choices[0]]));
  // A label can only collide with labels whose candidate envelopes touch.
  // This avoids repeatedly scanning distant labels in large, sparse diagrams.
  const neighbors = new Map(work.map(item => [item.label.id, work
    .filter(other => item !== other && touches(item.bounds, other.bounds)).map(other => other.label.id)]));
  const score = (id: string, c: Candidate): number[] => {
    let overlap = c.fixedOverlap;
    let attachmentConflicts = c.attachmentConflicts;
    for (const other of neighbors.get(id)!) {
      const position = selected.get(other)!;
      overlap += labelOverlap(c.box, position.box);
      if (c.leader && intersects(c.leader.from, c.leader.to, position.box)) attachmentConflicts++;
      if (position.leader && intersects(position.leader.from, position.leader.to, c.box)) attachmentConflicts++;
    }
    return [overlap, c.hiddenAnchor, attachmentConflicts, c.crossings, c.preference];
  };
  const better = (a: number[], b: number[]): boolean => {
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-6) return a[i] < b[i];
    }
    return false;
  };
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const { label, choices } of work) {
      const current = selected.get(label.id)!;
      let best = current, bestScore = score(label.id, current);
      for (const candidate of choices) {
        const candidateScore = score(label.id, candidate);
        if (better(candidateScore, bestScore)) { best = candidate; bestScore = candidateScore; }
      }
      selected.set(label.id, best);
      changed ||= best !== current;
    }
    if (!changed) break;
  }
  return new Map([...selected].map(([id, { x, y, box, leader }]) => [id, { x, y, box, ...(leader ? { leader } : {}) }]));
}
