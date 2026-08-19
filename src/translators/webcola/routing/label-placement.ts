/**
 * Nudging edge labels apart once routes are final.
 *
 * The search that decides WHICH labels overlap still lives in the component —
 * it reads the rendered SVG. This is the part that doesn't: given a label and a
 * push, move it and remember how far it has been pushed in total.
 */

/**
 * Moves `label` by (deltaX, deltaY), keeping the total displacement it has
 * accumulated within `cap` pixels of where it started.
 *
 * A label pushed by several neighbours would otherwise drift far from its edge
 * and stop reading as that edge's label. When the new cumulative displacement
 * would exceed the cap, the move is scaled so the magnitude lands exactly on
 * the cap instead of being dropped — the label still gives ground, just not
 * unboundedly.
 *
 * `dxMap`/`dyMap` carry the running totals across calls within one pass.
 */
export function applyLabelDisplacement(
  label: SVGTextElement,
  deltaX: number,
  deltaY: number,
  dxMap: Map<SVGTextElement, number>,
  dyMap: Map<SVGTextElement, number>,
  cap: number
): void {
  const curDx = dxMap.get(label) || 0;
  const curDy = dyMap.get(label) || 0;
  let newDx = curDx + deltaX;
  let newDy = curDy + deltaY;

  const mag = Math.hypot(newDx, newDy);
  if (mag > cap) {
    const scale = cap / mag;
    newDx *= scale;
    newDy *= scale;
  }

  // Apply only the delta between the old and new cumulative displacement, so
  // the label's own position stays the reference point.
  const x = parseFloat(label.getAttribute('x') || '0') + (newDx - curDx);
  const y = parseFloat(label.getAttribute('y') || '0') + (newDy - curDy);
  label.setAttribute('x', String(x));
  label.setAttribute('y', String(y));

  dxMap.set(label, newDx);
  dyMap.set(label, newDy);
}
