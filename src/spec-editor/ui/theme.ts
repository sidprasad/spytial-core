/**
 * Theme tokens for the Spytial spec editor (HOOK 1 in
 * `docs/SPEC_EDITOR_REDESIGN.md`).
 *
 * Every visual knob is a token. Tokens become `--spytial-ed-*` CSS custom
 * properties via {@link themeToCssVars}; `spec-editor.css` keys all colors,
 * fonts and sizes off those variables with fallbacks equal to {@link lightTheme},
 * so the editor is fully styled with no theme prop. A `theme` prop maps the
 * tokens onto inline custom properties on the editor root, overriding the
 * fallbacks.
 */

/** Every visual knob is a token; tokens become `--spytial-ed-*` custom properties. */
export interface SpecEditorTheme {
  accent?: string;
  accentText?: string;
  surface?: string;
  surfaceRaised?: string;
  border?: string;
  text?: string;
  textMuted?: string;
  danger?: string;
  warning?: string;
  success?: string;
  fontFamily?: string;
  monoFontFamily?: string;
  /** base, rem/px */
  fontSize?: string;
  /** base unit */
  radius?: string;
  /** base unit */
  spacing?: string;
  // syntax tokens for selector/yaml highlighting
  synKeyword?: string;
  synType?: string;
  synRelation?: string;
  synOperator?: string;
  synString?: string;
  synComment?: string;
}

/**
 * Default light palette — "drafting table": warm paper surfaces, near-black
 * ink, and a single vermillion accent used the way a draftsman uses a red
 * pencil (focus, active states, the ✨ affordance). Section labels and
 * summaries lean on the mono stack, giving the editor the feel of a technical
 * instrument rather than a generic web form.
 *
 * These exact string values are the CSS fallbacks baked into `spec-editor.css`,
 * so changing one here means changing the matching `var(..., <fallback>)` there.
 */
export const lightTheme: Required<SpecEditorTheme> = {
  accent: '#b5431a',
  accentText: '#fdf6ec',
  surface: '#faf8f2',
  surfaceRaised: '#f1ecdf',
  border: '#d9d2c0',
  text: '#221d14',
  textMuted: '#6e6553',
  danger: '#a32014',
  warning: '#8a6200',
  success: '#2f6c43',
  fontFamily:
    "'Avenir Next', 'Avenir', 'Seravek', 'Segoe UI Variable', 'Segoe UI', 'Trebuchet MS', sans-serif",
  monoFontFamily:
    "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: '14px',
  radius: '2px',
  spacing: '8px',
  synKeyword: '#6d28a8',
  synType: '#0e6b6b',
  synRelation: '#1f4f9e',
  synOperator: '#b5431a',
  synString: '#7a5901',
  synComment: '#8a8170',
};

/**
 * Default dark palette — "instrument panel": deep blue-black slate with warm
 * chalk text and an oscilloscope-amber accent. Same token shape as
 * {@link lightTheme}; syntax colors are lifted for dark backgrounds.
 */
export const darkTheme: Required<SpecEditorTheme> = {
  accent: '#e08a3c',
  accentText: '#16100a',
  surface: '#12161e',
  surfaceRaised: '#1a202b',
  border: '#2d3645',
  text: '#e7e2d3',
  textMuted: '#94865f',
  danger: '#e06c5d',
  warning: '#d4a843',
  success: '#5fb98a',
  fontFamily:
    "'Avenir Next', 'Avenir', 'Seravek', 'Segoe UI Variable', 'Segoe UI', 'Trebuchet MS', sans-serif",
  monoFontFamily:
    "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: '14px',
  radius: '2px',
  spacing: '8px',
  synKeyword: '#b48ee0',
  synType: '#5fb3a1',
  synRelation: '#7ba3e8',
  synOperator: '#e08a3c',
  synString: '#cfa75e',
  synComment: '#6e7889',
};

/**
 * Maps theme token keys to their `--spytial-ed-*` custom-property names.
 *
 * camelCase tokens become kebab-case suffixes (`synKeyword` →
 * `--spytial-ed-syn-keyword`, `accentText` → `--spytial-ed-accent-text`).
 */
const TOKEN_TO_CSS_VAR: Record<keyof SpecEditorTheme, string> = {
  accent: '--spytial-ed-accent',
  accentText: '--spytial-ed-accent-text',
  surface: '--spytial-ed-surface',
  surfaceRaised: '--spytial-ed-surface-raised',
  border: '--spytial-ed-border',
  text: '--spytial-ed-text',
  textMuted: '--spytial-ed-text-muted',
  danger: '--spytial-ed-danger',
  warning: '--spytial-ed-warning',
  success: '--spytial-ed-success',
  fontFamily: '--spytial-ed-font-family',
  monoFontFamily: '--spytial-ed-mono-font-family',
  fontSize: '--spytial-ed-font-size',
  radius: '--spytial-ed-radius',
  spacing: '--spytial-ed-spacing',
  synKeyword: '--spytial-ed-syn-keyword',
  synType: '--spytial-ed-syn-type',
  synRelation: '--spytial-ed-syn-relation',
  synOperator: '--spytial-ed-syn-operator',
  synString: '--spytial-ed-syn-string',
  synComment: '--spytial-ed-syn-comment',
};

/**
 * Converts a (possibly partial) theme to a map of `--spytial-ed-*` custom
 * properties. Only tokens actually present on `theme` are emitted, so the rest
 * fall back to the values baked into `spec-editor.css`. The result is suitable
 * for spreading into a React `style` prop on the editor root.
 */
export function themeToCssVars(theme: SpecEditorTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  (Object.keys(TOKEN_TO_CSS_VAR) as Array<keyof SpecEditorTheme>).forEach(
    (token) => {
      const value = theme[token];
      if (value !== undefined && value !== null) {
        vars[TOKEN_TO_CSS_VAR[token]] = value;
      }
    }
  );
  return vars;
}
