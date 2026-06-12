/**
 * Structural validation for the Spytial spec editor.
 *
 * `Diagnostic` itself is declared in `types.ts` (it is part of the pinned
 * contract). This module provides the structural validators that run over a
 * `SpecDocumentState`:
 *  - missing required fields → error
 *  - unknown enum values → error
 *  - per-definition `validate()` results
 *  - unknown item types → warning (preserved verbatim via `SpecItem.raw`)
 *
 * Domain validation (e.g. "type Foo is not in this instance") is layered on by
 * WP2's `validateAgainstDomain`; when a `DomainSchema` is supplied here, those
 * warnings are appended to the structural diagnostics. With no domain, only
 * structural diagnostics are produced (identical to before WP2).
 *
 * This module is framework-agnostic — no React.
 */

import { getDefinition } from './registry';
import type { Diagnostic, SpecDocumentState, SpecItem } from './types';
import type { DomainSchema } from '../domain/domain-schema';
import { validateAgainstDomain } from '../domain/domain-validation';

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/** Validate a single item structurally against its registry definition. */
export function validateItem(item: SpecItem): Diagnostic[] {
  const out: Diagnostic[] = [];

  // Unknown type (preserved as raw): a non-blocking warning.
  if (item.raw !== undefined && getDefinition(item.type) === undefined) {
    out.push({
      severity: 'warning',
      message: `Unknown ${item.kind} type "${item.type}". It is preserved as-is but the builder cannot edit it.`,
      itemId: item.id,
      source: 'structure',
    });
    return out;
  }

  const def = getDefinition(item.type);
  if (!def) {
    out.push({
      severity: 'warning',
      message: `Unknown ${item.kind} type "${item.type}".`,
      itemId: item.id,
      source: 'structure',
    });
    return out;
  }

  for (const field of def.fields) {
    const value = item.params[field.key];

    if (field.required && isEmpty(value)) {
      out.push({
        severity: 'error',
        message: `Missing required field "${field.label}".`,
        itemId: item.id,
        fieldKey: field.key,
        source: 'structure',
      });
      continue;
    }

    if (field.kind === 'enum' && field.options && !isEmpty(value)) {
      const allowed = new Set(field.options);
      const values = field.multiple
        ? Array.isArray(value)
          ? value.map((v) => String(v))
          : [String(value)]
        : [String(value)];
      for (const v of values) {
        if (!allowed.has(v)) {
          out.push({
            severity: 'error',
            message: `Invalid value "${v}" for "${field.label}". Allowed: ${field.options.join(', ')}.`,
            itemId: item.id,
            fieldKey: field.key,
            source: 'structure',
          });
        }
      }
    }
  }

  if (def.validate) {
    for (const d of def.validate(item.params)) {
      // Attach the item id if the definition didn't already (definitions only
      // know about field keys, not item ids).
      out.push(d.itemId ? d : { ...d, itemId: item.id });
    }
  }

  return out;
}

/**
 * Run structural validation across a whole document. When a `domain` is
 * supplied, WP2's domain warnings are appended after the structural
 * diagnostics.
 */
export function validateState(
  state: SpecDocumentState,
  domain?: DomainSchema,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const item of state.constraints) {
    out.push(...validateItem(item));
  }
  for (const item of state.directives) {
    out.push(...validateItem(item));
  }
  if (domain) {
    out.push(...validateAgainstDomain(state, domain));
  }
  return out;
}
