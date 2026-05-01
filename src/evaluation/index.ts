/**
 * Public evaluation API for spytial-core.
 *
 * **Intended for evaluation, not for production rendering.**
 *
 * Provides three things downstream consistency-analysis consumers need:
 *
 *   1. `runHeadlessLayout` — runs the full
 *      LayoutInstance → WebColaTranslator → cola.Layout pipeline with
 *      no DOM dependency, returning post-solver positions plus the
 *      edges and constraints needed to score them.
 *   2. Three consistency metrics, each measuring a different notion of
 *      "the layout stayed the same":
 *        - `positionalConsistency`  — per-node coordinate preservation
 *          (Penlloy PLATEAU 2025 §6.2; Liang TOSEM 2026 positional cell).
 *        - `relativeConsistency`    — per-edge vector preservation
 *          (Penlloy §6.2; Liang TOSEM 2026 §2.6.1).
 *        - `pairwiseDistanceConsistency` — per-pair distance preservation
 *          ("shape" of a node subset; computational form of Liang
 *          TOSEM 2026 §3.4 partial-consistency).
 *   3. `classifyChangeEmphasisStableSet` — recovers the stable-vs-
 *      reflow node split for a partial-consistency policy from its
 *      output positions, with no SequencePolicy interface change.
 *
 * Typical recipe:
 *
 *   const prevResult = await runHeadlessLayout(spec, prevInstance);
 *   const currResult = await runHeadlessLayout(spec, currInstance, {
 *     policy: stability,
 *     prevInstance,
 *     currInstance,
 *     priorPositions: prevResult.positions,
 *   });
 *   const m = positionalConsistency(prevResult.positions, currResult.positions);
 *
 * See [docs/evaluation-api.md](../../docs/evaluation-api.md) for a
 * worked example.
 */

export {
  runHeadlessLayout,
  type HeadlessLayoutOptions,
  type HeadlessLayoutResult,
} from './headless-layout';

export {
  positionalConsistency,
  relativeConsistency,
  pairwiseDistanceConsistency,
  constraintAdherence,
  classifyChangeEmphasisStableSet,
  type EdgeKey,
  type ConstraintAdherenceNode,
} from './consistency-metrics';
