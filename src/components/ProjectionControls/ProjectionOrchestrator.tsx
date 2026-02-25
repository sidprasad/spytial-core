import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ProjectionChoice } from './ProjectionControls';
import './ProjectionOrchestrator.css';
import {
  applyProjectionTransform,
  Projection,
  ProjectionTransformResult,
} from '../../data-instance/projection-transform';
import { IDataInstance } from '../../data-instance/interfaces';
import IEvaluator from '../../evaluators/interfaces';

/**
 * Result emitted by ProjectionOrchestrator whenever projections change.
 * Contains everything the caller needs to run layout on the projected data.
 */
export interface ProjectionOrchestratorResult {
  /** The projected data instance — pass this to `LayoutInstance.generateLayout()` */
  instance: IDataInstance;
  /** Projection choices for external consumption / serialisation */
  choices: ProjectionChoice[];
}

/**
 * Props for the ProjectionOrchestrator component.
 */
export interface ProjectionOrchestratorProps {
  /**
   * The **original, un-projected** data instance.
   * The orchestrator applies projection transforms to this instance.
   */
  instance: IDataInstance | null;

  /**
   * Optional evaluator, initialised against `instance`.
   * Required for `orderBy` support — if omitted, `orderBy` is ignored
   * and atoms fall back to lexicographic sorting.
   */
  evaluator?: IEvaluator | null;

  /**
   * Callback fired whenever the projected instance changes.
   * Called on instance change, projection add/remove, or atom selection change.
   * The caller should use `result.instance` for layout generation.
   */
  onProjectionChange: (result: ProjectionOrchestratorResult) => void;

  /** Additional CSS class name */
  className?: string;

  /** Whether the controls are disabled */
  disabled?: boolean;
}

/**
 * ProjectionOrchestrator
 *
 * A simplified, self-contained projection UI.
 *
 * **Step 1 — Add a projection:** Type any type/sig name (including built-in
 * types like `Int`) into the text box and press Enter or click Add.
 *
 * **Step 2 — Pick an atom:** Once a type is added, a dropdown appears listing
 * every atom of that type. Selecting a different atom re-projects the
 * instance and fires `onProjectionChange`.
 *
 * The component runs `applyProjectionTransform` internally and emits the
 * projected `IDataInstance` — the caller just passes it to `generateLayout()`.
 *
 * @public
 */
export const ProjectionOrchestrator: React.FC<ProjectionOrchestratorProps> = ({
  instance,
  evaluator,
  onProjectionChange,
  className = '',
  disabled = false,
}) => {
  // ── State ──────────────────────────────────────────────────────────
  const [projections, setProjections] = useState<Projection[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<ProjectionChoice[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Ref to avoid stale closures in the onProjectionChange callback.
  const onChangeRef = useRef(onProjectionChange);
  useEffect(() => {
    onChangeRef.current = onProjectionChange;
  }, [onProjectionChange]);

  // ── Core: run projection transform ─────────────────────────────────
  const runTransform = useCallback(
    (
      inst: IDataInstance | null,
      dirs: Projection[],
      sels: Record<string, string>,
    ): ProjectionTransformResult | null => {
      if (!inst || dirs.length === 0) {
        return null;
      }

      try {
        return applyProjectionTransform(inst, dirs, sels, {
          evaluateOrderBy: evaluator?.isReady()
            ? (sel) => evaluator.evaluate(sel).selectedTwoples()
            : undefined,
          onOrderByError: (sel, err) => {
            console.warn(`ProjectionOrchestrator: orderBy error for "${sel}":`, err);
          },
        });
      } catch (err) {
        console.error('ProjectionOrchestrator: projection transform failed:', err);
        return null;
      }
    },
    [evaluator],
  );

  // ── Effect: re-run projection when inputs change ───────────────────
  useEffect(() => {
    if (!instance) {
      setChoices([]);
      return;
    }

    if (projections.length === 0) {
      // No projections active — emit the original instance unchanged.
      setChoices([]);
      onChangeRef.current({ instance, choices: [] });
      return;
    }

    const selsCopy = { ...selections };
    const result = runTransform(instance, projections, selsCopy);
    if (result) {
      setChoices(result.choices);
      // Sync defaults that applyProjectionTransform may have filled in.
      setSelections(selsCopy);
      setError(null);
      onChangeRef.current({ instance: result.instance, choices: result.choices });
    } else {
      // Transform failed — fallback to un-projected
      setChoices([]);
      setError('Projection transform failed — showing un-projected data.');
      onChangeRef.current({ instance, choices: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, projections, JSON.stringify(selections), runTransform]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleAddProjection = useCallback(() => {
    const sig = inputValue.trim();
    if (!sig) return;

    // Prevent duplicates
    if (projections.some((p) => p.sig === sig)) {
      setError(`Already projecting over "${sig}".`);
      return;
    }

    setError(null);
    setProjections((prev) => [...prev, { sig }]);
    setInputValue('');
  }, [inputValue, projections]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddProjection();
      }
    },
    [handleAddProjection],
  );

  const handleRemoveProjection = useCallback((sig: string) => {
    setProjections((prev) => prev.filter((d) => d.sig !== sig));
    setSelections((prev) => {
      const next = { ...prev };
      delete next[sig];
      return next;
    });
    setError(null);
  }, []);

  const handleAtomChange = useCallback(
    (type: string, atomId: string) => {
      setSelections((prev) => ({ ...prev, [type]: atomId }));
    },
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────
  if (!instance) return null;

  return (
    <div
      className={`projection-orchestrator ${className}`}
      role="region"
      aria-label="Projection Orchestrator"
    >
      {/* ── Add new projection (free-text) ─────────────── */}
      <div className="projection-orchestrator__add">
        <label
          htmlFor="projection-orchestrator-add"
          className="projection-controls__label"
        >
          Project over:
        </label>
        <input
          id="projection-orchestrator-add"
          className="projection-controls__input"
          type="text"
          placeholder="Type name (e.g. State, Node, Int)"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
        />
        <button
          type="button"
          className="projection-orchestrator__add-btn"
          onClick={handleAddProjection}
          disabled={disabled || !inputValue.trim()}
        >
          Add
        </button>
      </div>

      {/* ── Error banner ─────────────────────────────────── */}
      {error && (
        <div className="projection-orchestrator__error" role="alert">
          {error}
        </div>
      )}

      {/* ── Active projections ───────────────────────────── */}
      {projections.length > 0 && (
        <div className="projection-orchestrator__list">
          {projections.map((d) => {
            const choice = choices.find((c) => c.type === d.sig);
            return (
              <div key={d.sig} className="projection-orchestrator__row">
                {/* Type tag with remove button */}
                <span className="projection-orchestrator__tag">
                  {d.sig}
                  <button
                    type="button"
                    className="projection-orchestrator__remove-btn"
                    onClick={() => handleRemoveProjection(d.sig)}
                    disabled={disabled}
                    aria-label={`Remove projection on ${d.sig}`}
                  >
                    ×
                  </button>
                </span>

                {/* Atom selector */}
                {choice && choice.atoms.length > 0 ? (
                  <select
                    className="projection-controls__select"
                    value={choice.projectedAtom}
                    onChange={(e) => handleAtomChange(d.sig, e.target.value)}
                    disabled={disabled}
                    aria-label={`Select atom for ${d.sig}`}
                  >
                    {choice.atoms.map((atom) => (
                      <option key={atom} value={atom}>
                        {atom}
                      </option>
                    ))}
                  </select>
                ) : choice ? (
                  <span className="projection-orchestrator__no-atoms">
                    No atoms
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
