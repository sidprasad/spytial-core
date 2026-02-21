import type { IInputDataInstance } from '../../data-instance/interfaces';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { WebColaCnDGraph } from './webcola-cnd-graph';
import type { LayoutState, WebColaLayoutOptions } from './webcolatranslator';
import { applyTemporalPolicy } from './temporal-policy';
import type { TemporalMode } from './temporal-policy';

/**
 * Options for generating layouts for a sequence of data instances.
 */
export interface SequenceLayoutOptions {
  /** Ordered list of data instances to lay out */
  instances: IInputDataInstance[];
  /** Spytial spec YAML string */
  spytialSpec: string;
  /** Inter-sequence policy mode (default: ignore_history) */
  mode?: TemporalMode;
  /** Per-step changed node IDs, used with `change_emphasis` mode */
  changedNodeIdsByStep?: Array<ReadonlyArray<string> | undefined>;
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
 * between steps according to the chosen inter-sequence policy.
 *
 * This is a thin orchestration layer atop `WebColaCnDGraph.renderLayout()`.
 * The temporal policy (`applyTemporalPolicy`) is applied here — the graph
 * component only receives the final `priorState` and is unaware of modes.
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

    // Apply temporal policy here — the graph component only sees priorState.
    const changedIds = mode === 'change_emphasis'
      ? options.changedNodeIdsByStep?.[i] ? [...options.changedNodeIdsByStep[i]!] : undefined
      : undefined;

    const { effectivePriorState } = applyTemporalPolicy(
      priorState ?? undefined,
      mode,
      changedIds
    );

    const renderOptions: WebColaLayoutOptions = {};
    if (effectivePriorState) {
      renderOptions.priorState = effectivePriorState;
    }

    await graphElement.renderLayout(layout, renderOptions);
    results.push(graphElement);

    priorState = mode === 'ignore_history' ? null : graphElement.getLayoutState();
  }

  return results;
}
