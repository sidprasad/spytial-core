import type { PortAttachment, Point, RoutableNode, RoutedEdge, VisibleRect } from './types';
import { normalizeNodeBounds, renderedBounds, visibleBounds } from './bounds';
import { clipLineToRectExit, dominantDirection, isPointOnRectPerimeter, sideNormal } from './geometry';
import { SIDE_NORMALS, sideCenter, type RectSide } from './port-sides';

/**
 * Port distribution: spreading the edges that share a node side across that
 * side instead of stacking them all at its centre.
 *
 * This is Spytial's own semantics, not a router's — a router only answers "how
 * do I get from A to B around these boxes", and gets told where A and B are.
 * The component stamps each edge with a side and a port slot before a routing
 * pass; everything here reads those stamps.
 */

/** Fraction of a side length kept clear at each end before ports start. */
export const PORT_MARGIN_FRACTION = 0.15;

/** Ports closer than this look like one thick edge, so margins give way first. */
export const MIN_PORT_PERIMETER_SPACING = 10;

/** Margins never shrink past this, however dense the ports get. */
export const MIN_ABSOLUTE_PORT_MARGIN_PX = 2;

/**
 * The margin to keep clear at each end of a side of `sideLength` carrying
 * `portCount` ports.
 *
 * At comfortable densities this is a flat fraction of the side. When ports
 * would land closer together than {@link MIN_PORT_PERIMETER_SPACING}, the
 * margin gives way instead — down to {@link MIN_ABSOLUTE_PORT_MARGIN_PX} — so
 * the ports stay distinguishable.
 */
export function computePortMargin(sideLength: number, portCount: number): number {
  const baseMargin = sideLength * PORT_MARGIN_FRACTION;
  if (portCount <= 1) return baseMargin;

  const baseSpacing = (sideLength - 2 * baseMargin) / portCount;
  if (baseSpacing >= MIN_PORT_PERIMETER_SPACING) {
    return baseMargin;
  }

  // Solve for the margin that yields exactly MIN_PORT_PERIMETER_SPACING:
  // (sideLength - 2*margin) / portCount >= MIN  →  margin <= (sideLength - portCount*MIN) / 2
  const desiredMargin = (sideLength - portCount * MIN_PORT_PERIMETER_SPACING) / 2;
  return Math.max(MIN_ABSOLUTE_PORT_MARGIN_PX, desiredMargin);
}

/** Where port `portIndex` of `portCount` sits along a side starting at `sideStart`. */
function portPosition(sideStart: number, sideLength: number, portIndex: number, portCount: number): number {
  const margin = computePortMargin(sideLength, portCount);
  const usable = sideLength - 2 * margin;
  return sideStart + margin + (portIndex + 0.5) * usable / portCount;
}

function hasPort(index: number | undefined, count: number | undefined): boolean {
  return index !== undefined && count !== undefined && count > 1;
}

/**
 * Spreads a route's first and last points across their node sides according to
 * the edge's port stamps, so that edges sharing a side (d→b and a→b both
 * arriving at b's top) don't pile up at its centre.
 *
 * Applies to every edge, not just parallel ones. Self-loops route themselves
 * and are left alone. Mutates and returns `route`.
 */
export function applyPortBasedEndpoints(
  edgeData: RoutedEdge,
  route: Point[]
): Point[] {
  if (!route || route.length < 2) return route;
  if (edgeData.source.id === edgeData.target.id) return route;

  const hasSourcePort = hasPort(edgeData._sourcePortIndex, edgeData._sourcePortCount);
  const hasTargetPort = hasPort(edgeData._targetPortIndex, edgeData._targetPortCount);
  if (!hasSourcePort && !hasTargetPort) return route;

  // Distribution axis per end: a left/right side spreads ports along Y, a
  // top/bottom side along X. Sides stamped by the obstacle-aware chooser win;
  // without stamps (grid pipeline, direct test calls) the dominant direction of
  // the centre-to-centre line decides.
  const dx = (edgeData.target.x || 0) - (edgeData.source.x || 0);
  const dy = (edgeData.target.y || 0) - (edgeData.source.y || 0);
  const direction = dominantDirection(Math.atan2(dy, dx));
  const horizontalEdge = direction === 'right' || direction === 'left';
  const verticalEdge = direction === 'up' || direction === 'down';
  const axisOf = (side: RectSide | undefined): 'y' | 'x' | null =>
    side ? (side === 'left' || side === 'right' ? 'y' : 'x')
         : horizontalEdge ? 'y' : verticalEdge ? 'x' : null;

  if (hasSourcePort) {
    const bounds = normalizeNodeBounds(edgeData.source);
    const axis = axisOf(edgeData._exitSide);
    const portIndex = edgeData._sourcePortIndex!;
    const portCount = edgeData._sourcePortCount!;
    if (axis === 'y') {
      route[0] = { ...route[0], y: portPosition(bounds.y, bounds.height(), portIndex, portCount) };
    } else if (axis === 'x') {
      route[0] = { ...route[0], x: portPosition(bounds.x, bounds.width(), portIndex, portCount) };
    }
  }

  if (hasTargetPort) {
    const bounds = normalizeNodeBounds(edgeData.target);
    // Without a stamp, the target side is opposite to the edge direction —
    // same distribution axis as the source.
    const axis = axisOf(edgeData._entrySide);
    const portIndex = edgeData._targetPortIndex!;
    const portCount = edgeData._targetPortCount!;
    const last = route.length - 1;
    if (axis === 'y') {
      route[last] = { ...route[last], y: portPosition(bounds.y, bounds.height(), portIndex, portCount) };
    } else if (axis === 'x') {
      route[last] = { ...route[last], x: portPosition(bounds.x, bounds.width(), portIndex, portCount) };
    }
  }

  return route;
}

/**
 * Grid-mode counterpart of {@link applyPortBasedEndpoints}: moves the first and
 * last points to port positions on the *visible* boundary, inserting an L-bend
 * where needed so the entry and exit segments stay orthogonal.
 */
export function applyPortBasedEndpointsOrthogonal(
  edgeData: RoutedEdge,
  route: Point[]
): Point[] {
  if (!route || route.length < 2) return route;
  if (edgeData?.source?.id === edgeData?.target?.id) return route;

  const hasSourcePort = hasPort(edgeData._sourcePortIndex, edgeData._sourcePortCount);
  const hasTargetPort = hasPort(edgeData._targetPortIndex, edgeData._targetPortCount);
  if (!hasSourcePort && !hasTargetPort) return route;

  let result = route.slice();

  if (hasSourcePort) {
    result = shiftRouteEndpointToPort(
      result, edgeData.source,
      edgeData._sourcePortIndex!, edgeData._sourcePortCount!,
      'start'
    );
  }
  if (hasTargetPort) {
    result = shiftRouteEndpointToPort(
      result, edgeData.target,
      edgeData._targetPortIndex!, edgeData._targetPortCount!,
      'end'
    );
  }

  return result;
}

/**
 * Moves one end of an orthogonal route to its port on the node's visible
 * boundary, adding an L-bend waypoint when the shifted endpoint would otherwise
 * leave a diagonal segment.
 */
export function shiftRouteEndpointToPort(
  route: Point[],
  node: RoutableNode,
  portIndex: number,
  portCount: number,
  which: 'start' | 'end'
): Point[] {
  if (route.length < 2) return route;
  const visible = visibleBounds(node);
  if (!visible) return route;

  const idx = which === 'start' ? 0 : route.length - 1;
  const neighborIdx = which === 'start' ? 1 : route.length - 2;
  const endpoint = route[idx];
  const neighbor = route[neighborIdx];

  const { x: bx, X: bX, y: by, Y: bY } = visible;
  const w = bX - bx;
  const h = bY - by;
  const eps = 1;

  // The side the endpoint already sits closest to is the side it belongs on.
  const dLeft = Math.abs(endpoint.x - bx);
  const dRight = Math.abs(endpoint.x - bX);
  const dTop = Math.abs(endpoint.y - by);
  const dBottom = Math.abs(endpoint.y - bY);
  const minD = Math.min(dLeft, dRight, dTop, dBottom);
  let side: RectSide;
  if (minD === dLeft) side = 'left';
  else if (minD === dRight) side = 'right';
  else if (minD === dTop) side = 'top';
  else side = 'bottom';

  const sideLength = (side === 'left' || side === 'right') ? h : w;
  if (sideLength <= 0) return route;
  const portOffset = portPosition(0, sideLength, portIndex, portCount);

  let newEndpoint: Point;
  switch (side) {
    case 'left':   newEndpoint = { x: bx, y: by + portOffset }; break;
    case 'right':  newEndpoint = { x: bX, y: by + portOffset }; break;
    case 'top':    newEndpoint = { x: bx + portOffset, y: by }; break;
    case 'bottom': newEndpoint = { x: bx + portOffset, y: bY }; break;
  }

  const result = route.slice();
  const isAxisAligned = Math.abs(newEndpoint.x - neighbor.x) < eps ||
                        Math.abs(newEndpoint.y - neighbor.y) < eps;

  if (isAxisAligned) {
    result[idx] = newEndpoint;
    return result;
  }

  // Need an L-bend to keep both new segments orthogonal.
  const bend: Point = (side === 'left' || side === 'right')
    // Egress along X; the side direction is Y.
    ? { x: neighbor.x, y: newEndpoint.y }
    // Egress along Y; the side direction is X.
    : { x: newEndpoint.x, y: neighbor.y };

  if (which === 'start') {
    result[0] = newEndpoint;
    result.splice(1, 0, bend);
  } else {
    result[result.length - 1] = newEndpoint;
    result.splice(result.length - 1, 0, bend);
  }
  return result;
}

/**
 * Port distribution for the legacy offset path: nudges the route's endpoints
 * along their node sides in place, choosing the axis from the edge's dominant
 * direction rather than from a stamped side.
 */
export function applyPortBasedOffset(
  route: Point[],
  edgeData: RoutedEdge,
  direction: 'right' | 'up' | 'left' | 'down' | null,
  hasSourcePort: boolean,
  hasTargetPort: boolean
): void {
  if (hasSourcePort) {
    const bounds = normalizeNodeBounds(edgeData.source);
    const portIndex = edgeData._sourcePortIndex!;
    const portCount = edgeData._sourcePortCount!;

    if (direction === 'right' || direction === 'left') {
      // Edge runs horizontally: distribute along the source side's Y axis.
      route[0].y = portPosition(bounds.y, bounds.height(), portIndex, portCount);
    } else if (direction === 'up' || direction === 'down') {
      route[0].x = portPosition(bounds.x, bounds.width(), portIndex, portCount);
    }
  }

  if (hasTargetPort) {
    const bounds = normalizeNodeBounds(edgeData.target);
    const portIndex = edgeData._targetPortIndex!;
    const portCount = edgeData._targetPortCount!;
    // The target end faces the opposite way from the edge direction.
    const targetDirection = direction === 'right' ? 'left'
      : direction === 'left' ? 'right'
      : direction === 'up' ? 'down' : 'up';
    const last = route.length - 1;

    if (targetDirection === 'right' || targetDirection === 'left') {
      route[last].y = portPosition(bounds.y, bounds.height(), portIndex, portCount);
    } else if (targetDirection === 'up' || targetDirection === 'down') {
      route[last].x = portPosition(bounds.x, bounds.width(), portIndex, portCount);
    }
  }
}

/**
 * Slides a stable side-centre anchor along its side to the edge's port slot,
 * so parallel edges stay spread apart during drag and tick. Returns the anchor
 * unchanged when the edge carries no port stamps.
 */
export function applyPortOffsetToAnchor(
  anchor: Point,
  bounds: Partial<VisibleRect>,
  portIndex: number | undefined,
  portCount: number | undefined
): Point {
  if (portIndex === undefined || portCount === undefined || portCount <= 1) {
    return anchor;
  }

  const bx = typeof bounds.x === 'number' ? bounds.x : 0;
  const bX = bounds.X !== undefined ? bounds.X : bx + (typeof bounds.width === 'function' ? bounds.width() : 0);
  const by = typeof bounds.y === 'number' ? bounds.y : 0;
  const bY = bounds.Y !== undefined ? bounds.Y : by + (typeof bounds.height === 'function' ? bounds.height() : 0);

  const eps = 1;

  if (Math.abs(anchor.x - bx) < eps || Math.abs(anchor.x - bX) < eps) {
    // Anchor is on the left or right side → distribute along Y.
    return { x: anchor.x, y: portPosition(by, bY - by, portIndex, portCount) };
  }
  if (Math.abs(anchor.y - by) < eps || Math.abs(anchor.y - bY) < eps) {
    // Anchor is on the top or bottom side → distribute along X.
    return { x: portPosition(bx, bX - bx, portIndex, portCount), y: anchor.y };
  }

  return anchor;
}

/**
 * One end of an edge as a {point, normal} port on the node's visible perimeter.
 *
 * The point comes from {@link applyPortBasedEndpoints}, which stays the sole
 * source of endpoints — a router never derives an attachment point of its own.
 * The normal is the outward unit vector of the side the point lands on, used to
 * force a perpendicular exit and to orient the arrowhead.
 */
export function portAttachment(
  edgeData: RoutedEdge,
  end: 'source' | 'target'
): PortAttachment {
  const node = end === 'source' ? edgeData.source : edgeData.target;
  const other = end === 'source' ? edgeData.target : edgeData.source;
  const bounds = renderedBounds(node);
  const otherBounds = renderedBounds(other);
  const center = { x: bounds.x + bounds.width() / 2, y: bounds.y + bounds.height() / 2 };
  const otherCenter = { x: otherBounds.x + otherBounds.width() / 2, y: otherBounds.y + otherBounds.height() / 2 };

  // Side stamped by the obstacle-aware chooser during this pass (absent for
  // callers outside a routing pass, e.g. unit tests — then the ray decides).
  const stampedSide = end === 'source' ? edgeData._exitSide : edgeData._entrySide;

  // Base perimeter point: where the centre→other-centre line exits this rect.
  let point = clipLineToRectExit(center, otherCenter, bounds);
  if (stampedSide) {
    // A flipped edge anchors at the stamped side's midpoint — the ray clip sits
    // on the side facing the blocker, which is what the chooser decided against.
    const n = sideNormal(point, bounds);
    const sn = SIDE_NORMALS[stampedSide];
    if (n.x !== sn.x || n.y !== sn.y) {
      const rect = { minX: bounds.x, minY: bounds.y, maxX: bounds.x + bounds.width(), maxY: bounds.y + bounds.height() };
      point = sideCenter(rect, stampedSide);
    }
  }

  // Spread siblings on the same side by seeding a 2-point route through
  // applyPortBasedEndpoints and reading back the relevant end. A mismatch
  // between the dominant direction and the natural clip side can push the
  // distributed point inside the rect — validate, and keep the base clip if so.
  const portCount = end === 'source' ? edgeData._sourcePortCount : edgeData._targetPortCount;
  if (portCount !== undefined && portCount > 1) {
    const seed = end === 'source'
      ? [{ ...point }, { ...otherCenter }]
      : [{ ...otherCenter }, { ...point }];
    const distributed = applyPortBasedEndpoints(edgeData, seed);
    const candidate = end === 'source' ? distributed[0] : distributed[distributed.length - 1];
    if (candidate && isPointOnRectPerimeter(candidate, bounds)) {
      point = candidate;
    }
  }

  return {
    point,
    normal: stampedSide ? { ...SIDE_NORMALS[stampedSide] } : sideNormal(point, bounds),
  };
}
