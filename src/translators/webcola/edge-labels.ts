import { placeEdgeLabels, type EdgeLabelBox, type LabelRect, type LabelRoute } from './routing/edge-label-placement';
import type { Point } from './routing/types';
import { simplifyCollinear } from './routing/geometry';

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

function measuredBox(element: SVGGraphicsElement): LabelRect | null {
  try {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden') return null;
    const box = element.getBBox();
    if (box.width <= 0 || box.height <= 0 || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch {
    // Detached/hidden SVG and DOM-only hosts may not provide geometry yet.
    return null;
  }
}

/**
 * Measure once, solve in memory, then write positions once. This runs after
 * final routing in both pipelines (including grid fallback), not on solver
 * ticks. Every measurement is in the zoomable container's diagram coordinates.
 * Labels remain in their edge groups, preserving lookup, theming and morphs.
 */
export function placeRenderedEdgeLabels(container: SVGGElement): void {
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
  const elements = new Map<string, { element: SVGTextElement; offset: Point }>();
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
      const count = 2 * Math.ceil(Math.min(64, Math.max(8, Math.ceil(length / 12))) / 2);
      const points = Array.from({ length: count + 1 }, (_, i) => {
        const p = path.getPointAtLength(length * i / count);
        return { x: p.x, y: p.y };
      });
      if (!points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) continue;
      const route = { id, points: simplifyCollinear(points) };
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
      const box = measuredBox(element);
      if (!box) continue;
      // SVG's dominant-baseline is font-dependent. Preserve the measured offset
      // from the x/y anchor to the actual visual center, rather than assuming it.
      const x = Number(element.getAttribute('x') ?? 0), y = Number(element.getAttribute('y') ?? 0);
      elements.set(id, { element, offset: { x: box.x + box.width / 2 - x, y: box.y + box.height / 2 - y } });
      labels.push({ id, width: box.width, height: box.height, route });
    } catch {
      // Leave the tick/midpoint fallback in place if geometry is unavailable.
    }
  }
  for (const [id, placement] of placeEdgeLabels(labels, obstacles, routes)) {
    const { element, offset } = elements.get(id)!;
    element.setAttribute('x', String(placement.x - offset.x));
    element.setAttribute('y', String(placement.y - offset.y));
  }
}
