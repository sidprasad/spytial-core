/**
 * Tests for size and hideAtom being treated as constraints
 * This verifies the issue fix: "Size and hideAtom should be constraints"
 */

import { describe, it, expect } from 'vitest';
import { parseLayoutSpec, LayoutInstance } from '../src/layout';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

describe('Size and HideAtom as Constraints', () => {
  const testData = {
    atoms: [
      { id: 'A', type: 'Type1', label: 'A' },
      { id: 'B', type: 'Type1', label: 'B' },
      { id: 'C', type: 'Type2', label: 'C' },
      { id: 'D', type: 'Type2', label: 'D' },
    ],
    relations: [
      { 
        id: 'r', 
        name: 'r', 
        types: ['Type1', 'Type1'], 
        tuples: [
          { atoms: ['A', 'B'], types: ['Type1', 'Type1'] }
        ]
      }
    ]
  };

  describe('Size as constraint', () => {
    it('should handle size in constraints section', () => {
      const layoutSpecYaml = `
constraints:
  - size:
      selector: Type1
      width: 200
      height: 150
directives: []
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      
      // Size should be in constraints
      expect(layoutSpec.constraints.sizes).toHaveLength(1);
      expect(layoutSpec.constraints.sizes[0].width).toBe(200);
      expect(layoutSpec.constraints.sizes[0].height).toBe(150);
      expect(layoutSpec.constraints.sizes[0].selector).toBe('Type1');
    });

    it('should move size from directives to constraints for backward compatibility', () => {
      const layoutSpecYaml = `
constraints: []
directives:
  - size:
      selector: Type1
      width: 150
      height: 100
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      
      // Size should be moved to constraints
      expect(layoutSpec.constraints.sizes).toHaveLength(1);
      expect(layoutSpec.constraints.sizes[0].width).toBe(150);
      expect(layoutSpec.constraints.sizes[0].height).toBe(100);
      expect(layoutSpec.constraints.sizes[0].selector).toBe('Type1');
    });

    it('should combine size from both constraints and directives sections', () => {
      const layoutSpecYaml = `
constraints:
  - size:
      selector: Type1
      width: 200
      height: 150
directives:
  - size:
      selector: Type2
      width: 100
      height: 50
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      
      // Both sizes should be in constraints
      expect(layoutSpec.constraints.sizes).toHaveLength(2);
      
      // Check both size constraints
      const sizes = layoutSpec.constraints.sizes;
      expect(sizes.find(s => s.selector === 'Type1')).toEqual({
        selector: 'Type1',
        width: 200,
        height: 150
      });
      expect(sizes.find(s => s.selector === 'Type2')).toEqual({
        selector: 'Type2',
        width: 100,
        height: 50
      });
    });
  });

  describe('HideAtom as constraint', () => {
    it('should handle hideAtom in constraints section', () => {
      const layoutSpecYaml = `
constraints:
  - hideAtom:
      selector: Type2
directives: []
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      const dataInstance = new JSONDataInstance(testData);
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: dataInstance });

      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(dataInstance, {});

      // Type2 atoms (C, D) should be hidden, only Type1 atoms (A, B) should remain
      const nodeIds = layout.nodes.map(node => node.id);
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).not.toContain('D');
      
      // Verify parsing structure
      expect(layoutSpec.constraints.hiddenAtoms).toHaveLength(1);
      expect(layoutSpec.constraints.hiddenAtoms[0].selector).toBe('Type2');
    });

    it('should move hideAtom from directives to constraints for backward compatibility', () => {
      const layoutSpecYaml = `
constraints: []
directives:
  - hideAtom:
      selector: Type2
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      const dataInstance = new JSONDataInstance(testData);
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: dataInstance });

      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(dataInstance, {});

      // Type2 atoms should still be hidden
      const nodeIds = layout.nodes.map(node => node.id);
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).not.toContain('D');
      
      // Verify it was moved to constraints
      expect(layoutSpec.constraints.hiddenAtoms).toHaveLength(1);
      expect(layoutSpec.constraints.hiddenAtoms[0].selector).toBe('Type2');
    });

    it('should combine hideAtom from both constraints and directives sections', () => {
      const layoutSpecYaml = `
constraints:
  - hideAtom:
      selector: C
directives:
  - hideAtom:
      selector: D
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      const dataInstance = new JSONDataInstance(testData);
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: dataInstance });

      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(dataInstance, {});

      // Both C and D should be hidden
      const nodeIds = layout.nodes.map(node => node.id);
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).not.toContain('D');
      
      // Verify both are in constraints
      expect(layoutSpec.constraints.hiddenAtoms).toHaveLength(2);
      
      const selectors = layoutSpec.constraints.hiddenAtoms.map(h => h.selector);
      expect(selectors).toContain('C');
      expect(selectors).toContain('D');
    });
  });

  describe('Mixed constraints and directives', () => {
    it('should handle both size and hideAtom in mixed sections', () => {
      const layoutSpecYaml = `
constraints:
  - size:
      selector: Type1
      width: 100
      height: 80
  - hideAtom:
      selector: C
directives:
  - size:
      selector: Type2
      width: 50
      height: 40
  - hideAtom:
      selector: D
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      
      // All should be moved to constraints
      expect(layoutSpec.constraints.sizes).toHaveLength(2);
      expect(layoutSpec.constraints.hiddenAtoms).toHaveLength(2);
      
      // Verify the content
      const sizes = layoutSpec.constraints.sizes;
      expect(sizes.find(s => s.selector === 'Type1')?.width).toBe(100);
      expect(sizes.find(s => s.selector === 'Type2')?.width).toBe(50);
      
      const hiddenAtoms = layoutSpec.constraints.hiddenAtoms;
      const selectors = hiddenAtoms.map(h => h.selector);
      expect(selectors).toContain('C');
      expect(selectors).toContain('D');
    });
  });
});