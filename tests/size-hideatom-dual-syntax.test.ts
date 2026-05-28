/**
 * Tests that size and hideAtom can be parsed from both constraints and directives blocks
 */

import { describe, it, expect } from 'vitest';
import { parseLayoutSpec, LayoutInstance } from '../src/layout';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

describe('Size and HideAtom Dual Syntax', () => {
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

  describe('hideAtom parsing', () => {
    it('should parse hideAtom from directives block (original syntax)', () => {
      const layoutSpecYaml = `
constraints: []
directives:
  - hideAtom:
      selector: Type2
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      expect(layoutSpec.directives.hiddenAtoms).toHaveLength(1);
      expect(layoutSpec.directives.hiddenAtoms[0].selector).toBe('Type2');
      
      // Verify it works in practice
      const dataInstance = new JSONDataInstance(testData);
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: dataInstance });

      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(dataInstance);

      const nodeIds = layout.nodes.map(node => node.id);
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).not.toContain('D');
    });

    it('should parse hideAtom from constraints block (new syntax)', () => {
      const layoutSpecYaml = `
constraints:
  - hideAtom:
      selector: Type2
directives: []
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      expect(layoutSpec.directives.hiddenAtoms).toHaveLength(1);
      expect(layoutSpec.directives.hiddenAtoms[0].selector).toBe('Type2');
      
      // Verify it works in practice
      const dataInstance = new JSONDataInstance(testData);
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: dataInstance });

      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(dataInstance);

      const nodeIds = layout.nodes.map(node => node.id);
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).not.toContain('D');
    });

    it('should merge hideAtom from both constraints and directives blocks', () => {
      const layoutSpecYaml = `
constraints:
  - hideAtom:
      selector: C
directives:
  - hideAtom:
      selector: D
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      expect(layoutSpec.directives.hiddenAtoms).toHaveLength(2);
      expect(layoutSpec.directives.hiddenAtoms[0].selector).toBe('C');
      expect(layoutSpec.directives.hiddenAtoms[1].selector).toBe('D');
      
      // Verify both are applied
      const dataInstance = new JSONDataInstance(testData);
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: dataInstance });

      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(dataInstance);

      const nodeIds = layout.nodes.map(node => node.id);
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).not.toContain('D');
    });
  });

  describe('size parsing', () => {
    it('should parse size from directives block (original syntax)', () => {
      const layoutSpecYaml = `
constraints: []
directives:
  - size:
      selector: Type1
      height: 100
      width: 200
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      expect(layoutSpec.directives.sizes).toHaveLength(1);
      expect(layoutSpec.directives.sizes[0].selector).toBe('Type1');
      expect(layoutSpec.directives.sizes[0].height).toBe(100);
      expect(layoutSpec.directives.sizes[0].width).toBe(200);
    });

    it('should parse size from constraints block (new syntax)', () => {
      const layoutSpecYaml = `
constraints:
  - size:
      selector: Type1
      height: 100
      width: 200
directives: []
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      expect(layoutSpec.directives.sizes).toHaveLength(1);
      expect(layoutSpec.directives.sizes[0].selector).toBe('Type1');
      expect(layoutSpec.directives.sizes[0].height).toBe(100);
      expect(layoutSpec.directives.sizes[0].width).toBe(200);
    });

    it('should merge size from both constraints and directives blocks', () => {
      const layoutSpecYaml = `
constraints:
  - size:
      selector: Type1
      height: 100
      width: 200
directives:
  - size:
      selector: Type2
      height: 150
      width: 250
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      expect(layoutSpec.directives.sizes).toHaveLength(2);
      expect(layoutSpec.directives.sizes[0].selector).toBe('Type1');
      expect(layoutSpec.directives.sizes[0].height).toBe(100);
      expect(layoutSpec.directives.sizes[0].width).toBe(200);
      expect(layoutSpec.directives.sizes[1].selector).toBe('Type2');
      expect(layoutSpec.directives.sizes[1].height).toBe(150);
      expect(layoutSpec.directives.sizes[1].width).toBe(250);
    });
  });

  describe('mixed usage', () => {
    it('should handle both size and hideAtom in constraints block', () => {
      const layoutSpecYaml = `
constraints:
  - size:
      selector: Type1
      height: 100
      width: 200
  - hideAtom:
      selector: Type2
directives: []
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      expect(layoutSpec.directives.sizes).toHaveLength(1);
      expect(layoutSpec.directives.sizes[0].selector).toBe('Type1');
      expect(layoutSpec.directives.hiddenAtoms).toHaveLength(1);
      expect(layoutSpec.directives.hiddenAtoms[0].selector).toBe('Type2');
    });

    it('should handle both size and hideAtom with actual constraints', () => {
      const layoutSpecYaml = `
constraints:
  - orientation:
      selector: A->B
      directions: [left]
  - size:
      selector: Type1
      height: 100
      width: 200
  - hideAtom:
      selector: Type2
directives:
  - atomColor:
      selector: Type1
      value: "#FF0000"
`;

      const layoutSpec = parseLayoutSpec(layoutSpecYaml);
      
      // Check constraints
      expect(layoutSpec.constraints.orientation.relative).toHaveLength(1);
      expect(layoutSpec.constraints.orientation.relative[0].selector).toBe('A->B');
      
      // Check directives (including size and hideAtom from constraints)
      expect(layoutSpec.directives.sizes).toHaveLength(1);
      expect(layoutSpec.directives.hiddenAtoms).toHaveLength(1);
      expect(layoutSpec.directives.atomColors).toHaveLength(1);
    });
  });

  describe('size validation rejects non-positive values', () => {
    const invalidSizes: { label: string; height: unknown; width: unknown }[] = [
      { label: 'zero width', height: 100, width: 0 },
      { label: 'zero height', height: 0, width: 100 },
      { label: 'negative width', height: 100, width: -50 },
      { label: 'negative height', height: -25, width: 100 },
      { label: 'both zero', height: 0, width: 0 },
    ];

    for (const { label, height, width } of invalidSizes) {
      it(`rejects size with ${label} in directives block`, () => {
        const yaml = `
constraints: []
directives:
  - size:
      selector: Type1
      height: ${height}
      width: ${width}
`;
        expect(() => parseLayoutSpec(yaml)).toThrow(/must be greater than 0/);
      });

      it(`rejects size with ${label} in constraints block`, () => {
        const yaml = `
constraints:
  - size:
      selector: Type1
      height: ${height}
      width: ${width}
directives: []
`;
        expect(() => parseLayoutSpec(yaml)).toThrow(/must be greater than 0/);
      });
    }

    it('rejects size with missing width in directives block', () => {
      const yaml = `
constraints: []
directives:
  - size:
      selector: Type1
      height: 100
`;
      expect(() => parseLayoutSpec(yaml)).toThrow(/width/);
    });

    it('rejects size with missing height in constraints block', () => {
      const yaml = `
constraints:
  - size:
      selector: Type1
      width: 100
directives: []
`;
      expect(() => parseLayoutSpec(yaml)).toThrow(/height/);
    });
  });
});
