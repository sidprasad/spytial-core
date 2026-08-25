import type { ErrorMessages } from './constraint-types';

/**
 * Error state shared between the layout engine and the (separately bundled)
 * error-modal UI. Lives in layout/ — not components/ — so that core modules
 * (e.g. layoutinstance.ts) can use these shapes without pulling any React
 * component code into the core bundle. The historical import path
 * `components/ErrorMessageModal/ErrorStateManager` re-exports everything here.
 */

/**
 * Represents a single selector evaluation error.
 * Captures context about which selector failed and why.
 */
export interface SelectorErrorDetail {
  /** The selector expression that failed */
  selector: string;
  /** Context about where/why the selector was being evaluated (e.g., "hideAtom selector", "attribute filter") */
  context: string;
  /** The error message from the evaluation */
  errorMessage: string;
}

/**
 * An advisory note about one constraint or directive, raised while generating a
 * layout. Unlike {@link SelectorErrorDetail} — which records a selector that
 * *failed* — a warning means the selector evaluated fine but produced something
 * the spec author probably did not intend.
 *
 * The motivating case is an unresolved name. simple-graph-query 3.0 evaluates a
 * name matching nothing to the empty relation rather than throwing, because an
 * instance carries only *populated* types and relations: a legitimately-empty
 * sig looks byte-for-byte like a typo, and a sig can empty out mid-trace. Since
 * an empty set satisfies predicates vacuously (`no Playr` is `true`), the
 * warning is the only thing distinguishing a typo from a real empty result —
 * which is why these must reach the user rather than being dropped.
 *
 * The other source is the spec parse itself: `parseLayoutSpec` raises a
 * `'deprecated'` {@link ParseWarning} for a legacy form (`atomColor`,
 * `edgeColor`, group-by-field, `inferredEdge`'s inline line styling), and
 * `LayoutInstance` forwards those onto the layout as warnings too. Same reason:
 * the spec works, quietly, on a form that is going away — and the console is
 * not somewhere a diagram's author looks.
 *
 * Carried on {@link CounterfactualLayoutResult} and on `InstanceLayout` beside
 * `selectorErrors`, never merged into it: `selectorErrors` stays errors-only so
 * existing consumers keep their meaning.
 */
export interface LayoutWarning {
  severity: 'warning' | 'error';
  /** Machine-readable category, so consumers can filter without matching prose. */
  code: 'unresolved-name' | 'selector-arity' | 'evaluation-failed' | 'deprecated' | (string & {});
  /** Human-readable explanation, including what the consequence was. */
  message: string;
  /**
   * The selector expression this warning is about. Absent when the warning is
   * not about a selector at all — a `'deprecated'` warning is raised while
   * *parsing* the spec, before any selector is evaluated.
   */
  selector?: string;
  /** Where the warning came from, e.g. `'orientation selector'`, `'spec'`. */
  context: string;
  /**
   * Registry type key of the owning spec item — `'orientation'`, `'atomStyle'`.
   * Together with {@link specIndex} this names the item the warning came from.
   */
  specType?: string;
  /**
   * Position within the owning parsed section array.
   *
   * This is an index into the *parsed* spec, not a YAML line: `parseLayoutSpec`
   * uses js-yaml (which discards positions), dedupes entries, and merges `size`
   * and `hideAtom` across both sections. So it is deterministic and stable, but
   * not guaranteed to equal the YAML ordinal. Enough to name an item in a
   * warning; not enough to anchor an editor marker.
   */
  specIndex?: number;
  /** Display label — a constraint's `toHTML()`, else `type[index] · selector`. */
  label?: string;
  /** The unresolved name, when the kind carries one. Doubles as the dedup key. */
  name?: string;
  /** simple-graph-query's "did you mean" suggestion, when it offers one. */
  suggestion?: string;
}

/**
 * Represents different types of errors that can occur in the system
 */
/**
 * What the diagram element reports when a render goes wrong, carried on its
 * `layout-error` event.
 *
 * Same reasoning as {@link LayoutWarning}: the console is not somewhere a
 * diagram's author looks, and the element's own error box lives inside a shadow
 * root — inside whatever panel or iframe the host embedded it in. Neither
 * reaches a host that could do something about it. This is the channel that
 * does.
 */
export interface LayoutErrorDetail {
  /** Human-readable explanation, the same text the element puts on screen. */
  message: string;
  /** Which part of the render failed. */
  phase: 'render' | 'routing' | 'solver';
  /**
   * False when the diagram is on screen but degraded — a solver that could not
   * run leaves nodes drawn at unsolved positions, which looks like a layout
   * rather than like a failure. True when nothing usable was drawn.
   */
  fatal: boolean;
  /** The underlying error, when there was one. */
  cause?: unknown;
}

export type SystemError = {
  type: 'parse-error';
  message: string;
  source?: string;
} | {
  type: 'positional-error';
  messages: ErrorMessages;
} | {
  type: 'hidden-node-conflict';
  messages: ErrorMessages;
} | {
  type: 'group-overlap-error';  // New type
  message: string;
  source?: string;
} | {
  type: 'general-error';
  message: string;
} | {
  type: 'selector-error';
  /** List of selector errors encountered during layout evaluation */
  errors: SelectorErrorDetail[];
};

/**
 * Minimal error state manager for handling different error types
 * Follows functional programming principles with immutable state
 */
export class ErrorStateManager {
  private currentError: SystemError | null = null;
  private errorCallbacks: ((error: SystemError | null) => void)[] = [];

  /**
   * Set the current error state
   * @param error - The error to set, or null to clear
   */
  public setError(error: SystemError | null): void {
    this.currentError = error;
    this.notifyCallbacks();
  }

  /**
   * Clear the current error state
   */
  public clearError(): void {
    this.currentError = null;
    this.notifyCallbacks();
  }

  /**
   * Get the current error state
   * @returns Current error or null if no error
   */
  public getCurrentError(): SystemError | null {
    return this.currentError;
  }

  /**
   * Subscribe to error state changes
   * @param callback - Function to call when error state changes
   */
  public onErrorChange(callback: (error: SystemError | null) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Check if there's currently an error
   * @returns True if there's an active error
   */
  public hasError(): boolean {
    return this.currentError !== null;
  }

  /**
   * Notify all subscribed callbacks of error state change
   */
  private notifyCallbacks(): void {
    this.errorCallbacks.forEach(callback => callback(this.currentError));
  }
}
