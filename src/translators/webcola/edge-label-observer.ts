import { placeRenderedEdgeLabels } from './edge-labels';

/**
 * Keep final-route labels current when their first measurement happens before
 * attachment, while hidden, or before a web font arrives. Observe sizes, not
 * positions: writing label x/y or zooming must not trigger another placement.
 * No polling is needed while a graph has no rendered geometry.
 */
export function observeRenderedEdgeLabels(container: SVGGElement, onDeferredPlacement: () => void): () => void {
  if (!container.querySelector('text.linklabel')) return () => {};
  const document = container.ownerDocument;
  const view = document.defaultView;
  const svg = container.ownerSVGElement;
  let active = true;
  let frame: number | undefined;

  const placeIfRendered = (): boolean => {
    if (!active || !svg?.isConnected) return false;
    // getBBox may report fallback/partial geometry even beneath display:none.
    // The viewport's client rect establishes that this SVG actually has layout.
    const rect = svg.getClientRects()[0];
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    placeRenderedEdgeLabels(container);
    return true;
  };
  const schedule = (): void => {
    if (!active || frame !== undefined || !view) return;
    frame = view.requestAnimationFrame(() => {
      frame = undefined;
      if (!active) return;
      observeVisibility();
      if (placeIfRendered()) onDeferredPlacement();
    });
  };

  // visibility:hidden preserves dimensions, so it does not produce a resize.
  // Watch relevant presentation attributes only; x/y/transform writes from
  // placement and zoom cannot create a mutation/placement feedback loop.
  const visibilityObserver = view?.MutationObserver ? new view.MutationObserver(schedule) : undefined;
  const observeVisibility = (): void => {
    visibilityObserver?.disconnect();
    const options = { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'visibility', 'display'] };
    let ancestor: Element | null = container;
    while (ancestor) {
      visibilityObserver?.observe(ancestor, options);
      const root = ancestor.getRootNode() as Document | ShadowRoot;
      ancestor = ancestor.parentElement ?? ('host' in root ? root.host : null);
    }
    for (const text of container.querySelectorAll('.linklabel, .groupLabel, .groupLabelBg')) {
      visibilityObserver?.observe(text, options);
    }
  };
  observeVisibility();

  // ResizeObserver reports a hidden/detached viewport becoming rendered, and
  // SVG text size changes (including already-loaded font/style switches).
  const observer = view?.ResizeObserver ? new view.ResizeObserver(schedule) : undefined;
  if (svg) observer?.observe(svg);
  for (const element of container.querySelectorAll('.linklabel, .node, .error-node, .groupLabel, .groupLabelBg')) {
    observer?.observe(element);
  }

  // ready covers a font load already underway; loadingdone also covers fonts
  // discovered later, e.g. after an @import stylesheet finishes downloading.
  const fonts = document.fonts;
  if (fonts?.status === 'loading') void fonts.ready.then(schedule);
  fonts?.addEventListener('loadingdone', schedule);
  fonts?.addEventListener('loadingerror', schedule);
  placeIfRendered();

  return () => {
    active = false;
    observer?.disconnect();
    visibilityObserver?.disconnect();
    fonts?.removeEventListener('loadingdone', schedule);
    fonts?.removeEventListener('loadingerror', schedule);
    if (frame !== undefined) view?.cancelAnimationFrame(frame);
    frame = undefined;
  };
}
