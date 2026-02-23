import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

const jsonData: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Type1', label: 'A' },
    { id: 'B', type: 'Type1', label: 'B' }
  ],
  relations: [
    {
      id: 'r',
      name: 'r',
      types: ['Type1', 'Type1'],
      tuples: [ { atoms: ['A', 'B'], types: ['Type1', 'Type1'] } ]
    }
  ]
};

const jsonDataDisconnected: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Type1', label: 'A' },
    { id: 'B', type: 'Type1', label: 'B' },
    { id: 'C', type: 'Type1', label: 'C' }
  ],
  relations: [
    {
      id: 'r',
      name: 'r',
      types: ['Type1', 'Type1'],
      tuples: [ { atoms: ['A', 'B'], types: ['Type1', 'Type1'] } ]
    }
  ]
};

const layoutSpecStr = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;

const layoutSpecDisconnected = `
constraints:
  - orientation:
      selector: A->C
      directions:
        - right
`;

const layoutSpec = parseLayoutSpec(layoutSpecStr);
const layoutSpecDisconnectedNodes = parseLayoutSpec(layoutSpecDisconnected);

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('LayoutInstance', () => {
  it('generates layout from data', () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1); // Only the original relation edge, no alignment edge because they're already connected
    expect(layout.constraints.length).toBeGreaterThan(0);
  });

  it('adds alignment edges for disconnected nodes with orientation constraints', () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpecDisconnectedNodes, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2); // Original relation edge A->B + alignment edge A->C
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Check that we have both the original edge and the alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).toContain('r'); // Original relation
    expect(edgeLabels).toContain('_alignment_A_C_'); // Added alignment edge
  });

  it('adds alignment edges for align constraints on disconnected nodes', () => {
    const alignConstraintData: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Type1', label: 'A' },
        { id: 'B', type: 'Type1', label: 'B' },
        { id: 'C', type: 'Type1', label: 'C' }
      ],
      relations: []
    };

    const alignConstraintSpec = `
constraints:
  - align:
      selector: A->B
      direction: horizontal
`;

    const instance = new JSONDataInstance(alignConstraintData);
    const evaluator = createEvaluator(instance);
    const alignLayoutSpec = parseLayoutSpec(alignConstraintSpec);

    const layoutInstance = new LayoutInstance(alignLayoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(1); // Only the alignment edge A->B
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Check that we have the alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).toContain('_alignment_A_B_'); // Added alignment edge
  });

  it('does not add alignment edges when addAlignmentEdges is false', () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpecDisconnectedNodes, evaluator, 0, false);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(1); // Only the original relation edge A->B
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Should not have alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).not.toContain('_alignment_A_C_');
  });

  it('applies color to inferred edges when specified', () => {
    const dataWithTransitiveRelation: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B'], types: ['Node', 'Node'] },
            { atoms: ['B', 'C'], types: ['Node', 'Node'] }
          ]
        }
      ]
    };

    const specWithInferredEdge = `
directives:
  - inferredEdge:
      name: reachable
      selector: next.next
      color: '#ff0000'
`;

    const instance = new JSONDataInstance(dataWithTransitiveRelation);
    const evaluator = createEvaluator(instance);
    const spec = parseLayoutSpec(specWithInferredEdge);

    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    // Should have original edges (A->B, B->C) and inferred edge (A->C)
    expect(layout.edges.length).toBeGreaterThanOrEqual(3);

    // Find the inferred edge
    const inferredEdge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('reachable'));
    expect(inferredEdge).toBeDefined();
    expect(inferredEdge?.color).toBe('#ff0000');
  });

  it('uses default black color for inferred edges when color not specified', () => {
    const dataWithTransitiveRelation: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B'], types: ['Node', 'Node'] },
            { atoms: ['B', 'C'], types: ['Node', 'Node'] }
          ]
        }
      ]
    };

    const specWithInferredEdge = `
directives:
  - inferredEdge:
      name: reachable
      selector: next.next
`;

    const instance = new JSONDataInstance(dataWithTransitiveRelation);
    const evaluator = createEvaluator(instance);
    const spec = parseLayoutSpec(specWithInferredEdge);

    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    // Should have original edges (A->B, B->C) and inferred edge (A->C)
    expect(layout.edges.length).toBeGreaterThanOrEqual(3);

    // Find the inferred edge
    const inferredEdge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('reachable'));
    expect(inferredEdge).toBeDefined();
    expect(inferredEdge?.color).toBe('black'); // Default color
  });

  it('preserves builtin nodes that become connected via inferred edges even when hideDisconnectedBuiltIns flag is set', () => {
    const dataWithBuiltin: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'I', type: 'Int', label: '1' }
      ],
      relations: []
    };

    const specWithFlagAndInferredEdge = `
directives:
  - flag: hideDisconnectedBuiltIns
  - inferredEdge:
      name: connects
      selector: dummy
`;

    const instance = new JSONDataInstance(dataWithBuiltin);
    const dummyEvaluator: any = {
      initialize: () => {},
      evaluate: (_selector: string, _opts?: any) => {
        return {
          selectedTuplesAll: () => [['I','A']],
          selectedAtoms: () => [] as string[],
          selectedTwoples: () => [] as string[][]
        };
      }
    };

    const spec = parseLayoutSpec(specWithFlagAndInferredEdge);
    const layoutInstance = new LayoutInstance(spec, dummyEvaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(2);
    const inferredEdge2 = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('connects'));
    expect(inferredEdge2).toBeDefined();
  });

  it('preserves nodes added by inferred edges when hideDisconnected flag is set', () => {
    const data: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' }
      ],
      relations: []
    };

    const specStr = `
directives:
  - flag: hideDisconnected
  - inferredEdge:
      name: conn
      selector: dummy
`;

    const instance = new JSONDataInstance(data);
    const dummyEvaluator: any = {
      initialize: () => {},
      evaluate: (_selector: string, _opts?: any) => {
        return {
          selectedTuplesAll: () => [['A','B']],
          selectedAtoms: () => [] as string[],
          selectedTwoples: () => [] as string[][]
        };
      }
    };

    const spec = parseLayoutSpec(specStr);
    const layoutInstance = new LayoutInstance(spec, dummyEvaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(2);
    const inferred = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('conn'));
    expect(inferred).toBeDefined();
  });

  it('supports projection over abstract sigs by collecting atoms from subtypes', () => {
    // This test simulates the garbage collection example from the user:
    // abstract sig State { allocated: set HeapCell }
    // one sig Initial extends State {}
    // one sig Changed extends State {}
    // one sig Marked extends State { marked: set HeapCell }
    // one sig Swept extends State {}
    //
    // When projecting over "State", we should get atoms from Initial, Changed, Marked, Swept
    
    const abstractSigData: IJsonDataInstance = {
      atoms: [
        // HeapCell atoms
        { id: 'HeapCell0', type: 'HeapCell', label: 'HeapCell0' },
        { id: 'HeapCell1', type: 'HeapCell', label: 'HeapCell1' },
        // State atoms (one of each concrete subtype)
        { id: 'Initial0', type: 'Initial', label: 'Initial0' },
        { id: 'Changed0', type: 'Changed', label: 'Changed0' },
        { id: 'Marked0', type: 'Marked', label: 'Marked0' },
        { id: 'Swept0', type: 'Swept', label: 'Swept0' },
      ],
      relations: [
        {
          id: 'allocated',
          name: 'allocated',
          types: ['State', 'HeapCell'],
          tuples: [
            { atoms: ['Initial0', 'HeapCell0'], types: ['Initial', 'HeapCell'] },
            { atoms: ['Changed0', 'HeapCell0'], types: ['Changed', 'HeapCell'] },
            { atoms: ['Changed0', 'HeapCell1'], types: ['Changed', 'HeapCell'] },
            { atoms: ['Marked0', 'HeapCell0'], types: ['Marked', 'HeapCell'] },
          ]
        }
      ],
      types: [
        { id: 'HeapCell', types: ['HeapCell'], atoms: [], isBuiltin: false },
        // Abstract sig State - has no atoms directly
        { id: 'State', types: ['State'], atoms: [], isBuiltin: false },
        // Concrete subtypes - each has one atom
        { id: 'Initial', types: ['Initial', 'State'], atoms: [{ id: 'Initial0', type: 'Initial', label: 'Initial0' }], isBuiltin: false },
        { id: 'Changed', types: ['Changed', 'State'], atoms: [{ id: 'Changed0', type: 'Changed', label: 'Changed0' }], isBuiltin: false },
        { id: 'Marked', types: ['Marked', 'State'], atoms: [{ id: 'Marked0', type: 'Marked', label: 'Marked0' }], isBuiltin: false },
        { id: 'Swept', types: ['Swept', 'State'], atoms: [{ id: 'Swept0', type: 'Swept', label: 'Swept0' }], isBuiltin: false },
      ]
    };

    const specWithProjection = `
directives:
  - projection:
      sig: State
`;

    const instance = new JSONDataInstance(abstractSigData);
    const evaluator = createEvaluator(instance);
    const spec = parseLayoutSpec(specWithProjection);
    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    
    const { layout, projectionData } = layoutInstance.generateLayout(instance, {});

    // Projection data should include the abstract sig with all descendant atoms
    expect(projectionData).toHaveLength(1);
    expect(projectionData[0].type).toBe('State');
    expect(projectionData[0].atoms).toHaveLength(4);
    expect(projectionData[0].atoms).toContain('Initial0');
    expect(projectionData[0].atoms).toContain('Changed0');
    expect(projectionData[0].atoms).toContain('Marked0');
    expect(projectionData[0].atoms).toContain('Swept0');
    
    // The projected atom should be one of the available atoms (defaults to first)
    expect(projectionData[0].atoms).toContain(projectionData[0].projectedAtom);
  });

  it('supports switching projection between atoms of abstract sig subtypes', () => {
    const abstractSigData: IJsonDataInstance = {
      atoms: [
        { id: 'HeapCell0', type: 'HeapCell', label: 'HeapCell0' },
        { id: 'HeapCell1', type: 'HeapCell', label: 'HeapCell1' },
        { id: 'Initial0', type: 'Initial', label: 'Initial0' },
        { id: 'Changed0', type: 'Changed', label: 'Changed0' },
      ],
      relations: [
        {
          id: 'allocated',
          name: 'allocated',
          types: ['State', 'HeapCell'],
          tuples: [
            { atoms: ['Initial0', 'HeapCell0'], types: ['Initial', 'HeapCell'] },
            { atoms: ['Changed0', 'HeapCell0'], types: ['Changed', 'HeapCell'] },
            { atoms: ['Changed0', 'HeapCell1'], types: ['Changed', 'HeapCell'] },
          ]
        }
      ],
      types: [
        { id: 'HeapCell', types: ['HeapCell'], atoms: [
          { id: 'HeapCell0', type: 'HeapCell', label: 'HeapCell0' },
          { id: 'HeapCell1', type: 'HeapCell', label: 'HeapCell1' }
        ], isBuiltin: false },
        { id: 'State', types: ['State'], atoms: [], isBuiltin: false },
        { id: 'Initial', types: ['Initial', 'State'], atoms: [{ id: 'Initial0', type: 'Initial', label: 'Initial0' }], isBuiltin: false },
        { id: 'Changed', types: ['Changed', 'State'], atoms: [{ id: 'Changed0', type: 'Changed', label: 'Changed0' }], isBuiltin: false },
      ]
    };

    const specWithProjection = `
directives:
  - projection:
      sig: State
`;

    const instance = new JSONDataInstance(abstractSigData);
    const evaluator = createEvaluator(instance);
    const spec = parseLayoutSpec(specWithProjection);
    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    
    // First layout with explicit projection on Changed0
    const result1 = layoutInstance.generateLayout(instance, { 'State': 'Changed0' });
    expect(result1.projectionData[0].projectedAtom).toBe('Changed0');
    
    // The layout should show edges for Changed0's allocated tuples
    // Changed0 has HeapCell0 and HeapCell1 allocated
    
    // Second layout with projection on Initial0
    const result2 = layoutInstance.generateLayout(instance, { 'State': 'Initial0' });
    expect(result2.projectionData[0].projectedAtom).toBe('Initial0');
    
    // Both should have the same available atoms
    expect(result1.projectionData[0].atoms).toEqual(result2.projectionData[0].atoms);
  });

  it('inferred edge with ternary selector uses middle elements as label', () => {
    // A ternary relation: A --[via B]--> C
    // The middle element (B) should appear in the inferred edge label.
    const ternaryData: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'Alpha' },
        { id: 'B', type: 'Node', label: 'Bravo' },
        { id: 'C', type: 'Node', label: 'Charlie' },
      ],
      relations: [
        {
          id: 'path',
          name: 'path',
          types: ['Node', 'Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B', 'C'], types: ['Node', 'Node', 'Node'] },
          ],
        },
      ],
    };

    const spec = parseLayoutSpec(`
directives:
  - inferredEdge:
      name: route
      selector: path
`);

    const instance = new JSONDataInstance(ternaryData);
    const evaluator = createEvaluator(instance);
    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    const { layout, selectorErrors } = layoutInstance.generateLayout(instance, {});

    // No selector errors — ternary selectors are valid for inferred edges
    expect(selectorErrors).toHaveLength(0);

    // The inferred edge should go from A to C
    const inferredEdge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('route'));
    expect(inferredEdge).toBeDefined();
    expect(inferredEdge!.source.id).toBe('A');
    expect(inferredEdge!.target.id).toBe('C');

    // The label should include the middle node's label: "route[Bravo]"
    expect(inferredEdge!.label).toBe('route[Bravo]');
  });
});
