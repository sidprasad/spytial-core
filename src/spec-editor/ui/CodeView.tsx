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
 * Optional line numbers are rendered in a gutter that scroll-syncs with the
 * textarea (the same mirror technique the SelectorField uses). YAML is NOT
 * syntax-highlighted (per the WP3 handoff note: a plain textarea with
 * diagnostics is acceptable, and full YAML highlighting is out of scope).
 */

import React, { useCallback, useId, useMemo, useRef } from 'react';
import type { Diagnostic } from '../core/types';

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
  disabled = false,
  'aria-label': ariaLabel = 'Layout specification YAML',
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const diagId = `${baseId}-diag`;

  const lineCount = useMemo(() => {
    // At least one line so the gutter is never empty.
    const lines = value.split('\n').length;
    return Math.max(1, lines);
  }, [value]);

  // Keep the gutter scrolled in lockstep with the textarea.
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const gutter = gutterRef.current;
    if (!ta || !gutter) return;
    gutter.scrollTop = ta.scrollTop;
  }, []);

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

        <textarea
          ref={textareaRef}
          className="spytial-ed-code-textarea"
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
