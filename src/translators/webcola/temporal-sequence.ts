import type { IInputDataInstance } from '../../data-instance/interfaces';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { WebColaCnDGraph } from './webcola-cnd-graph';
import type { LayoutState, WebColaLayoutOptions } from './webcolatranslator';
import type { TemporalMode } from './temporal-policy';

/**
 * Options for rendering a temporal sequence of data instances.
 */
export interface RenderTemporalSequenceOptions {
  /** Ordered list of data instances to render */
  instances: IInputDataInstance[];
  /** Spytial spec YAML string */
  spytialSpec: string;
  /** Temporal mode for inter-instance continuity (default: ignore_history) */
  mode?: TemporalMode;
  /** Per-step changed node IDs, used with `change_emphasis` mode */
  changedNodeIdsByStep?: Array<ReadonlyArray<string> | undefined>;
  /** Per-step projection overrides */
  projectionsByStep?: Array<Record<string, string> | undefined>;
}

function ensureWebColaElementRegistered(): void {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') {
    throw new Error('Temporal sequence rendering requires a browser environment.');
  }
  if (!customElements.get('webcola-cnd-graph')) {
    customElements.define('webcola-cnd-graph', WebColaCnDGraph as any);
  }
}

/**
 * Render a temporal sequence of data instances, threading layout state
 * between steps according to the chosen temporal mode.
 *
 * This is a thin orchestration layer atop `WebColaCnDGraph.renderLayout()`.
 * Each step produces a `webcola-cnd-graph` element; the caller is responsible
 * for inserting them into the DOM.
 *
 * @param options - Sequence rendering options
 * @returns Array of rendered `webcola-cnd-graph` elements, one per instance
 */
export async function renderTemporalSequence(
  options: RenderTemporalSequenceOptions
): Promise<WebColaCnDGraph[]> {
  const { instances, spytialSpec } = options;
  const mode = options.mode ?? 'ignore_history';
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

    const renderOptions: WebColaLayoutOptions = {
      temporalMode: mode,
    };

    if (mode !== 'ignore_history' && priorState) {
      renderOptions.priorState = priorState;
    }

    if (mode === 'change_emphasis') {
      const changedIds = options.changedNodeIdsByStep?.[i];
      if (changedIds) {
        renderOptions.changedNodeIds = [...changedIds];
      }
    }

    await graphElement.renderLayout(layout, renderOptions);
    results.push(graphElement);

    priorState = mode === 'ignore_history' ? null : graphElement.getLayoutState();
  }

  return results;
}
