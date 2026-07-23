/**
 * Public React component surface — the source of the npm `spytial-core/react`
 * entry. These components left the default entry in 4.0.0 so that
 * `import { ... } from 'spytial-core'` no longer pays for React or the
 * CodeMirror spec editor.
 *
 * CDN pages don't import this: they load
 * dist/components/react-component-integration.global.js, which additionally
 * provides the window.mount* API (mountErrorMessageModal,
 * mountCndLayoutInterface, updateSpecFromReact, ...) that spytial-py,
 * spytial-rust, spytial-gdl, spytial-lean, and copeanddrag drive.
 */

// Error modal (the state manager itself lives in layout/error-state and is
// also exported from the core entry — UI-free by design).
export { ErrorMessageModal, ErrorMessageContainer, ErrorStateManager } from './ErrorMessageModal';
export type { ErrorMessageContainerProps, SystemError, SelectorErrorDetail } from './ErrorMessageModal';

// Instance authoring
export { InstanceBuilder } from './InstanceBuilder/InstanceBuilder';
export type { InstanceBuilderProps } from './InstanceBuilder/InstanceBuilder';

// REPL interfaces
export { ReplInterface } from './ReplInterface/ReplInterface';
export type { ReplInterfaceProps } from './ReplInterface/ReplInterface';
export { PyretReplInterface } from './ReplInterface/PyretReplInterface';
export type { PyretReplInterfaceProps } from './ReplInterface/PyretReplInterface';
export { ReplWithVisualization } from './ReplInterface/ReplWithVisualization';
export type { ReplWithVisualizationProps } from './ReplInterface/ReplWithVisualization';
export { PyretExpressionParser } from './ReplInterface/parsers/PyretExpressionParser';
export type { PyretEvaluator, PyretEvaluationResult } from './ReplInterface/parsers/PyretExpressionParser';

// Projections
export { ProjectionControls, ProjectionOrchestrator } from './ProjectionControls';
export type {
  ProjectionControlsProps,
  ProjectionChoice,
  ProjectionOrchestratorProps,
  ProjectionOrchestratorResult,
} from './ProjectionControls';

// Spec authoring (embeds the CodeMirror-based SpecEditor)
export { CndLayoutInterface } from './CndLayoutInterface';
export type { CndLayoutInterfaceProps } from './CndLayoutInterface';
// Assistant hooks, re-exported so React hosts don't need the spec-editor entry
// just to type the objects they pass to CndLayoutInterface.
export type {
  SelectorAssistant,
  SelectorAssistContext,
  Completion,
  LayoutAssistant,
  LayoutAssistContext,
  LayoutSuggestionResult,
  LayoutSuggestionDetail,
  LayoutSuggestionConfidence,
  LayoutSuggestionOutcome,
} from '../spec-editor';
export { generateLayoutSpecYaml, parseLayoutSpecToData } from './NoCodeView';
export type { ConstraintData, DirectiveData } from './NoCodeView';

// Auxiliary widgets
export { EvaluatorRepl } from './EvaluatorRepl/EvaluatorRepl';
export { RelationHighlighter } from './RelationHighlighter/RelationHighlighter';
