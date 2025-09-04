/**
 * Tests for Python Evaluator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PythonEvaluator } from '../src/evaluators/python-evaluator';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('PythonEvaluator', () => {
  let evaluator: PythonEvaluator;
  let dataInstance: JSONDataInstance;

  beforeEach(() => {
    evaluator = new PythonEvaluator();
    dataInstance = new JSONDataInstance({
      atoms: [
        { id: 'user1', type: 'User', label: 'Alice' },
        { id: 'user2', type: 'User', label: 'Bob' }
      ],
      relations: [
        {
          id: 'follows1',
          name: 'follows',
          types: ['User', 'User'],
          tuples: [{ atoms: ['user1', 'user2'], types: ['User', 'User'] }]
        }
      ]
    });
    
    evaluator.initialize({ sourceData: dataInstance });
  });

  describe('Initialization', () => {
    it('should initialize with data instance', () => {
      expect(evaluator.isReady()).toBe(true);
    });

    it('should not be ready before initialization', () => {
      const newEvaluator = new PythonEvaluator();
      expect(newEvaluator.isReady()).toBe(false);
    });
  });

  describe('Python Constants', () => {
    it('should handle True constant', () => {
      const result = evaluator.evaluate('True');
      expect(result.singleResult()).toBe(true);
    });

    it('should handle False constant', () => {
      const result = evaluator.evaluate('False');
      expect(result.singleResult()).toBe(false);
    });

    it('should handle None constant', () => {
      const result = evaluator.evaluate('None');
      expect(result.noResult()).toBe(true);
    });
  });

  describe('Python Built-in Functions', () => {
    it('should evaluate len() function', () => {
      const result = evaluator.evaluate('len([1, 2, 3, 4, 5])');
      expect(result.singleResult()).toBe(5);
    });

    it('should evaluate range() function', () => {
      const result = evaluator.evaluate('range(5)');
      expect(result.selectedTuplesAll()).toEqual([['0'], ['1'], ['2'], ['3'], ['4']]);
    });

    it('should evaluate range() with start and stop', () => {
      const result = evaluator.evaluate('range(2, 5)');
      expect(result.selectedTuplesAll()).toEqual([['2'], ['3'], ['4']]);
    });

    it('should evaluate sum() function', () => {
      const result = evaluator.evaluate('sum([1, 2, 3, 4, 5])');
      expect(result.singleResult()).toBe(15);
    });

    it('should evaluate max() function', () => {
      const result = evaluator.evaluate('max(10, 20, 5, 15)');
      expect(result.singleResult()).toBe(20);
    });

    it('should evaluate min() function', () => {
      const result = evaluator.evaluate('min(10, 20, 5, 15)');
      expect(result.singleResult()).toBe(5);
    });

    it('should evaluate abs() function', () => {
      const result = evaluator.evaluate('abs(-42)');
      expect(result.singleResult()).toBe(42);
    });
  });

  describe('Python Data Types', () => {
    it('should create lists', () => {
      const result = evaluator.evaluate('list([1, 2, 3])');
      expect(result.selectedTuplesAll()).toEqual([['1'], ['2'], ['3']]);
    });

    it('should create tuples', () => {
      const result = evaluator.evaluate('tuple(1, 2, 3)');
      expect(result.selectedTuplesAll()).toEqual([['1'], ['2'], ['3']]);
    });

    it('should create dictionaries', () => {
      const result = evaluator.evaluate('dict({"a": 1, "b": 2})');
      expect(result.isSingleton()).toBe(true);
      // The result should be a stringified dictionary
      const dictResult = result.singleResult() as string;
      expect(dictResult).toContain('a');
      expect(dictResult).toContain('b');
    });
  });

  describe('List Comprehensions', () => {
    it('should evaluate simple list comprehension', () => {
      const result = evaluator.evaluate('[x for x in range(5)]');
      expect(result.selectedTuplesAll()).toEqual([['0'], ['1'], ['2'], ['3'], ['4']]);
    });

    it('should evaluate list comprehension with condition', () => {
      const result = evaluator.evaluate('[x for x in range(10) if x % 2 == 0]');
      expect(result.selectedTuplesAll()).toEqual([['0'], ['2'], ['4'], ['6'], ['8']]);
    });

    it('should evaluate list comprehension with transformation', () => {
      const result = evaluator.evaluate('[x * 2 for x in range(3)]');
      expect(result.selectedTuplesAll()).toEqual([['0'], ['2'], ['4']]);
    });
  });

  describe('Python Operators', () => {
    it('should handle power operator **', () => {
      const result = evaluator.evaluate('2 ** 3');
      expect(result.singleResult()).toBe(8);
    });

    it('should handle floor division //', () => {
      const result = evaluator.evaluate('7 // 2');
      expect(result.singleResult()).toBe(3);
    });
  });

  describe('Data Creation Functions', () => {
    it('should create atoms', () => {
      const result = evaluator.evaluate('atom("test1", "TestType", "Test Label")');
      expect(result.isSingleton()).toBe(true);
      const atomData = JSON.parse(result.singleResult() as string);
      expect(atomData.id).toBe('test1');
      expect(atomData.type).toBe('TestType');
      expect(atomData.label).toBe('Test Label');
    });

    it('should create relations', () => {
      const result = evaluator.evaluate('relation("rel1", "testRel", "atom1", "atom2")');
      expect(result.isSingleton()).toBe(true);
      const relData = JSON.parse(result.singleResult() as string);
      expect(relData.id).toBe('rel1');
      expect(relData.name).toBe('testRel');
      expect(relData.from).toBe('atom1');
      expect(relData.to).toBe('atom2');
    });
  });

  describe('Print Function', () => {
    it('should handle print function', () => {
      const result = evaluator.evaluate('print("Hello, World!")');
      expect(result.isError()).toBe(false);
      // The print function returns the printed value
      expect(result.singleResult()).toBe('Hello, World!');
    });

    it('should handle print with multiple arguments', () => {
      const result = evaluator.evaluate('print("Hello", "World", 123)');
      expect(result.isError()).toBe(false);
    });
  });

  describe('Python Formatting', () => {
    it('should format strings with quotes in pretty print', () => {
      const result = evaluator.evaluate('"hello world"');
      expect(result.prettyPrint()).toBe("'hello world'");
    });

    it('should format None as None in pretty print', () => {
      const result = evaluator.evaluate('None');
      expect(result.prettyPrint()).toBe('None');
    });

    it('should format lists with Python syntax', () => {
      const result = evaluator.evaluate('[1, 2, 3]');
      const prettyOutput = result.prettyPrint();
      expect(prettyOutput).toContain('[');
      expect(prettyOutput).toContain(']');
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors', () => {
      const result = evaluator.evaluate('invalid syntax here');
      expect(result.isError()).toBe(true);
    });

    it('should handle runtime errors', () => {
      // Use a more reliable runtime error than division by zero
      const result = evaluator.evaluate('nonexistentVariable.undefinedMethod()');
      expect(result.isError()).toBe(true);
    });
  });

  describe('Complex Expressions', () => {
    it('should handle nested function calls', () => {
      const result = evaluator.evaluate('len(range(10))');
      expect(result.singleResult()).toBe(10);
    });

    it('should handle arithmetic with built-in functions', () => {
      const result = evaluator.evaluate('sum(range(5)) * 2');
      expect(result.singleResult()).toBe(20); // sum(0,1,2,3,4) = 10, * 2 = 20
    });

    it('should handle list operations', () => {
      const result = evaluator.evaluate('len([x * 2 for x in range(3)])');
      expect(result.singleResult()).toBe(3);
    });
  });

  describe('Result Format Conversion', () => {
    it('should handle null results', () => {
      const result = evaluator.evaluate('None');
      expect(result.noResult()).toBe(true);
    });

    it('should convert results to tuples properly', () => {
      const result = evaluator.evaluate('[1, 2, 3]');
      expect(result.selectedTuplesAll()).toEqual([['1'], ['2'], ['3']]);
    });

    it('should handle singleton results', () => {
      const result = evaluator.evaluate('42');
      expect(result.isSingleton()).toBe(true);
      expect(result.singleResult()).toBe(42);
    });
  });
});