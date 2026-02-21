import type { IDataInstance } from '../../data-instance/interfaces';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import type { InstanceLayout } from '../../layout/interfaces';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import type { LayoutSpec } from '../../layout/layoutspec';
import { WebColaCnDGraph } from './webcola-cnd-graph';
import type { LayoutState, WebColaLayoutOptions } from './webcolatranslator';
import { ignoreHistory } from './sequence-policy';
import type { SequencePolicy } from './sequence-policy';

/**
 * Options for generating layouts for a sequence of data instances.
 */
export interface SequenceLayoutOptions {
  /** Ordered list of data instances to lay out */
  instances: IDataInstance[];
  /** Spytial spec YAML string */
  spytialSpec: string;
  /** Sequence policy controlling how prior state carries forward (default: ignoreHistory) */
  policy?: SequencePolicy;
  /** Per-step projection overrides */
  projectionsByStep?: Array<Record<string, string> | undefined>;
}

function ensureWebColaElementRegistered(): void {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') {
    throw new Error('Sequence layout generation requires a browser environment.');
  }
  if (!customElements.get('webcola-cnd-graph')) {
    customElements.define('webcola-cnd-graph', WebColaCnDGraph as any);
  }
}

/**
 * Generate layouts for a sequence of data instances, threading layout state
 * between steps according to the chosen sequence policy.
 *
 * This is a thin orchestration layer atop `WebColaCnDGraph.renderLayout()`.
 * The policy is applied here — the graph component only receives the
 * final `priorState` and is unaware of policy logic.
 *
 * Each step produces a `webcola-cnd-graph` element; the caller is responsible
 * for inserting them into the DOM.
 *
 * @param options - Sequence layout options
 * @returns Array of `webcola-cnd-graph` elements, one per instance
 */
export async function generateSequenceLayouts(
  options: SequenceLayoutOptions
): Promise<WebColaCnDGraph[]> {
  const { instances, spytialSpec } = options;
  const policy = options.policy ?? ignoreHistory;
  const parsedSpec = parseLayoutSpec(spytialSpec);
  const results: WebColaCnDGraph[] = [];
  let priorState: LayoutState | null = null;

  ensureWebColaElementRegistered();

  for (let i = 0; i < instances.length; i++) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instances[i] });

    const layoutInstance = new LayoutInstance(parsedSpec, evaluator, i, true);
    const projections = options.projectionsByStep?.[i] ?? {};
    const { layout, error } = layoutInstance.generateLayout(instances[i], projections);

    if (error) throw error;

    const graphElement = document.createElement('webcola-cnd-graph') as WebColaCnDGraph;

    // Apply the sequence policy to compute effective prior state.
    // The policy receives the pairwise context (prior state + prev/curr instances).
    let effectivePriorState: LayoutState | undefined;
    if (i > 0 && priorState && priorState.positions.length > 0) {
      const result = policy.apply({
        priorState,
        prevInstance: instances[i - 1],
        currInstance: instances[i],
        spec: parsedSpec,
      });
      effectivePriorState = result.effectivePriorState;
    }

    const renderOptions: WebColaLayoutOptions = {};
    if (effectivePriorState) {
      renderOptions.priorState = effectivePriorState;
    }

    await graphElement.renderLayout(layout, renderOptions);
    results.push(graphElement);

    // Always capture state — the policy decides whether to use it
    priorState = graphElement.getLayoutState();
  }

  return results;
}

// ---------------------------------------------------------------------------
// SequenceStepper — interactive step-by-step rendering
// ---------------------------------------------------------------------------

/**
 * Options for creating a {@link SequenceStepper}.
 */
export interface SequenceStepperOptions {
  /** Sequence policy controlling inter-step state (default: ignoreHistory) */
  policy?: SequencePolicy;
  /** Parsed layout specification (passed to policy context) */
  spec: LayoutSpec;
}

/**
 * Stateful helper for interactive step-by-step sequence rendering.
 *
 * Wraps a single `WebColaCnDGraph` element and manages the pairwise
 * state (prior layout positions, previous instance) that sequence
 * policies need.  The caller generates layouts however they like and
 * calls {@link step} — the stepper handles `getLayoutState()`, policy
 * application, and `renderLayout()`.
 *
 * For the batch (side-by-side) scenario, use {@link generateSequenceLayouts}
 * instead.
 *
 * @example
 * ```typescript
 * import { SequenceStepper, stability } from 'spytial-core';
 *
 * const stepper = new SequenceStepper(graphElement, {
 *   policy: stability,
 *   spec: parsedSpec,
 * });
 *
 * // First render — fresh layout, no policy applied
 * await stepper.step(instance0, layout0);
 *
 * // User clicks "Next" — stepper captures prior state & applies policy
 * await stepper.step(instance1, layout1);
 *
 * // User drags a node, then clicks "Next" again —
 * // dragged positions are captured automatically
 * await stepper.step(instance2, layout2);
 * ```
 */
export class SequenceStepper {
  private graph: WebColaCnDGraph;
  private _policy: SequencePolicy;
  private _spec: LayoutSpec;
  private currentInstance: IDataInstance | null = null;

  constructor(graph: WebColaCnDGraph, options: SequenceStepperOptions) {
    this.graph = graph;
    this._policy = options.policy ?? ignoreHistory;
    this._spec = options.spec;
  }

  /** The active sequence policy. */
  get policy(): SequencePolicy {
    return this._policy;
  }

  /** Swap the policy mid-stream (e.g., user changes a dropdown). */
  setPolicy(policy: SequencePolicy): void {
    this._policy = policy;
  }

  /** Update the layout spec (e.g., after user edits YAML and re-parses). */
  setSpec(spec: LayoutSpec): void {
    this._spec = spec;
  }

  /**
   * Reset internal state.  The next {@link step} call will be treated as
   * the first render (no prior state, no policy application).
   */
  reset(): void {
    this.currentInstance = null;
  }

  /**
   * Render the next instance in the sequence.
   *
   * On the first call (or after {@link reset}), the layout is rendered
   * without any prior state.  On subsequent calls the stepper:
   *
   * 1. Captures the graph's live layout state (including drag)
   * 2. Applies the active policy with `(priorState, prev, curr)`
   * 3. Calls `renderLayout()` with the computed effective prior state
   * 4. Updates internal state for the next step
   *
   * @param nextInstance - Data instance for this step
   * @param layout - Pre-generated layout (from `LayoutInstance.generateLayout`)
   */
  async step(nextInstance: IDataInstance, layout: InstanceLayout): Promise<void> {
    const renderOptions: WebColaLayoutOptions = {};

    if (this.currentInstance) {
      const priorState = this.graph.getLayoutState();
      if (priorState && priorState.positions.length > 0) {
        const { effectivePriorState } = this._policy.apply({
          priorState,
          prevInstance: this.currentInstance,
          currInstance: nextInstance,
          spec: this._spec,
        });
        if (effectivePriorState) {
          renderOptions.priorState = effectivePriorState;
        }
      }
    }

    await this.graph.renderLayout(layout, renderOptions);
    this.currentInstance = nextInstance;
  }
}
