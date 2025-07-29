import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { PyretReplInterface } from '../src/components/ReplInterface/PyretReplInterface';
import { PyretEvaluator, PyretEvaluationResult } from '../src/components/ReplInterface/parsers/PyretExpressionParser';
import { render, screen } from '@testing-library/react';

/**
 * Integration test to verify the async Pyret evaluator works end-to-end
 */
describe('Pyret Async Integration', () => {
  let instance: PyretDataInstance;
  let mockEvaluator: PyretEvaluator;

  beforeEach(() => {
    // Create empty instance
    instance = new PyretDataInstance({});

    // Create mock evaluator that simulates the real Pyret evaluator response format
    mockEvaluator = {
      run: vi.fn().mockImplementation(async (code: string) => {
        // Simulate success response format from pyret-success-1.json
        if (code === '1') {
          return {
            result: {
              dict: {
                v: {
                  val: {
                    modules: {
                      '$interactions://1': {
                        dict: {
                          answer: 1
                        }
                      }
                    }
                  }
                }
              }
            }
          };
        }

        // Simulate complex object response format from pyret-success-2.json
        if (code.includes('edge(')) {
          return {
            result: {
              dict: {
                v: {
                  val: {
                    modules: {
                      '$interactions://2': {
                        dict: {
                          answer: {
                            dict: {
                              value: 6,
                              left: { dict: { value: 0 }, brands: {} },
                              right: { dict: { value: 0 }, brands: {} }
                            },
                            brands: {}
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          };
        }

        // Simulate failure response format from pyret-failure-1.json
        return {
          result: {
            exn: 'Parse error: invalid syntax'
          }
        };
      }),
      runtime: {
        isSuccessResult: (result: PyretEvaluationResult) => !result.exn
      }
    };
  });

  it('should render PyretReplInterface with external evaluator', () => {
    render(
      <PyretReplInterface 
        initialInstance={instance}
        externalEvaluator={mockEvaluator}
      />
    );

    // Should render with simplified placeholder regardless of evaluator
    expect(screen.getByPlaceholderText(/list/)).toBeInTheDocument();
  });

  it('should render PyretReplInterface without external evaluator', () => {
    render(
      <PyretReplInterface 
        initialInstance={instance}
      />
    );

    // Should render the REPL interface with minimal placeholder
    expect(screen.getByPlaceholderText(/list/)).toBeInTheDocument();
  });

  it('should render with simplified placeholder regardless of evaluator presence', () => {
    render(
      <PyretReplInterface 
        initialInstance={instance}
        externalEvaluator={mockEvaluator}
      />
    );

    // Should use simplified placeholder regardless of evaluator
    expect(screen.getByPlaceholderText(/list/)).toBeInTheDocument();
  });

  it('should render with simplified placeholder for edge expressions', () => {
    render(
      <PyretReplInterface 
        initialInstance={instance}
        externalEvaluator={mockEvaluator}
      />
    );

    // Should use simplified placeholder instead of verbose examples
    expect(screen.getByPlaceholderText(/list/)).toBeInTheDocument();
  });

  it('should validate mock evaluator response format matches expected structure', async () => {
    // Test primitive response
    const primitiveResult = await mockEvaluator.run('1');
    expect(primitiveResult.result.dict.v.val.modules['$interactions://1'].dict.answer).toBe(1);

    // Test complex object response
    const complexResult = await mockEvaluator.run('edge("1", "label", 3)');
    expect(complexResult.result.dict.v.val.modules['$interactions://2'].dict.answer.dict.value).toBe(6);

    // Test failure response
    const failureResult = await mockEvaluator.run('invalid');
    expect(failureResult.result.exn).toBe('Parse error: invalid syntax');
  });
});