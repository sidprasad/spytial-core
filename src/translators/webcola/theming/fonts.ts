/**
 * The graph's default font stack, and the web-font import that backs it.
 *
 * Kept beside the color theme because they are the same kind of thing: a
 * display default the host can override with an attribute, composed into the
 * shadow stylesheet.
 */

/**
 * Default font stack. Atkinson Hyperlegible (Braille Institute, OFL) is
 * designed for low-vision and dyslexic readers — distinguishable letterforms
 * (a/g/q/d, 0/O, 1/l/I) without looking childlike. Falls back to system-ui
 * if the host hasn't loaded the web font.
 */
export const DEFAULT_FONT_FAMILY = "'Atkinson Hyperlegible', system-ui, -apple-system, sans-serif";

/** The @import that loads {@link DEFAULT_FONT_FAMILY} from Google Fonts. */
export const DEFAULT_FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap');";
