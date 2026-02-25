import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ProjectionControls, ProjectionChoice } from './ProjectionControls';
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
   *
   * **Important:** The evaluator must be initialised with the original
   * (un-projected) instance, not the projected one. See the DEV_GUIDE
   * section on evaluation-order dependency.
   */
  evaluator?: IEvaluator | null;

  /**
   * Callback fired whenever the projected instance changes.
   * This is called:
   *  - When `instance` changes (initial projection)
   *  - When a projection is added / removed
   *  - When the user selects a different atom in a dropdown
   *
   * The caller should use `result.instance` for layout generation.
   */
  onProjectionChange: (result: ProjectionOrchestratorResult) => void;

  /**
   * Available type names that can be projected. If provided, the "add
   * projection" dropdown only shows these types. If omitted, all non-builtin
   * types from `instance.getTypes()` are offered.
   */
  availableTypes?: string[];

  /** Additional CSS class name */
  className?: string;

  /** Whether the controls are disabled */
  disabled?: boolean;
}

/**
 * ProjectionOrchestrator
 *
 * A self-contained React component that implements the full projection
 * pattern: managing projections, applying the pre-layout
 * `applyProjectionTransform` step, and rendering `ProjectionControls`
 * for atom selection.
 *
 * This component owns the `Projection[]` and `selections`
 * state. When anything changes (projections, selections, or upstream
 * instance), it re-runs `applyProjectionTransform` and emits the
 * projected `IDataInstance` via `onProjectionChange`.
 *
 * @example
 * ```tsx
 * <ProjectionOrchestrator
 *   instance={myDataInstance}
 *   evaluator={myEvaluator}
 *   onProjectionChange={({ instance, choices }) => {
 *     const layout = layoutInstance.generateLayout(instance);
 *     renderGraph(layout);
 *   }}
 * />
 * ```
 *
 * @public
 */
export const ProjectionOrchestrator: React.FC<ProjectionOrchestratorProps> = ({
  instance,
  evaluator,
  onProjectionChange,
  availableTypes,
  className = '',
  disabled = false,
}) => {
  // ── State ──────────────────────────────────────────────────────────
  const [projections, setProjections] = useState<Projection[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<ProjectionChoice[]>([]);
  const [addSigValue, setAddSigValue] = useState('');

  // Ref to avoid stale closures in the onProjectionChange callback.
  const onChangeRef = useRef(onProjectionChange);
  useEffect(() => {
    onChangeRef.current = onProjectionChange;
  }, [onProjectionChange]);

  // ── Derived: available types for the "add" dropdown ────────────────
  const typeOptions = useMemo(() => {
    if (availableTypes) return availableTypes;
    if (!instance) return [];
    return instance
      .getTypes()
      .filter((t) => !t.isBuiltin)
      .map((t) => t.id);
  }, [instance, availableTypes]);

  // Types that haven't been projected yet
  const unusedTypes = useMemo(() => {
    const projectedSigs = new Set(projections.map((d) => d.sig));
    return typeOptions.filter((t) => !projectedSigs.has(t));
  }, [typeOptions, projections]);

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
      // No projections — emit the original instance
      setChoices([]);
      onChangeRef.current({ instance, choices: [] });
      return;
    }

    const result = runTransform(instance, projections, selections);
    if (result) {
      setChoices(result.choices);
      onChangeRef.current({ instance: result.instance, choices: result.choices });
    } else {
      // Transform failed — fallback to un-projected
      setChoices([]);
      onChangeRef.current({ instance, choices: [] });
    }
    // We intentionally use a JSON key for selections to avoid infinite loops
    // from the object reference changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, projections, JSON.stringify(selections), runTransform]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleAddProjection = useCallback(() => {
    const sig = addSigValue;
    if (!sig) return;
    setProjections((prev) => [...prev, { sig }]);
    setAddSigValue('');
  }, [addSigValue]);

  const handleRemoveProjection = useCallback((sig: string) => {
    setProjections((prev) => prev.filter((d) => d.sig !== sig));
    setSelections((prev) => {
      const next = { ...prev };
      delete next[sig];
      return next;
    });
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
      {/* ── Add new projection ───────────────────────────── */}
      {unusedTypes.length > 0 && (
        <div className="projection-orchestrator__add">
          <label
            htmlFor="projection-orchestrator-add"
            className="projection-controls__label"
          >
            Project over:
          </label>
          <select
            id="projection-orchestrator-add"
            className="projection-controls__select"
            value={addSigValue}
            onChange={(e) => setAddSigValue(e.target.value)}
            disabled={disabled}
          >
            <option value="">— select type —</option>
            {unusedTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="projection-orchestrator__add-btn"
            onClick={handleAddProjection}
            disabled={disabled || !addSigValue}
          >
            Add
          </button>
        </div>
      )}

      {/* ── Active projections (with remove) ─── */}
      {projections.length > 0 && (
        <div className="projection-orchestrator__projections">
          {projections.map((d) => (
            <span key={d.sig} className="projection-orchestrator__tag">
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
          ))}
        </div>
      )}

      {/* ── Atom selection dropdowns (delegate to ProjectionControls) */}
      <ProjectionControls
        projectionData={choices}
        onProjectionChange={handleAtomChange}
        disabled={disabled}
      />
    </div>
  );
};
