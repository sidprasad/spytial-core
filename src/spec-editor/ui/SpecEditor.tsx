/**
 * {@link SpecEditor} — the public Spytial spec-editor component.
 *
 * Owns a single {@link SpecDocument} (the source of truth) and projects it into
 * two live views: the {@link BuilderView} (compact schema-driven rows) and the
 * {@link CodeView} (raw YAML). The view toggle is purely visual; no conversion
 * happens on toggle.
 *
 * Sync semantics (see `docs/SPEC_EDITOR_REDESIGN.md`):
 *  - Builder mutations → document mutation → `toYaml()` → `onChange` synchronously.
 *  - Code-view edits → `onChange(text)` immediately (controlled), plus a
 *    debounced `replaceFromYaml`. On a `SpecParseError` the model is untouched,
 *    the parse diagnostic is shown inline, and the builder toggle shows a "text
 *    has unapplied edits" badge until the text parses again.
 *  - External `value` changes (prop differs from both the last emitted text and
 *    the current model YAML) replace the model, guarded by try/catch.
 *
 * Domain awareness: `domain` is `props.domain ?? extractDomainSchema(instance)`,
 * memoized. It flows to the field combo-box options, the built-in completion
 * source, `document.validate(domain)`, and the assistant context.
 *
 * Selector assistance: per (item, field) we compose built-in domain completions
 * with `assistant.complete()`; `assistant.synthesize` powers the ✨ affordance;
 * `assistant.review()` results are merged into the field diagnostics (debounced,
 * stale-dropped, failures swallowed).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import './spec-editor.css';
import { SpecDocument, SpecParseError } from '../core/spec-document';
import type {
  Diagnostic,
  FieldSpec,
  ItemKind,
  SpecItem,
} from '../core/types';
import { getDefinition } from '../core/registry';
import { extractDomainSchema } from '../domain/domain-schema';
import type { DomainSchema } from '../domain/domain-schema';
import {
  createBuiltinCompletionSource,
  mergeCompletions,
} from '../domain/completions';
import type { Completion, SelectorAssistant, SelectorAssistContext } from '../domain/assistant';
import type { IInputDataInstance } from '../../data-instance/interfaces';
import {
  SpecEditorThemeInput,
  resolveSpecEditorTheme,
  themeToCssVars,
} from './theme';
import { BuilderView } from './BuilderView';
import { CodeView } from './CodeView';
import { lintYaml } from '../core/code-positioning';
import type { SelectorFieldExtras } from './FieldRenderer';

export interface SpecEditorProps {
  /** controlled YAML value */
  value: string;
  onChange(value: string): void;
  /** domain awareness: pass either the live instance or a precomputed schema */
  instance?: IInputDataInstance;
  /** wins over instance if both given */
  domain?: DomainSchema;
  /**
   * Hooks. `theme` accepts either a token object or the NAME of a registered
   * theme (`'light'`, `'dark'`, or anything added via
   * `registerSpecEditorThemes`) — the same by-name convention as
   * `webcola-cnd-graph`'s `theme` attribute.
   */
  theme?: SpecEditorThemeInput;
  selectorAssistant?: SelectorAssistant;
  /** appearance */
  density?: 'compact' | 'comfortable';
  /**
   * Syntax highlighting in the code view and selector fields (default true).
   * Both use a mirror-overlay technique (highlighted <pre> behind a
   * transparent-text textarea); this is the escape hatch if a host's fonts or
   * zoom ever misalign the overlay — flipping it off renders plain visible
   * text with no mirror.
   */
  syntaxHighlighting?: boolean;
  defaultView?: 'builder' | 'code';
  /**
   * Optional controlled view. When provided, the editor renders this view and
   * notifies `onViewChange` instead of owning view state internally. (Used by
   * the back-compat `CndLayoutInterface` wrapper to keep `isNoCodeView` working;
   * standalone consumers can ignore it and use `defaultView`.)
   */
  view?: 'builder' | 'code';
  onViewChange?(view: 'builder' | 'code'): void;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** notified whenever validation state changes */
  onDiagnostics?(diagnostics: Diagnostic[]): void;
}

const PARSE_DEBOUNCE_MS = 300;
const REVIEW_DEBOUNCE_MS = 400;

export const SpecEditor: React.FC<SpecEditorProps> = ({
  value,
  onChange,
  instance,
  domain: domainProp,
  theme,
  selectorAssistant,
  density = 'compact',
  syntaxHighlighting = true,
  defaultView = 'builder',
  view: controlledView,
  onViewChange,
  className,
  disabled = false,
  'aria-label': ariaLabel = 'Layout specification editor',
  onDiagnostics,
}) => {
  // ── Document (source of truth) ────────────────────────────────────────
  // Created once from the initial value; never recreated on re-render. If the
  // INITIAL value is unparseable we keep an empty document but carry the parse
  // diagnostic forward (PR review finding: silently rendering an empty builder
  // for a broken initial spec left the user with no explanation), seeding the
  // parseError state below so the diagnostic + "unapplied edits" badge show
  // from the first render.
  const initRef = useRef<{ doc: SpecDocument; error: Diagnostic | null } | null>(
    null,
  );
  if (initRef.current === null) {
    initRef.current = initDocFromYaml(value);
  }
  const doc = initRef.current.doc;

  // Bump to force re-render on any document change (builder/undo/redo/parse).
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Last YAML text we emitted via onChange, so external-change detection can
  // distinguish a prop echo from a genuine external edit.
  const lastEmitted = useRef<string>(value);

  // Generation token bumped by every model mutation (builder emit, external
  // replace). A debounced code-view parse captures the current value when
  // scheduled and aborts if a mutation has bumped it since — otherwise a stale
  // parse could clobber a newer builder edit (see Finding 2 in the redesign).
  const mutationSeq = useRef(0);

  const [internalView, setInternalView] = useState<'builder' | 'code'>(
    defaultView,
  );
  const view = controlledView ?? internalView;
  // Holds the debounced code-view parse timer and its payload; declared here
  // so a view toggle can flush a pending parse (defined fully where code-view
  // editing lives).
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingParse = useRef<{ text: string; seq: number } | null>(null);
  const flushParseRef = useRef<() => void>(() => {});
  const setView = useCallback(
    (next: 'builder' | 'code') => {
      // Apply (not discard) any pending debounced parse before switching views,
      // so a code edit made just before toggling is reflected in the builder.
      // The generation-token guard inside the flush still drops parses that a
      // newer builder/external mutation has superseded.
      flushParseRef.current();
      if (controlledView === undefined) {
        setInternalView(next);
      }
      onViewChange?.(next);
    },
    [controlledView, onViewChange],
  );
  // The parse diagnostic + "unapplied edits" state for the code view. Seeded
  // with the initial value's parse error, if any (see initRef above).
  const [parseError, setParseError] = useState<Diagnostic | null>(
    () => initRef.current?.error ?? null,
  );

  // ── Domain ─────────────────────────────────────────────────────────────
  const domain = useMemo<DomainSchema | undefined>(() => {
    if (domainProp) return domainProp;
    if (instance) return extractDomainSchema(instance);
    return undefined;
  }, [domainProp, instance]);

  const builtinComplete = useMemo(
    () => createBuiltinCompletionSource(domain),
    [domain],
  );

  const relationNames = useMemo(
    () => domain?.relations.map((r) => r.name) ?? [],
    [domain],
  );
  const typeNames = useMemo(
    () => domain?.types.map((t) => t.name) ?? [],
    [domain],
  );

  // ── Emit helper: regenerate YAML from the model and notify the host ──────
  const emit = useCallback(() => {
    const yaml = doc.toYaml();
    lastEmitted.current = yaml;
    // Invalidate any in-flight debounced code-view parse: this builder mutation
    // is now the latest edit, so a pending stale parse must not overwrite it.
    mutationSeq.current += 1;
    // A successful builder edit means the model and text now agree.
    setParseError(null);
    onChange(yaml);
  }, [doc, onChange]);

  // ── Assistant-review diagnostics (debounced, per item+field) ────────────
  const [reviewDiagnostics, setReviewDiagnostics] = useState<
    readonly Diagnostic[]
  >([]);
  const reviewSeq = useRef(0);
  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Combined diagnostics (structure + domain + assistant review) ─────────
  const structuralDomain = useMemo(
    () => doc.validate(domain),
    // Re-validate on every model change. `value` is included as a coarse model
    // change signal (each emit/parse threads through the controlled value), so
    // structural diagnostics refresh after builder edits and external changes.
    [doc, domain, value],
  );

  const allDiagnostics = useMemo(
    () => [...structuralDomain, ...reviewDiagnostics],
    [structuralDomain, reviewDiagnostics],
  );

  // Notify the host when validation state changes (string-keyed dedupe).
  const lastDiagKey = useRef<string>('');
  useEffect(() => {
    if (!onDiagnostics) return;
    const key = diagnosticsKey(allDiagnostics);
    if (key === lastDiagKey.current) return;
    lastDiagKey.current = key;
    onDiagnostics(allDiagnostics);
  }, [allDiagnostics, onDiagnostics]);

  // ── External value-change handling ───────────────────────────────────────
  // When the controlled prop diverges from both the last text we emitted and
  // the current model YAML, treat it as an external edit and replace the model.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    let modelYaml: string;
    try {
      modelYaml = doc.toYaml();
    } catch {
      modelYaml = '';
    }
    if (value === modelYaml) {
      lastEmitted.current = value;
      return;
    }
    try {
      doc.replaceFromYaml(value);
      lastEmitted.current = value;
      // An external replace is also a model mutation — invalidate any pending
      // debounced code-view parse so it can't overwrite this newer state.
      mutationSeq.current += 1;
      setParseError(null);
      forceRender();
    } catch (err) {
      // Keep the model; surface the parse error in the code view.
      setParseError(toParseDiagnostic(err));
    }
    // `doc` is a stable ref; we intentionally key only on the controlled value.
  }, [value, doc]);

  // ── Subscribe to document changes (covers undo/redo + internal mutations) ─
  useEffect(() => {
    const unsub = doc.subscribe(() => forceRender());
    return unsub;
  }, [doc]);

  // ── Code-view editing (debounced parse) ─────────────────────────────────
  // Applies the pending code-view text to the model. Called by the debounce
  // timer and synchronously by `setView` so a toggle right after typing never
  // discards the edit. The generation check still aborts parses that a newer
  // builder/undo/external mutation has superseded (Finding 2).
  const flushParse = useCallback(() => {
    if (parseTimer.current) {
      clearTimeout(parseTimer.current);
      parseTimer.current = null;
    }
    const pending = pendingParse.current;
    pendingParse.current = null;
    if (!pending) return;
    if (mutationSeq.current !== pending.seq) return; // superseded
    try {
      doc.replaceFromYaml(pending.text);
      setParseError(null);
      forceRender();
    } catch (err) {
      // Model untouched; show the diagnostic + "unapplied edits" badge.
      setParseError(toParseDiagnostic(err));
    }
  }, [doc]);
  flushParseRef.current = flushParse;

  const handleCodeChange = useCallback(
    (text: string) => {
      if (disabled) return;
      lastEmitted.current = text;
      onChange(text); // controlled text updates immediately
      if (parseTimer.current) clearTimeout(parseTimer.current);
      // Capture the mutation generation at schedule time (checked in flush).
      pendingParse.current = { text, seq: mutationSeq.current };
      parseTimer.current = setTimeout(flushParse, PARSE_DEBOUNCE_MS);
    },
    [disabled, onChange, flushParse],
  );

  useEffect(
    () => () => {
      if (parseTimer.current) clearTimeout(parseTimer.current);
      if (reviewTimer.current) clearTimeout(reviewTimer.current);
    },
    [],
  );

  // ── Builder mutations ───────────────────────────────────────────────────
  const handleAddItem = useCallback(
    (kind: ItemKind, type: string) => {
      if (disabled) return undefined;
      const item = doc.addItem(kind, type);
      emit();
      // Returned so the builder can auto-expand the freshly added row.
      return item;
    },
    [disabled, doc, emit],
  );

  const handleUpdateParam = useCallback(
    (id: string, key: string, val: unknown) => {
      if (disabled) return;
      // Empty string clears a param so it round-trips out of the YAML.
      const patchValue = val === '' ? undefined : val;
      doc.updateItem(id, { params: { [key]: patchValue } });
      emit();
    },
    [disabled, doc, emit],
  );

  const handleUpdateComment = useCallback(
    (id: string, comment: string) => {
      if (disabled) return;
      doc.updateItem(id, { comment });
      emit();
    },
    [disabled, doc, emit],
  );

  const handleToggleNegate = useCallback(
    (id: string, negated: boolean) => {
      if (disabled) return;
      doc.updateItem(id, { params: { hold: negated ? 'never' : undefined } });
      emit();
    },
    [disabled, doc, emit],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      if (disabled) return;
      // Single document-level mutation = single undo step (the previous
      // addItem + updateItem + moveItem composition recorded three).
      const created = doc.duplicateItem(id);
      if (!created) return;
      emit();
    },
    [disabled, doc, emit],
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (disabled) return;
      doc.removeItem(id);
      emit();
    },
    [disabled, doc, emit],
  );

  const handleMove = useCallback(
    (id: string, direction: -1 | 1) => {
      if (disabled) return;
      const state = doc.getState();
      const list = state.constraints.some((i) => i.id === id)
        ? state.constraints
        : state.directives;
      const index = list.findIndex((i) => i.id === id);
      if (index === -1) return;
      doc.moveItem(id, index + direction);
      emit();
    },
    [disabled, doc, emit],
  );

  // ── Undo / redo ──────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (disabled || !doc.canUndo()) return;
    doc.undo();
    emit();
  }, [disabled, doc, emit]);

  const handleRedo = useCallback(() => {
    if (disabled || !doc.canRedo()) return;
    doc.redo();
    emit();
  }, [disabled, doc, emit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    },
    [handleUndo, handleRedo],
  );

  // ── Selector wiring (per item + field) ──────────────────────────────────
  const selectorProps = useCallback(
    (item: SpecItem, field: FieldSpec): SelectorFieldExtras | undefined => {
      if (field.kind !== 'selector') return undefined;

      const ctxBase: Omit<SelectorAssistContext, 'currentValue'> = {
        itemKind: item.kind,
        itemType: item.type,
        fieldKey: field.key,
        domain,
        specYaml: lastEmitted.current,
      };

      const complete = (prefix: string): Completion[] | Promise<Completion[]> => {
        const builtinResults = builtinComplete(prefix);
        const assistantComplete = selectorAssistant?.complete;
        if (!assistantComplete) {
          return builtinResults;
        }
        const ctx: SelectorAssistContext = {
          ...ctxBase,
          currentValue: String(item.params[field.key] ?? ''),
        };
        let assistantOut: Completion[] | Promise<Completion[]>;
        try {
          assistantOut = assistantComplete(ctx, prefix) ?? [];
        } catch {
          return builtinResults;
        }
        return Promise.resolve(assistantOut)
          .then((res) => mergeCompletions(res ?? [], builtinResults))
          .catch(() => builtinResults);
      };

      const extras: SelectorFieldExtras = {
        complete,
        highlight: syntaxHighlighting,
      };

      if (selectorAssistant?.synthesize) {
        const synthFn = selectorAssistant.synthesize;
        extras.synthesize = (request: string) => {
          const ctx: SelectorAssistContext = {
            ...ctxBase,
            currentValue: String(item.params[field.key] ?? ''),
          };
          return synthFn(ctx, request);
        };
      }

      return extras;
    },
    [domain, builtinComplete, selectorAssistant, syntaxHighlighting],
  );

  // ── Assistant review (debounced over the whole model) ───────────────────
  useEffect(() => {
    const review = selectorAssistant?.review;
    if (!review) {
      setReviewDiagnostics([]);
      return;
    }
    if (reviewTimer.current) clearTimeout(reviewTimer.current);
    const seq = ++reviewSeq.current;
    reviewTimer.current = setTimeout(() => {
      const state = doc.getState();
      const items = [...state.constraints, ...state.directives];
      const tasks: Array<Promise<Diagnostic[]>> = [];
      for (const item of items) {
        const def = getDefinition(item.type);
        if (!def) continue;
        for (const field of def.fields) {
          if (field.kind !== 'selector') continue;
          const current = String(item.params[field.key] ?? '');
          if (current.trim() === '') continue;
          const ctx: SelectorAssistContext = {
            itemKind: item.kind,
            itemType: item.type,
            fieldKey: field.key,
            currentValue: current,
            domain,
            specYaml: lastEmitted.current,
          };
          tasks.push(
            Promise.resolve()
              .then(() => review(ctx, current))
              .then((ds) =>
                (ds ?? []).map((d) => ({
                  ...d,
                  itemId: item.id,
                  fieldKey: field.key,
                  source: 'assistant' as const,
                })),
              )
              .catch(() => [] as Diagnostic[]),
          );
        }
      }
      Promise.all(tasks)
        .then((groups) => {
          if (seq !== reviewSeq.current) return; // stale
          setReviewDiagnostics(groups.flat());
        })
        .catch(() => {
          if (seq !== reviewSeq.current) return;
          setReviewDiagnostics([]);
        });
    }, REVIEW_DEBOUNCE_MS);
    // Re-review when the assistant/domain change or the model changes (`value`
    // is the coarse model-change signal). `doc` is a stable ref.
  }, [selectorAssistant, domain, value, doc]);

  // ── Render ───────────────────────────────────────────────────────────────
  const state = doc.getState();
  const hasUnappliedEdits = parseError !== null;
  const rootClass = [
    'spytial-ed',
    density === 'compact' ? 'spytial-ed--compact' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // Lint the code-view text itself — parse + validate + position all from the
  // same `value`, so diagnostics' item ids match the state used to place them.
  // (Deliberately independent of the debounced model, whose ids drift on each
  // re-parse and whose text may lag during unapplied edits.)
  const codeDiagnostics = useMemo(() => lintYaml(value, domain), [value, domain]);

  const resolvedTheme = resolveSpecEditorTheme(theme);

  return (
    <section
      className={rootClass}
      style={resolvedTheme ? themeToCssVars(resolvedTheme) : undefined}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <div className="spytial-ed-toolbar">
        <div
          className="spytial-ed-viewtoggle"
          role="tablist"
          aria-label="Editor view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'builder'}
            className={`spytial-ed-viewtoggle-btn${
              view === 'builder' ? ' spytial-ed-viewtoggle-btn--active' : ''
            }`}
            disabled={disabled}
            onClick={() => setView('builder')}
          >
            Builder
            {hasUnappliedEdits ? (
              <span
                className="spytial-ed-diagnostic-badge spytial-ed-diagnostic-badge--warning"
                title="Text has unapplied edits"
                aria-label="Text has unapplied edits"
              >
                !
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'code'}
            className={`spytial-ed-viewtoggle-btn${
              view === 'code' ? ' spytial-ed-viewtoggle-btn--active' : ''
            }`}
            disabled={disabled}
            onClick={() => setView('code')}
          >
            Code
          </button>
        </div>

        <div className="spytial-ed-history">
          <button
            type="button"
            className="spytial-ed-history-btn"
            aria-label="Undo"
            title="Undo (Cmd/Ctrl+Z)"
            disabled={disabled || !doc.canUndo()}
            onClick={handleUndo}
          >
            <span aria-hidden="true">↶</span>
          </button>
          <button
            type="button"
            className="spytial-ed-history-btn"
            aria-label="Redo"
            title="Redo (Shift+Cmd/Ctrl+Z)"
            disabled={disabled || !doc.canRedo()}
            onClick={handleRedo}
          >
            <span aria-hidden="true">↷</span>
          </button>
        </div>
      </div>

      <div className="spytial-ed-body">
        {view === 'builder' ? (
          <BuilderView
            constraints={state.constraints}
            directives={state.directives}
            diagnostics={allDiagnostics}
            options={{ relationNames, typeNames }}
            selectorProps={selectorProps}
            onAddItem={handleAddItem}
            onUpdateParam={handleUpdateParam}
            onUpdateComment={handleUpdateComment}
            onToggleNegate={handleToggleNegate}
            onDuplicate={handleDuplicate}
            onRemove={handleRemove}
            onMove={handleMove}
            disabled={disabled}
          />
        ) : (
          <CodeView
            value={value}
            onChange={handleCodeChange}
            diagnostics={codeDiagnostics}
            hasUnappliedEdits={hasUnappliedEdits}
            syntaxHighlighting={syntaxHighlighting}
            disabled={disabled}
          />
        )}
      </div>
    </section>
  );
};

// ---- helpers --------------------------------------------------------------

/**
 * Build a document from YAML. On parse error, falls back to an empty document
 * but RETURNS the diagnostic so the editor can surface it from first render
 * instead of silently showing an empty builder.
 */
function initDocFromYaml(yaml: string): {
  doc: SpecDocument;
  error: Diagnostic | null;
} {
  try {
    return { doc: SpecDocument.fromYaml(yaml), error: null };
  } catch (err) {
    return { doc: new SpecDocument(), error: toParseDiagnostic(err) };
  }
}

/** Turn an unknown thrown value into a YAML parse diagnostic. */
function toParseDiagnostic(err: unknown): Diagnostic {
  if (err instanceof SpecParseError) {
    return {
      severity: 'error',
      message: err.message,
      source: 'yaml',
      ...(err.line !== undefined ? { line: err.line } : {}),
      ...(err.column !== undefined ? { column: err.column } : {}),
    };
  }
  return {
    severity: 'error',
    message: err instanceof Error ? err.message : String(err),
    source: 'yaml',
  };
}

/** Stable key for a diagnostics array, for change detection. */
function diagnosticsKey(ds: readonly Diagnostic[]): string {
  return ds
    .map(
      (d) =>
        `${d.severity}|${d.source}|${d.itemId ?? ''}|${d.fieldKey ?? ''}|${
          d.line ?? ''
        }|${d.column ?? ''}|${d.message}`,
    )
    .join('\n');
}
