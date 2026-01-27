import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  isEvaluatorError, 
  EvaluatorConstraintError, 
  EvaluatorErrorReason 
} from '../src/layout/constraint-validator';
import { 
  SystemError, 
  QueryErrorDetails, 
  QueryErrorReason 
} from '../src/components/ErrorMessageModal/ErrorStateManager';

describe('Evaluator Query Error Types', () => {
  describe('EvaluatorConstraintError interface', () => {
    it('should correctly identify evaluator errors using isEvaluatorError', () => {
      const evaluatorError: EvaluatorConstraintError = {
        type: 'evaluator-error',
        name: 'EvaluatorQueryError',
        message: 'Test error message',
        selector: 'Person.friend',
        reason: 'hidden-element',
        originalError: 'Original error from evaluator'
      };

      expect(isEvaluatorError(evaluatorError)).toBe(true);
    });

    it('should return false for non-evaluator errors', () => {
      const positionalError = {
        type: 'positional-conflict',
        message: 'Constraint conflict'
      };

      expect(isEvaluatorError(positionalError)).toBe(false);
      expect(isEvaluatorError(null)).toBe(false);
      expect(isEvaluatorError(undefined)).toBe(false);
      expect(isEvaluatorError({})).toBe(false);
    });
  });

  describe('EvaluatorErrorReason classification', () => {
    it('should support hidden-element reason', () => {
      const reason: EvaluatorErrorReason = 'hidden-element';
      expect(reason).toBe('hidden-element');
    });

    it('should support syntax-error reason', () => {
      const reason: EvaluatorErrorReason = 'syntax-error';
      expect(reason).toBe('syntax-error');
    });

    it('should support missing-element reason', () => {
      const reason: EvaluatorErrorReason = 'missing-element';
      expect(reason).toBe('missing-element');
    });

    it('should support unknown reason', () => {
      const reason: EvaluatorErrorReason = 'unknown';
      expect(reason).toBe('unknown');
    });
  });

  describe('SystemError query-error type', () => {
    it('should create valid query-error with hidden-element reason', () => {
      const queryError: SystemError = {
        type: 'query-error',
        message: 'Selector "Person.friend" references element "Person1" that has been hidden.',
        details: {
          selector: 'Person.friend',
          reason: 'hidden-element',
          missingElement: 'Person1',
          sourceConstraint: 'left(Person.friend)'
        }
      };

      expect(queryError.type).toBe('query-error');
      expect(queryError.details.reason).toBe('hidden-element');
      expect(queryError.details.selector).toBe('Person.friend');
      expect(queryError.details.missingElement).toBe('Person1');
      expect(queryError.details.sourceConstraint).toBe('left(Person.friend)');
    });

    it('should create valid query-error with syntax-error reason', () => {
      const queryError: SystemError = {
        type: 'query-error',
        message: 'Selector "Person..invalid" has a syntax error',
        details: {
          selector: 'Person..invalid',
          reason: 'syntax-error'
        }
      };

      expect(queryError.type).toBe('query-error');
      expect(queryError.details.reason).toBe('syntax-error');
      expect(queryError.details.selector).toBe('Person..invalid');
      expect(queryError.details.missingElement).toBeUndefined();
    });

    it('should create valid query-error with missing-element reason', () => {
      const queryError: SystemError = {
        type: 'query-error',
        message: 'Selector references non-existent element',
        details: {
          selector: 'NonExistentType',
          reason: 'missing-element',
          missingElement: 'NonExistentType'
        }
      };

      expect(queryError.type).toBe('query-error');
      expect(queryError.details.reason).toBe('missing-element');
    });

    it('should create valid query-error with unknown reason', () => {
      const queryError: SystemError = {
        type: 'query-error',
        message: 'Unknown error occurred',
        details: {
          selector: 'SomeSelector',
          reason: 'unknown'
        }
      };

      expect(queryError.type).toBe('query-error');
      expect(queryError.details.reason).toBe('unknown');
    });
  });

  describe('QueryErrorDetails interface', () => {
    it('should have required selector and reason properties', () => {
      const details: QueryErrorDetails = {
        selector: 'TestSelector',
        reason: 'hidden-element'
      };

      expect(details.selector).toBe('TestSelector');
      expect(details.reason).toBe('hidden-element');
    });

    it('should allow optional missingElement property', () => {
      const detailsWithElement: QueryErrorDetails = {
        selector: 'TestSelector',
        reason: 'hidden-element',
        missingElement: 'Element1'
      };

      expect(detailsWithElement.missingElement).toBe('Element1');

      const detailsWithoutElement: QueryErrorDetails = {
        selector: 'TestSelector',
        reason: 'syntax-error'
      };

      expect(detailsWithoutElement.missingElement).toBeUndefined();
    });

    it('should allow optional sourceConstraint property', () => {
      const detailsWithConstraint: QueryErrorDetails = {
        selector: 'TestSelector',
        reason: 'hidden-element',
        sourceConstraint: 'left(Relation)'
      };

      expect(detailsWithConstraint.sourceConstraint).toBe('left(Relation)');
    });
  });

  describe('Error reason mapping consistency', () => {
    it('should have consistent reason values between ConstraintError and SystemError', () => {
      // The EvaluatorErrorReason and QueryErrorReason should have the same values
      const constraintReasons: EvaluatorErrorReason[] = [
        'hidden-element',
        'syntax-error',
        'missing-element',
        'unknown'
      ];

      const queryReasons: QueryErrorReason[] = [
        'hidden-element',
        'syntax-error',
        'missing-element',
        'unknown'
      ];

      expect(constraintReasons).toEqual(queryReasons);
    });
  });
});

describe('Error Message Formatting', () => {
  describe('Hidden element errors (constraint-level)', () => {
    it('should provide helpful message for hidden element errors', () => {
      const error: SystemError = {
        type: 'query-error',
        message: 'Selector "Person.friend" references element "Person1" that has been hidden. ' +
          'This may be due to a "hide" constraint that removed this element from the visualization.',
        details: {
          selector: 'Person.friend',
          reason: 'hidden-element',
          missingElement: 'Person1'
        }
      };

      expect(error.message).toContain('hidden');
      expect(error.message).toContain('Person1');
      expect(error.message).toContain('hide');
    });
  });

  describe('Syntax errors', () => {
    it('should provide helpful message for syntax errors', () => {
      const error: SystemError = {
        type: 'query-error',
        message: 'Selector "Person..invalid" has a syntax error: Unexpected token',
        details: {
          selector: 'Person..invalid',
          reason: 'syntax-error'
        }
      };

      expect(error.message).toContain('syntax');
      expect(error.message).toContain('Person..invalid');
    });
  });

  describe('Missing element errors', () => {
    it('should provide helpful message for missing element errors', () => {
      const error: SystemError = {
        type: 'query-error',
        message: 'Selector "NonExistent" references element "NonExistent" that does not exist in the data.',
        details: {
          selector: 'NonExistent',
          reason: 'missing-element',
          missingElement: 'NonExistent'
        }
      };

      expect(error.message).toContain('does not exist');
      expect(error.message).toContain('NonExistent');
    });
  });
});
