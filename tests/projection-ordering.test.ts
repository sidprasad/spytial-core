import { describe, it, expect } from 'vitest';
import { LayoutInstance, parseLayoutSpec } from '../src/layout';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('Projection Ordering', () => {
  // Test data: Time signature with a 'next' relation forming a chain
  const timeChainData: IJsonDataInstance = {
    atoms: [
      { id: 'Time2', type: 'Time', label: 'Time2' },
      { id: 'Time0', type: 'Time', label: 'Time0' },
      { id: 'Time1', type: 'Time', label: 'Time1' },
      { id: 'Person0', type: 'Person', label: 'Person0' },
    ],
    relations: [
      {
        id: 'next',
        name: 'next',
        types: ['Time', 'Time'],
        tuples: [
          { atoms: ['Time0', 'Time1'], types: ['Time', 'Time'] },
          { atoms: ['Time1', 'Time2'], types: ['Time', 'Time'] },
        ]
      }
    ],
    types: [
      { id: 'Time', types: ['Time'], atoms: [
        { id: 'Time2', type: 'Time', label: 'Time2' },
        { id: 'Time0', type: 'Time', label: 'Time0' },
        { id: 'Time1', type: 'Time', label: 'Time1' },
      ], isBuiltin: false },
      { id: 'Person', types: ['Person'], atoms: [
        { id: 'Person0', type: 'Person', label: 'Person0' },
      ], isBuiltin: false },
    ]
  };

  it('should sort atoms lexicographically by default when no orderBy is specified', () => {
    const spec = `
directives:
  - projection:
      sig: Time
`;

    const instance = new JSONDataInstance(timeChainData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(spec);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const { projectionData } = layoutInstance.generateLayout(instance, {});

    expect(projectionData).toHaveLength(1);
    expect(projectionData[0].type).toBe('Time');
    // Should be sorted lexicographically: Time0, Time1, Time2
    expect(projectionData[0].atoms).toEqual(['Time0', 'Time1', 'Time2']);
  });

  it('should sort atoms based on orderBy selector when specified', () => {
    // Using next relation to define partial order
    // Time0 -> Time1, Time1 -> Time2
    // Topological sort should give: Time0, Time1, Time2
    const spec = `
directives:
  - projection:
      sig: Time
      orderBy: "next"
`;

    const instance = new JSONDataInstance(timeChainData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(spec);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const { projectionData } = layoutInstance.generateLayout(instance, {});

    expect(projectionData).toHaveLength(1);
    expect(projectionData[0].type).toBe('Time');
    // Topological sort of next: Time0 -> Time1 -> Time2
    expect(projectionData[0].atoms).toEqual(['Time0', 'Time1', 'Time2']);
  });

  it('should handle atoms not in the orderBy selector result', () => {
    // Test data with an atom that doesn't appear in the orderBy relation
    const dataWithExtra: IJsonDataInstance = {
      atoms: [
        { id: 'Time2', type: 'Time', label: 'Time2' },
        { id: 'Time0', type: 'Time', label: 'Time0' },
        { id: 'Time1', type: 'Time', label: 'Time1' },
        { id: 'TimeOrphan', type: 'Time', label: 'TimeOrphan' },
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Time', 'Time'],
          tuples: [
            { atoms: ['Time0', 'Time1'], types: ['Time', 'Time'] },
            { atoms: ['Time1', 'Time2'], types: ['Time', 'Time'] },
          ]
        }
      ],
      types: [
        { id: 'Time', types: ['Time'], atoms: [
          { id: 'Time2', type: 'Time', label: 'Time2' },
          { id: 'Time0', type: 'Time', label: 'Time0' },
          { id: 'Time1', type: 'Time', label: 'Time1' },
          { id: 'TimeOrphan', type: 'Time', label: 'TimeOrphan' },
        ], isBuiltin: false },
      ]
    };

    const spec = `
directives:
  - projection:
      sig: Time
      orderBy: "next"
`;

    const instance = new JSONDataInstance(dataWithExtra);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(spec);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const { projectionData } = layoutInstance.generateLayout(instance, {});

    expect(projectionData).toHaveLength(1);
    // Topological sort: Time0 -> Time1 -> Time2, then TimeOrphan (no edges, so lexicographically placed)
    // Time0, Time1 come in order from the chain
    // Time2 comes next (end of chain, in-degree satisfied after Time1)
    // TimeOrphan has no edges, so it's placed based on when its in-degree becomes 0
    // Since all have in-degree 0 initially except Time1 and Time2, we process in lex order among those ready
    // Ready initially: Time0 (in-degree 0), TimeOrphan (in-degree 0) -> pick Time0 (lex first)
    // After Time0: Time1 becomes ready, TimeOrphan still ready -> pick Time1 (lex first)
    // After Time1: Time2 becomes ready, TimeOrphan still ready -> pick Time2 (lex first)
    // After Time2: TimeOrphan ready -> pick TimeOrphan
    expect(projectionData[0].atoms).toEqual(['Time0', 'Time1', 'Time2', 'TimeOrphan']);
  });

  it('should fallback to lexicographic sort on invalid orderBy selector', () => {
    const spec = `
directives:
  - projection:
      sig: Time
      orderBy: "nonExistentRelation"
`;

    const instance = new JSONDataInstance(timeChainData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(spec);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const { projectionData, selectorErrors } = layoutInstance.generateLayout(instance, {});

    expect(projectionData).toHaveLength(1);
    // Should fallback to lexicographic order
    expect(projectionData[0].atoms).toEqual(['Time0', 'Time1', 'Time2']);
    // Should record a selector error
    expect(selectorErrors.length).toBeGreaterThan(0);
    expect(selectorErrors.some(e => e.selector === 'nonExistentRelation')).toBe(true);
  });

  it('should handle cycles in orderBy relation by breaking them', () => {
    // Create a cycle: A -> B -> C -> A
    const cyclicData: IJsonDataInstance = {
      atoms: [
        { id: 'StateC', type: 'State', label: 'StateC' },
        { id: 'StateA', type: 'State', label: 'StateA' },
        { id: 'StateB', type: 'State', label: 'StateB' },
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['State', 'State'],
          tuples: [
            { atoms: ['StateA', 'StateB'], types: ['State', 'State'] },
            { atoms: ['StateB', 'StateC'], types: ['State', 'State'] },
            { atoms: ['StateC', 'StateA'], types: ['State', 'State'] }, // Creates cycle
          ]
        }
      ],
      types: [
        { id: 'State', types: ['State'], atoms: [
          { id: 'StateC', type: 'State', label: 'StateC' },
          { id: 'StateA', type: 'State', label: 'StateA' },
          { id: 'StateB', type: 'State', label: 'StateB' },
        ], isBuiltin: false },
      ]
    };

    const spec = `
directives:
  - projection:
      sig: State
      orderBy: "next"
`;

    const instance = new JSONDataInstance(cyclicData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(spec);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const { projectionData } = layoutInstance.generateLayout(instance, {});

    expect(projectionData).toHaveLength(1);
    // All nodes are in a cycle, so none have in-degree 0
    // Algorithm breaks cycle by picking lexicographically smallest: StateA
    // After StateA: StateB has in-degree 0 -> pick StateB
    // After StateB: StateC has in-degree 0 -> pick StateC
    expect(projectionData[0].atoms).toEqual(['StateA', 'StateB', 'StateC']);
  });

  it('should handle multiple projections with different orderBy selectors', () => {
    const multiProjectionData: IJsonDataInstance = {
      atoms: [
        { id: 'Time2', type: 'Time', label: 'Time2' },
        { id: 'Time0', type: 'Time', label: 'Time0' },
        { id: 'Time1', type: 'Time', label: 'Time1' },
        { id: 'ProcessC', type: 'Process', label: 'ProcessC' },
        { id: 'ProcessA', type: 'Process', label: 'ProcessA' },
        { id: 'ProcessB', type: 'Process', label: 'ProcessB' },
        // Int atoms needed for the priority relation
        { id: '1', type: 'Int', label: '1' },
        { id: '2', type: 'Int', label: '2' },
        { id: '3', type: 'Int', label: '3' },
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Time', 'Time'],
          tuples: [
            { atoms: ['Time0', 'Time1'], types: ['Time', 'Time'] },
            { atoms: ['Time1', 'Time2'], types: ['Time', 'Time'] },
          ]
        },
        {
          id: 'priority',
          name: 'priority',
          types: ['Process', 'Int'],
          tuples: [
            { atoms: ['ProcessC', '1'], types: ['Process', 'Int'] },
            { atoms: ['ProcessA', '3'], types: ['Process', 'Int'] },
            { atoms: ['ProcessB', '2'], types: ['Process', 'Int'] },
          ]
        }
      ],
      types: [
        { id: 'Time', types: ['Time'], atoms: [
          { id: 'Time2', type: 'Time', label: 'Time2' },
          { id: 'Time0', type: 'Time', label: 'Time0' },
          { id: 'Time1', type: 'Time', label: 'Time1' },
        ], isBuiltin: false },
        { id: 'Process', types: ['Process'], atoms: [
          { id: 'ProcessC', type: 'Process', label: 'ProcessC' },
          { id: 'ProcessA', type: 'Process', label: 'ProcessA' },
          { id: 'ProcessB', type: 'Process', label: 'ProcessB' },
        ], isBuiltin: false },
        { id: 'Int', types: ['Int'], atoms: [
          { id: '1', type: 'Int', label: '1' },
          { id: '2', type: 'Int', label: '2' },
          { id: '3', type: 'Int', label: '3' },
        ], isBuiltin: true },
      ]
    };

    const spec = `
directives:
  - projection:
      sig: Time
      orderBy: "next"
  - projection:
      sig: Process
      orderBy: "priority"
`;

    const instance = new JSONDataInstance(multiProjectionData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(spec);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const { projectionData } = layoutInstance.generateLayout(instance, {});

    expect(projectionData).toHaveLength(2);
    
    // Time should be ordered by next relation (topological sort)
    const timeProjection = projectionData.find(p => p.type === 'Time');
    expect(timeProjection).toBeDefined();
    expect(timeProjection!.atoms).toEqual(['Time0', 'Time1', 'Time2']);
    
    // Process should be ordered by priority relation
    // priority defines edges: ProcessC->1, ProcessB->2, ProcessA->3
    // But 1, 2, 3 are Int atoms, not Process atoms, so these edges are ignored
    // Result: all Process atoms have in-degree 0, so they're sorted lexicographically
    const processProjection = projectionData.find(p => p.type === 'Process');
    expect(processProjection).toBeDefined();
    expect(processProjection!.atoms).toEqual(['ProcessA', 'ProcessB', 'ProcessC']);
  });

  it('should parse projection with orderBy from YAML correctly', () => {
    const spec = `
directives:
  - projection:
      sig: Time
      orderBy: "^next"
`;

    const layoutSpec = parseLayoutSpec(spec);
    expect(layoutSpec.directives.projections).toHaveLength(1);
    expect(layoutSpec.directives.projections[0].sig).toBe('Time');
    expect(layoutSpec.directives.projections[0].orderBy).toBe('^next');
  });

  it('should handle projection without orderBy in YAML', () => {
    const spec = `
directives:
  - projection:
      sig: State
`;

    const layoutSpec = parseLayoutSpec(spec);
    expect(layoutSpec.directives.projections).toHaveLength(1);
    expect(layoutSpec.directives.projections[0].sig).toBe('State');
    expect(layoutSpec.directives.projections[0].orderBy).toBeUndefined();
  });
});
