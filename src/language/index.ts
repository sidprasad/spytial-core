/**
 * The Spytial spec-language contract: a machine-readable description of the
 * YAML spec language, versioned independently of the package and shipped with
 * every release.
 *
 * Consumers that *generate* specs should read this instead of scraping the
 * Markdown reference. Two artifacts are published per release, in `docs/`, on
 * npm, and as GitHub release assets:
 *
 *  - `spytial-language.json`    — this manifest, serialized.
 *  - `spytial-spec.schema.json` — a JSON Schema for validating a spec document.
 *
 * Both carry the same `languageVersion`. From TypeScript you can also build the
 * manifest at runtime with {@link getLanguageManifest}.
 */

export type {
  DocumentRules,
  Enforcement,
  FieldDeprecation,
  FieldType,
  HoldRules,
  ItemDeprecation,
  LanguageBlock,
  LanguageField,
  LanguageItem,
  LanguageManifest,
  SelectorArity,
  SpecSection,
} from './types';

export {
  LANGUAGE_VERSION,
  LANGUAGE_VERSION_POLICY,
  getLanguageBlocks,
  getLanguageItem,
  getLanguageItems,
  getLanguageManifest,
} from './manifest';

export { buildJsonSchema } from './json-schema';
