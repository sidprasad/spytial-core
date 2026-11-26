import { placeEdgeLabels, type EdgeLabelBox, type LabelRect, type LabelRoute } from './routing/edge-label-placement';
import type { Point } from './routing/types';

/** A conservative box around the renderer's 12 × 8 user-space arrow marker. */
export function arrowheadBounds(tip: Point, inside: Point): LabelRect | null {
  const length = Math.hypot(inside.x - tip.x, inside.y - tip.y);
  if (length < 1e-9) return null;
  const dx = (inside.x - tip.x) / length, dy = (inside.y - tip.y) / length;
  const xs = [tip.x, tip.x + 12 * dx - 4 * dy, tip.x + 12 * dx + 4 * dy];
  const ys = [tip.y, tip.y + 12 * dy + 4 * dx, tip.y + 12 * dy - 4 * dx];
  return { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1,
    width: Math.max(...xs) - Math.min(...xs) + 2, height: Math.max(...ys) - Math.min(...ys) + 2 };
}

export function measuredBox(element: SVGGraphicsElement, style?: CSSStyleDeclaration): LabelRect | null {
  try {
    style ??= element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden') return null;
    const box = element.getBBox();
    if (box.width <= 0 || box.height <= 0 || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch {
    // Detached/hidden SVG and DOM-only hosts may not provide geometry yet.
    return null;
  }
}

// Every point on a continuous subpath of length L lies inside the ellipse
// whose foci are its endpoints and whose major axis is L. Its semi-minor
// axis bounds how far a bend can stray from the sampled chord.
function sampleLabelRoute(path: SVGPathElement, length: number) {
  const pointAt = (distance: number): Point => {
    const { x, y } = path.getPointAtLength(distance);
    return { x, y };
  };
  const first = pointAt(0);
  const points = [first];
  let maxDeviation = 0;
  const subdivide = (start: number, a: Point, end: number, b: Point, depth: number): void => {
    const arc = end - start;
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const deviation = Math.sqrt(Math.max(0, (arc - chord) * (arc + chord))) / 2;
    if (deviation > 0.5 && depth < 12) {
      const mid = (start + end) / 2;
      const p = pointAt(mid);
      subdivide(start, a, mid, p, depth + 1);
      subdivide(mid, p, end, b, depth + 1);
    } else {
      points.push(b);
      maxDeviation = Math.max(maxDeviation, deviation);
    }
  };
  subdivide(0, first, length, pointAt(length), 0);
  return { points, maxDeviation };
}

export interface ZoomableEdgeLabel {
  element: SVGTextElement;
  center: Point;
  width: number;
  height: number;
  maxScale: number;
  scale: number;
}

function labelScale(maxScale: number, zoom: number): number {
  return Math.min(maxScale, Math.max(1, 1 / zoom));
}

export const FIT_TEXT_PADDING = 5;

/** Combine base geometry with glyphs at the proposed camera scale. */
export function projectedLabelBounds(base: LabelRect, labels: readonly ZoomableEdgeLabel[], zoom: number): LabelRect {
  let left = base.x, right = base.x + base.width, top = base.y, bottom = base.y + base.height;
  for (const { center, width, height, maxScale } of labels) {
    const scale = labelScale(maxScale, zoom);
    const halfWidth = width * scale / 2 + FIT_TEXT_PADDING;
    const halfHeight = height * scale / 2 + FIT_TEXT_PADDING;
    left = Math.min(left, center.x - halfWidth);
    right = Math.max(right, center.x + halfWidth);
    top = Math.min(top, center.y - halfHeight);
    bottom = Math.max(bottom, center.y + halfHeight);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Measure once, solve in memory, then write positions once. This runs after
 * final routing in both pipelines (including grid fallback), and again when
 * rendered text geometry changes, not on solver ticks. Every measurement is
 * in the zoomable container's diagram coordinates.
 * Cache the settled centers and glyph sizes for zooming and fitting.
 */
export function placeRenderedEdgeLabels(container: SVGGElement): ZoomableEdgeLabel[] {
  const obstacles: LabelRect[] = [];
  // Protect complete node content, including icons and overflowing text. Group
  // interiors are usable whitespace; protect captions and border strips only.
  for (const element of container.querySelectorAll<SVGGraphicsElement>('.node, .error-node, .groupLabelBg, .groupLabel')) {
    const box = measuredBox(element);
    if (box) obstacles.push(box);
  }
  for (const element of container.querySelectorAll<SVGGraphicsElement>('rect.group')) {
    const box = measuredBox(element);
    if (!box) continue;
    obstacles.push(
      { ...box, height: 2 }, { ...box, y: box.y + box.height - 2, height: 2 },
      { ...box, width: 2 }, { ...box, x: box.x + box.width - 2, width: 2 },
    );
  }

  const routes: LabelRoute[] = [];
  const labels: EdgeLabelBox[] = [];
  const elements = new Map<string, { element: SVGTextElement; offset: Point; box: LabelRect }>();
  let ordinal = 0;
  for (const path of container.querySelectorAll<SVGPathElement>('.link-group path[data-link-id]')) {
    if (path.classList.contains('alignmentLink')) continue;
    const group = path.closest('.link-group')!;
    // No selector is built from IDs: relation IDs may contain quotes/brackets.
    const rawId = path.getAttribute('data-link-id') || '';
    const id = `${rawId}\u0000${ordinal++}`;
    try {
      const length = path.getTotalLength();
      if (!Number.isFinite(length) || length <= 0) continue;
      const { points, maxDeviation } = sampleLabelRoute(path, length);
      if (!points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) continue;
      const stroke = container.ownerDocument.defaultView?.getComputedStyle(path).strokeWidth;
      const underlay = group.querySelector<SVGPathElement>('.highlight-underlay');
      const strokeWidth = Math.max(parseFloat(stroke ?? '') || 0, parseFloat(underlay?.style.strokeWidth ?? '') || 0);
      // Expand the stroke by the remaining sampling uncertainty on each side.
      const route = { id, points, strokeWidth: strokeWidth + 2 * maxDeviation };
      routes.push(route);
      // Marker attributes remain authoritative even after the arrowhead layer
      // suppresses the lower marker copy using inline styles.
      for (const [attribute, distance, inward] of [
        ['marker-start', 0, Math.min(0.1, length)],
        ['marker-end', length, Math.max(0, length - 0.1)],
      ] as const) {
        const marker = path.getAttribute(attribute);
        if (!marker || marker === 'none') continue;
        const box = arrowheadBounds(path.getPointAtLength(distance), path.getPointAtLength(inward));
        if (box) obstacles.push(box);
      }

      const element = group.querySelector<SVGTextElement>('text.linklabel');
      if (!element?.textContent?.trim()) continue;
      const textStyle = element.ownerDocument.defaultView?.getComputedStyle(element);
      const box = measuredBox(element, textStyle);
      if (!box) continue;
      // SVG's dominant-baseline is font-dependent. Preserve the measured offset
      // from the x/y anchor to the actual visual center, rather than assuming it.
      const x = Number(element.getAttribute('x') ?? 0), y = Number(element.getAttribute('y') ?? 0);
      elements.set(id, { element, box, offset: { x: box.x + box.width / 2 - x, y: box.y + box.height / 2 - y } });
      // Match the rendered caption and its base font size, including any textStyle.size directive.
      const sizeGroup = JSON.stringify([element.textContent, textStyle?.fontSize]);
      labels.push({ id, width: box.width, height: box.height, route, sizeGroup });
    } catch {
      // Leave the tick/midpoint fallback in place if geometry is unavailable.
    }
  }
  const resizable: ZoomableEdgeLabel[] = [];
  for (const [id, placement] of placeEdgeLabels(labels, obstacles, routes)) {
    const { element, offset, box } = elements.get(id)!;
    element.setAttribute('x', String(placement.x - offset.x));
    element.setAttribute('y', String(placement.y - offset.y));
    if (placement.maxScale > 1) {
      resizable.push({ element, center: placement, width: box.width, height: box.height, maxScale: placement.maxScale, scale: 1 });
    }
  }
  return resizable;
}

export function sizeEdgeLabels(labels: readonly ZoomableEdgeLabel[], zoom: number): void {
  for (const label of labels) {
    const scale = labelScale(label.maxScale, zoom);
    if (scale === label.scale) continue;
    label.scale = scale;
    if (scale === 1) label.element.removeAttribute('transform');
    else {
      const { x, y } = label.center;
      label.element.setAttribute('transform', `matrix(${scale} 0 0 ${scale} ${x * (1 - scale)} ${y * (1 - scale)})`);
    }
  }
}
