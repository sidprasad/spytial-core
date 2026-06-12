/**
 * Selector-writing assistance hook (HOOK 2 in `docs/SPEC_EDITOR_REDESIGN.md`).
 *
 * Integrators provide a `SelectorAssistant` to augment the editor with
 * completions, natural-language selector synthesis (the ✨ affordance), and
 * async review of written selectors — e.g. backed by a model or a synthesis
 * engine. All members are optional; the UI gates affordances on presence.
 *
 * Framework-agnostic — no React. The shape here is the binding contract from
 * `docs/SPEC_EDITOR_REDESIGN.md`.
 */

import type { ItemKind, Diagnostic } from '../core/types';
import type { DomainSchema } from './domain-schema';

export interface SelectorAssistContext {
  itemKind: ItemKind;
  itemType: string;
  fieldKey: string;
  currentValue: string;
  domain?: DomainSchema;
  /** full current spec YAML, for context */
  specYaml: string;
}

export interface Completion {
  label: string;
  /** text inserted on accept; defaults to `label` */
  insertText?: string;
  kind: 'type' | 'relation' | 'atom' | 'keyword' | 'snippet';
  /** right-aligned hint, e.g. 'relation · arity 2' */
  detail?: string;
}

export interface SelectorAssistant {
  /** extra completions, merged with built-in domain completions */
  complete?(
    ctx: SelectorAssistContext,
    prefix: string
  ): Completion[] | Promise<Completion[]>;
  /** natural-language request -> selector. Powers the ✨ affordance. */
  synthesize?(
    ctx: SelectorAssistContext,
    request: string
  ): Promise<{ value: string; explanation?: string }>;
  /** async review of a written selector (e.g. model-based lint) */
  review?(ctx: SelectorAssistContext, value: string): Promise<Diagnostic[]>;
}
