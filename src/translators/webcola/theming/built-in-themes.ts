/**
 * The two built-in themes and the constants they hang off.
 *
 * Light is the historical look and sets no slots at all — it IS the stylesheet
 * literals. Dark overrides them. Keeping the light theme empty is what makes an
 * unthemed graph pixel-identical to one from before theming existed.
 */

import type { GraphTheme, ThemeSlots } from './types';

/**
 * Default canvas color (tufte-css `#fffff8` warm white). Used when the host
 * element has no `background` attribute and the active theme sets no canvas
 * slot. The canvas color drives the container background, node fills,
 * edge-label halos, and PNG export background so they all stay in sync.
 */
export const DEFAULT_CANVAS_BG = '#fffff8';

/**
 * Dark-theme custom-property values. Light mode simply removes these
 * properties, falling back to the literals baked into the stylesheet. A few
 * entries (canvas-bg, edge-color, node-border, label-text) are also read
 * directly from JS for colors applied as SVG presentation attributes, where
 * a CSS `var()` cannot reach.
 */
export const DARK_THEME = {
  '--cnd-canvas-bg': '#1e1e1e',
  '--cnd-label-text': '#e6e6e6',
  '--cnd-edge-color': '#7d828b',
  '--cnd-node-border': '#8b919b',
  '--cnd-edge-highlight': '#f0f0f0',
  '--cnd-inferred-highlight': '#9aa0a8',
  '--cnd-group-fill': 'rgba(140, 140, 140, 0.12)',
  '--cnd-group-stroke': '#7a7f87',
  '--cnd-loading-bg': 'rgba(30, 32, 37, 0.95)',
  '--cnd-loading-text': '#c9cdd4',
  '--cnd-loading-dot': '#5dade2',
  '--cnd-panel-bg': '#23262d',
  '--cnd-panel-text': '#e6e6e6',
  '--cnd-panel-text-muted': '#a7adb8',
  '--cnd-panel-border': '#3a3f49',
  '--cnd-toolbar-bg': 'rgba(30, 32, 37, 0.95)',
  '--cnd-control-bg': '#2b2f37',
  '--cnd-control-bg-hover': '#343a44',
  '--cnd-control-border': '#3a3f49'
} satisfies ThemeSlots;

/**
 * The slots a caller may name in {@link ThemeController.dataColor}. Every one
 * has a dark value, which is what makes it worth reading from JS at all.
 */
export type ThemeSlotKey = keyof typeof DARK_THEME;

/** The name every unknown theme falls back to. */
export const FALLBACK_THEME_NAME = 'light';

/** A fresh registry seeded with `light` and `dark`, in that order. */
export function builtInThemes(): Map<string, GraphTheme> {
  return new Map<string, GraphTheme>([
    ['light', { name: 'light', label: 'Light', slots: {}, nodeColors: {} }],
    ['dark', { name: 'dark', label: 'Dark', slots: DARK_THEME, nodeColors: { lightness: 74 } }]
  ]);
}
