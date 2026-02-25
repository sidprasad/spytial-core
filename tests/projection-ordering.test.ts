import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import {
  applyProjectionTransform,
  topologicalSortWithCycleBreaking,
  Projection,
} from '../src/data-instance/projection-transform';

/**
 * Helper: simulates an evaluateOrderBy function by looking up a relation
 * in the given data and returning its tuples as [from, to] pairs.
 */
function makeOrderByEvaluator(data: IJsonDataInstance) {
  return (selector: string): string[][] => {
    const rel = data.relations?.find(r => r.name === selector);
    if (!rel) {
      throw new Error(`Unknown relation: ${selector}`);
    }
    return rel.tuples.map(t => [t.atoms[0], t.atoms[1]]);
  };
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
    const instance = new JSONDataInstance(timeChainData);
    const projections: Projection[] = [{ sig: 'Time' }];

    const { choices } = applyProjectionTransform(instance, projections, {});

    expect(choices).toHaveLength(1);
    expect(choices[0].type).toBe('Time');
    // Should be sorted lexicographically: Time0, Time1, Time2
    expect(choices[0].atoms).toEqual(['Time0', 'Time1', 'Time2']);
  });

  it('should sort atoms based on orderBy selector when specified', () => {
    // Using next relation to define partial order
    // Time0 -> Time1, Time1 -> Time2
    // Topological sort should give: Time0, Time1, Time2
    const instance = new JSONDataInstance(timeChainData);
    const projections: Projection[] = [{ sig: 'Time', orderBy: 'next' }];

    const { choices } = applyProjectionTransform(instance, projections, {}, {
      evaluateOrderBy: makeOrderByEvaluator(timeChainData),
    });

    expect(choices).toHaveLength(1);
    expect(choices[0].type).toBe('Time');
    // Topological sort of next: Time0 -> Time1 -> Time2
    expect(choices[0].atoms).toEqual(['Time0', 'Time1', 'Time2']);
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

    const instance = new JSONDataInstance(dataWithExtra);
    const projections: Projection[] = [{ sig: 'Time', orderBy: 'next' }];

    const { choices } = applyProjectionTransform(instance, projections, {}, {
      evaluateOrderBy: makeOrderByEvaluator(dataWithExtra),
    });

    expect(choices).toHaveLength(1);
    // Topological sort: Time0 -> Time1 -> Time2, then TimeOrphan (no edges, so lexicographically placed)
    // Ready initially: Time0 (in-degree 0), TimeOrphan (in-degree 0) -> pick Time0 (lex first)
    // After Time0: Time1 becomes ready, TimeOrphan still ready -> pick Time1 (lex first)
    // After Time1: Time2 becomes ready, TimeOrphan still ready -> pick Time2 (lex first)
    // After Time2: TimeOrphan ready -> pick TimeOrphan
    expect(choices[0].atoms).toEqual(['Time0', 'Time1', 'Time2', 'TimeOrphan']);
  });

  it('should fallback to lexicographic sort on invalid orderBy selector', () => {
    const instance = new JSONDataInstance(timeChainData);
    const projections: Projection[] = [{ sig: 'Time', orderBy: 'nonExistentRelation' }];

    const errors: { selector: string; error: unknown }[] = [];

    const { choices } = applyProjectionTransform(instance, projections, {}, {
      evaluateOrderBy: (selector) => {
        throw new Error(`Unknown relation: ${selector}`);
      },
      onOrderByError: (selector, error) => {
        errors.push({ selector, error });
      },
    });

    expect(choices).toHaveLength(1);
    // Should fallback to lexicographic order
    expect(choices[0].atoms).toEqual(['Time0', 'Time1', 'Time2']);
    // Should have recorded the error
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.selector === 'nonExistentRelation')).toBe(true);
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

    const instance = new JSONDataInstance(cyclicData);
    const projections: Projection[] = [{ sig: 'State', orderBy: 'next' }];

    const { choices } = applyProjectionTransform(instance, projections, {}, {
      evaluateOrderBy: makeOrderByEvaluator(cyclicData),
    });

    expect(choices).toHaveLength(1);
    // All nodes are in a cycle, so none have in-degree 0
    // Algorithm breaks cycle by picking lexicographically smallest: StateA
    // After StateA: StateB has in-degree 0 -> pick StateB
    // After StateB: StateC has in-degree 0 -> pick StateC
    expect(choices[0].atoms).toEqual(['StateA', 'StateB', 'StateC']);
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

    const instance = new JSONDataInstance(multiProjectionData);
    const projections: Projection[] = [
      { sig: 'Time', orderBy: 'next' },
      { sig: 'Process', orderBy: 'priority' },
    ];

    const { choices } = applyProjectionTransform(instance, projections, {}, {
      evaluateOrderBy: makeOrderByEvaluator(multiProjectionData),
    });

    expect(choices).toHaveLength(2);
    
    // Time should be ordered by next relation (topological sort)
    const timeProjection = choices.find(p => p.type === 'Time');
    expect(timeProjection).toBeDefined();
    expect(timeProjection!.atoms).toEqual(['Time0', 'Time1', 'Time2']);
    
    // Process should be ordered by priority relation
    // priority defines edges: ProcessC->1, ProcessB->2, ProcessA->3
    // But 1, 2, 3 are Int atoms, not Process atoms, so these edges are ignored
    // Result: all Process atoms have in-degree 0, so they're sorted lexicographically
    const processProjection = choices.find(p => p.type === 'Process');
    expect(processProjection).toBeDefined();
    expect(processProjection!.atoms).toEqual(['ProcessA', 'ProcessB', 'ProcessC']);
  });

  it('should accept Projection objects directly', () => {
    const projections: Projection[] = [
      { sig: 'Time', orderBy: '^next' },
    ];
    
    expect(projections).toHaveLength(1);
    expect(projections[0].sig).toBe('Time');
    expect(projections[0].orderBy).toBe('^next');
  });

  it('should handle Projection without orderBy', () => {
    const projections: Projection[] = [
      { sig: 'State' },
    ];

    expect(projections).toHaveLength(1);
    expect(projections[0].sig).toBe('State');
    expect(projections[0].orderBy).toBeUndefined();
  });
});
