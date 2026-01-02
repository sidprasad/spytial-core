import { describe, it, expect } from 'vitest';
import { generateLayoutSpecYaml } from '../src/components/NoCodeView/CodeView';
import { parseLayoutSpecToData } from '../src/components/NoCodeView/NoCodeView';
import type { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces';

describe('NoCode Complete Round-Trip', () => {
  it('handles complete round-trip: NoCodeView data → YAML → NoCodeView data', () => {
    // Original data from NoCodeView
    const originalConstraints: ConstraintData[] = [
      {
        id: '1',
        type: 'align',
        params: {
          selector: '{x, y : Node | some x.R and some y.R}',
          direction: 'horizontal'
        }
      },
      {
        id: '2',
        type: 'orientation',
        params: {
          selector: 'Edge',
          directions: ['left']
        }
      },
      {
        id: '3',
        type: 'cyclic',
        params: {
          selector: '{x : Node | some x.cycle}',
          direction: 'clockwise'
        }
      },
      {
        id: '4',
        type: 'size',
        params: {
          selector: 'Node',
          width: 100,
          height: 50
        }
      },
      {
        id: '5',
        type: 'hideAtom',
        params: {
          selector: 'HiddenNode'
        }
      },
      {
        id: '6',
        type: 'groupfield',
        params: {
          field: 'type'
        }
      },
      {
        id: '7',
        type: 'groupselector',
        params: {
          selector: '{x : Node | some x.group}'
        }
      }
    ];

    const originalDirectives: DirectiveData[] = [
      {
        id: 'd1',
        type: 'color',
        params: {
          selector: 'Node',
          value: '#ff0000'
        }
      }
    ];

    // Step 1: Generate YAML from NoCodeView data
    const yaml = generateLayoutSpecYaml(originalConstraints, originalDirectives);
    
    // Step 2: Parse YAML back to NoCodeView data
    const { constraints: parsedConstraints, directives: parsedDirectives } = parseLayoutSpecToData(yaml);

    // Verify all constraints were preserved
    expect(parsedConstraints).toHaveLength(7);
    
    // Verify align constraint
    const alignConstraint = parsedConstraints.find(c => c.type === 'align');
    expect(alignConstraint).toBeDefined();
    expect(alignConstraint?.params.selector).toBe('{x, y : Node | some x.R and some y.R}');
    expect(alignConstraint?.params.direction).toBe('horizontal');
    
    // Verify orientation constraint
    const orientConstraint = parsedConstraints.find(c => c.type === 'orientation');
    expect(orientConstraint).toBeDefined();
    expect(orientConstraint?.params.selector).toBe('Edge');
    expect(orientConstraint?.params.directions).toEqual(['left']);
    
    // Verify cyclic constraint
    const cyclicConstraint = parsedConstraints.find(c => c.type === 'cyclic');
    expect(cyclicConstraint).toBeDefined();
    expect(cyclicConstraint?.params.selector).toBe('{x : Node | some x.cycle}');
    
    // Verify size constraint
    const sizeConstraint = parsedConstraints.find(c => c.type === 'size');
    expect(sizeConstraint).toBeDefined();
    expect(sizeConstraint?.params.width).toBe(100);
    expect(sizeConstraint?.params.height).toBe(50);
    
    // Verify hideAtom constraint
    const hideAtomConstraint = parsedConstraints.find(c => c.type === 'hideAtom');
    expect(hideAtomConstraint).toBeDefined();
    expect(hideAtomConstraint?.params.selector).toBe('HiddenNode');
    
    // Verify groupfield constraint
    const groupfieldConstraint = parsedConstraints.find(c => c.type === 'groupfield');
    expect(groupfieldConstraint).toBeDefined();
    expect(groupfieldConstraint?.params.field).toBe('type');
    
    // Verify groupselector constraint
    const groupselectorConstraint = parsedConstraints.find(c => c.type === 'groupselector');
    expect(groupselectorConstraint).toBeDefined();
    expect(groupselectorConstraint?.params.selector).toBe('{x : Node | some x.group}');
    
    // Verify directives
    expect(parsedDirectives).toHaveLength(1);
    const colorDirective = parsedDirectives[0];
    expect(colorDirective.type).toBe('color');
    expect(colorDirective.params.selector).toBe('Node');
    expect(colorDirective.params.value).toBe('#ff0000');
  });

  it('preserves comments through round-trip', () => {
    // This tests that comments are preserved when going from YAML to data and back
    const yamlWithComments = `
constraints:
  # This aligns nodes horizontally
  - align:
      selector: '{x, y : Node | true}'
      direction: 'horizontal'
  # This orients edges to the left
  - orientation:
      selector: Edge
      directions: [left]

directives:
  # Color all nodes red
  - color:
      selector: Node
      value: '#ff0000'
`;

    const { constraints, directives } = parseLayoutSpecToData(yamlWithComments);
    
    // Verify comments are extracted
    expect(constraints).toHaveLength(2);
    expect(constraints[0].comment).toBe('This aligns nodes horizontally');
    expect(constraints[1].comment).toBe('This orients edges to the left');
    
    expect(directives).toHaveLength(1);
    expect(directives[0].comment).toBe('Color all nodes red');
    
    // Generate YAML again with comments
    const regeneratedYaml = generateLayoutSpecYaml(constraints, directives);
    
    // Verify comments are in the YAML
    expect(regeneratedYaml).toContain('# This aligns nodes horizontally');
    expect(regeneratedYaml).toContain('# This orients edges to the left');
    expect(regeneratedYaml).toContain('# Color all nodes red');
  });
});
