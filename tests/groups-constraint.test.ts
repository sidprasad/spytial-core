import { describe, it, expect, vi } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { generateLayoutSpecYaml } from '../src/components/NoCodeView/CodeView';

// Mock evaluator for testing
const mockEvaluator = {
  evaluate: vi.fn()
};

// Mock data instance
const mockDataInstance = {
  atoms: [],
  relations: new Map(),
  types: new Map()
};

describe('Groupby constraint functionality', () => {
  it('should parse groupby constraint correctly', () => {
    const layoutSpecStr = `
constraints:
  - groupby:
      selector: 'Person->Car'
      name: 'ownership'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    expect(layoutSpec.constraints.grouping.groups).toHaveLength(1);
    expect(layoutSpec.constraints.grouping.groups[0].selector).toBe('Person->Car');
    expect(layoutSpec.constraints.grouping.groups[0].name).toBe('ownership');
    expect(layoutSpec.constraints.grouping.groups[0].toHTML()).toContain('GroupsBySelector');
    expect(layoutSpec.constraints.grouping.groups[0].toHTML()).toContain('Person->Car');
    expect(layoutSpec.constraints.grouping.groups[0].toHTML()).toContain('ownership');
  });
  
  it('should create multiple groups from binary selector results', () => {
    const layoutSpecStr = `
constraints:
  - groupby:
      selector: 'Person->Car'
      name: 'ownership'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    // Mock selector evaluation to return binary tuples
    mockEvaluator.evaluate.mockReturnValue({
      selectedTwoples: () => [
        ['Alice', 'Tesla'],
        ['Alice', 'BMW'],
        ['Bob', 'Ford'],
        ['Bob', 'Honda']
      ],
      selectedAtoms: () => []
    });

    const layoutInstance = new LayoutInstance(
      layoutSpec,
      mockEvaluator as any,
      0,
      true
    );

    // Create a mock graph
    const mockGraph = {
      edges: () => [],
      node: (nodeId: string) => ({ label: nodeId }) // Mock node method that returns label same as ID
    };

    // Access private method for testing
    const generateGroups = (layoutInstance as any).generateGroups.bind(layoutInstance);
    const groups = generateGroups(mockGraph, mockDataInstance);

    // Should create 2 groups: ownership[Alice] and ownership[Bob]
    expect(groups).toHaveLength(2);
    
    const aliceGroup = groups.find(g => g.name === 'ownership[Alice]');
    const bobGroup = groups.find(g => g.name === 'ownership[Bob]');
    
    expect(aliceGroup).toBeDefined();
    expect(aliceGroup.nodeIds).toEqual(['Tesla', 'BMW']);
    expect(aliceGroup.keyNodeId).toBe('Alice');
    
    expect(bobGroup).toBeDefined();
    expect(bobGroup.nodeIds).toEqual(['Ford', 'Honda']);
    expect(bobGroup.keyNodeId).toBe('Bob');
  });

  it('should handle empty binary selector results', () => {
    const layoutSpecStr = `
constraints:
  - groupby:
      selector: 'Person->Car'
      name: 'ownership'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    // Mock selector evaluation to return no results
    mockEvaluator.evaluate.mockReturnValue({
      selectedTwoples: () => [],
      selectedAtoms: () => []
    });

    const layoutInstance = new LayoutInstance(
      layoutSpec,
      mockEvaluator as any,
      0,
      true
    );

    // Create a mock graph
    const mockGraph = {
      edges: () => [],
      node: (nodeId: string) => ({ label: nodeId }) // Mock node method that returns label same as ID
    };

    // Access private method for testing
    const generateGroups = (layoutInstance as any).generateGroups.bind(layoutInstance);
    const groups = generateGroups(mockGraph, mockDataInstance);

    // Should create no groups
    expect(groups).toHaveLength(0);
  });

  it('should generate YAML correctly for groupby constraint', () => {
    const constraintData = [
      {
        id: '1',
        type: 'groupby' as const,
        params: {
          selector: 'Person->Car',
          name: 'ownership'
        }
      }
    ];

    const yaml = generateLayoutSpecYaml(constraintData, []);
    
    expect(yaml).toContain('constraints:');
    expect(yaml).toContain('- groupby:');
    expect(yaml).toContain('selector: Person->Car');
    expect(yaml).toContain('name: ownership');
  });

  it('should handle groupby constraint with edgeName', () => {
    const layoutSpecStr = `
constraints:
  - groupby:
      selector: 'Person->Car'
      name: 'ownership'
      edgeName: 'owns'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    expect(layoutSpec.constraints.grouping.groups).toHaveLength(1);
    expect(layoutSpec.constraints.grouping.groups[0].selector).toBe('Person->Car');
    expect(layoutSpec.constraints.grouping.groups[0].name).toBe('ownership');
    expect(layoutSpec.constraints.grouping.groups[0].edgeName).toBe('owns');
    expect(layoutSpec.constraints.grouping.groups[0].toHTML()).toContain('owns');
  });
});