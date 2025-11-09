/**
 * Test for Spytial spec extraction functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PyretExpressionParser, PyretEvaluator } from '../src/components/ReplInterface/parsers/PyretExpressionParser';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

describe('Spytial Spec Extraction', () => {
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

  it('should extract Spytial spec from object with _cndspec method', async () => {
    // Mock the evaluator to return different results based on the expression
    (mockEvaluator.run as any).mockImplementation(async (code: string) => {
      if (code === '[test-expression]') {
        // First call - return the original object
        return {
          answer: { value: 'test' }
        };
      } else if (code === '([test-expression])._cndspec()') {
        // Second call - return the Spytial spec string
        return {
          answer: 'constraints:\n  - orientation:\n      selector: test'
        };
      }
      return { answer: null };
    });

    const result = await parser.execute('[test-expression]', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBe('constraints:\n  - orientation:\n      selector: test');
    expect(result.message).toContain('Extracted Spytial specification from result');
  });

  it('should handle objects without _cndspec method', async () => {
    // Mock the evaluator to return different results based on the expression
    (mockEvaluator.run as any).mockImplementation(async (code: string) => {
      if (code === '[test-expression]') {
        // First call - return the original object
        return {
          answer: { value: 'test', someMethod: () => 'hello' }
        };
      } else if (code === '([test-expression])._cndspec()') {
        // Second call - simulate error/no method
        throw new Error('Method not found');
      }
      return { answer: null };
    });

    const result = await parser.execute('[test-expression]', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeUndefined();
    expect(result.message).not.toContain('Extracted Spytial specification from result');
  });

  it('should handle _cndspec method that returns an object', async () => {
    // Mock the evaluator to return different results based on the expression
    (mockEvaluator.run as any).mockImplementation(async (code: string) => {
      if (code === '[test-expression]') {
        // First call - return the original object
        return {
          answer: { value: 'test' }
        };
      } else if (code === '([test-expression])._cndspec()') {
        // Second call - return an object (not a string, so should be ignored)
        return {
          answer: {
            constraints: [
              {
                orientation: {
                  selector: 'test',
                  directions: ['right', 'below']
                }
              }
            ]
          }
        };
      }
      return { answer: null };
    });

    const result = await parser.execute('[test-expression]', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeUndefined(); // Objects are not considered valid Spytial specs
    expect(result.message).not.toContain('Extracted Spytial specification from result');
  });

  it('should handle errors in _cndspec method gracefully', async () => {
    // Mock the evaluator to return different results based on the expression
    (mockEvaluator.run as any).mockImplementation(async (code: string) => {
      if (code === '[test-expression]') {
        // First call - return the original object
        return {
          answer: { value: 'test' }
        };
      } else if (code === '([test-expression])._cndspec()') {
        // Second call - simulate error in _cndspec method
        throw new Error('Spec generation failed');
      }
      return { answer: null };
    });

    const result = await parser.execute('[test-expression]', instance);

    // Should still succeed, just without extracted spec
    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeUndefined();
  });

  it('should extract spec for primitive values that do not have _cndspec', async () => {
    // Mock the evaluator to return different results based on the expression
    (mockEvaluator.run as any).mockImplementation(async (code: string) => {
      if (code === '"hello world"') {
        // First call - return the primitive value
        return {
          answer: 'hello world'
        };
      } else if (code === '("hello world")._cndspec()') {
        // Second call - primitive values don't have _cndspec method, so error
        throw new Error('Method not found');
      }
      return { answer: null };
    });

    const result = await parser.execute('"hello world"', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeUndefined();
    expect(result.message).toContain('Added 1 atom');
  });

  it('should handle complex Pyret objects with _cndspec', async () => {
    // Mock the evaluator to return different results based on the expression
    (mockEvaluator.run as any).mockImplementation(async (code: string) => {
      if (code === 'Black(42, empty, empty)') {
        // First call - return the complex Pyret object
        return {
          answer: {
            dict: {
              'brand-dict': {},
              'data-dict': {
                'value': 42,
                'left': null,
                'right': null
              }
            },
            brands: ['RBNod', 'Black']
          }
        };
      } else if (code === '(Black(42, empty, empty))._cndspec()') {
        // Second call - return the Spytial spec string
        return {
          answer: `constraints:
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
      }
      return { answer: null };
    });

    const result = await parser.execute('Black(42, empty, empty)', instance);

    expect(result.success).toBe(true);
    expect(result.extractedCndSpec).toBeDefined();
    expect(result.extractedCndSpec).toContain('constraints:');
    expect(result.extractedCndSpec).toContain('orientation:');
    expect(result.extractedCndSpec).toContain('right');
    expect(result.extractedCndSpec).toContain('left');
    expect(result.message).toContain('Extracted Spytial specification from result');
  });
});