/**
 * Re-exports the canonical metrics from spytial-core. No reimplementation.
 */
export {
  runHeadlessLayout,
  type HeadlessLayoutOptions,
  type HeadlessLayoutResult,
} from '../../src/evaluation/headless-layout';

export {
  positionalConsistency,
  relativeConsistency,
  pairwiseDistanceConsistency,
  changeEmphasisSeparation,
  constraintAdherence,
  classifyChangeEmphasisStableSet,
  // Misue mental-map battery
  orthogonalOrderingPreservation,
  knnJaccard,
  edgeCrossings,
  edgeCrossingsDelta,
  directionalCoherence,
  stableQuietRatio,
  // Constraint-perturbation moderator
  constraintPerturbation,
  type EdgeKey,
  type CrossingEdge,
  type ChangeEmphasisSeparation,
  type ConstraintAdherenceNode,
} from '../../src/evaluation/consistency-metrics';

export {
  positionalOracle,
  pairwiseDistanceOracle,
  type PairwiseDistanceOracleOptions,
} from '../../src/evaluation/oracle-layouts';

export { classifyChangeEmphasisChangedSet } from '../../src/translators/webcola/sequence-policy';

export { JSONDataInstance } from '../../src/data-instance/json-data-instance';
export { parseLayoutSpec } from '../../src/layout/layoutspec';
