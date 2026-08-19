import type { Point, RoutableNode, RoutedEdge, VisibleRect } from './types';
import { visibleBounds } from './bounds';
import { applyPortOffsetToAnchor } from './ports';

/**
 * Jitter-free edge endpoints for the frames where full routing is too
 * expensive to run — every solver tick, and every mouse-move during a drag.
 *
 * Intersection-based endpoints jump erratically as rectangles move past each
 * other. These pick one of the four side centres instead, so an endpoint only
 * ever moves when the edge genuinely crosses to a different side.
 */

/** A rectangle in either of the two forms endpoints arrive in. */
type AnchorBounds = Partial<VisibleRect>;

/**
 * The centre of whichever side of `bounds` faces `targetPoint`. Falls back to
 * `targetPoint` itself when the rectangle carries no usable dimensions.
 */
export function stableEdgeAnchor(
  bounds: AnchorBounds | null | undefined,
  targetPoint: Point
): Point {
  if (!bounds) return targetPoint;

  let cx: number, cy: number, halfWidth: number, halfHeight: number;

  if (typeof bounds.cx === 'function') {
    // WebCola Rectangle, with accessor methods.
    cx = bounds.cx();
    cy = bounds.cy!();
    halfWidth = bounds.width!() / 2;
    halfHeight = bounds.height!() / 2;
  } else if (bounds.x !== undefined && bounds.X !== undefined) {
    cx = (bounds.x + bounds.X) / 2;
    cy = (bounds.y! + bounds.Y!) / 2;
    halfWidth = (bounds.X - bounds.x) / 2;
    halfHeight = (bounds.Y! - bounds.y!) / 2;
  } else {
    return targetPoint;
  }

  const dx = targetPoint.x - cx;
  const dy = targetPoint.y - cy;

  // Compare against the rectangle's own aspect ratio, so a wide node doesn't
  // claim its short sides for shallow angles.
  if (Math.abs(dx) / halfWidth > Math.abs(dy) / halfHeight) {
    return dx > 0
      ? { x: cx + halfWidth, y: cy }   // right side
      : { x: cx - halfWidth, y: cy };  // left side
  }
  return dy > 0
    ? { x: cx, y: cy + halfHeight }    // bottom side
    : { x: cx, y: cy - halfHeight };   // top side
}

/**
 * The two endpoints of a straight edge between `source` and `target`, anchored
 * on the side centres facing each other and then slid to their port slots if
 * the edge carries port stamps.
 */
export function stableEdgePath(
  source: RoutableNode,
  target: RoutableNode,
  edgeData?: RoutedEdge
): Point[] {
  // node.x/y is the authoritative position from the WebCola solver and is
  // always in sync; bounds.cx()/cy() lag a tick and describe the inflated
  // collision rectangle. Group endpoints have no x/y, only bounds — fall back
  // to the bounds centre so the opposite anchor aims at the hull, not the origin.
  const centerFor = (ep: RoutableNode): Point => ({
    x: ep.x ?? (typeof ep.bounds?.cx === 'function' ? ep.bounds.cx() : 0),
    y: ep.y ?? (typeof ep.bounds?.cy === 'function' ? ep.bounds.cy() : 0),
  });
  const sourceCenter = centerFor(source);
  const targetCenter = centerFor(target);

  // Prefer visible bounds. WebCola bounds would land arrowheads on the INFLATED
  // rectangle, behind the rendered fill.
  const sourceBounds = visibleBounds(source) ?? source.bounds ?? source.innerBounds;
  const targetBounds = visibleBounds(target) ?? target.bounds ?? target.innerBounds;

  let sourceAnchor = sourceBounds
    ? stableEdgeAnchor(sourceBounds, targetCenter)
    : sourceCenter;
  let targetAnchor = targetBounds
    ? stableEdgeAnchor(targetBounds, sourceCenter)
    : targetCenter;

  if (edgeData && sourceBounds) {
    sourceAnchor = applyPortOffsetToAnchor(
      sourceAnchor, sourceBounds, edgeData._sourcePortIndex, edgeData._sourcePortCount
    );
  }
  if (edgeData && targetBounds) {
    targetAnchor = applyPortOffsetToAnchor(
      targetAnchor, targetBounds, edgeData._targetPortIndex, edgeData._targetPortCount
    );
  }

  return [sourceAnchor, targetAnchor];
}
