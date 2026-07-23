/**
 * Whole-spec suggestion hook (HOOK 3).
 *
 * Where {@link SelectorAssistant} assists one selector field, a
 * `LayoutAssistant` proposes an entire layout. Integrators provide the policy
 * — a heuristic analyzer, a model, a synthesis engine — and the editor owns the
 * affordance: a toolbar button, the apply-through-document semantics (so the
 * suggestion is one undo step and refreshes the builder in place), and a
 * read-only panel explaining what the suggester did.
 *
 * The contract is deliberately domain-agnostic. The context is
 * `{domain, instance, currentYaml}` and nothing else; the optional
 * per-suggestion metadata (`rationale`, `confidence`, `outcome`) is rendered
 * generically, and a suggester with no such vocabulary simply omits it. Any
 * host can plug in any suggester.
 *
 * Framework-agnostic — no React.
 */

import type { IInputDataInstance } from '../../data-instance/interfaces';
import type { DomainSchema } from './domain-schema';

export interface LayoutAssistContext {
  /** Domain awareness, as resolved by the editor (`domain` prop ?? extracted from `instance`). */
  domain?: DomainSchema;
  /** The live data instance, when the host passed one. */
  instance?: IInputDataInstance;
  /** The full current spec text, so a suggester can extend rather than replace. */
  currentYaml: string;
}

/** How much the suggester trusts an individual suggestion. */
export type LayoutSuggestionConfidence = 'high' | 'medium' | 'low';

/**
 * What became of a suggestion in the returned YAML. Suggesters that validate
 * their own output use this to admit a fallback (`weakened`) or a drop
 * (`omitted`) instead of silently shipping a shorter spec.
 */
export type LayoutSuggestionOutcome = 'applied' | 'weakened' | 'omitted';

/** One line of the suggestions panel. All fields beyond `id` are optional. */
export interface LayoutSuggestionDetail {
  /** Stable identifier, unique within a result. Used as the React key. */
  id: string;
  /** Why the suggester proposed this. Rendered as the body of the row. */
  rationale?: string;
  confidence?: LayoutSuggestionConfidence;
  outcome?: LayoutSuggestionOutcome;
}

export interface LayoutSuggestionResult {
  /** The proposed spec. Replaces the document wholesale, as one undo step. */
  yaml: string;
  /** Per-suggestion detail for the panel. Omit for an opaque suggestion. */
  suggestions?: readonly LayoutSuggestionDetail[];
  /** Result-level remarks (e.g. "2 suggestions used a weaker fallback"). */
  notes?: readonly string[];
}

export interface LayoutAssistant {
  /**
   * Propose a whole spec for the current data. Powers the toolbar's Suggest
   * affordance; the button is hidden entirely when this member is absent.
   *
   * Rejecting is a normal outcome — the editor surfaces the error message and
   * leaves the document untouched.
   */
  suggest?(ctx: LayoutAssistContext): Promise<LayoutSuggestionResult>;
}
