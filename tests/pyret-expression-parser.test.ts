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

    it('should return error when trying to execute without evaluator', async () => {
      const result = await parser.execute('edge("1", "label", 3)', instance);
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
      expect(patterns).toContain('reify'); // Now includes reify and edge pattern
      expect(patterns.length).toBeGreaterThan(1); // Multiple patterns now
    });

    it('should indicate evaluator available in help', () => {
      const help = parser.getHelp();
      expect(help.join('\n')).toContain('External Pyret evaluator is available');
    });

    it('should execute and provide result through async operation', async () => {
      // Mock a successful evaluation
      const mockResult = {
        result: {
          dict: {
            v: {
              val: {
                modules: {
                  '$interactions://1': {
                    dict: {
                      answer: { value: 1, label: 'test' }
                    }
                  }
                }
              }
            }
          }
        }
      };
      mockEvaluator.run = vi.fn().mockResolvedValue(mockResult);

      const result = await parser.execute('edge("1", "label", 3)', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Evaluated Pyret expression');
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

    it('should handle reify command', async () => {
      // Add some test data to the instance
      instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
      instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });

      const result = await parser.execute('reify', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Alice:Person');
      expect(result.message).toContain('Bob:Person');
      expect(result.message).toContain('alice.friend=bob');
      expect(result.action).toBe('info');
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

    it('should handle evaluator errors gracefully', async () => {
      // Create a parser with failure evaluator for this test
      const mockFailureEvaluator = {
        run: vi.fn().mockResolvedValue({
          result: {
            exn: 'Test evaluation error'
          }
        }),
        runtime: {
          isSuccessResult: (result: PyretEvaluationResult) => result.success === true
        }
      };
      const failureParser = new PyretExpressionParser(mockFailureEvaluator);

      const result = await failureParser.execute('invalid-expression()', instance);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Evaluation failed');
    });
  });
});