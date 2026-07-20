/**
 * Back-compat shims for the legacy `NoCodeView` data API.
 *
 * The old Structured Builder (the 27 hand-built selector components, the
 * `NoCodeView`/`CodeView` React surfaces, the `ConstraintCard`/`DirectiveCard`
 * widgets, the selector hooks and CSS) has been replaced by the schema-driven
 * Spytial spec editor in `src/spec-editor/`. The functions below preserve the
 * legacy import surface so existing callers keep compiling, by re-expressing
 * each one on top of the new core:
 *
 *  - `parseLayoutSpecToData(yaml)`  → `parseYamlToState` mapped to the legacy
 *    `{ id, type, params, comment }` `ConstraintData`/`DirectiveData` shapes.
 *  - `generateLayoutSpecYaml(c, d)` → the legacy data shapes mapped back to
 *    `SpecItem[]` and serialized via `serializeStateToYaml`.
 *  - `validateYaml` / `validateSpytialSpec` → unchanged behaviour (js-yaml
 *    syntax check + structural key/type warnings + a final `parseLayoutSpec`).
 *  - `highlightSelector` → the legacy pure HTML-highlighting helper, kept
 *    verbatim (it has no UI dependency and retains its own test coverage).
 *
 * Document state is owned by the new `SpecEditor`; these shims are convenience
 * adapters for callers that have not migrated yet.
 */

import jsyaml from 'js-yaml';
import { parseLayoutSpec } from '../../layout/layoutspec';
import {
  parseYamlToState,
  serializeStateToYaml,
  newId,
  isKnownType,
  isKnownYamlKey,
  getKnownYamlKeys,
} from '../../spec-editor';
import type { SpecItem, SpecDocumentState } from '../../spec-editor';
import type { ConstraintData, DirectiveData } from './interfaces';
import type { ConstraintType, DirectiveType } from './types';

// ---- parse: YAML → legacy data shapes ------------------------------------

/** Map a core `SpecItem` to the legacy flat data shape. */
function itemToData<T extends ConstraintData | DirectiveData>(item: SpecItem): T {
  return {
    id: item.id,
    type: item.type as ConstraintType & DirectiveType,
    params: { ...item.params },
    ...(item.comment !== undefined ? { comment: item.comment } : {}),
  } as T;
}

/**
 * Parse a CnD layout spec YAML string into the legacy structured data shapes.
 *
 * Backed by the new codec (`parseYamlToState`), which preserves comments and
 * unknown nodes. Items keep the section the YAML places them in (the old
 * directive→constraint migration for `hideAtom`/`size` is no longer applied;
 * the spec editor renders those wherever they appear).
 *
 * @param yamlString - the YAML spec to parse
 * @returns the constraints and directives as legacy data objects
 * @public
 */
export function parseLayoutSpecToData(yamlString: string): {
  constraints: ConstraintData[];
  directives: DirectiveData[];
} {
  const state = parseYamlToState(yamlString);
  return {
    constraints: state.constraints.map((i) => itemToData<ConstraintData>(i)),
    directives: state.directives.map((i) => itemToData<DirectiveData>(i)),
  };
}

// ---- serialize: legacy data shapes → YAML --------------------------------

/** Map a legacy data object back to a core `SpecItem`. */
function dataToItem(
  data: ConstraintData | DirectiveData,
  kind: SpecItem['kind'],
): SpecItem {
  const item: SpecItem = {
    id: data.id || newId(),
    kind,
    type: data.type,
    params: { ...(data.params ?? {}) },
  };
  if (data.comment !== undefined) {
    item.comment = data.comment;
  }
  // Unknown types (not in the registry) carry their raw node so the codec
  // re-emits them verbatim under their own key.
  if (!isKnownType(data.type)) {
    item.raw = { [data.type]: { ...(data.params ?? {}) } };
  }
  return item;
}

/**
 * Generate a CnD layout spec YAML string from the legacy structured data
 * shapes. Backed by the new codec's `serializeStateToYaml`, so comments
 * round-trip and grouping types emit under the shared `group:` key.
 *
 * @param constraints - constraint data objects
 * @param directives - directive data objects
 * @returns the YAML spec
 * @public
 */
export function generateLayoutSpecYaml(
  constraints: ConstraintData[],
  directives: DirectiveData[],
): string {
  const state: SpecDocumentState = {
    constraints: (constraints ?? []).map((c) => dataToItem(c, 'constraint')),
    directives: (directives ?? []).map((d) => dataToItem(d, 'directive')),
  };
  return serializeStateToYaml(state);
}

// ---- validation (unchanged behaviour) ------------------------------------

/**
 * Validate YAML syntax. Returns an error message (with line/column when
 * available) if invalid, or `null` if the YAML parses.
 *
 * @param yamlString - YAML to validate
 * @public
 */
export function validateYaml(yamlString: string): string | null {
  if (!yamlString || !yamlString.trim()) {
    return null; // empty is valid
  }
  try {
    jsyaml.load(yamlString);
    return null;
  } catch (error) {
    if (error instanceof jsyaml.YAMLException) {
      const line = error.mark?.line !== undefined ? error.mark.line + 1 : undefined;
      const column =
        error.mark?.column !== undefined ? error.mark.column + 1 : undefined;
      const position = line && column ? ` (line ${line}, column ${column})` : '';
      return `YAML syntax error${position}: ${error.reason || error.message}`;
    }
    return `Invalid YAML: ${(error as Error).message}`;
  }
}

/** Result of Spytial spec validation. */
export interface SpytialValidationResult {
  /** whether the spec is valid */
  isValid: boolean;
  /** error message if the spec has errors (will prevent parsing) */
  error: string | null;
  /** warning messages for unrecognized elements (won't prevent parsing) */
  warnings: string[];
}

/**
 * Recognized constraint/directive keys are derived from the registry
 * (`isKnownYamlKey` / `getKnownYamlKeys`) rather than hand-listed here, so this
 * check can't drift out of sync as the registry grows — the reason a
 * hand-maintained list previously false-warned on `atomStyle`/`edgeStyle`. The
 * check is kind-agnostic (a known key is accepted in either section, matching
 * the engine, which simply ignores a directive placed among constraints).
 */

/** Known top-level keys in a Spytial spec. */
const KNOWN_TOP_LEVEL_KEYS = ['constraints', 'directives'];

/**
 * Validate a Spytial spec YAML string and return detailed results: YAML syntax
 * is checked first, then unrecognized top-level keys and constraint/directive
 * types are flagged as warnings, then the spec is parsed with the authoritative
 * `parseLayoutSpec` to surface structural errors.
 *
 * @param yamlString - YAML to validate
 * @public
 */
export function validateSpytialSpec(yamlString: string): SpytialValidationResult {
  const result: SpytialValidationResult = {
    isValid: true,
    error: null,
    warnings: [],
  };

  if (!yamlString || !yamlString.trim()) {
    return result; // empty is valid
  }

  let parsed: unknown;
  try {
    parsed = jsyaml.load(yamlString);
  } catch (error) {
    if (error instanceof jsyaml.YAMLException) {
      const line = error.mark?.line !== undefined ? error.mark.line + 1 : undefined;
      const column =
        error.mark?.column !== undefined ? error.mark.column + 1 : undefined;
      const position = line && column ? ` (line ${line}, column ${column})` : '';
      result.isValid = false;
      result.error = `YAML syntax error${position}: ${error.reason || error.message}`;
    } else {
      result.isValid = false;
      result.error = `Invalid YAML: ${(error as Error).message}`;
    }
    return result;
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (!KNOWN_TOP_LEVEL_KEYS.includes(key)) {
        result.warnings.push(
          `Unrecognized top-level key: "${key}". Expected: ${KNOWN_TOP_LEVEL_KEYS.join(', ')}`,
        );
      }
    }

    if (Array.isArray(obj.constraints)) {
      obj.constraints.forEach((constraint, i) => {
        if (constraint && typeof constraint === 'object') {
          const constraintType = Object.keys(constraint as object)[0];
          if (constraintType && !isKnownYamlKey(constraintType)) {
            result.warnings.push(
              `Unrecognized constraint type at index ${i}: "${constraintType}". Known types: ${getKnownYamlKeys().join(', ')}`,
            );
          }
        }
      });
    }

    if (Array.isArray(obj.directives)) {
      obj.directives.forEach((directive, i) => {
        if (directive && typeof directive === 'object') {
          const directiveType = Object.keys(directive as object)[0];
          if (directiveType && !isKnownYamlKey(directiveType)) {
            result.warnings.push(
              `Unrecognized directive type at index ${i}: "${directiveType}". Known types: ${getKnownYamlKeys().join(', ')}`,
            );
          }
        }
      });
    }
  }

  try {
    parseLayoutSpec(yamlString);
  } catch (error) {
    result.isValid = false;
    result.error = `Spytial spec error: ${(error as Error).message}`;
    return result;
  }

  return result;
}

// ---- highlightSelector (legacy pure helper, kept verbatim) ----------------

/**
 * Highlights selector syntax with Alloy-esque coloring, returning an HTML
 * string of `<span>`-wrapped tokens. Pure and dependency-free; retained for
 * tooltips/previews and its existing test coverage.
 *
 * Recognizes operators (`->`, `+`, `&`, `-`, `~`, `*`, `^`, `.`), wildcards
 * (`_`, `univ`, `none`, `iden`), parentheses/brackets, capitalized identifiers
 * (sigs/atoms), lowercase identifiers (fields) and numeric literals.
 *
 * @param selector - the selector string to highlight
 * @returns HTML string with span elements for syntax highlighting
 * @public
 */
export function highlightSelector(selector: string): string {
  if (!selector) return '';

  const tokenPattern =
    /(->|[+&~*^.-]|[()[\]]|_\b|univ\b|none\b|iden\b|[A-Z][a-zA-Z0-9_]*|[a-z][a-zA-Z0-9_]*|[0-9]+|\s+|.)/g;

  const tokens = Array.from(selector.matchAll(tokenPattern), (m) => m[0]);

  const highlighted = tokens.map((token) => {
    const escaped = token
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    if (/^\s+$/.test(token)) {
      return escaped;
    }
    if (token === '->' || token === '.') {
      return `<span class="selector-join">${escaped}</span>`;
    }
    if (/^[+&\-~*^]$/.test(token)) {
      return `<span class="selector-operator">${escaped}</span>`;
    }
    if (/^[()[\]]$/.test(token)) {
      return `<span class="selector-paren">${escaped}</span>`;
    }
    if (/^(_|univ|none|iden)$/.test(token)) {
      return `<span class="selector-wildcard">${escaped}</span>`;
    }
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(token)) {
      return `<span class="selector-sig">${escaped}</span>`;
    }
    if (/^[a-z][a-zA-Z0-9_]*$/.test(token)) {
      return `<span class="selector-field">${escaped}</span>`;
    }
    if (/^[0-9]+$/.test(token)) {
      return `<span class="selector-number">${escaped}</span>`;
    }
    return escaped;
  });

  return highlighted.join('');
}
