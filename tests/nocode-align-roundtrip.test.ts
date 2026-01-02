import { describe, it, expect } from 'vitest';
import { parseLayoutSpecToData } from '../src/components/NoCodeView/NoCodeView';

describe('NoCode Align Round-Trip Conversion', () => {
  it('handles round-trip YAML parsing back to NoCodeView data for align constraint', () => {
    // This tests the actual bug scenario - parsing YAML with align constraint
    // back to structured data for the NoCodeView component
    const originalYaml = `
constraints:
  - align:
      selector: '{x, y : Node | some x.R and some y.R}'
      direction: 'horizontal'
  - orientation:
      selector: Edge
      directions: [left]
`;

    // Parse YAML back to structured data for NoCodeView
    const { constraints } = parseLayoutSpecToData(originalYaml);
    
    // Should have 2 constraints
    expect(constraints).toHaveLength(2);
    
    // First should be align constraint
    const alignConstraint = constraints.find(c => c.type === 'align');
    expect(alignConstraint).toBeDefined();
    expect(alignConstraint?.params.selector).toBe('{x, y : Node | some x.R and some y.R}');
    expect(alignConstraint?.params.direction).toBe('horizontal');
    
    // Second should be orientation constraint
    const orientConstraint = constraints.find(c => c.type === 'orientation');
    expect(orientConstraint).toBeDefined();
    expect(orientConstraint?.params.selector).toBe('Edge');
  });

  it('handles all constraint types in round-trip conversion', () => {
    const yamlWithAllTypes = `
constraints:
  - align:
      selector: '{x, y : Node | true}'
      direction: 'vertical'
  - size:
      selector: Node
      width: 100
      height: 50
  - hideAtom:
      selector: HiddenNode
`;

    // This should not throw an error (tests the fix for missing align, size, hideAtom)
    const { constraints } = parseLayoutSpecToData(yamlWithAllTypes);
    
    expect(constraints).toHaveLength(3);
    
    const alignConstraint = constraints.find(c => c.type === 'align');
    expect(alignConstraint).toBeDefined();
    expect(alignConstraint?.params.direction).toBe('vertical');
    
    const sizeConstraint = constraints.find(c => c.type === 'size');
    expect(sizeConstraint).toBeDefined();
    expect(sizeConstraint?.params.width).toBe(100);
    
    const hideAtomConstraint = constraints.find(c => c.type === 'hideAtom');
    expect(hideAtomConstraint).toBeDefined();
    expect(hideAtomConstraint?.params.selector).toBe('HiddenNode');
  });

  it('throws error for truly unknown constraint types', () => {
    const yamlWithUnknown = `
constraints:
  - unknownType:
      selector: Node
`;

    // Should throw for constraint types that don't exist
    expect(() => parseLayoutSpecToData(yamlWithUnknown)).toThrow(/Unsupported constraint type/);
  });
});
