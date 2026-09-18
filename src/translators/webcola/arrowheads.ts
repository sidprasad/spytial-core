const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Paint only edge markers above the diagram. SVG markers paint with their
 * referencing path: raising a <marker> definition cannot change that order.
 * Keep the real paths below nodes, with their labels and interaction handlers,
 * and mirror their geometry into non-interactive, zero-width marker carriers.
 * userSpaceOnUse markers retain their size even though the carrier has no stroke.
 */
export function syncArrowheadLayer(container: SVGGElement): void {
  let layer = container.querySelector<SVGGElement>(':scope > .arrowhead-layer');
  const paths = Array.from(container.querySelectorAll<SVGPathElement>('.link-group path[data-link-id]'));
  if (!paths.length) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = container.ownerDocument.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'arrowhead-layer');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.pointerEvents = 'none';
  }
  container.appendChild(layer); // Above node fills, group captions and edge labels.

  let count = 0;
  for (const source of paths) {
    const start = source.getAttribute('marker-start') ?? 'none';
    const end = source.getAttribute('marker-end') ?? 'none';
    // Alignment edges have no markers; paths without geometry aren't painted yet.
    if ((start === 'none' && end === 'none') || !source.getAttribute('d')) continue;

    let carrier = layer.children[count] as SVGPathElement | undefined;
    if (!carrier) {
      carrier = container.ownerDocument.createElementNS(SVG_NS, 'path');
      layer.appendChild(carrier);
    }
    count++;
    const group = source.closest('.link-group')!;
    carrier.setAttribute('class', `arrowhead ${source.getAttribute('class') ?? ''}`);
    carrier.setAttribute('data-arrowhead-for', source.getAttribute('data-link-id') ?? '');
    carrier.setAttribute('d', source.getAttribute('d')!);
    carrier.setAttribute('stroke', source.getAttribute('stroke') ?? 'black');
    carrier.setAttribute('fill', 'none');
    carrier.setAttribute('transform', [group.getAttribute('transform'), source.getAttribute('transform')].filter(Boolean).join(' '));
    carrier.style.cssText = source.style.cssText;
    carrier.style.setProperty('stroke-width', '0', 'important');
    carrier.style.setProperty('pointer-events', 'none', 'important');
    carrier.style.setProperty('marker-start', start);
    carrier.style.setProperty('marker-end', end);
    const opacity = group.hasAttribute('data-arrowheads-hidden') ? 0
      : Number(group.getAttribute('opacity') ?? 1) * Number(source.getAttribute('opacity') ?? 1);
    carrier.setAttribute('opacity', String(opacity));

    // Keep the attributes as the marker contract; suppress only the lower copy.
    source.style.setProperty('marker-start', 'none');
    source.style.setProperty('marker-end', 'none');
  }
  while (layer.children.length > count) layer.lastElementChild!.remove();
}
