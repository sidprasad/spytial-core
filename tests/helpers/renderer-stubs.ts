/**
 * Shared pieces for the renderer tests that call `WebColaCnDGraph` methods off
 * the prototype with a fabricated `this`.
 *
 * Those tests used to hand-copy whatever the method under test happened to
 * read — `getCanvasBackground: () => '#fffff8'`, a `getFontFamily` returning
 * some stand-in stack, a `themedDataColor` borrowed from the prototype. Each
 * copy was a guess at the real behaviour, and they drifted apart. Now the
 * display half is a real {@link ThemeController}, so the tests exercise the
 * shipping resolution instead of an approximation of it.
 */

import { ThemeController } from '../../src/translators/webcola/theming';

/**
 * A real controller on the light baseline (no slots set), which is what an
 * unthemed graph runs. `attributes` stands in for the host element's display
 * attributes — `background` (canvas sugar) and `font-family`.
 */
export function lightTheme(attributes: Record<string, string> = {}): ThemeController {
  return new ThemeController({ attribute: name => attributes[name] ?? null });
}

/** The one field `getCSS` reads off `this`. */
export function stylesheetHost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { themeController: lightTheme(), ...overrides };
}
