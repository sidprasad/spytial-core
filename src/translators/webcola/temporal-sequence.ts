import type { IInputDataInstance } from '../../data-instance/interfaces';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { WebColaCnDGraph } from './webcola-cnd-graph';
import type { LayoutState, WebColaLayoutOptions } from './webcolatranslator';
import type { TemporalPolicyCanonicalName } from './temporal-policy';

export type SequenceMode = TemporalPolicyCanonicalName;
export type SequenceModeStrategy = SequenceMode | 'default';
export type ChangedRegionStrategy = 'default' | 'provided';

export interface TemporalSequenceStrategy {
  /**
   * Strategy for temporal mode selection.
   * - `default` => `ignore_history`
   */
  mode?: SequenceModeStrategy;
  /**
   * Strategy for changed-region handling in `change_emphasis` mode.
   * - `default` => infer changes from prior positions
   * - `provided` => use changedNodeIdsByStep
   */
  changedRegions?: ChangedRegionStrategy;
}

export interface RenderTemporalSequenceOptions {
  instances: IInputDataInstance[];
  spytialSpec: string;
  strategy?: TemporalSequenceStrategy;
  changedNodeIdsByStep?: Array<ReadonlyArray<string> | undefined>;
  projectionsByStep?: Array<Record<string, string> | undefined>;
  container?: HTMLElement;
}

export function resolveSequenceMode(
  mode: SequenceModeStrategy | undefined
): SequenceMode {
  if (!mode || mode === 'default') {
    return 'ignore_history';
  }
  return mode;
}

function resolveChangedRegionStrategy(
  strategy: TemporalSequenceStrategy | undefined
): ChangedRegionStrategy {
  return strategy?.changedRegions || 'default';
}

function ensureWebColaElementRegistered(): void {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof customElements === 'undefined'
  ) {
    throw new Error('Temporal sequence rendering requires a browser environment.');
  }

  if (!customElements.get('webcola-cnd-graph')) {
    customElements.define('webcola-cnd-graph', WebColaCnDGraph as any);
  }
}

function makeGraphElement(): WebColaCnDGraph {
  ensureWebColaElementRegistered();
  return document.createElement('webcola-cnd-graph') as WebColaCnDGraph;
}

/**
 * Sequence layer for rendering multiple instances with temporal strategy.
 *
 * Input:
 * - list of instances
 * - Spytial spec
 * - strategy (defaults to `(default, default)`)
 *
 * Output:
 * - list of rendered `webcola-cnd-graph` elements
 */
export async function renderTemporalSequence(
  options: RenderTemporalSequenceOptions
): Promise<WebColaCnDGraph[]> {
  const { instances, spytialSpec, container } = options;
  const mode = resolveSequenceMode(options.strategy?.mode);
  const changedRegionStrategy = resolveChangedRegionStrategy(options.strategy);

  const parsedSpec = parseLayoutSpec(spytialSpec);
  const renderedGraphs: WebColaCnDGraph[] = [];
  let priorState: LayoutState | null = null;

  for (let index = 0; index < instances.length; index++) {
    const instance = instances[index];
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });

    const layoutInstance = new LayoutInstance(parsedSpec, evaluator, index, true);
    const projections = options.projectionsByStep?.[index] || {};
    const { layout, error } = layoutInstance.generateLayout(instance, projections);

    if (error) {
      throw error;
    }

    const graphElement = makeGraphElement();
    if (container) {
      container.appendChild(graphElement);
    }

    const renderOptions: WebColaLayoutOptions = {
      temporalPolicy: mode
    };

    if (mode !== 'ignore_history' && priorState) {
      renderOptions.priorState = priorState;
    }

    if (mode === 'change_emphasis' && changedRegionStrategy === 'provided') {
      const changedIds = options.changedNodeIdsByStep?.[index];
      if (changedIds) {
        renderOptions.changedNodeIds = [...changedIds];
      }
    }

    await graphElement.renderLayout(layout, renderOptions);
    renderedGraphs.push(graphElement);

    priorState = mode === 'ignore_history' ? null : graphElement.getLayoutState();
  }

  return renderedGraphs;
}
