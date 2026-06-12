/**
 * Public surface of the Spytial spec editor (Structured Builder v2).
 *
 * WP1 ships the framework-agnostic core model plus the domain-schema type
 * contracts. Later work packages add the domain layer (WP2), UI primitives
 * (WP3) and views/integration (WP4) and extend this barrel.
 *
 * Named exports only (tree-shaking convention).
 */

// ---- core types (pinned contracts) ----
export type {
  ItemKind,
  SpecItem,
  FieldKind,
  FieldSpec,
  Diagnostic,
  ItemDefinition,
  SpecDocumentState,
} from './core/types';

// ---- document ----
export { SpecDocument, SpecParseError } from './core/spec-document';

// ---- codec ----
export {
  parseYamlToState,
  serializeStateToYaml,
} from './core/yaml-codec';

// ---- registry ----
export {
  getDefinition,
  getDefinitions,
  getAllDefinitions,
  getDefinitionsForYamlKey,
  isKnownType,
  isKnownYamlKey,
  defaultParamsFor,
  getFieldSpec,
  ORIENTATION_DIRECTIONS,
  CYCLIC_DIRECTIONS,
  ALIGN_DIRECTIONS,
  EDGE_STYLES,
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
} from './core/registry';

// ---- diagnostics ----
export { validateItem, validateState } from './core/diagnostics';

// ---- id helper (used by integrators that build SpecItems by hand) ----
export { newId } from './core/id';

// ---- domain schema + extraction (WP2) ----
export type { DomainSchema, DomainRelation } from './domain/domain-schema';
export { extractDomainSchema } from './domain/domain-schema';

// ---- domain validation (WP2) ----
export {
  validateAgainstDomain,
  extractSelectorIdentifiers,
} from './domain/domain-validation';

// ---- selector assistance contract (HOOK 2) ----
export type {
  SelectorAssistant,
  SelectorAssistContext,
  Completion,
} from './domain/assistant';

// ---- built-in completions (WP2) ----
export {
  getSelectorKeywordCompletions,
  getDomainCompletions,
  createBuiltinCompletionSource,
  mergeCompletions,
  MAX_ATOM_COMPLETIONS,
} from './domain/completions';

// ---- UI foundation primitives (WP3) ----
export type { SpecEditorTheme } from './ui/theme';
export { lightTheme, darkTheme, themeToCssVars, registerSpecEditorThemes, resolveSpecEditorTheme } from './ui/theme';
export type { SpecEditorThemeInput } from './ui/theme';

export type { Token, TokenKind } from './ui/highlight';
export { tokenizeSelector, tokenClassName, isPunctuation } from './ui/highlight';

export type { YamlToken, YamlTokenKind } from './ui/highlight-yaml';
export { tokenizeYaml, tokenizeYamlLine, yamlTokenClassName } from './ui/highlight-yaml';

export type { SelectorFieldProps, SynthesisResult } from './ui/SelectorField';
export { SelectorField } from './ui/SelectorField';

export type {
  FieldRendererProps,
  FieldRendererOptions,
  SelectorFieldExtras,
} from './ui/FieldRenderer';
export { FieldRenderer } from './ui/FieldRenderer';

// ---- views + public component (WP4) ----
export type { CodeViewProps } from './ui/CodeView';
export { CodeView } from './ui/CodeView';

export type { BuilderViewProps } from './ui/BuilderView';
export { BuilderView } from './ui/BuilderView';

export type { SpecEditorProps } from './ui/SpecEditor';
export { SpecEditor } from './ui/SpecEditor';
