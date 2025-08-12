import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorStateManager, type SystemError } from '../src/components/ErrorMessageModal/ErrorStateManager';

describe('ErrorStateManager', () => {
  let errorStateManager: ErrorStateManager;

  beforeEach(() => {
    errorStateManager = new ErrorStateManager();
  });

  describe('setError', () => {
    it('should set currentError with a SystemError object', () => {
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax',
        source: 'test-source'
      };

      errorStateManager.setError(parseError);
      
      expect(errorStateManager.getCurrentError()).toEqual(parseError);
    });

    it('should set currentError with null', () => {
      // First set an error
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax'
      };
      errorStateManager.setError(parseError);
      
      // Then set it to null
      errorStateManager.setError(null);
      
      expect(errorStateManager.getCurrentError()).toBeNull();
    });

    it('should notify all error callbacks when setting an error', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      
      errorStateManager.onErrorChange(callback1);
      errorStateManager.onErrorChange(callback2);
      errorStateManager.onErrorChange(callback3);

      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax'
      };

      errorStateManager.setError(parseError);

      expect(callback1).toHaveBeenCalledWith(parseError);
      expect(callback2).toHaveBeenCalledWith(parseError);
      expect(callback3).toHaveBeenCalledWith(parseError);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it('should notify all error callbacks when setting error to null', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      errorStateManager.onErrorChange(callback1);
      errorStateManager.onErrorChange(callback2);

      errorStateManager.setError(null);

      expect(callback1).toHaveBeenCalledWith(null);
      expect(callback2).toHaveBeenCalledWith(null);
    });

    it('should handle different SystemError types', () => {
      const callback = vi.fn();
      errorStateManager.onErrorChange(callback);

      // Test positional-error type
      const positionalError: SystemError = {
        type: 'positional-error',
        messages: { atoms: [], constraints: [] }
      };
      errorStateManager.setError(positionalError);
      expect(errorStateManager.getCurrentError()).toEqual(positionalError);
      expect(callback).toHaveBeenCalledWith(positionalError);

      // Test group-overlap-error type
      const groupOverlapError: SystemError = {
        type: 'group-overlap-error',
        message: 'Groups overlap',
        source: 'test-source'
      };
      errorStateManager.setError(groupOverlapError);
      expect(errorStateManager.getCurrentError()).toEqual(groupOverlapError);
      expect(callback).toHaveBeenCalledWith(groupOverlapError);

      // Test general-error type
      const generalError: SystemError = {
        type: 'general-error',
        message: 'Something went wrong'
      };
      errorStateManager.setError(generalError);
      expect(errorStateManager.getCurrentError()).toEqual(generalError);
      expect(callback).toHaveBeenCalledWith(generalError);
    });
  });

  describe('clearError', () => {
    it('should set currentError to null', () => {
      // First set an error
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax'
      };
      errorStateManager.setError(parseError);
      expect(errorStateManager.getCurrentError()).toEqual(parseError);
      
      // Then clear it
      errorStateManager.clearError();
      
      expect(errorStateManager.getCurrentError()).toBeNull();
    });

    it('should notify all error callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      
      errorStateManager.onErrorChange(callback1);
      errorStateManager.onErrorChange(callback2);
      errorStateManager.onErrorChange(callback3);

      errorStateManager.clearError();

      expect(callback1).toHaveBeenCalledWith(null);
      expect(callback2).toHaveBeenCalledWith(null);
      expect(callback3).toHaveBeenCalledWith(null);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it('should clear error even when currentError is already null', () => {
      const callback = vi.fn();
      errorStateManager.onErrorChange(callback);
      
      // clearError when already null
      errorStateManager.clearError();
      
      expect(errorStateManager.getCurrentError()).toBeNull();
      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('getCurrentError', () => {
    it('should return currentError when an error is set', () => {
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax',
        source: 'test-source'
      };

      errorStateManager.setError(parseError);
      
      expect(errorStateManager.getCurrentError()).toEqual(parseError);
    });

    it('should return null when no error is set', () => {
      expect(errorStateManager.getCurrentError()).toBeNull();
    });

    it('should return null after clearing an error', () => {
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax'
      };

      errorStateManager.setError(parseError);
      errorStateManager.clearError();
      
      expect(errorStateManager.getCurrentError()).toBeNull();
    });
  });

  describe('onErrorChange', () => {
    it('should add the given callback to errorCallbacks', () => {
      const callback = vi.fn();
      
      errorStateManager.onErrorChange(callback);
      
      // Trigger a notification to verify the callback was added
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };
      errorStateManager.setError(parseError);
      
      expect(callback).toHaveBeenCalledWith(parseError);
    });

    it('should add multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      
      errorStateManager.onErrorChange(callback1);
      errorStateManager.onErrorChange(callback2);
      errorStateManager.onErrorChange(callback3);
      
      // Trigger a notification to verify all callbacks were added
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };
      errorStateManager.setError(parseError);
      
      expect(callback1).toHaveBeenCalledWith(parseError);
      expect(callback2).toHaveBeenCalledWith(parseError);
      expect(callback3).toHaveBeenCalledWith(parseError);
    });

    it('should preserve order of callbacks', () => {
      const callOrder: number[] = [];
      const callback1 = vi.fn(() => callOrder.push(1));
      const callback2 = vi.fn(() => callOrder.push(2));
      const callback3 = vi.fn(() => callOrder.push(3));
      
      errorStateManager.onErrorChange(callback1);
      errorStateManager.onErrorChange(callback2);
      errorStateManager.onErrorChange(callback3);
      
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };
      errorStateManager.setError(parseError);
      
      expect(callOrder).toEqual([1, 2, 3]);
    });
  });

  describe('hasError', () => {
    it('should return true if currentError is not null', () => {
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax'
      };

      errorStateManager.setError(parseError);
      
      expect(errorStateManager.hasError()).toBe(true);
    });

    it('should return false if currentError is null', () => {
      expect(errorStateManager.hasError()).toBe(false);
    });

    it('should return false after clearing an error', () => {
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Invalid syntax'
      };

      errorStateManager.setError(parseError);
      expect(errorStateManager.hasError()).toBe(true);
      
      errorStateManager.clearError();
      expect(errorStateManager.hasError()).toBe(false);
    });

    it('should return true for all SystemError types', () => {
      const errors: SystemError[] = [
        { type: 'parse-error', message: 'Parse error' },
        { type: 'positional-error', messages: { atoms: [], constraints: [] } },
        { type: 'group-overlap-error', message: 'Overlap error' },
        { type: 'general-error', message: 'General error' }
      ];

      errors.forEach(error => {
        errorStateManager.setError(error);
        expect(errorStateManager.hasError()).toBe(true);
        errorStateManager.clearError();
      });
    });
  });

  describe('notifyCallbacks', () => {
    it('should call each callback in errorCallbacks when errorCallbacks is empty', () => {
      // notifyCallbacks is private, but we can test it indirectly through setError
      // When no callbacks are registered, setError should not throw an error
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };

      expect(() => errorStateManager.setError(parseError)).not.toThrow();
      expect(errorStateManager.getCurrentError()).toEqual(parseError);
    });

    it('should call each callback in errorCallbacks when errorCallbacks has one element', () => {
      const callback = vi.fn();
      errorStateManager.onErrorChange(callback);
      
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };
      
      errorStateManager.setError(parseError);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(parseError);
    });

    it('should call each callback in errorCallbacks when errorCallbacks has multiple elements', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      const callback4 = vi.fn();
      
      errorStateManager.onErrorChange(callback1);
      errorStateManager.onErrorChange(callback2);
      errorStateManager.onErrorChange(callback3);
      errorStateManager.onErrorChange(callback4);
      
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };
      
      errorStateManager.setError(parseError);
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
      expect(callback4).toHaveBeenCalledTimes(1);
      
      expect(callback1).toHaveBeenCalledWith(parseError);
      expect(callback2).toHaveBeenCalledWith(parseError);
      expect(callback3).toHaveBeenCalledWith(parseError);
      expect(callback4).toHaveBeenCalledWith(parseError);
    });

    it('should call callbacks with current error state for both setError and clearError', () => {
      const callback = vi.fn();
      errorStateManager.onErrorChange(callback);
      
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };
      
      // Test setError notification
      errorStateManager.setError(parseError);
      expect(callback).toHaveBeenNthCalledWith(1, parseError);
      
      // Test clearError notification
      errorStateManager.clearError();
      expect(callback).toHaveBeenNthCalledWith(2, null);
      
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should handle callback exceptions by propagating them', () => {
      const throwingCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();
      
      errorStateManager.onErrorChange(throwingCallback);
      errorStateManager.onErrorChange(normalCallback);
      
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Test error'
      };
      
      // The current implementation will throw if a callback throws
      expect(() => errorStateManager.setError(parseError)).toThrow('Callback error');
      
      // The throwing callback should be called
      expect(throwingCallback).toHaveBeenCalledWith(parseError);
      // The normal callback should not be called due to the exception
      expect(normalCallback).not.toHaveBeenCalled();
    });
  });
});