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
 * Default light palette. Restrained, modern neutral look; the accent is a calm
 * indigo used sparingly (focus rings, active pills, the ✨ affordance). Syntax
 * colors are tuned for readability on the light surface.
 *
 * These exact string values are the CSS fallbacks baked into `spec-editor.css`,
 * so changing one here means changing the matching `var(..., <fallback>)` there.
 */
export const lightTheme: Required<SpecEditorTheme> = {
  accent: '#4f46e5',
  accentText: '#ffffff',
  surface: '#ffffff',
  surfaceRaised: '#f7f7f9',
  border: '#e2e2e7',
  text: '#1c1c1f',
  textMuted: '#6b6b75',
  danger: '#d4374a',
  warning: '#b7791f',
  success: '#1f9d57',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monoFontFamily:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: '14px',
  radius: '6px',
  spacing: '8px',
  synKeyword: '#7c3aed',
  synType: '#0e7490',
  synRelation: '#1d4ed8',
  synOperator: '#9333ea',
  synString: '#b45309',
  synComment: '#6b6b75',
};

/**
 * Default dark palette. Same token shape; neutral slate surfaces with the same
 * indigo accent lightened for contrast, and syntax colors lifted for dark
 * backgrounds.
 */
export const darkTheme: Required<SpecEditorTheme> = {
  accent: '#818cf8',
  accentText: '#0c0c10',
  surface: '#1b1b20',
  surfaceRaised: '#26262d',
  border: '#3a3a44',
  text: '#e9e9ee',
  textMuted: '#9a9aa6',
  danger: '#f0697a',
  warning: '#e0b25a',
  success: '#56cf8d',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monoFontFamily:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: '14px',
  radius: '6px',
  spacing: '8px',
  synKeyword: '#c4b5fd',
  synType: '#67e8f9',
  synRelation: '#93c5fd',
  synOperator: '#d8b4fe',
  synString: '#fcd34d',
  synComment: '#9a9aa6',
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
