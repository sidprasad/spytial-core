/**
 * UI foundation primitives for the Spytial spec editor (WP3).
 *
 * Theme tokens + presets, the syntax tokenizer for selector highlighting, and
 * the two foundation components: {@link SelectorField} and
 * {@link FieldRenderer}. The stylesheet is imported here so any consumer of a
 * UI component gets the full editor styling automatically (tsup inlines the
 * CSS, matching the `src/components/*` convention).
 *
 * Named exports only. WP4 wires this barrel into the top-level
 * `src/spec-editor/index.ts`.
 */

import './spec-editor.css';

// ---- theme (HOOK 1) ----
export type { SpecEditorTheme } from './theme';
export { lightTheme, darkTheme, themeToCssVars, registerSpecEditorThemes, resolveSpecEditorTheme } from './theme';
export type { SpecEditorThemeInput } from './theme';

// ---- selector syntax tokenizer ----
export type { Token, TokenKind } from './highlight';
export { tokenizeSelector, tokenClassName, isPunctuation } from './highlight';

export type { YamlToken, YamlTokenKind } from './highlight-yaml';
export { tokenizeYaml, tokenizeYamlLine, yamlTokenClassName } from './highlight-yaml';

// ---- SelectorField ----
export type { SelectorFieldProps, SynthesisResult } from './SelectorField';
export { SelectorField } from './SelectorField';

// ---- FieldRenderer ----
export type {
  FieldRendererProps,
  FieldRendererOptions,
  SelectorFieldExtras,
} from './FieldRenderer';
export { FieldRenderer } from './FieldRenderer';

// ---- views (WP4) ----
export type { CodeViewProps } from './CodeView';
export { CodeView } from './CodeView';

export type { BuilderViewProps } from './BuilderView';
export { BuilderView } from './BuilderView';

// ---- the public component (WP4) ----
export type { SpecEditorProps } from './SpecEditor';
export { SpecEditor } from './SpecEditor';
