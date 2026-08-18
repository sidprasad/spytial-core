import type { BoundsRect, Point, RoutableNode, VisibleRect } from './types';

/**
 * Deriving rectangles from nodes and groups, and clipping points onto them.
 *
 * WebCola inflates `node.width/height` for collision avoidance and a group's
 * `bounds` covers the inflated container rectangle — both are larger than what
 * is drawn. Everything edge routing does has to happen against the RENDERED
 * rectangle instead, or arrowheads land in the padding where the node's own
 * fill covers them. These helpers are the one place that conversion lives.
 */

/**
 * How far a group's visible rectangle sits inside its WebCola bounds. Matches
 * the `bounds.inflate(-groupMargin)` applied at routing time.
 */
export const GROUP_VISUAL_MARGIN_PX = 10;

/**
 * The *visible* rectangle of a node or group, or null when visible dimensions
 * can't be derived (no position, or no size to work from).
 */
export function visibleBounds(node: RoutableNode | null | undefined): VisibleRect | null {
  if (!node) return null;
  const cx = node.x ?? (typeof node.bounds?.cx === 'function' ? node.bounds.cx() : undefined);
  const cy = node.y ?? (typeof node.bounds?.cy === 'function' ? node.bounds.cy() : undefined);
  if (cx === undefined || cy === undefined) return null;

  let hw: number | undefined;
  let hh: number | undefined;

  if (node.visualWidth !== undefined || node.visualHeight !== undefined) {
    hw = (node.visualWidth ?? node.width ?? 0) / 2;
    hh = (node.visualHeight ?? node.height ?? 0) / 2;
  } else if (Array.isArray(node.leaves) || Array.isArray(node.groups)) {
    // Group container — visible rectangle is bounds inset by GROUP_VISUAL_MARGIN_PX.
    if (node.bounds && typeof node.bounds.width === 'function') {
      hw = node.bounds.width() / 2 - GROUP_VISUAL_MARGIN_PX;
      hh = node.bounds.height!() / 2 - GROUP_VISUAL_MARGIN_PX;
    } else if (node.bounds && node.bounds.X !== undefined) {
      hw = (node.bounds.X - node.bounds.x!) / 2 - GROUP_VISUAL_MARGIN_PX;
      hh = (node.bounds.Y! - node.bounds.y!) / 2 - GROUP_VISUAL_MARGIN_PX;
    }
  } else if (node.width !== undefined || node.height !== undefined) {
    hw = (node.width ?? 0) / 2;
    hh = (node.height ?? 0) / 2;
  }

  if (hw === undefined || hh === undefined || (hw <= 0 && hh <= 0)) return null;
  const halfW = Math.max(0, hw);
  const halfH = Math.max(0, hh);

  return {
    cx: () => cx,
    cy: () => cy,
    width: () => halfW * 2,
    height: () => halfH * 2,
    x: cx - halfW,
    X: cx + halfW,
    y: cy - halfH,
    Y: cy + halfH,
  };
}

/**
 * A node's bounds in {x, y, width(), height()} form, using the visual size
 * rather than the inflated collision size.
 */
export function normalizeNodeBounds(node: RoutableNode): BoundsRect {
  const vw = node.visualWidth ?? node.width ?? 50;
  const vh = node.visualHeight ?? node.height ?? 30;
  const bounds: Partial<VisibleRect> = node.bounds || {
    x: node.x! - vw / 2,
    y: node.y! - vh / 2,
    width: () => vw,
    height: () => vh,
  };

  return {
    x: typeof bounds.x === 'number' ? bounds.x : (bounds.X !== undefined ? bounds.x! : node.x! - vw / 2),
    y: typeof bounds.y === 'number' ? bounds.y : node.y! - vh / 2,
    width: () => typeof bounds.width === 'function' ? bounds.width() : (bounds.X !== undefined ? bounds.X - bounds.x! : vw),
    height: () => typeof bounds.height === 'function' ? bounds.height() : (bounds.Y !== undefined ? bounds.Y - bounds.y! : vh),
  };
}

/**
 * The rectangle a node actually renders as. Prefers {@link visibleBounds} and
 * falls back to {@link normalizeNodeBounds} when no visible size can be
 * derived. Edge endpoint placement should always go through this.
 */
export function renderedBounds(node: RoutableNode): BoundsRect {
  const visible = visibleBounds(node);
  if (visible) {
    return {
      x: visible.x,
      y: visible.y,
      width: visible.width,
      height: visible.height,
    };
  }
  return normalizeNodeBounds(node);
}

/**
 * The closest point on (or inside) a rectangle to the given point. Used to pull
 * an endpoint back onto the node it belongs to after an offset has moved it.
 */
export function closestPointOnRect(
  bounds: Pick<VisibleRect, 'x' | 'y' | 'X' | 'Y'> | null | undefined,
  point: Point
): Point {
  if (!bounds) return point;

  const { x, y, X, Y } = bounds;
  return {
    x: Math.max(x, Math.min(point.x, X)),
    y: Math.max(y, Math.min(point.y, Y)),
  };
}

/**
 * Where the line from (x1, y1) to (x2, y2) meets the rectangle boundary, or
 * null if it misses entirely. Used to seat arrowheads on the node boundary in
 * grid mode.
 */
export function rectangleIntersection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bounds: BoundsRect
): Point | null {
  const rectLeft = bounds.x;
  const rectRight = bounds.x + bounds.width();
  const rectTop = bounds.y;
  const rectBottom = bounds.y + bounds.height();

  const dx = x2 - x1;
  const dy = y2 - y1;

  // A zero-length line has no direction to intersect along.
  if (dx === 0 && dy === 0) {
    return { x: x1, y: y1 };
  }

  let tMin = 0;
  let tMax = 1;

  if (dx !== 0) {
    const t1 = (rectLeft - x1) / dx;
    const t2 = (rectRight - x1) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (dy !== 0) {
    const t1 = (rectTop - y1) / dy;
    const t2 = (rectBottom - y1) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (tMin > tMax) {
    return null;
  }

  // tMin if the line starts outside the rectangle, tMax if it starts inside.
  const t = tMin > 0 ? tMin : tMax;
  return { x: x1 + t * dx, y: y1 + t * dy };
}

/**
 * Pulls an orthogonal route's endpoint back onto the node's visible boundary.
 * An axis-aligned final segment tells us which side the endpoint belongs on
 * outright; anything else falls back to a centre-to-neighbour ray clip.
 */
export function clipEndpointToVisibleBoundary(
  endpoint: Point,
  neighbor: Point,
  bounds: BoundsRect & Partial<Pick<VisibleRect, 'X' | 'Y'>>
): Point {
  const cx = bounds.x + bounds.width() / 2;
  const cy = bounds.y + bounds.height() / 2;
  const bx = bounds.x;
  const bX = typeof bounds.X === 'number' ? bounds.X : bounds.x + bounds.width();
  const by = bounds.y;
  const bY = typeof bounds.Y === 'number' ? bounds.Y : bounds.y + bounds.height();
  const eps = 0.5;

  const dx = neighbor.x - endpoint.x;
  const dy = neighbor.y - endpoint.y;

  if (Math.abs(dx) < eps && Math.abs(dy) >= eps) {
    // Vertical segment — endpoint is on top or bottom.
    return { x: endpoint.x, y: endpoint.y > cy ? bY : by };
  }
  if (Math.abs(dy) < eps && Math.abs(dx) >= eps) {
    // Horizontal segment — endpoint is on left or right.
    return { x: endpoint.x > cx ? bX : bx, y: endpoint.y };
  }

  const intersection = rectangleIntersection(cx, cy, neighbor.x, neighbor.y, bounds);
  return intersection ?? endpoint;
}
