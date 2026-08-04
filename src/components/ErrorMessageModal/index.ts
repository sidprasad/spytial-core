/**
 * Error message modal system for displaying constraint conflicts and parse errors
 * Designed for tree-shaking and minimal bundle impact
 */

export { ErrorMessageModal } from './ErrorMessageModal';
export { ErrorMessageContainer } from './ErrorMessageContainer';
export { ErrorStateManager } from './ErrorStateManager';
export type { ErrorMessageContainerProps } from './ErrorMessageContainer';
export type { SystemError, SelectorErrorDetail } from './ErrorStateManager';
// Straight from constraint-types, which DEFINES these. Going through
// constraint-validator (which only re-exports them for back-compat) pulled the
// deprecated Kiwi/Cassowary validator — and with it kiwi.js — into every bundle
// that touches the modal, for one type guard.
export type { ErrorMessages, GroupOverlapError, HiddenNodeConflictError } from '../../layout/constraint-types';
export { isHiddenNodeConflictError } from '../../layout/constraint-types';