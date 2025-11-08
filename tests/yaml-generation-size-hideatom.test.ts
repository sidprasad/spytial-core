/**
 * Tests for YAML generation with size and hideAtom in constraints
 */

import { describe, it, expect } from 'vitest';
import { generateLayoutSpecYaml } from '../src/components/NoCodeView/CodeView';
import { parseLayoutSpec } from '../src/layout';
import { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces';

describe('YAML Generation for Size and HideAtom', () => {
  it('should generate YAML with size in constraints block', () => {
    const constraints: ConstraintData[] = [
      {
        id: '1',
        type: 'size',
        params: {
          selector: 'Type1',
          height: 100,
          width: 200
        }
      }
    ];
    const directives: DirectiveData[] = [];

    const yaml = generateLayoutSpecYaml(constraints, directives);
    
    expect(yaml).toContain('constraints:');
    expect(yaml).toContain('size:');
    expect(yaml).toContain('selector: Type1');
    expect(yaml).toContain('height: 100');
    expect(yaml).toContain('width: 200');
    
    // Verify it can be parsed back
    const parsed = parseLayoutSpec(yaml);
    expect(parsed.directives.sizes).toHaveLength(1);
    expect(parsed.directives.sizes[0].selector).toBe('Type1');
  });

  it('should generate YAML with hideAtom in constraints block', () => {
    const constraints: ConstraintData[] = [
      {
        id: '1',
        type: 'hideAtom',
        params: {
          selector: 'Type2'
        }
      }
    ];
    const directives: DirectiveData[] = [];

    const yaml = generateLayoutSpecYaml(constraints, directives);
    
    expect(yaml).toContain('constraints:');
    expect(yaml).toContain('hideAtom:');
    expect(yaml).toContain('selector: Type2');
    
    // Verify it can be parsed back
    const parsed = parseLayoutSpec(yaml);
    expect(parsed.directives.hiddenAtoms).toHaveLength(1);
    expect(parsed.directives.hiddenAtoms[0].selector).toBe('Type2');
  });

  it('should generate YAML with both size and hideAtom in constraints', () => {
    const constraints: ConstraintData[] = [
      {
        id: '1',
        type: 'size',
        params: {
          selector: 'Type1',
          height: 100,
          width: 200
        }
      },
      {
        id: '2',
        type: 'hideAtom',
        params: {
          selector: 'Type2'
        }
      }
    ];
    const directives: DirectiveData[] = [];

    const yaml = generateLayoutSpecYaml(constraints, directives);
    
    expect(yaml).toContain('constraints:');
    expect(yaml).toContain('size:');
    expect(yaml).toContain('hideAtom:');
    
    // Verify it can be parsed back
    const parsed = parseLayoutSpec(yaml);
    expect(parsed.directives.sizes).toHaveLength(1);
    expect(parsed.directives.hiddenAtoms).toHaveLength(1);
  });

  it('should generate YAML with size in directives block (backward compatibility)', () => {
    const constraints: ConstraintData[] = [];
    const directives: DirectiveData[] = [
      {
        id: '1',
        type: 'size',
        params: {
          selector: 'Type1',
          height: 150,
          width: 250
        }
      }
    ];

    const yaml = generateLayoutSpecYaml(constraints, directives);
    
    expect(yaml).toContain('directives:');
    expect(yaml).toContain('size:');
    
    // Verify it can be parsed back
    const parsed = parseLayoutSpec(yaml);
    expect(parsed.directives.sizes).toHaveLength(1);
  });

  it('should generate YAML with hideAtom in directives block (backward compatibility)', () => {
    const constraints: ConstraintData[] = [];
    const directives: DirectiveData[] = [
      {
        id: '1',
        type: 'hideAtom',
        params: {
          selector: 'Type2'
        }
      }
    ];

    const yaml = generateLayoutSpecYaml(constraints, directives);
    
    expect(yaml).toContain('directives:');
    expect(yaml).toContain('hideAtom:');
    
    // Verify it can be parsed back
    const parsed = parseLayoutSpec(yaml);
    expect(parsed.directives.hiddenAtoms).toHaveLength(1);
  });

  it('should generate YAML with mixed constraints and directives', () => {
    const constraints: ConstraintData[] = [
      {
        id: '1',
        type: 'orientation',
        params: {
          selector: 'A->B',
          directions: ['left']
        }
      },
      {
        id: '2',
        type: 'size',
        params: {
          selector: 'Type1',
          height: 100,
          width: 200
        }
      }
    ];
    const directives: DirectiveData[] = [
      {
        id: '1',
        type: 'atomColor',
        params: {
          selector: 'Type1',
          value: '#FF0000'
        }
      },
      {
        id: '2',
        type: 'hideAtom',
        params: {
          selector: 'Type2'
        }
      }
    ];

    const yaml = generateLayoutSpecYaml(constraints, directives);
    
    expect(yaml).toContain('constraints:');
    expect(yaml).toContain('orientation:');
    expect(yaml).toContain('size:');
    expect(yaml).toContain('directives:');
    expect(yaml).toContain('atomColor:');
    expect(yaml).toContain('hideAtom:');
    
    // Verify it can be parsed back correctly
    const parsed = parseLayoutSpec(yaml);
    expect(parsed.constraints.orientation.relative).toHaveLength(1);
    expect(parsed.directives.sizes).toHaveLength(1);
    expect(parsed.directives.atomColors).toHaveLength(1);
    expect(parsed.directives.hiddenAtoms).toHaveLength(1);
  });

  it('should handle round-trip conversion correctly', () => {
    const originalConstraints: ConstraintData[] = [
      {
        id: '1',
        type: 'size',
        params: {
          selector: 'Type1',
          height: 100,
          width: 200
        }
      },
      {
        id: '2',
        type: 'hideAtom',
        params: {
          selector: 'Type2'
        }
      }
    ];
    const originalDirectives: DirectiveData[] = [];

    // Generate YAML
    const yaml = generateLayoutSpecYaml(originalConstraints, originalDirectives);
    
    // Parse it back
    const parsed = parseLayoutSpec(yaml);
    
    // Verify the data is preserved
    expect(parsed.directives.sizes).toHaveLength(1);
    expect(parsed.directives.sizes[0]).toMatchObject({
      selector: 'Type1',
      height: 100,
      width: 200
    });
    expect(parsed.directives.hiddenAtoms).toHaveLength(1);
    expect(parsed.directives.hiddenAtoms[0]).toMatchObject({
      selector: 'Type2'
    });
  });
});
