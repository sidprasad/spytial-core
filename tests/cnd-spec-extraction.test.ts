/**
 * Test for CnD spec extraction functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PyretExpressionParser, PyretEvaluator } from '../src/components/ReplInterface/parsers/PyretExpressionParser';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

describe('CnD Spec Extraction', () => {
  let parser: PyretExpressionParser;
  let mockEvaluator: PyretEvaluator;
  let instance: PyretDataInstance;

  beforeEach(() => {
    // Create a mock evaluator
    mockEvaluator = {
      run: vi.fn(),
      runtime: {
        isSuccessResult: vi.fn(() => true)
      }
    };

    parser = new PyretExpressionParser(mockEvaluator);
    instance = new PyretDataInstance();
  });

  it('should extract CnD spec from object with _cndspec method', async () => {
    // Mock an object with _cndspec method
    const objectWithSpec = {
      value: 'test',
      _cndspec: () => 'constraints:\n  - orientation:\n      selector: test'
    };

    // Mock the evaluator to return this object
    (mockEvaluator.run as any).mockResolvedValue({
      answer: objectWithSpec
    });

    const result = await parser.execute('[test-expression]', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBe('constraints:\n  - orientation:\n      selector: test');
    expect(result.message).toContain('🎯 Extracted CnD specification from result');
  });

  it('should handle objects without _cndspec method', async () => {
    // Mock an object without _cndspec method
    const objectWithoutSpec = {
      value: 'test',
      someMethod: () => 'hello'
    };

    // Mock the evaluator to return this object
    (mockEvaluator.run as any).mockResolvedValue({
      answer: objectWithoutSpec
    });

    const result = await parser.execute('[test-expression]', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeUndefined();
    expect(result.message).not.toContain('🎯 Extracted CnD specification from result');
  });

  it('should handle _cndspec method that returns an object', async () => {
    // Mock an object with _cndspec method that returns an object
    const objectWithSpecObject = {
      value: 'test',
      _cndspec: () => ({
        constraints: [
          {
            orientation: {
              selector: 'test',
              directions: ['right', 'below']
            }
          }
        ]
      })
    };

    // Mock the evaluator to return this object
    (mockEvaluator.run as any).mockResolvedValue({
      answer: objectWithSpecObject
    });

    const result = await parser.execute('[test-expression]', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeDefined();
    expect(result.extractedCndSpec).toContain('"constraints"');
    expect(result.extractedCndSpec).toContain('"orientation"');
    expect(result.message).toContain('🎯 Extracted CnD specification from result');
  });

  it('should handle errors in _cndspec method gracefully', async () => {
    // Mock an object with _cndspec method that throws an error
    const objectWithFailingSpec = {
      value: 'test',
      _cndspec: () => {
        throw new Error('Spec generation failed');
      }
    };

    // Mock the evaluator to return this object
    (mockEvaluator.run as any).mockResolvedValue({
      answer: objectWithFailingSpec
    });

    const result = await parser.execute('[test-expression]', instance);

    // Should still succeed, just without extracted spec
    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeUndefined();
  });

  it('should extract spec for primitive values that do not have _cndspec', async () => {
    // Mock the evaluator to return a primitive value
    (mockEvaluator.run as any).mockResolvedValue({
      answer: 'hello world'
    });

    const result = await parser.execute('"hello world"', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeUndefined();
    expect(result.message).toContain('Added 1 atom');
  });

  it('should handle complex Pyret objects with _cndspec', async () => {
    // Create a mock complex Pyret object similar to the example in the issue
    const mockRBNod = {
      dict: {
        'brand-dict': {},
        'data-dict': {
          'value': 42,
          'left': null,
          'right': null
        }
      },
      brands: ['RBNod', 'Black'],
      _cndspec: () => `constraints:
  - orientation:
      selector: right
      directions:
        - right
        - below
  - orientation:
      directions:
        - left
        - below
      selector: left`
    };

    // Mock the evaluator to return this object
    (mockEvaluator.run as any).mockResolvedValue({
      answer: mockRBNod
    });

    const result = await parser.execute('Black(42, empty, empty)', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeDefined();
    expect(result.extractedCndSpec).toContain('constraints:');
    expect(result.extractedCndSpec).toContain('orientation:');
    expect(result.extractedCndSpec).toContain('right');
    expect(result.extractedCndSpec).toContain('left');
    expect(result.message).toContain('🎯 Extracted CnD specification from result');
  });
});