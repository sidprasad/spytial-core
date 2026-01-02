import { describe, it, expect } from 'vitest';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

const jsonData: IJsonDataInstance = {
    atoms: [
        { id: 'n1', type: 'Node', label: 'Node 1' },
        { id: 'n2', type: 'Node', label: 'Node 2' },
        { id: 'n3', type: 'Node', label: 'Node 3' }
    ],
    relations: [
        {
            id: 'edge',
            name: 'edge',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['n1', 'n2'], types: ['Node', 'Node'] },
                { atoms: ['n2', 'n3'], types: ['Node', 'Node'] }
            ]
        }
    ]
};

function createEvaluator(instance: JSONDataInstance) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

describe('Evaluator Constraint Error Handling', () => {
    it('should catch and convert evaluator errors to constraint errors when referencing hidden nodes', () => {
        // Create a layout spec with a constraint that references a hidden node
        const specYaml = `
constraints:
  - hideAtom:
      selector: n2
  - orientation:
      directions: [left]
      selector: n1->n2
        `;

        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);
        const layoutSpec = parseLayoutSpec(specYaml);
        const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);

        // Generate layout should catch the evaluator error and return it as a constraint error
        const result = layoutInstance.generateLayout(instance, {});

        // The result should have an error (not throw)
        expect(result.error).toBeDefined();
        expect(result.error).not.toBeNull();
        
        // The layout should still be generated (best effort)
        expect(result.layout).toBeDefined();
        expect(result.layout.nodes).toBeDefined();
        expect(result.layout.nodes.length).toBeGreaterThan(0);
    });

    it('should include selector information in evaluator error', () => {
        // Create a constraint that will cause an evaluator error
        const specYaml = `
constraints:
  - hideAtom:
      selector: n1
  - hideAtom:
      selector: n2
  - orientation:
      directions: [below]
      selector: n1->n2
        `;

        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);
        const layoutSpec = parseLayoutSpec(specYaml);
        const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);

        const result = layoutInstance.generateLayout(instance, {});

        // Check that the error contains useful information
        expect(result.error).toBeDefined();
        if (result.error) {
            expect(result.error.message).toBeDefined();
            // The error message should mention the selector or query
            expect(result.error.message.toLowerCase()).toMatch(/selector|query|evaluation/);
        }
    });

    it('should provide best-effort layout when evaluator fails', () => {
        // Create a spec where some constraints work and some fail
        const specYaml = `
constraints:
  - align:
      direction: horizontal
      selector: edge
  - hideAtom:
      selector: n2
  - orientation:
      directions: [below]
      selector: n1->n2
        `;

        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);
        const layoutSpec = parseLayoutSpec(specYaml);
        const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);

        const result = layoutInstance.generateLayout(instance, {});

        // Should return a layout with visible nodes, even though one constraint failed
        expect(result.layout).toBeDefined();
        expect(result.layout.nodes).toBeDefined();
        
        // Should have at least the non-hidden nodes
        const visibleNodes = result.layout.nodes.filter(n => n.id === 'n1' || n.id === 'n3');
        expect(visibleNodes.length).toBeGreaterThan(0);
        
        // Should have an error indicating the problem
        expect(result.error).toBeDefined();
    });
});
