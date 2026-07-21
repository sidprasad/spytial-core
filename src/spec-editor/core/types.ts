/**
 * Core shared contracts for the Spytial spec editor (Structured Builder v2).
 *
 * This module is framework-agnostic — it MUST NOT import React or any UI code.
 * The interfaces pinned in `docs/SPEC_EDITOR_REDESIGN.md` are reproduced here
 * verbatim; later work packages compile against them.
 */

// ---- item model ----

export type ItemKind = 'constraint' | 'directive';

export interface SpecItem {
  /** stable id for React keys + diagnostics */
  id: string;
  kind: ItemKind;
  /** registry key, e.g. 'orientation' */
  type: string;
  params: Record<string, unknown>;
  /** user note, round-trips as YAML comment */
  comment?: string;
  /** present iff type unknown to registry; re-emitted verbatim */
  raw?: unknown;
  /**
   * The raw inner YAML body this item parsed from, when a custom `fromYamlNode`
   * (group / flag) ingested it. Curated ingestion copies only recognized keys
   * into `params`, so this preserves the rest — enabling the unknown-key check
   * to still flag typos on those types. Not serialized; absent for
   * builder-built items (which only ever hold known fields).
   */
  sourceBody?: Record<string, unknown>;
}

// ---- field model ----

export type FieldKind =
  | 'selector' // CnD selector expression (gets SelectorField treatment)
  | 'relationName' // a relation/field name from the domain (dropdown when domain known)
  | 'typeName' // a type/sig name from the domain (dropdown when domain known)
  | 'enum'
  | 'number'
  | 'color'
  | 'text'
  | 'boolean'
  | 'group'; // a nested block (lineStyle / textStyle / …); renders its `children` recursively

export interface FieldSpec {
  /** params key */
  key: string;
  kind: FieldKind;
  label: string;
  required?: boolean;
  /** for 'enum' */
  options?: readonly string[];
  /** for 'enum': multi-select pills (e.g. orientation directions) */
  multiple?: boolean;
  default?: unknown;
  placeholder?: string;
  /** short tooltip text */
  help?: string;
  /** for 'selector' fields */
  selectorArity?: 'unary' | 'binary';
  /** for 'group' fields: the nested block's child fields (rendered recursively). */
  children?: readonly FieldSpec[];
}

// ---- diagnostics ----

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /**
   * Machine-readable category, so consumers can filter/handle by kind rather
   * than string-matching the message — e.g. surface `'deprecated'` differently
   * from `'unknown-key'`. Optional and open-ended; absent on older diagnostics.
   */
  code?:
    | 'unknown-key'
    | 'unknown-type'
    | 'deprecated'
    | 'missing-required'
    | 'invalid-value'
    | (string & {});
  /** ties to a builder row */
  itemId?: string;
  /** ties to a specific field */
  fieldKey?: string;
  /** ties to a YAML location (code view) */
  line?: number;
  column?: number;
  source: 'yaml' | 'structure' | 'domain' | 'assistant';
}

// ---- registry ----

export interface ItemDefinition {
  kind: ItemKind;
  type: string;
  /** human name in the add menu */
  label: string;
  description?: string;
  /** parse + render, but hide from add menu (e.g. 'groupfield') */
  deprecated?: boolean;
  /**
   * When `deprecated`, the label of the type that supersedes it (e.g. 'atomStyle'
   * for 'atomColor'). Surfaced in the deprecation diagnostic so the fix is named.
   */
  deprecatedInFavorOf?: string;
  fields: FieldSpec[];
  /** one-line summary for the collapsed row, e.g. "left, above · parent" */
  summary(params: Record<string, unknown>): string;
  /** extra structural validation beyond required-field checks */
  validate?(params: Record<string, unknown>): Diagnostic[];
  /** override YAML emission for quirky shapes (e.g. flag scalar form) */
  toYamlNode?(params: Record<string, unknown>): unknown;
  /** override YAML ingestion; return null to reject */
  fromYamlNode?(node: unknown): Record<string, unknown> | null;
}

// ---- document state ----

/** One preserved top-level YAML section the editor does not interpret. */
export interface OtherSection {
  /** top-level YAML key, e.g. 'projections' or 'temporal' */
  key: string;
  /** the section's parsed value, re-emitted verbatim on serialize */
  value: unknown;
}

export interface SpecDocumentState {
  constraints: SpecItem[];
  directives: SpecItem[];
  /** comments/blank-line structure not attached to an item, preserved on serialize */
  headerComment?: string;
  /**
   * Top-level sections other than `constraints:`/`directives:` (e.g. a host's
   * `projections:`/`temporal:` blocks), preserved in document order and
   * re-emitted after the known sections. The editor never edits these — it
   * just doesn't delete content it doesn't understand.
   */
  otherSections?: OtherSection[];
}
