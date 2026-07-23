/**
 * Historical home of the error state manager. The implementation moved to
 * src/layout/error-state.ts so core layout code can depend on it without
 * reaching into components/. This shim keeps every existing import path
 * (ErrorMessageContainer, react-component-integration.tsx, external users)
 * working unchanged.
 */
export { ErrorStateManager } from '../../layout/error-state';
export type { SystemError, SelectorErrorDetail } from '../../layout/error-state';
