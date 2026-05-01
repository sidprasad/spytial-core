/**
 * Headless layout pipeline: instance + spec → post-solver positions,
 * with no DOM and no d3.
 *
 * Mirrors the production reduced-iterations path used in
 * `WebColaCnDGraph.renderLayout` when prior positions are present
 * (webcola-cnd-graph.ts:1764-1772, :1806-1816), but invokes
 * `cola.Layout` directly so it can run inside vitest, downstream
 * eval scripts, or any other Node-side consumer.
 *
 * Intended for evaluation, not for production rendering. Do not
 * extend this with iteration or convergence knobs — production
 * tuning lives in the renderer; evaluation's job is to use the
 * production setup faithfully.
 */

import { Layout as ColaLayout } from 'webcola';
import { LayoutInstance } from '../layout/layoutinstance';
import type { LayoutSpec } from '../layout/layoutspec';
import type { IDataInstance } from '../data-instance/interfaces';
import type { LayoutConstraint } from '../layout/interfaces';
import { SGraphQueryEvaluator } from '../evaluators/data/sgq-evaluator';
import {
  WebColaTranslator,
  type LayoutState,
  type NodeWithMetadata,
  type WebColaLayoutOptions,
} from '../translators/webcola/webcolatranslator';
import type { SequencePolicy, SequencePolicyContext } from '../translators/webcola/sequence-policy';
import type { EdgeKey } from './consistency-metrics';

/**
 * Options for `runHeadlessLayout`.
 *
 * Two modes:
 *
 * 1. **Direct** — pass `priorPositions` and optionally
 *    `lockUnconstrainedNodes`. No policy invocation.
 * 2. **Policy-driven** — pass `policy`, `prevInstance`, `currInstance`.
 *    The API applies the policy and uses its `effectivePriorState`
 *    plus `useReducedIterations` (the latter as
 *    `lockUnconstrainedNodes`, matching the production gating in
 *    webcola-cnd-graph.ts:1676).
 *
 * If both are supplied the policy-driven path wins, matching
 * production semantics.
 */
export interface HeadlessLayoutOptions {
  /** Direct prior positions (used when no policy is provided). */
  priorPositions?: LayoutState;
  /** Direct lock flag (used when no policy is provided). */
  lockUnconstrainedNodes?: boolean;

  /** Sequence policy to apply. Requires `prevInstance` and `currInstance`. */
  policy?: SequencePolicy;
  /** Previous data instance, fed to the policy. */
  prevInstance?: IDataInstance;
  /**
   * Current data instance, fed to the policy. Usually the same object
   * as the `instance` argument but accepted explicitly so policies
   * can be tested with mismatched pairs.
   */
  currInstance?: IDataInstance;

  /** Figure width passed to the translator and solver. Default 800. */
  figWidth?: number;
  /** Figure height passed to the translator and solver. Default 600. */
  figHeight?: number;
}

/**
 * Result of `runHeadlessLayout`. Exposes the minimum surface needed
 * to compute consistency metrics, validate constraint satisfaction,
 * and inspect node geometry.
 */
export interface HeadlessLayoutResult {
  /**
   * Post-solver positions plus an identity transform, in the same
   * shape policies and `WebColaTranslator.priorPositions` use. Feed
   * this directly into `positionalConsistency` /
   * `relativeConsistency` as the "current frame".
   */
  positions: LayoutState;
  /**
   * Edge identities (`source`, `target`, `rel`) for the layout, used
   * to determine persistence by the relative-consistency metric.
   * Sourced from `InstanceLayout.edges` (pre-translation) so the
   * triples match what a downstream consumer can recover from a
   * separate run.
   */
  edges: EdgeKey[];
  /**
   * Source `LayoutConstraint`s (Left / Top / Alignment / etc.) as
   * produced by `LayoutInstance.generateLayout`. Use these to assert
   * post-solver satisfaction.
   */
  constraints: LayoutConstraint[];
  /**
   * The full `NodeWithMetadata` array after the solver has mutated
   * positions. Includes `visualWidth` / `visualHeight`, useful for
   * computing required separations when checking constraint
   * satisfaction.
   */
  nodes: NodeWithMetadata[];
}

const DEFAULT_FIG_WIDTH = 800;
const DEFAULT_FIG_HEIGHT = 600;

/**
 * Run the layout pipeline headlessly: build a LayoutInstance, generate
 * the InstanceLayout, translate to a WebColaLayout, run cola.Layout to
 * convergence under the production reduced-iterations schedule, and
 * return the post-solver state.
 *
 * @param spec     Parsed layout specification (from `parseLayoutSpec`).
 * @param instance Data instance to lay out.
 * @param options  Prior-state / policy options. See `HeadlessLayoutOptions`.
 *
 * @example
 *   const spec = parseLayoutSpec(specStr);
 *   const result = await runHeadlessLayout(spec, instance);
 *   // result.positions is the LayoutState; pass it to positionalConsistency
 *   // alongside a prior-frame LayoutState.
 */
export async function runHeadlessLayout(
  spec: LayoutSpec,
  instance: IDataInstance,
  options: HeadlessLayoutOptions = {}
): Promise<HeadlessLayoutResult> {
  const figWidth = options.figWidth ?? DEFAULT_FIG_WIDTH;
  const figHeight = options.figHeight ?? DEFAULT_FIG_HEIGHT;

  // Build the LayoutInstance with the production-default evaluator.
  // Evaluation does not need to vary this — production uses
  // SGraphQueryEvaluator behind every renderer entry point.
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
  const { layout } = layoutInstance.generateLayout(instance);

  // Resolve translator options. Policy-driven path mirrors
  // webcola-cnd-graph.ts:1645-1678.
  let translatorOptions: WebColaLayoutOptions | undefined;
  if (options.policy && options.prevInstance && options.currInstance) {
    const priorState: LayoutState = options.priorPositions ?? {
      positions: [],
      transform: { k: 1, x: 0, y: 0 },
    };
    const ctx: SequencePolicyContext = {
      priorState,
      prevInstance: options.prevInstance,
      currInstance: options.currInstance,
      spec,
    };
    const policyResult = options.policy.apply(ctx);
    if (policyResult.effectivePriorState) {
      translatorOptions = {
        priorPositions: policyResult.effectivePriorState,
        lockUnconstrainedNodes: policyResult.useReducedIterations,
      };
    }
  } else if (options.priorPositions) {
    translatorOptions = {
      priorPositions: options.priorPositions,
      lockUnconstrainedNodes: options.lockUnconstrainedNodes ?? false,
    };
  }

  const translator = new WebColaTranslator();
  const webcolaLayout = await translator.translate(
    layout,
    figWidth,
    figHeight,
    translatorOptions
  );

  // Solve. Iteration counts and convergence threshold match the
  // reduced-iterations production path used when prior positions are
  // present (webcola-cnd-graph.ts:1764-1772, :1803).
  const colaLayout = new ColaLayout()
    .linkDistance(150)
    .convergenceThreshold(0.1)
    .avoidOverlaps(true)
    .handleDisconnected(true)
    .nodes(webcolaLayout.colaNodes as any)
    .links(webcolaLayout.colaEdges as any)
    .constraints(webcolaLayout.colaConstraints as any[])
    .size([webcolaLayout.FIG_WIDTH, webcolaLayout.FIG_HEIGHT]);
  colaLayout.start(0, 10, 20, 1);

  const positions: LayoutState = {
    positions: webcolaLayout.colaNodes.map(n => ({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
    })),
    transform: { k: 1, x: 0, y: 0 },
  };

  const edges: EdgeKey[] = layout.edges.map(e => ({
    source: e.source.id,
    target: e.target.id,
    rel: e.relationName,
  }));

  return {
    positions,
    edges,
    constraints: layout.constraints,
    nodes: webcolaLayout.colaNodes,
  };
}
