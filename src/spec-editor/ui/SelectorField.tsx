/**
 * {@link SelectorField} — a controlled, single-expression CnD selector input
 * with syntax highlighting, ARIA-combobox autocomplete, an optional synthesis
 * (✨) affordance, and inline diagnostics.
 *
 * This component is intentionally domain-agnostic: it knows nothing about
 * `DomainSchema` or `SelectorAssistant`. Completion and synthesis are plain
 * props (`complete`, `synthesize`); WP4 composes the real sources (built-in
 * domain completions + the assistant hook) and passes them down.
 *
 * Highlighting uses the standard mirror-overlay technique: a `<pre aria-hidden>`
 * renders highlighted tokens behind a `<textarea>` whose own text is
 * transparent (but whose caret is visible). The two share identical font,
 * padding and box metrics, and the mirror's scroll position is synced to the
 * textarea on BOTH input and scroll — this is the fix for the scroll-desync bug
 * that got the old highlighter disabled.
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Completion } from '../domain/assistant';
import type { Diagnostic } from '../core/types';
import { tokenizeSelector, tokenClassName } from './highlight';
import { useAnchoredPopup } from './use-anchored-popup';

/** Result shape of the synthesis hook. */
export interface SynthesisResult {
  value: string;
  explanation?: string;
}

export interface SelectorFieldProps {
  /** controlled value */
  value: string;
  /** fired with the next value on every edit / accept */
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
  /** accessible name; ignored if `aria-labelledby` is set */
  'aria-label'?: string;
  /** id of an external label element */
  'aria-labelledby'?: string;
  /** drives placeholder/help hint text only */
  selectorArity?: 'unary' | 'binary';
  /**
   * Completion source. Returns sync or async completions for the identifier
   * prefix at the caret. The component does not know where these come from.
   */
  complete?: (prefix: string) => Completion[] | Promise<Completion[]>;
  /**
   * Synthesis hook. When present a ✨ button appears; clicking opens an inline
   * popover that turns a natural-language request into a selector.
   */
  synthesize?: (request: string) => Promise<SynthesisResult>;
  /** field-scoped diagnostics (already filtered by the caller). */
  diagnostics?: Diagnostic[];
  /** extra class on the root, for callers that need to hook styles. */
  className?: string;
}

const COMPLETE_DEBOUNCE_MS = 150;

/** Word characters that make up a selector identifier (for prefix extraction). */
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/** Highest diagnostic severity present, for the border/underline color. */
function topSeverity(
  diagnostics: readonly Diagnostic[] | undefined
): Diagnostic['severity'] | undefined {
  if (!diagnostics || diagnostics.length === 0) return undefined;
  if (diagnostics.some((d) => d.severity === 'error')) return 'error';
  if (diagnostics.some((d) => d.severity === 'warning')) return 'warning';
  return 'info';
}

/**
 * Finds the identifier prefix ending at `caret` and the offset where it starts.
 * Returns an empty prefix when the caret is not on a word.
 */
function identifierPrefixAt(
  text: string,
  caret: number
): { prefix: string; start: number } {
  let start = caret;
  while (start > 0 && IDENT_CHAR.test(text[start - 1])) start--;
  return { prefix: text.slice(start, caret), start };
}

/** Renders the highlighted mirror content as React spans (no innerHTML). */
const HighlightedMirror: React.FC<{ value: string }> = ({ value }) => {
  // A trailing newline must be padded so the mirror's last line keeps height,
  // matching textarea rendering.
  const tokens = useMemo(() => tokenizeSelector(value), [value]);
  return (
    <>
      {tokens.map((tok, idx) => {
        const cls = tokenClassName(tok.kind);
        return cls ? (
          <span key={idx} className={cls}>
            {tok.text}
          </span>
        ) : (
          <React.Fragment key={idx}>{tok.text}</React.Fragment>
        );
      })}
      {/* keep height when value ends in a newline */}
      {value.endsWith('\n') ? '​' : null}
    </>
  );
};

export const SelectorField: React.FC<SelectorFieldProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  selectorArity,
  complete,
  synthesize,
  diagnostics,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLPreElement | null>(null);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number): string => `${baseId}-opt-${i}`;
  const diagId = `${baseId}-diag`;

  // ── Autocomplete state ────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Completion[]>([]);
  const [active, setActive] = useState(0);
  // Token that increments per request so stale async responses can be dropped.
  const requestSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Offset where the current identifier prefix begins (for replace-on-accept).
  const prefixStart = useRef(0);

  // ── Synthesis popover state ───────────────────────────────────────────
  const [synOpen, setSynOpen] = useState(false);
  const [synRequest, setSynRequest] = useState('');
  const [synLoading, setSynLoading] = useState(false);
  const [synError, setSynError] = useState<string | null>(null);
  const [synResult, setSynResult] = useState<SynthesisResult | null>(null);
  const synInputRef = useRef<HTMLInputElement | null>(null);

  const severity = topSeverity(diagnostics);

  // Keep the mirror scrolled in lockstep with the textarea. Called on every
  // input AND on every scroll — the dual binding is the desync fix.
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  }, []);

  // Auto-grow the textarea to fit its content (single-expression, grows down).
  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoGrow();
    syncScroll();
  }, [value, autoGrow, syncScroll]);

  // ── Completion fetching (debounced, stale-drop, never-throw) ───────────
  const runComplete = useCallback(
    (text: string, caret: number) => {
      if (!complete) return;
      const { prefix, start } = identifierPrefixAt(text, caret);
      prefixStart.current = start;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const seq = ++requestSeq.current;
      debounceTimer.current = setTimeout(() => {
        let result: Completion[] | Promise<Completion[]>;
        try {
          result = complete(prefix);
        } catch {
          return; // never crash on a throwing source
        }
        Promise.resolve(result)
          .then((completions) => {
            // Drop stale responses.
            if (seq !== requestSeq.current) return;
            if (!completions || completions.length === 0) {
              setItems([]);
              setOpen(false);
              return;
            }
            setItems(completions);
            setActive(0);
            setOpen(true);
          })
          .catch(() => {
            // Never crash on a rejected promise; just leave the popup closed.
            if (seq !== requestSeq.current) return;
            setItems([]);
            setOpen(false);
          });
      }, COMPLETE_DEBOUNCE_MS);
    },
    [complete]
  );

  const closeAutocomplete = useCallback(() => {
    requestSeq.current++; // invalidate any in-flight response
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setOpen(false);
    setItems([]);
  }, []);

  const acceptCompletion = useCallback(
    (item: Completion) => {
      const ta = textareaRef.current;
      const caret = ta ? ta.selectionStart : value.length;
      const insert = item.insertText ?? item.label;
      const next =
        value.slice(0, prefixStart.current) + insert + value.slice(caret);
      onChange(next);
      closeAutocomplete();
      // Restore caret just after the inserted text on the next frame.
      const nextCaret = prefixStart.current + insert.length;
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (node) {
          node.focus();
          node.setSelectionRange(nextCaret, nextCaret);
        }
      });
    },
    [value, onChange, closeAutocomplete]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      onChange(text);
      runComplete(text, e.target.selectionStart);
    },
    [onChange, runComplete]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Space (or Cmd+Space) explicitly requests completions.
      if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const ta = textareaRef.current;
        if (ta) runComplete(ta.value, ta.selectionStart);
        return;
      }

      if (!open || items.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActive((a) => (a + 1) % items.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActive((a) => (a - 1 + items.length) % items.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          acceptCompletion(items[active]);
          break;
        case 'Escape':
          e.preventDefault();
          closeAutocomplete();
          break;
        default:
          break;
      }
    },
    [open, items, active, acceptCompletion, closeAutocomplete, runComplete]
  );

  // Close the popup when focus leaves the field entirely.
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      // If focus moves into our own listbox (e.g. mouse-down on an option),
      // don't close before the click registers.
      const next = e.relatedTarget as Node | null;
      if (next && mirrorRef.current?.parentElement?.contains(next)) return;
      closeAutocomplete();
    },
    [closeAutocomplete]
  );

  // ── Synthesis popover handlers ────────────────────────────────────────
  const openSynthesis = useCallback(() => {
    setSynOpen(true);
    setSynError(null);
    setSynResult(null);
    requestAnimationFrame(() => synInputRef.current?.focus());
  }, []);

  const closeSynthesis = useCallback(() => {
    setSynOpen(false);
    setSynLoading(false);
    setSynError(null);
    setSynResult(null);
    setSynRequest('');
  }, []);

  const runSynthesis = useCallback(async () => {
    if (!synthesize || synLoading) return;
    const request = synRequest.trim();
    if (!request) return;
    setSynLoading(true);
    setSynError(null);
    setSynResult(null);
    try {
      const result = await synthesize(request);
      setSynResult(result);
    } catch (err) {
      setSynError(
        err instanceof Error ? err.message : 'Synthesis failed. Try again.'
      );
    } finally {
      setSynLoading(false);
    }
  }, [synthesize, synLoading, synRequest]);

  const acceptSynthesis = useCallback(() => {
    if (!synResult) return;
    onChange(synResult.value);
    closeSynthesis();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [synResult, onChange, closeSynthesis]);

  // Clean up timers on unmount.
  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    []
  );

  const hint =
    placeholder ??
    (selectorArity === 'binary'
      ? 'binary selector, e.g. parent'
      : selectorArity === 'unary'
        ? 'unary selector, e.g. Node'
        : 'selector expression');

  const describedBy = diagnostics && diagnostics.length > 0 ? diagId : undefined;

  // Viewport-fixed listbox position (spans the textarea's width, flips up when
  // cramped) so host containers with overflow clipping can't cut it off.
  const autocompleteStyle = useAnchoredPopup(open && items.length > 0, textareaRef, {
    align: 'stretch',
    estimatedHeight: 224,
  });

  return (
    <div
      className={`spytial-ed-selector${
        severity ? ` spytial-ed-selector--${severity}` : ''
      }${className ? ` ${className}` : ''}`}
    >
      <div className="spytial-ed-selector-input-wrap">
        {/* Highlight mirror, behind the textarea. */}
        <pre
          ref={mirrorRef}
          className="spytial-ed-selector-mirror"
          aria-hidden="true"
        >
          <HighlightedMirror value={value} />
        </pre>

        {/*
          ARIA editable combobox (APG 1.2). The combobox role lives on the
          editable element itself, so it legitimately supports `aria-expanded`,
          `aria-autocomplete` and `aria-activedescendant`, and the accessible
          name comes from `aria-label`/`aria-labelledby`. A <textarea> is used
          (not <input>) so the field can grow vertically and wrap long lines.
        */}
        <textarea
          ref={textareaRef}
          className="spytial-ed-selector-textarea"
          value={value}
          onChange={handleInput}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={hint}
          disabled={disabled}
          rows={1}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="soft"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && items.length > 0 ? optionId(active) : undefined
          }
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={describedBy}
          aria-invalid={severity === 'error' || undefined}
        />

        {synthesize ? (
          <button
            type="button"
            className="spytial-ed-selector-synth-btn"
            onClick={openSynthesis}
            disabled={disabled}
            aria-label="Generate selector from a description"
            aria-haspopup="dialog"
            aria-expanded={synOpen}
            title="Generate selector from a description"
          >
            <span aria-hidden="true">✨</span>
          </button>
        ) : null}

        {/* Autocomplete listbox. */}
        {open && items.length > 0 ? (
          <ul
            className="spytial-ed-autocomplete"
            style={autocompleteStyle}
            id={listboxId}
            role="listbox"
            aria-label="Selector completions"
          >
            {items.map((item, i) => (
              <li
                key={`${item.label}-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={`spytial-ed-autocomplete-item${
                  i === active ? ' spytial-ed-autocomplete-item--active' : ''
                }`}
                // mousedown (not click) so it fires before textarea blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptCompletion(item);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span
                  className={`spytial-ed-autocomplete-kind spytial-ed-kind-${item.kind}`}
                  aria-hidden="true"
                />
                <span className="spytial-ed-autocomplete-label">
                  {item.label}
                </span>
                {item.detail ? (
                  <span className="spytial-ed-autocomplete-detail">
                    {item.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Synthesis popover. */}
      {synOpen ? (
        <div
          className="spytial-ed-synth-popover"
          role="dialog"
          aria-label="Generate selector"
        >
          <div className="spytial-ed-synth-row">
            <input
              ref={synInputRef}
              type="text"
              className="spytial-ed-synth-input"
              value={synRequest}
              placeholder="Describe the selector you want…"
              disabled={synLoading}
              aria-label="Selector description"
              onChange={(e) => setSynRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runSynthesis();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSynthesis();
                }
              }}
            />
            <button
              type="button"
              className="spytial-ed-synth-generate"
              onClick={() => void runSynthesis()}
              disabled={synLoading || synRequest.trim().length === 0}
            >
              {synLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {synError ? (
            <div className="spytial-ed-synth-error" role="alert">
              {synError}
            </div>
          ) : null}

          {synResult ? (
            <div className="spytial-ed-synth-result">
              <pre className="spytial-ed-synth-preview" aria-label="Proposed selector">
                <HighlightedMirror value={synResult.value} />
              </pre>
              {synResult.explanation ? (
                <p className="spytial-ed-synth-explanation">
                  {synResult.explanation}
                </p>
              ) : null}
              <div className="spytial-ed-synth-actions">
                <button
                  type="button"
                  className="spytial-ed-synth-accept"
                  onClick={acceptSynthesis}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="spytial-ed-synth-dismiss"
                  onClick={closeSynthesis}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Inline diagnostics. */}
      {diagnostics && diagnostics.length > 0 ? (
        <ul className="spytial-ed-diagnostics" id={diagId}>
          {diagnostics.map((d, i) => (
            <li
              key={i}
              className={`spytial-ed-diagnostic spytial-ed-diagnostic--${d.severity}`}
            >
              <span
                className="spytial-ed-diagnostic-dot"
                aria-hidden="true"
              />
              <span className="spytial-ed-diagnostic-msg">{d.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
