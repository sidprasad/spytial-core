/**
 * {@link SuggestionsPanel} — the read-only explanation of a
 * {@link LayoutAssistant} run.
 *
 * The suggestion itself has already been applied to the document by the time
 * this renders; the panel exists so the reasoning isn't thrown away. Each row
 * shows the suggester's rationale plus two optional generic chips (confidence,
 * outcome), and result-level `notes` follow the list. Nothing here is
 * interactive beyond dismissal — accepting or rejecting individual suggestions
 * would require the suggester to recompose the spec, which is host policy.
 */

import React from 'react';
import type {
  LayoutSuggestionDetail,
  LayoutSuggestionResult,
} from '../domain/layout-assistant';

export interface SuggestionsPanelProps {
  result: LayoutSuggestionResult;
  onDismiss(): void;
}

export const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  result,
  onDismiss,
}) => {
  const suggestions = result.suggestions ?? [];
  const notes = result.notes ?? [];

  return (
    <div
      className="spytial-ed-suggestions"
      role="region"
      aria-label="Layout suggestions"
    >
      <div className="spytial-ed-suggestions-head">
        <span className="spytial-ed-suggestions-title">
          {suggestions.length > 0
            ? `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`
            : 'Suggestion applied'}
        </span>
        <button
          type="button"
          className="spytial-ed-suggestions-dismiss"
          aria-label="Dismiss suggestions"
          title="Dismiss"
          onClick={onDismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {suggestions.length > 0 ? (
        <ul className="spytial-ed-suggestions-list">
          {suggestions.map((s) => (
            <SuggestionRow key={s.id} suggestion={s} />
          ))}
        </ul>
      ) : null}

      {notes.length > 0 ? (
        <ul className="spytial-ed-suggestions-notes">
          {notes.map((note, i) => (
            // Notes are free-form host strings with no stable identity; index
            // keys are correct here because the list is replaced wholesale.
            <li key={i}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const SuggestionRow: React.FC<{ suggestion: LayoutSuggestionDetail }> = ({
  suggestion,
}) => {
  const { id, rationale, confidence, outcome } = suggestion;
  return (
    <li
      className={`spytial-ed-suggestion${
        outcome === 'omitted' ? ' spytial-ed-suggestion--omitted' : ''
      }`}
    >
      <div className="spytial-ed-suggestion-head">
        {/* Ids are machine-facing (`orientation:synth-union:Node`), so the
            rationale leads and the id trails as a mono tag. With no rationale
            the id is all we have, so it becomes the label. */}
        <span className="spytial-ed-suggestion-text">{rationale || id}</span>
        {confidence ? (
          <span
            className={`spytial-ed-suggestion-chip spytial-ed-suggestion-chip--${confidence}`}
            title={`${confidence} confidence`}
          >
            {confidence}
          </span>
        ) : null}
        {outcome ? (
          <span
            className={`spytial-ed-suggestion-chip spytial-ed-suggestion-chip--${outcome}`}
            title={`Outcome: ${outcome}`}
          >
            {outcome}
          </span>
        ) : null}
      </div>
      {rationale ? <code className="spytial-ed-suggestion-id">{id}</code> : null}
    </li>
  );
};
