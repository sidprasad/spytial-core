import { describe, it, expect, beforeEach } from 'vitest';
import { PyretExpressionParser, PyretEvaluator, PyretEvaluationResult } from '../src/components/ReplInterface/parsers/PyretExpressionParser';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('PyretExpressionParser', () => {
  let instance: JSONDataInstance;
  let parser: PyretExpressionParser;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
  });

  describe('without external evaluator', () => {
    beforeEach(() => {
      parser = new PyretExpressionParser();
    });

    it('should not handle any commands when no evaluator is available', () => {
      expect(parser.canHandle('edge("1", "label", 3)')).toBe(false);
      expect(parser.canHandle('[list: 1, 2, 3]')).toBe(false);
      expect(parser.canHandle('tree(node(1, empty, empty))')).toBe(false);
    });

    it('should return error when trying to execute without evaluator', () => {
      const result = parser.execute('edge("1", "label", 3)', instance);
      expect(result.success).toBe(false);
      expect(result.message).toContain('No external Pyret evaluator available');
    });

    it('should indicate evaluator unavailable in help', () => {
      const help = parser.getHelp();
      expect(help.join('\n')).toContain('External Pyret evaluator not available');
    });
  });

  describe('with external evaluator', () => {
    let mockEvaluator: PyretEvaluator;

    beforeEach(() => {
      mockEvaluator = {
        run: async (code: string) => ({
          success: true,
          result: { dict: { value: 42 }, brands: { '$brandtest': true } }
        }),
        runtime: {
          isSuccessResult: (result: PyretEvaluationResult) => result.success === true
        }
      };
      parser = new PyretExpressionParser(mockEvaluator);
    });

    it('should handle Pyret function calls', () => {
      expect(parser.canHandle('edge("1", "label", 3)')).toBe(true);
      expect(parser.canHandle('tree(node(1, empty, empty))')).toBe(true);
      expect(parser.canHandle('func(arg1, arg2)')).toBe(true);
    });

    it('should handle Pyret lists with brackets', () => {
      expect(parser.canHandle('[list: 1, 2, 3, 4]')).toBe(true);
      expect(parser.canHandle('[set: "a", "b", "c"]')).toBe(true);
    });

    it('should handle Pyret table syntax', () => {
      expect(parser.canHandle('table: name, age row: "Alice", 25 end')).toBe(true);
      expect(parser.canHandle('row: "Bob", 30')).toBe(true);
    });

    it('should not handle simple atom syntax', () => {
      expect(parser.canHandle('Alice:Person')).toBe(false);
      expect(parser.canHandle('id=Label:Type')).toBe(false);
    });

    it('should not handle simple dot notation', () => {
      expect(parser.canHandle('alice.friend=bob')).toBe(false);
    });

    it('should not handle remove commands', () => {
      expect(parser.canHandle('remove alice')).toBe(false);
      expect(parser.canHandle('remove Alice:Person')).toBe(false);
    });

    it('should not handle utility commands', () => {
      expect(parser.canHandle('help')).toBe(false);
      expect(parser.canHandle('info')).toBe(false);
      expect(parser.canHandle('clear')).toBe(false);
    });

    it('should have lower priority than specific parsers', () => {
      expect(parser.getPriority()).toBe(90);
    });

    it('should provide appropriate command patterns', () => {
      const patterns = parser.getCommandPatterns();
      expect(patterns).toContain('[list: 1, 2, 3, 4]');
      expect(patterns).toHaveLength(1); // Only show list for now
    });

    it('should indicate evaluator available in help', () => {
      const help = parser.getHelp();
      expect(help.join('\n')).toContain('External Pyret evaluator is available');
    });

    it('should execute and provide informational message', () => {
      const result = parser.execute('edge("1", "label", 3)', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Pyret evaluator detected!');
      expect(result.message).toContain('edge("1", "label", 3)');
      expect(result.action).toBe('info');
    });

    it('should allow updating evaluator after construction', () => {
      const newParser = new PyretExpressionParser();
      expect(newParser.canHandle('edge("1", "label", 3)')).toBe(false);
      
      newParser.setEvaluator(mockEvaluator);
      expect(newParser.canHandle('edge("1", "label", 3)')).toBe(true);
    });

    it('should allow removing evaluator', () => {
      expect(parser.canHandle('edge("1", "label", 3)')).toBe(true);
      
      parser.setEvaluator(null);
      expect(parser.canHandle('edge("1", "label", 3)')).toBe(false);
    });
  });

  describe('evaluator failure handling', () => {
    let mockFailureEvaluator: PyretEvaluator;

    beforeEach(() => {
      mockFailureEvaluator = {
        run: async (code: string) => ({
          success: false,
          exn: 'Mock evaluation error'
        }),
        runtime: {
          isSuccessResult: (result: PyretEvaluationResult) => result.success === true
        }
      };
      parser = new PyretExpressionParser(mockFailureEvaluator);
    });

    it('should handle evaluator errors gracefully', () => {
      const result = parser.execute('invalid-expression()', instance);
      expect(result.success).toBe(true); // Our current implementation returns success for detection
      expect(result.message).toContain('Pyret evaluator detected!');
    });
  });
});