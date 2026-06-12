/**
 * Viewport-anchored popup positioning.
 *
 * The editor is embedded in host pages whose containers routinely clip
 * absolutely-positioned children (fixed-height sidebars with `overflow:
 * hidden`/`auto` — e.g. the demo pages' layout panel). Menus and listboxes
 * therefore use `position: fixed` with coordinates computed from the trigger's
 * bounding rect, so they render above any host clipping context.
 *
 * The hook flips the popup above the anchor when there is more room there than
 * below, constrains `maxHeight` to the available space, and recomputes on
 * window resize and on any ancestor scroll (capture-phase listener). Note:
 * `position: fixed` resolves against a transformed ancestor if one exists —
 * host pages with `transform` on a wrapping element would offset the popup —
 * but no demo or known integration does this; it's the standard trade-off of
 * non-portal fixed positioning.
 */

import { useLayoutEffect, useState } from 'react';
import type React from 'react';

export interface AnchoredPopupOptions {
  /**
   * Horizontal alignment relative to the anchor:
   * - `'start'`: popup's left edge aligns with the anchor's left edge,
   * - `'end'`: popup's right edge aligns with the anchor's right edge,
   * - `'stretch'`: popup spans exactly the anchor's width.
   */
  align?: 'start' | 'end' | 'stretch';
  /** gap in px between anchor and popup (default 2). */
  gap?: number;
  /**
   * Expected popup height in px, used only to decide whether to flip above
   * the anchor (default 280).
   */
  estimatedHeight?: number;
}

/**
 * Returns a `style` object (fixed positioning + maxHeight) for a popup
 * anchored to `anchorRef`, or `{}` while closed. Spread it onto the popup
 * element; the element's stylesheet rule should declare `position: fixed`.
 */
export function useAnchoredPopup(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  options?: AnchoredPopupOptions,
): React.CSSProperties {
  const { align = 'start', gap = 2, estimatedHeight = 280 } = options ?? {};
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) {
      setStyle({});
      return;
    }

    const compute = (): void => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportW =
        window.innerWidth || document.documentElement.clientWidth;
      const viewportH =
        window.innerHeight || document.documentElement.clientHeight;

      const spaceBelow = viewportH - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const flipUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

      const next: React.CSSProperties = {
        // jsdom reports all-zero rects; the resulting 0-coordinates are inert
        // there (no layout), and real browsers always have a real rect.
        maxHeight: Math.max(120, (flipUp ? spaceAbove : spaceBelow) - 8),
      };

      if (flipUp) {
        next.bottom = viewportH - rect.top + gap;
      } else {
        next.top = rect.bottom + gap;
      }

      if (align === 'end') {
        next.right = Math.max(8, viewportW - rect.right);
      } else if (align === 'stretch') {
        next.left = rect.left;
        next.width = rect.width;
      } else {
        next.left = rect.left;
      }

      setStyle(next);
    };

    compute();
    window.addEventListener('resize', compute);
    // capture-phase so scrolls of ANY ancestor (host sidebars, the editor's
    // own scroll areas) reposition the popup rather than leaving it stranded.
    document.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      document.removeEventListener('scroll', compute, true);
    };
  }, [open, anchorRef, align, gap, estimatedHeight]);

  return style;
}
