/**
 * Error message modal system for displaying constraint conflicts and parse errors
 * Designed for tree-shaking and minimal bundle impact
 */

export { ErrorMessageModal } from './ErrorMessageModal';
export { ErrorMessageContainer } from './ErrorMessageContainer';
export { ErrorStateManager } from './ErrorStateManager';
export type { ErrorMessageContainerProps } from './ErrorMessageContainer';
export type { SystemError } from './ErrorStateManager';
export type { ErrorMessages, GroupOverlapError } from '../../layout/constraint-validator';