import type { ErrorMessages, GroupOverlapError } from './index';

/**
 * Categorizes the reason why an evaluator query failed.
 * This helps determine how to present the error to the user.
 */
export type QueryErrorReason = 
  /** The query references an element that was hidden by a hide constraint */
  | 'hidden-element'
  /** The query has a syntax error */
  | 'syntax-error'
  /** The query references an element that doesn't exist (not due to hiding) */
  | 'missing-element'
  /** Unknown or general query error */
  | 'unknown';

/**
 * Details about a query error for structured error reporting
 */
export interface QueryErrorDetails {
  /** The original selector/expression that failed */
  selector: string;
  /** The reason the query failed */
  reason: QueryErrorReason;
  /** Optional: the element that was referenced but not found */
  missingElement?: string;
  /** Optional: the source constraint that caused this error */
  sourceConstraint?: string;
}

/**
 * Represents different types of errors that can occur in the system
 */
export type SystemError = {
  type: 'parse-error';
  message: string;
  source?: string;
} | {
  type: 'positional-error';
  messages: ErrorMessages;
} | {
  type: 'group-overlap-error';  // New type
  message: string;
  source?: string;
} | {
  type: 'query-error';
  message: string;
  /** Detailed information about the query error */
  details: QueryErrorDetails;
} | {
  type: 'general-error';
  message: string;
};

/**
 * Minimal error state manager for handling different error types
 * Follows functional programming principles with immutable state
 */
export class ErrorStateManager {
  private currentError: SystemError | null = null;
  private errorCallbacks: ((error: SystemError | null) => void)[] = [];

  /**
   * Set the current error state
   * @param error - The error to set, or null to clear
   */
  public setError(error: SystemError | null): void {
    this.currentError = error;
    this.notifyCallbacks();
  }

  /**
   * Clear the current error state
   */
  public clearError(): void {
    this.currentError = null;
    this.notifyCallbacks();
  }

  /**
   * Get the current error state
   * @returns Current error or null if no error
   */
  public getCurrentError(): SystemError | null {
    return this.currentError;
  }

  /**
   * Subscribe to error state changes
   * @param callback - Function to call when error state changes
   */
  public onErrorChange(callback: (error: SystemError | null) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Check if there's currently an error
   * @returns True if there's an active error
   */
  public hasError(): boolean {
    return this.currentError !== null;
  }

  /**
   * Notify all subscribed callbacks of error state change
   */
  private notifyCallbacks(): void {
    this.errorCallbacks.forEach(callback => callback(this.currentError));
  }
}