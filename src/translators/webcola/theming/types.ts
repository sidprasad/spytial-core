/**
 * Shared types for the graph's display theming.
 *
 * A theme is a bundle of `--cnd-*` custom-property values plus a tuning knob
 * for the default node palette. Everything here is a display concern: a theme
 * never changes what a diagram means, only how it is painted.
 */

import type { NodeColorParams } from '../../../layout/colorpicker';

/** `--cnd-*` custom-property values, keyed by property name. */
export type ThemeSlots = Record<string, string>;

/**
 * A named display theme. A theme is the single source of truth for the graph's
 * colors and bundles the three levers:
 *  1. the canvas background (the `--cnd-canvas-bg` slot),
 *  2. the default edge color (the `--cnd-edge-color` slot), and
 *  3. the default node-color palette ({@link GraphTheme.nodeColors}).
 *
 * `light` and `dark` are built in; register more via the graph's
 * `registerTheme` / `registerThemes` and they appear in the Mode dropdown.
 */
export interface GraphTheme {
  /** Unique key — used as the `theme` attribute value and the dropdown option value. */
  name: string;
  /** Human-readable label for the dropdown. Defaults to a title-cased `name`. */
  label?: string;
  /**
   * `--cnd-*` custom-property values layered over the light baseline (the
   * stylesheet literals). An absent/empty map IS the light theme. Slots are
   * applied to the host element and read by the shadow stylesheet via `var()`.
   */
  slots?: ThemeSlots;
  /**
   * Tuning for the default (phyllotactic) node palette — e.g. a dark canvas
   * passes `{ lightness: 74 }` so the algorithm-assigned type colors stay
   * legible. Absent = leave the canonical light palette untouched.
   */
  nodeColors?: NodeColorParams;
}
