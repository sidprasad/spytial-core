/**
 * Types for the Spytial spec-language manifest — the machine-readable
 * description of the YAML spec language that ships with every release.
 *
 * The manifest exists so a consumer that *generates* specs (a host-language
 * integration emitting YAML, an agent, a code-gen tool) can read the language's
 * shape as data instead of scraping prose out of a Markdown file. It answers,
 * per constraint/directive: which section it lives in, which fields it takes,
 * which are required, which values are legal, what the engine does when a field
 * is omitted, and — crucially — what is deprecated and what to emit instead.
 *
 * The manifest is versioned independently of the package: see
 * {@link LanguageManifest.languageVersion}.
 */

/** Which top-level section(s) of a spec document an item may appear under. */
export type SpecSection = 'constraints' | 'directives';

/**
 * The value shape of a field, as a code generator needs to emit it.
 *
 * `selector` and `relation` are `string` at the YAML level; they are called out
 * separately because a generator usually builds them differently (a selector is
 * an expression in the host's relational syntax, a relation is a bare name from
 * the data instance).
 */
export type FieldType =
  | 'selector'
  | 'relation'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'color'
  | 'enum'
  | 'enum-list'
  | 'icon-path'
  | 'block';

/**
 * How many columns a selector expression is expected to return.
 * `n-ary` means "two or more" (tuple filters).
 */
export type SelectorArity = 'unary' | 'binary' | 'n-ary';

/**
 * Whether `parseLayoutSpec` actually enforces a rule, or merely documents it.
 *
 *  - `parse-error`   — the parser throws when the rule is broken.
 *  - `unchecked`     — the parser accepts it silently; the breakage shows up
 *                      later (a directive that matches nothing, an evaluator
 *                      error at layout time, or a plain no-op).
 *  - `value-ignored` — the parser drops the offending value and behaves as if
 *                      the field were absent (how the sparse style blocks
 *                      reject out-of-range leaves).
 *
 * This distinction is the difference between "my generator will crash" and "my
 * generator will silently emit a dead directive", so it is worth stating. Every
 * claim made here is asserted against the real parser in
 * `tests/language-manifest.test.ts`.
 */
export type Enforcement = 'parse-error' | 'unchecked' | 'value-ignored';

/** One field of a constraint or directive. */
export interface LanguageField {
  /** The YAML key. */
  name: string;
  type: FieldType;
  description: string;
  /** Absent means optional. */
  required?: boolean;
  /**
   * What the parser does when `required` is violated (or, for enums, when the
   * value is not in `values`). Absent on optional fields with no enum.
   */
  enforcement?: Enforcement;
  /** For `enum` / `enum-list`: the legal values. */
  values?: readonly string[];
  /** For `selector`: how many columns the expression should return. */
  arity?: SelectorArity;
  /**
   * What the engine does when the field is omitted. This is the *engine*
   * default (the observable behaviour), not a value the editor happens to seed
   * a new item with — absent means "no default; omitting it means the feature
   * is off or inherited".
   */
  default?: unknown;
  /** For numbers: the accepted range. Values outside it are dropped. */
  exclusiveMinimum?: number;
  minimum?: number;
  maximum?: number;
  /** For `block`: the name of a shared block in {@link LanguageManifest.blocks}. */
  block?: string;
  /** For `block` fields that are not one of the shared blocks: their leaves. */
  fields?: readonly LanguageField[];
  /**
   * An additional accepted shape for this field, beyond `type`. Used by
   * `group.addEdge`, which is either a bare direction string or a block that
   * also styles the connector.
   */
  alternativeForm?: {
    type: FieldType;
    description: string;
    fields?: readonly LanguageField[];
    block?: string;
  };
  /** Set when the field itself is deprecated (its parent item may not be). */
  deprecated?: FieldDeprecation;
  /** Anything a generator would otherwise get wrong. */
  note?: string;
}

/** A deprecated field and the current spelling that replaces it. */
export interface FieldDeprecation {
  /** Dotted path to the replacement, relative to the same item. */
  replacedBy: string;
  reason?: string;
}

/** A shared, reusable block of style leaves (`textStyle`, `lineStyle`, …). */
export interface LanguageBlock {
  name: string;
  description: string;
  fields: readonly LanguageField[];
}

/** A constraint or directive: one entry in a spec's `constraints`/`directives` list. */
export interface LanguageItem {
  /**
   * The YAML key this item is written under (`orientation`, `atomStyle`, …).
   * Not unique on its own: `group` covers both grouping forms, told apart by
   * {@link LanguageItem.discriminator}.
   */
  yamlKey: string;
  /** Unique id for this item across the manifest. Equals `yamlKey` unless two items share a key. */
  id: string;
  label: string;
  description: string;
  /** The section(s) to write this item under. Emit here. */
  sections: readonly SpecSection[];
  /**
   * Section(s) where the item is still parsed, identically, but deprecated —
   * writing it there raises a deprecation warning. `size` and `hideAtom` are
   * constraints that were historically also accepted among the directives.
   * A generator should treat these as read-only: migrate what it finds, never
   * emit here.
   */
  deprecatedSections?: readonly SpecSection[];
  /** Set when `deprecatedSections` is: why, and the warning it raises. */
  sectionDeprecation?: {
    reason: string;
    /** The `specType` carried on the {@link ParseWarning}. */
    warningSpecType: string;
  };
  /**
   * How the item's value is written. Nearly everything is a `mapping`
   * (`- orientation: { selector: …, … }`); `flag` is a bare `scalar`
   * (`- flag: hideDisconnected`) and has a single unnamed value described by
   * its one entry in {@link LanguageItem.fields}.
   */
  valueShape: 'mapping' | 'scalar';
  /** How to tell this item apart from another sharing its `yamlKey`. */
  discriminator?: {
    /** The field whose presence/absence decides. */
    field: string;
    present: boolean;
  };
  /** Whether this item supports negation via `hold: never`. */
  supportsHold: boolean;
  fields: readonly LanguageField[];
  /** Set when the whole item is deprecated. */
  deprecated?: ItemDeprecation;
  /** A minimal, valid example. Parsed in the conformance test. */
  example: Record<string, unknown>;
  note?: string;
}

/** A deprecated item, and how to rewrite it. */
export interface ItemDeprecation {
  /** The item id that supersedes this one. */
  replacedBy: string;
  reason: string;
  /**
   * Field-by-field rewrite, as `oldPath` → `newPath`. A generator can apply
   * this mechanically to migrate an existing spec.
   */
  mapping: Readonly<Record<string, string>>;
  /**
   * The `specType` carried on the {@link ParseWarning} the parser raises for
   * this form, so a consumer can attribute a warning without matching prose.
   */
  warningSpecType: string;
}

/** Document-level facts about how a spec is read as a whole. */
export interface DocumentRules {
  /** Top-level keys that carry meaning. */
  sections: readonly SpecSection[];
  /**
   * Whether an unrecognized top-level key, list item, or field is rejected.
   * It is not: the parser ignores what it does not recognize, so a typo is
   * silent. Generators should validate against this manifest rather than
   * relying on the parser to complain.
   */
  unknownKeys: 'ignored' | 'error';
  /** Each section must be a YAML list; a mapping is ignored wholesale. */
  sectionShape: 'list';
  /** Notes on whole-document behaviour a generator should know. */
  notes: readonly string[];
}

/** Negation: `hold: never` on a constraint. */
export interface HoldRules {
  field: string;
  values: readonly string[];
  default: string;
  /** Item ids that honour `hold`. Anything else silently ignores it. */
  supportedBy: readonly string[];
  note: string;
}

/** The complete machine-readable description of the spec language. */
export interface LanguageManifest {
  /** Stable identifier for this artifact's own shape. */
  $schema?: string;
  /** The language this describes. */
  language: 'spytial-layout-spec';
  /** The date the language last changed, as `YYYY-MM-DD`. */
  languageVersion: string;
  /** The `spytial-core` release that produced this manifest. */
  spytialCoreVersion: string;
  /** How the language is versioned, and what a deprecation promises. */
  versioning: Readonly<Record<'note' | 'deprecations', string>>;
  document: DocumentRules;
  hold: HoldRules;
  blocks: readonly LanguageBlock[];
  items: readonly LanguageItem[];
  /**
   * Every deprecated form in one list, for a migration pass — a whole item, a
   * single field, or a placement (the right form written in the wrong section).
   */
  deprecations: readonly (ItemDeprecation & {
    id: string;
    kind: 'item' | 'field' | 'placement';
    path: string;
  })[];
  /** Prose documentation, for humans following up on something here. */
  documentation: Readonly<Record<string, string>>;
}
