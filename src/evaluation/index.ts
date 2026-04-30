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
 *   2. `positionalConsistency` / `relativeConsistency` — Penlloy's two
 *      consistency metrics (PLATEAU 2025 §6.2), as plain pure
 *      functions over `LayoutState`.
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
  classifyChangeEmphasisStableSet,
  type EdgeKey,
} from './penlloy-metrics';
