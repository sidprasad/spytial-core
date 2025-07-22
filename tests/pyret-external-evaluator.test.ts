import { describe, it, expect, beforeEach } from 'vitest';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { PyretEvaluator } from '../src/components/ReplInterface/parsers/PyretExpressionParser';

describe('PyretDataInstance External Evaluator Integration', () => {
  let instance: PyretDataInstance;
  let mockEvaluator: PyretEvaluator;

  beforeEach(() => {
    mockEvaluator = {
      run: async (code: string) => ({
        success: true,
        result: { dict: { value: 42 }, brands: { '$brandtest': true } }
      }),
      runtime: {
        isSuccessResult: (result) => result.success === true
      }
    };
  });

  describe('constructor with external evaluator', () => {
    it('should accept external evaluator in constructor', () => {
      instance = new PyretDataInstance(null, false, mockEvaluator);
      expect(instance.hasExternalEvaluator()).toBe(true);
      expect(instance.getExternalEvaluator()).toBe(mockEvaluator);
    });

    it('should work without external evaluator', () => {
      instance = new PyretDataInstance(null, false);
      expect(instance.hasExternalEvaluator()).toBe(false);
      expect(instance.getExternalEvaluator()).toBe(null);
    });
  });

  describe('external evaluator management', () => {
    beforeEach(() => {
      instance = new PyretDataInstance();
    });

    it('should allow setting external evaluator after construction', () => {
      expect(instance.hasExternalEvaluator()).toBe(false);
      
      instance.setExternalEvaluator(mockEvaluator);
      expect(instance.hasExternalEvaluator()).toBe(true);
      expect(instance.getExternalEvaluator()).toBe(mockEvaluator);
    });

    it('should allow removing external evaluator', () => {
      instance.setExternalEvaluator(mockEvaluator);
      expect(instance.hasExternalEvaluator()).toBe(true);
      
      instance.setExternalEvaluator(null);
      expect(instance.hasExternalEvaluator()).toBe(false);
      expect(instance.getExternalEvaluator()).toBe(null);
    });
  });

  describe('reify with external evaluator', () => {
    it('should include evaluator comment when external evaluator is present', () => {
      // Create instance with some data
      const pyretData = {
        dict: { value: 42 },
        brands: { '$brandtest': true }
      };
      instance = new PyretDataInstance(pyretData, false, mockEvaluator);
      
      const reified = instance.reify();
      expect(reified).toContain('// Enhanced with external Pyret evaluator');
    });

    it('should not include evaluator comment when no external evaluator', () => {
      // Create instance with some data
      const pyretData = {
        dict: { value: 42 },
        brands: { '$brandtest': true }
      };
      instance = new PyretDataInstance(pyretData, false);
      
      const reified = instance.reify();
      expect(reified).not.toContain('// Enhanced with external Pyret evaluator');
    });

    it('should maintain backward compatibility without external evaluator', () => {
      const pyretData = {
        dict: { value: 42 },
        brands: { '$brandtest': true }
      };
      
      const instanceWithEvaluator = new PyretDataInstance(pyretData, false, mockEvaluator);
      const instanceWithoutEvaluator = new PyretDataInstance(pyretData, false);
      
      const reifiedWith = instanceWithEvaluator.reify();
      const reifiedWithout = instanceWithoutEvaluator.reify();
      
      // Remove the comment from the evaluator version for comparison
      const reifiedWithClean = reifiedWith.replace('// Enhanced with external Pyret evaluator\n', '');
      expect(reifiedWithClean).toBe(reifiedWithout);
    });
  });

  describe('backward compatibility', () => {
    it('should maintain all existing functionality without external evaluator', () => {
      const pyretData = {
        dict: { 
          name: 'Alice',
          age: 25 
        },
        brands: { '$brandperson': true }
      };
      
      instance = new PyretDataInstance(pyretData);
      
      expect(instance.getAtoms().length).toBeGreaterThan(0);
      expect(instance.getRelations().length).toBeGreaterThan(0);
      expect(instance.hasExternalEvaluator()).toBe(false);
    });

    it('should maintain all existing methods and interfaces', () => {
      instance = new PyretDataInstance();
      
      // Check that all existing methods are still available
      expect(typeof instance.addAtom).toBe('function');
      expect(typeof instance.removeAtom).toBe('function');
      expect(typeof instance.addRelationTuple).toBe('function');
      expect(typeof instance.removeRelationTuple).toBe('function');
      expect(typeof instance.getAtoms).toBe('function');
      expect(typeof instance.getRelations).toBe('function');
      expect(typeof instance.getTypes).toBe('function');
      expect(typeof instance.reify).toBe('function');
      expect(typeof instance.generateGraph).toBe('function');
      expect(typeof instance.applyProjections).toBe('function');
    });
  });
});