/**
 * Tests for cyclic constraint semantics specification
 * 
 * These tests validate that our formal specification correctly captures
 * the behavior of the actual implementation.
 */

import { describe, it, expect } from 'vitest';
import { 
  translateCyclicConstraint, 
  leanStyleTranslation,
  demonstrateTriangleTranslation,
  type CyclicConstraint,
  type LayoutConstraint 
} from '../../src/layout/cyclic-semantics';

describe('Cyclic Constraint Semantics', () => {
  
  describe('Translation Function', () => {
    
    it('should generate correct number of perturbations for a fragment', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // Should generate 3 perturbations for 3-node fragment
      expect(result).toHaveLength(3);
    });
    
    it('should handle counterclockwise direction by reversing fragments', () => {
      const clockwise: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const counterclockwise: CyclicConstraint = {
        direction: 'counterclockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const clockwiseResult = translateCyclicConstraint(clockwise);
      const counterclockwiseResult = translateCyclicConstraint(counterclockwise);
      
      // Both should have same number of constraint sets
      expect(clockwiseResult).toHaveLength(counterclockwiseResult.length);
      
      // But the constraints should be different due to reversal
      expect(clockwiseResult[0]).not.toEqual(counterclockwiseResult[0]);
    });
    
    it('should generate pairwise constraints for all node pairs', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // For 3 nodes, we expect constraints between all ordered pairs (3×2 = 6 ordered pairs)
      // Each pair generates 2 constraints (horizontal + vertical)
      // So we expect 12 constraints per perturbation
      result.forEach(constraintSet => {
        expect(constraintSet.length).toBe(12);
      });
    });
    
    it('should generate different constraints for different perturbations', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // Different perturbations should generate different constraint sets
      expect(result[0]).not.toEqual(result[1]);
      expect(result[1]).not.toEqual(result[2]);
      expect(result[0]).not.toEqual(result[2]);
    });
    
  });
  
  describe('Constraint Types', () => {
    
    it('should generate only valid constraint types', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B']]
      };
      
      const result = translateCyclicConstraint(constraint);
      const validTypes = ['left', 'top', 'alignment'];
      
      result.forEach(constraintSet => {
        constraintSet.forEach(c => {
          expect(validTypes).toContain(c.type);
        });
      });
    });
    
    it('should include minDistance for non-alignment constraints', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      result.forEach(constraintSet => {
        constraintSet.forEach(c => {
          if (c.type === 'left' || c.type === 'top') {
            expect(c.minDistance).toBeDefined();
            expect(c.minDistance).toBeGreaterThan(0);
          }
        });
      });
    });
    
    it('should generate proper LeftConstraint structure', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      result.forEach(constraintSet => {
        const leftConstraints = constraintSet.filter(c => c.type === 'left');
        leftConstraints.forEach(c => {
          expect(c).toHaveProperty('left');
          expect(c).toHaveProperty('right');
          expect(c).toHaveProperty('minDistance');
        });
      });
    });
    
    it('should generate proper TopConstraint structure', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      result.forEach(constraintSet => {
        const topConstraints = constraintSet.filter(c => c.type === 'top');
        topConstraints.forEach(c => {
          expect(c).toHaveProperty('top');
          expect(c).toHaveProperty('bottom');
          expect(c).toHaveProperty('minDistance');
        });
      });
    });
    
    it('should generate proper AlignmentConstraint structure', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      result.forEach(constraintSet => {
        const alignConstraints = constraintSet.filter(c => c.type === 'alignment');
        alignConstraints.forEach(c => {
          expect(c).toHaveProperty('axis');
          expect(c).toHaveProperty('node1');
          expect(c).toHaveProperty('node2');
          expect(['x', 'y']).toContain(c.axis);
        });
      });
    });
    
  });
  
  describe('Multiple Fragments', () => {
    
    it('should handle multiple fragments correctly', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [
          ['A', 'B', 'C'],
          ['X', 'Y']
        ]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // Should generate perturbations for all fragments
      // Fragment 1: 3 perturbations, Fragment 2: 2 perturbations
      // Total: 5 constraint sets
      expect(result).toHaveLength(5);
    });
    
  });
  
  describe('Edge Cases', () => {
    
    it('should handle single-node fragments gracefully', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // Single node should generate 1 empty constraint set
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(0);
    });
    
    it('should handle two-node fragments', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // Two nodes should generate 2 perturbations, but no constraints (per implementation)
      expect(result).toHaveLength(2);
      
      // Each perturbation should have 0 constraints (two-node fragments return empty)
      result.forEach(constraintSet => {
        expect(constraintSet).toHaveLength(0);
      });
    });
    
    it('should handle empty fragments', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [[]]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // Empty fragment should generate empty result
      expect(result).toHaveLength(0);
    });
    
  });
  
  describe('Lean-Style Translation', () => {
    
    it('should provide lean-style translation description', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const translation = leanStyleTranslation(constraint);
      
      expect(translation).toContain('LeftConstraint');
      expect(translation).toContain('TopConstraint');
      expect(translation).toContain('AlignmentConstraint');
      expect(translation).toContain('satisfies');
      expect(translation).toContain('disjunction');
    });
    
    it('should demonstrate triangle translation without errors', () => {
      // This should run without throwing errors
      expect(() => {
        demonstrateTriangleTranslation();
      }).not.toThrow();
    });
    
  });
  
  describe('Mathematical Properties', () => {
    
    it('should preserve node relationships across perturbations', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // All perturbations should involve the same set of nodes
      const expectedNodes = new Set(['A', 'B', 'C']);
      
      result.forEach(constraintSet => {
        const involvedNodes = new Set();
        constraintSet.forEach(c => {
          if (c.type === 'left') {
            involvedNodes.add(c.left);
            involvedNodes.add(c.right);
          } else if (c.type === 'top') {
            involvedNodes.add(c.top);
            involvedNodes.add(c.bottom);
          } else if (c.type === 'alignment') {
            involvedNodes.add(c.node1);
            involvedNodes.add(c.node2);
          }
        });
        expect(involvedNodes).toEqual(expectedNodes);
      });
    });
    
    it('should generate symmetric constraint patterns', () => {
      const constraint: CyclicConstraint = {
        direction: 'clockwise',
        fragments: [['A', 'B', 'C', 'D']]
      };
      
      const result = translateCyclicConstraint(constraint);
      
      // For a regular n-gon, rotational symmetry should be preserved
      // Each perturbation should have the same number of constraints
      const constraintCounts = result.map(cs => cs.length);
      const firstCount = constraintCounts[0];
      
      constraintCounts.forEach(count => {
        expect(count).toBe(firstCount);
      });
    });
    
  });
  
});