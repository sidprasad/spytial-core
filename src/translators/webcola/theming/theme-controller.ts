/**
 * Owns the graph's theme state and every color decision derived from it.
 *
 * The controller is deliberately DOM-free: it resolves colors and slot maps,
 * and the component does the painting (setting custom properties on the host,
 * repainting SVG presentation attributes, rebuilding the Mode dropdown). That
 * split is what makes theming testable without a browser — and it keeps the
 * component's remaining theme code down to three short "write it to the DOM"
 * methods.
 *
 * What the controller cannot resolve on its own are the host's display
 * attributes — `background` (sugar for the canvas slot) and `font-family`. It
 * reads those through {@link ThemeHost} so it always sees the live value.
 */

import { setLabLightness, type NodeColorParams } from '../../../layout/colorpicker';
import { ColorSource } from '../../../layout/interfaces';
import type { GraphTheme, ThemeSlots } from './types';
import {
  builtInThemes,
  DARK_THEME,
  DEFAULT_CANVAS_BG,
  FALLBACK_THEME_NAME,
  type ThemeSlotKey
} from './built-in-themes';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_IMPORT } from './fonts';

/** The element the controller is themed against. */
export interface ThemeHost {
  /**
   * Reads one of the host's display attributes (`background`, `font-family`),
   * or null when it is unset. A method rather than a snapshot, so the
   * controller always sees the live attribute.
   */
  attribute(name: string): string | null;
}

export class ThemeController {
  /**
   * Registry of available themes, keyed by name. Seeded with the built-in
   * `light` and `dark`; hosts add more via {@link register}, which surface in
   * the Mode dropdown. Per-instance, so different graphs can offer different
   * theme sets.
   */
  private registry: Map<string, GraphTheme> = builtInThemes();

  /**
   * Name of the active theme (a key into {@link registry}). `'light'`
   * (default) preserves the historical warm-white look exactly. Switching theme
   * sets `--cnd-*` custom properties on the host; the shadow stylesheet reads
   * them via `var(--cnd-*, <light-literal>)`, so an unthemed graph is
   * pixel-identical to before. Data-driven colors (`d.color`/`d.highlight`) are
   * never overridden — only static fallbacks and algorithm defaults are themed.
   */
  private activeName: string = FALLBACK_THEME_NAME;

  /**
   * Per-slot color overrides layered on top of the active theme (e.g.
   * `{ '--cnd-canvas-bg': '#101010' }`). The `background` attribute is sugar
   * for `--cnd-canvas-bg`.
   */
  private slotOverrides: ThemeSlots = {};

  /**
   * Per-call node-color overrides layered on top of the active theme's
   * `nodeColors` (e.g. `{ lightness: 80 }`).
   */
  private nodeColorOverrides: NodeColorParams = {};

  constructor(private readonly host: ThemeHost) {}

  // ---------------------------------------------------------------- registry

  /**
   * Register one or more custom themes (or override a built-in by reusing its
   * name). Each theme needs a unique `name`; nameless entries are skipped with
   * a warning rather than corrupting the registry.
   */
  register(themes: GraphTheme[]): void {
    for (const theme of themes) {
      if (!theme || !theme.name) {
        console.warn('registerThemes: each theme needs a non-empty `name`; skipping', theme);
        continue;
      }
      this.registry.set(theme.name, { ...theme });
    }
  }

  /** Names of all registered themes, in registration order (built-ins first). */
  names(): string[] {
    return [...this.registry.keys()];
  }

  /** The display label for a theme: its explicit `label`, else a title-cased name. */
  labelFor(name: string): string {
    const label = this.registry.get(name)?.label;
    return label ?? name.charAt(0).toUpperCase() + name.slice(1);
  }

  /** Name of the active theme. */
  get name(): string {
    return this.activeName;
  }

  /** The active theme object (falls back to `light` if the name is unknown). */
  private activeTheme(): GraphTheme {
    return this.registry.get(this.activeName) ?? this.registry.get(FALLBACK_THEME_NAME)!;
  }

  /** The active theme's `--cnd-*` slot values (empty for the light baseline). */
  private activeSlots(): ThemeSlots {
    return this.activeTheme().slots ?? {};
  }

  /**
   * Switch to `name` (unknown names fall back to `light`) and replace both
   * override layers. State only — the caller paints the result.
   */
  select(name: string, overrides?: ThemeSlots, nodeColors?: NodeColorParams): void {
    this.activeName = this.registry.has(name) ? name : FALLBACK_THEME_NAME;
    this.slotOverrides = overrides ? { ...overrides } : {};
    this.nodeColorOverrides = nodeColors ? { ...nodeColors } : {};
  }

  /** The current override layers, for a caller re-applying the same theme. */
  get overrides(): ThemeSlots {
    return this.slotOverrides;
  }

  /** The current node-color override layer, for a caller re-applying the same theme. */
  get nodeColors(): NodeColorParams {
    return this.nodeColorOverrides;
  }

  // ------------------------------------------------------------------- slots

  /**
   * Every `--cnd-*` slot key any registered theme can set — the set to clear
   * before applying a theme so a switch never leaves stale custom properties.
   */
  allSlotKeys(): Set<string> {
    const keys = new Set<string>(Object.keys(DARK_THEME));
    for (const theme of this.registry.values()) {
      if (theme.slots) for (const key of Object.keys(theme.slots)) keys.add(key);
    }
    return keys;
  }

  /**
   * The `--cnd-*` properties to set on the host: the active theme's slots, then
   * the `background` attribute (canvas sugar), then explicit per-slot overrides
   * (highest priority). Empty override values are ignored rather than clearing
   * the layer beneath them.
   */
  resolvedSlots(): ThemeSlots {
    const resolved: ThemeSlots = { ...this.activeSlots() };
    const bg = this.host.attribute('background');
    if (bg) resolved['--cnd-canvas-bg'] = bg;
    for (const [key, value] of Object.entries(this.slotOverrides)) {
      if (value) resolved[key] = value;
    }
    return resolved;
  }

  /**
   * The active canvas color, resolved highest-priority-first: an explicit
   * `--cnd-canvas-bg` theme override, then the legacy `background` attribute
   * (sugar for the canvas slot — composes with either base theme), then the
   * base theme's canvas (dark canvas, or the warm-white default). Drives node
   * fills, the edge-label halo, and PNG export so they stay in sync.
   */
  canvasBackground(): string {
    const override = this.slotOverrides['--cnd-canvas-bg'];
    if (override) return override;
    const bg = this.host.attribute('background');
    if (bg) return bg;
    return this.activeSlots()['--cnd-canvas-bg'] ?? DEFAULT_CANVAS_BG;
  }

  // ------------------------------------------------------------------- fonts

  /**
   * The active font stack: the host's `font-family` attribute if set, otherwise
   * the Atkinson Hyperlegible default.
   */
  fontFamily(): string {
    return this.host.attribute('font-family') ?? DEFAULT_FONT_FAMILY;
  }

  /**
   * The @import statement(s) needed to load the default font. Skipped when the
   * host has set a custom `font-family`, since users with their own font
   * shouldn't pay for an unused download.
   */
  fontImports(): string {
    return this.host.attribute('font-family') === null ? DEFAULT_FONT_IMPORT : '';
  }

  // ------------------------------------------------------------------ colors

  /**
   * The active theme's node-color tuning (its `nodeColors`, e.g. light `{}` /
   * dark `{ lightness: 74 }`) with any per-call override layered on top.
   */
  private resolvedNodeColorParams(): NodeColorParams {
    return {
      ...this.activeTheme().nodeColors,
      ...this.nodeColorOverrides
    };
  }

  /**
   * Whether the renderer may re-tune a node's color for the active theme, based
   * on its {@link ColorSource}. Only the default palette is themeable today;
   * this is the single decision point, so a new ColorSource variant opts in here
   * (and defaults to non-themeable until it does). Absent source is treated as
   * the default palette for backward compatibility.
   */
  private isThemeable(source: ColorSource | undefined): boolean {
    return (source ?? ColorSource.DefaultPalette) === ColorSource.DefaultPalette;
  }

  /**
   * Resolve a data-driven stroke/fill color that may be the *implicit* black
   * default (Alloy/Forge assign `"black"` to uncolored edges, node borders, and
   * type labels). A genuinely chosen non-black color is preserved under every
   * theme; the implicit black/empty default is replaced with the theme's slot
   * value when the active theme defines that slot, so edges, arrowheads (which
   * inherit via `context-stroke`), and borders stay legible on a themed canvas.
   * Under the light baseline (no slot) the literal fallback is used — unchanged.
   */
  dataColor(
    color: string | null | undefined,
    slotKey: ThemeSlotKey,
    lightFallback: string | null
  ): string | null {
    const themed = this.slotOverrides[slotKey] ?? this.activeSlots()[slotKey];
    if (themed !== undefined) {
      return isImplicitDefault(color) ? themed : color!;
    }
    return color || lightFallback;
  }

  /**
   * Resolve a node's effective color for the active theme. An algorithm-assigned
   * color (a themeable {@link ColorSource}) is re-tinted to the theme's node
   * lightness so the canonical palette adapts to the canvas; a user `color`
   * directive, or the implicit black fallback, is passed through to
   * {@link dataColor} unchanged. With no themed lightness (light theme) this is
   * identity — the historical look is preserved exactly.
   */
  nodeColor(
    color: string | null | undefined,
    source: ColorSource | undefined,
    slotKey: ThemeSlotKey,
    lightFallback: string | null
  ): string | null {
    const lightness = this.resolvedNodeColorParams().lightness;
    const base =
      lightness !== undefined && this.isThemeable(source) && !isImplicitDefault(color)
        ? setLabLightness(color!, lightness)
        : color;
    return this.dataColor(base, slotKey, lightFallback);
  }
}

/**
 * True for the colors that mean "nobody chose one": empty, or the black that
 * Alloy/Forge stamp on every uncolored edge, border, and type label.
 */
function isImplicitDefault(color: string | null | undefined): boolean {
  return !color || color === 'black' || color === '#000' || color === '#000000';
}
