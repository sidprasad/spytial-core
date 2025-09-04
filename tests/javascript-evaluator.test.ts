/**
 * Tests for JavaScript Evaluator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JavaScriptEvaluator } from '../src/evaluators/javascript-evaluator';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('JavaScriptEvaluator', () => {
  let evaluator: JavaScriptEvaluator;
  let dataInstance: JSONDataInstance;

  beforeEach(() => {
    evaluator = new JavaScriptEvaluator();
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
      const newEvaluator = new JavaScriptEvaluator();
      expect(newEvaluator.isReady()).toBe(false);
    });
  });

  describe('Basic JavaScript Expressions', () => {
    it('should evaluate simple arithmetic', () => {
      const result = evaluator.evaluate('2 + 3');
      expect(result.isSingleton()).toBe(true);
      expect(result.singleResult()).toBe(5);
    });

    it('should evaluate string operations', () => {
      const result = evaluator.evaluate('"hello" + " " + "world"');
      expect(result.singleResult()).toBe('hello world');
    });

    it('should evaluate boolean expressions', () => {
      const result = evaluator.evaluate('true && false');
      expect(result.singleResult()).toBe(false);
    });
  });

  describe('Array Operations', () => {
    it('should evaluate array map operations', () => {
      const result = evaluator.evaluate('[1, 2, 3].map(x => x * 2)');
      expect(result.selectedTuplesAll()).toEqual([['2'], ['4'], ['6']]);
    });

    it('should evaluate array filter operations', () => {
      const result = evaluator.evaluate('[1, 2, 3, 4, 5].filter(x => x % 2 === 0)');
      expect(result.selectedTuplesAll()).toEqual([['2'], ['4']]);
    });

    it('should evaluate array reduce operations', () => {
      const result = evaluator.evaluate('[1, 2, 3, 4].reduce((a, b) => a + b, 0)');
      expect(result.singleResult()).toBe(10);
    });
  });

  describe('Math Operations', () => {
    it('should evaluate Math.max', () => {
      const result = evaluator.evaluate('Math.max(10, 20, 5, 15)');
      expect(result.singleResult()).toBe(20);
    });

    it('should evaluate Math.min', () => {
      const result = evaluator.evaluate('Math.min(10, 20, 5, 15)');
      expect(result.singleResult()).toBe(5);
    });

    it('should evaluate Math.abs', () => {
      const result = evaluator.evaluate('Math.abs(-42)');
      expect(result.singleResult()).toBe(42);
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

  describe('Object Operations', () => {
    it('should evaluate Object.keys', () => {
      const result = evaluator.evaluate('Object.keys({a: 1, b: 2, c: 3})');
      expect(result.selectedTuplesAll()).toEqual([['a'], ['b'], ['c']]);
    });

    it('should evaluate Object.values', () => {
      const result = evaluator.evaluate('Object.values({a: 1, b: 2, c: 3})');
      expect(result.selectedTuplesAll()).toEqual([['1'], ['2'], ['3']]);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors', () => {
      const result = evaluator.evaluate('invalid syntax here');
      expect(result.isError()).toBe(true);
    });

    it('should handle runtime errors', () => {
      const result = evaluator.evaluate('undefined.nonexistentMethod()');
      expect(result.isError()).toBe(true);
    });
  });

  describe('Result Format Conversion', () => {
    it('should handle null results', () => {
      const result = evaluator.evaluate('null');
      expect(result.noResult()).toBe(true);
    });

    it('should handle undefined results', () => {
      const result = evaluator.evaluate('undefined');
      expect(result.noResult()).toBe(true);
    });

    it('should pretty print arrays', () => {
      const result = evaluator.evaluate('[1, 2, 3]');
      const prettyOutput = result.prettyPrint();
      expect(prettyOutput).toContain('1');
      expect(prettyOutput).toContain('2');
      expect(prettyOutput).toContain('3');
    });

    it('should pretty print errors', () => {
      const result = evaluator.evaluate('throw new Error("test error")');
      const prettyOutput = result.prettyPrint();
      expect(prettyOutput).toContain('Error:');
    });
  });

  describe('Console Logging', () => {
    it('should provide console.log functionality', () => {
      // This would typically be tested with a mock console, but for simplicity
      // we just verify it doesn't throw an error
      const result = evaluator.evaluate('console.log("test message")');
      expect(result.isError()).toBe(false);
    });
  });
});