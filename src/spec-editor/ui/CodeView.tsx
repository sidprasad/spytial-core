/**
 * {@link CodeView} — the raw-YAML editing surface of the spec editor.
 *
 * A CodeMirror 6 editor (not a textarea): CodeMirror owns the text rendering, so
 * syntax highlighting is real (no transparent-text mirror to keep in sync) and
 * diagnostics are drawn as IDE-style squiggly underlines you can hover to read.
 * The value is controlled by {@link SpecEditor}: typing fires `onChange(text)`
 * immediately, and the parent attempts a debounced parse. A parse error never
 * clobbers the model — the parent keeps the last good state and passes the
 * diagnostics down here as {@link PositionedDiagnostic}s (already resolved to
 * character ranges by `positionDiagnostics`), which we hand to `@codemirror/lint`.
 *
 * Highlighting uses `@codemirror/lang-yaml` themed through the same
 * `--spytial-ed-syn-*` CSS variables the rest of the editor uses, so it tracks
 * light/dark automatically. A persistent diagnostics list is kept below the
 * editor for accessibility and for any diagnostic that couldn't be positioned.
 */

import React, { useEffect, useId, useMemo, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { tags as t } from '@lezer/highlight';
import type { Diagnostic } from '../core/types';
import type { PositionedDiagnostic } from '../core/code-positioning';

export interface CodeViewProps {
  /** controlled YAML text */
  value: string;
  /** fired with the next text on every edit */
  onChange(value: string): void;
  /**
   * Diagnostics for the current text, pre-resolved to character ranges. Those
   * with a range become editor squiggles; all appear in the list below.
   */
  diagnostics?: readonly PositionedDiagnostic[];
  /**
   * True when the text differs from the applied model (a parse error is keeping
   * the model on its last good state). Drives the "unapplied edits" notice.
   */
  hasUnappliedEdits?: boolean;
  /** render a line-number gutter (default true). */
  showLineNumbers?: boolean;
  /** syntax-highlight the YAML (default true). */
  syntaxHighlighting?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

/** Stable severity ranking for sorting the diagnostics list (errors first). */
const SEVERITY_ORDER: Record<Diagnostic['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * YAML token colors, mapped onto the editor's `--spytial-ed-syn-*` variables so
 * the highlight tracks the active (light/dark) theme. Keys carry the "keyword"
 * color, matching the old hand-rolled tokenizer's palette.
 */
const yamlHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--spytial-ed-syn-comment, #8a8170)', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: 'var(--spytial-ed-syn-string, #7a5901)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--spytial-ed-syn-number, #7a5901)' },
  {
    tag: [t.propertyName, t.definition(t.propertyName), t.keyword, t.atom],
    color: 'var(--spytial-ed-syn-keyword, #6d28a8)',
  },
  { tag: [t.punctuation, t.separator], color: 'var(--spytial-ed-text-muted, #6e6553)' },
]);

/** Editor chrome themed through the shared spec-editor CSS variables. */
const editorTheme = EditorView.theme({
  '&': {
    fontSize: '0.85em',
    color: 'var(--spytial-ed-text, #221d14)',
    backgroundColor: 'var(--spytial-ed-surface, #faf8f2)',
    border: '1px solid var(--spytial-ed-border, #d9d2c0)',
    borderRadius: 'var(--spytial-ed-radius, 2px)',
    minHeight: '12rem',
  },
  '&.cm-focused': { outline: '2px solid var(--spytial-ed-accent, #b5431a)', outlineOffset: '-1px' },
  '.cm-scroller': {
    fontFamily: 'var(--spytial-ed-mono-font-family, ui-monospace, monospace)',
    lineHeight: '1.5',
    overflow: 'auto',
  },
  '.cm-content': { padding: '0.5em 0', caretColor: 'var(--spytial-ed-accent, #b5431a)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--spytial-ed-accent, #b5431a)' },
  '.cm-gutters': {
    backgroundColor: 'var(--spytial-ed-surface-raised, #f1ecdf)',
    color: 'var(--spytial-ed-text-muted, #6e6553)',
    border: 'none',
    borderInlineEnd: '1px solid var(--spytial-ed-border, #d9d2c0)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.5em 0 0.6em' },
  '&.cm-editor .cm-selectionBackground, & .cm-selectionBackground, & .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--spytial-ed-accent, #b5431a) 22%, transparent)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--spytial-ed-border, #d9d2c0)',
    backgroundColor: 'var(--spytial-ed-surface-raised, #f1ecdf)',
    color: 'var(--spytial-ed-text, #221d14)',
    borderRadius: 'var(--spytial-ed-radius, 2px)',
    fontSize: '0.85em',
  },
});

/** Map our severity onto CodeMirror's (identical vocabulary for these three). */
function cmSeverity(s: Diagnostic['severity']): CmDiagnostic['severity'] {
  return s; // 'error' | 'warning' | 'info' all exist in CodeMirror's union
}

/** Positioned diagnostics → CodeMirror lint diagnostics (only the ranged ones). */
function toCmDiagnostics(
  diagnostics: readonly PositionedDiagnostic[] | undefined,
  docLength: number,
): CmDiagnostic[] {
  if (!diagnostics) return [];
  const out: CmDiagnostic[] = [];
  for (const d of diagnostics) {
    if (d.from === undefined || d.to === undefined) continue;
    const from = Math.max(0, Math.min(d.from, docLength));
    const to = Math.max(from, Math.min(d.to, docLength));
    out.push({
      from,
      to,
      severity: cmSeverity(d.severity),
      message: d.message,
      // `code` (e.g. 'deprecated') surfaces as the source label in the tooltip.
      source: d.code,
    });
  }
  // CodeMirror expects diagnostics sorted by `from`.
  out.sort((a, b) => a.from - b.from);
  return out;
}

export const CodeView: React.FC<CodeViewProps> = ({
  value,
  onChange,
  diagnostics,
  hasUnappliedEdits = false,
  showLineNumbers = true,
  syntaxHighlighting: highlight = true,
  disabled = false,
  'aria-label': ariaLabel = 'Layout specification YAML',
  className,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Always-current callback, so the persistent editor never calls a stale one.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Reconfigurable editable/read-only state (driven by `disabled`).
  const editableRef = useRef(new Compartment());
  const baseId = useId();
  const diagId = `${baseId}-diag`;

  // Create the editor once; subsequent prop changes are pushed via the effects
  // below (the EditorView persists across React renders).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const extensions = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      ...(showLineNumbers ? [lineNumbers()] : []),
      ...(highlight ? [yaml(), syntaxHighlighting(yamlHighlightStyle)] : []),
      lintGutter(),
      editorTheme,
      editableRef.current.of([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-describedby': diagId }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once. `value`/`diagnostics`/`disabled` are synced by the effects
    // below; the other inputs are construction-time options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external value changes into the editor (guarding the typing feedback
  // loop: when the user types, onChange updates `value`, which arrives here
  // already equal to the doc, so no transaction is dispatched).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Push diagnostics into the lint layer (squiggles + hover tooltips).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, toCmDiagnostics(diagnostics, view.state.doc.length)));
  }, [diagnostics]);

  // Reconfigure editable / read-only when `disabled` changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableRef.current.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    });
  }, [disabled]);

  const sorted = useMemo(() => {
    if (!diagnostics || diagnostics.length === 0) return [];
    return [...diagnostics].sort((a, b) => {
      const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sev !== 0) return sev;
      return (a.line ?? Infinity) - (b.line ?? Infinity);
    });
  }, [diagnostics]);

  return (
    <div className={`spytial-ed-code${className ? ` ${className}` : ''}`}>
      {hasUnappliedEdits ? (
        <div className="spytial-ed-code-notice" role="status">
          Text has unapplied edits — fix the error below to update the builder.
        </div>
      ) : null}

      <div
        ref={hostRef}
        className={`spytial-ed-code-cm${disabled ? ' spytial-ed-code-cm--disabled' : ''}`}
      />

      {sorted.length > 0 ? (
        <ul className="spytial-ed-code-diagnostics" id={diagId}>
          {sorted.map((d, i) => (
            <li
              key={i}
              className={`spytial-ed-diagnostic spytial-ed-diagnostic--${d.severity}`}
            >
              <span className="spytial-ed-diagnostic-dot" aria-hidden="true" />
              {d.line !== undefined ? (
                <span className="spytial-ed-code-diagnostic-loc">
                  {d.column !== undefined
                    ? `Ln ${d.line}, Col ${d.column}`
                    : `Ln ${d.line}`}
                </span>
              ) : null}
              <span className="spytial-ed-diagnostic-msg">{d.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
