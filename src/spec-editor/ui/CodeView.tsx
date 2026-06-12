/**
 * {@link CodeView} — the raw-YAML editing surface of the spec editor.
 *
 * A controlled monospace `<textarea>` whose value is owned by {@link SpecEditor}.
 * Typing fires `onChange(text)` immediately (the text is controlled), and a
 * debounced parse is attempted by the parent via `onParse`. CodeView itself is
 * presentation-only: it does not own a {@link SpecDocument}. The parent passes
 * down the current parse `diagnostics` (line/column anchored, severity colored)
 * and a flag indicating whether the text currently differs from the model
 * ("unapplied edits"). A parse error never clobbers the model — the parent keeps
 * the last good state and surfaces the diagnostic here.
 *
 * The YAML is syntax-highlighted with the same mirror-overlay technique the
 * SelectorField uses: a highlighted `<pre>` sits behind a transparent-text
 * textarea with identical metrics, scroll-synced on both axes (the text never
 * wraps, so horizontal sync matters here). Tokenization is the lossless
 * line tokenizer in `highlight-yaml.ts` (comments, strings, numbers, keys,
 * and the spec's known constraint/directive keywords). Optional line numbers
 * render in a gutter that shares the same scroll sync.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import type { Diagnostic } from '../core/types';
import { tokenizeYaml, yamlTokenClassName } from './highlight-yaml';

export interface CodeViewProps {
  /** controlled YAML text */
  value: string;
  /** fired with the next text on every edit */
  onChange(value: string): void;
  /** parse diagnostics for the current text (line/column, severity colored). */
  diagnostics?: readonly Diagnostic[];
  /**
   * True when the text differs from the applied model (a parse error is keeping
   * the model on its last good state). Drives the "unapplied edits" notice.
   */
  hasUnappliedEdits?: boolean;
  /** render a line-number gutter (default true). */
  showLineNumbers?: boolean;
  /**
   * Render the YAML highlight mirror (default true). Escape hatch for hosts
   * where the overlay misaligns: when false the textarea shows its own text.
   */
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

export const CodeView: React.FC<CodeViewProps> = ({
  value,
  onChange,
  diagnostics,
  hasUnappliedEdits = false,
  showLineNumbers = true,
  syntaxHighlighting = true,
  disabled = false,
  'aria-label': ariaLabel = 'Layout specification YAML',
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLPreElement | null>(null);
  const baseId = useId();
  const diagId = `${baseId}-diag`;

  const lineCount = useMemo(() => {
    // At least one line so the gutter is never empty.
    const lines = value.split('\n').length;
    return Math.max(1, lines);
  }, [value]);

  const highlightedLines = useMemo(
    () => (syntaxHighlighting ? tokenizeYaml(value) : []),
    [value, syntaxHighlighting],
  );

  // Keep the gutter and the highlight mirror scrolled in lockstep with the
  // textarea — both axes: with `wrap="off"` the text scrolls horizontally too.
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const gutter = gutterRef.current;
    if (gutter) gutter.scrollTop = ta.scrollTop;
    const mirror = mirrorRef.current;
    if (mirror) {
      mirror.scrollTop = ta.scrollTop;
      mirror.scrollLeft = ta.scrollLeft;
    }
  }, []);

  // Re-sync after every value change as well (typing can scroll the textarea
  // without firing a scroll event in all engines).
  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const sorted = useMemo(() => {
    if (!diagnostics || diagnostics.length === 0) return [];
    return [...diagnostics].sort((a, b) => {
      const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sev !== 0) return sev;
      return (a.line ?? Infinity) - (b.line ?? Infinity);
    });
  }, [diagnostics]);

  const hasError = sorted.some((d) => d.severity === 'error');
  const describedBy = sorted.length > 0 ? diagId : undefined;

  return (
    <div className={`spytial-ed-code${className ? ` ${className}` : ''}`}>
      {hasUnappliedEdits ? (
        <div className="spytial-ed-code-notice" role="status">
          Text has unapplied edits — fix the error below to update the builder.
        </div>
      ) : null}

      <div className="spytial-ed-code-editor">
        {showLineNumbers ? (
          <div
            ref={gutterRef}
            className="spytial-ed-code-gutter"
            aria-hidden="true"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="spytial-ed-code-gutter-line">
                {i + 1}
              </div>
            ))}
          </div>
        ) : null}

        <div className="spytial-ed-code-input-wrap">
          {/* Highlight mirror, behind the textarea (presentation only;
              omitted entirely when highlighting is disabled). */}
          {syntaxHighlighting ? (
            <pre
              ref={mirrorRef}
              className="spytial-ed-code-mirror"
              aria-hidden="true"
            >
              {highlightedLines.map((tokens, lineIdx) => (
                <React.Fragment key={lineIdx}>
                  {lineIdx > 0 ? '\n' : null}
                  {tokens.map((t, i) => {
                    const cls = yamlTokenClassName(t.kind);
                    return cls ? (
                      <span key={i} className={cls}>
                        {t.text}
                      </span>
                    ) : (
                      t.text
                    );
                  })}
                </React.Fragment>
              ))}
              {/* trailing newline keeps the last line's height in the mirror */}
              {'\n'}
            </pre>
          ) : null}

          <textarea
            ref={textareaRef}
            className={`spytial-ed-code-textarea${
              syntaxHighlighting ? '' : ' spytial-ed-code-textarea--plain'
            }`}
            value={value}
            onChange={handleChange}
            onScroll={syncScroll}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-label={ariaLabel}
            aria-describedby={describedBy}
            aria-invalid={hasError || undefined}
          />
        </div>
      </div>

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
