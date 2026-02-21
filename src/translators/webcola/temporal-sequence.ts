import type { IInputDataInstance } from '../../data-instance/interfaces';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { WebColaCnDGraph } from './webcola-cnd-graph';
import type { LayoutState, WebColaLayoutOptions } from './webcolatranslator';
import { ignoreHistory } from './sequence-policy';
import type { SequencePolicy } from './sequence-policy';

/**
 * Options for generating layouts for a sequence of data instances.
 */
export interface SequenceLayoutOptions {
  /** Ordered list of data instances to lay out */
  instances: IInputDataInstance[];
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
