import { describe, it, expect } from 'vitest';
import { generateLayoutSpecYaml } from '../src/components/NoCodeView/CodeView';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import type { ConstraintData } from '../src/components/NoCodeView/interfaces';

describe('NoCode Align Integration', () => {
  it('handles align constraint in YAML generation', () => {
    const alignConstraintData: ConstraintData = {
      id: 'test-align',
      type: 'align',
      params: {
        selector: '{x, y : Node | some x.R and some y.R}',
        direction: 'horizontal'
      }
    };

    const generatedYaml = generateLayoutSpecYaml([alignConstraintData], []);
    
    expect(generatedYaml).toContain('align:');
    expect(generatedYaml).toContain("selector: '{x, y : Node | some x.R and some y.R}'");
    expect(generatedYaml).toContain('direction: horizontal');
  });

  it('supports round-trip YAML conversion', () => {
    const originalConstraints: ConstraintData[] = [
      {
        id: 'align-1',
        type: 'align',
        params: {
          selector: '{a, b : Node | a != b}',
          direction: 'vertical'
        }
      },
      {
        id: 'align-2', 
        type: 'align',
        params: {
          selector: '{x, y : Node | x.edge.y}',
          direction: 'horizontal'
        }
      }
    ];

    // Generate YAML
    const yaml = generateLayoutSpecYaml(originalConstraints, []);
    
    // Parse it back
    const parsed = parseLayoutSpec(yaml);
    
    expect(parsed.constraints.alignment.length).toBe(2);
    
    const constraint1 = parsed.constraints.alignment[0];
    const constraint2 = parsed.constraints.alignment[1];
    
    // Check first constraint
    expect(constraint1.selector).toBe('{a, b : Node | a != b}');
    expect(constraint1.direction).toBe('vertical');
    expect(constraint1.isInternallyConsistent()).toBe(true);
    
    // Check second constraint
    expect(constraint2.selector).toBe('{x, y : Node | x.edge.y}');
    expect(constraint2.direction).toBe('horizontal');
    expect(constraint2.isInternallyConsistent()).toBe(true);
  });

  it('integrates with existing constraint types', () => {
    const mixedConstraints: ConstraintData[] = [
      {
        id: 'orientation-1',
        type: 'orientation',
        params: {
          selector: 'Edge',
          directions: ['left'] // Use just one direction to avoid inconsistency
        }
      },
      {
        id: 'align-1',
        type: 'align',
        params: {
          selector: '{x, y : Node | connected[x, y]}',
          direction: 'horizontal'
        }
      },
      {
        id: 'cyclic-1',
        type: 'cyclic',
        params: {
          selector: '{x : Node | some x.cycle}',
          direction: 'clockwise'
        }
      }
    ];

    const yaml = generateLayoutSpecYaml(mixedConstraints, []);
    const parsed = parseLayoutSpec(yaml);
    
    expect(parsed.constraints.orientation.relative.length).toBe(1);
    expect(parsed.constraints.alignment.length).toBe(1);
    expect(parsed.constraints.orientation.cyclic.length).toBe(1);
    
    // Verify align constraint is properly parsed
    const alignConstraint = parsed.constraints.alignment[0];
    expect(alignConstraint.selector).toBe('{x, y : Node | connected[x, y]}');
    expect(alignConstraint.direction).toBe('horizontal');
  });

  it('validates constraint parameters correctly', () => {
    // Test missing selector
    expect(() => {
      generateLayoutSpecYaml([{
        id: 'test',
        type: 'align',
        params: { direction: 'horizontal' }
      }], []);
    }).not.toThrow(); // YAML generation shouldn't fail, parsing should

    // Test missing direction
    expect(() => {
      generateLayoutSpecYaml([{
        id: 'test',
        type: 'align',
        params: { selector: '{x, y : Node | true}' }
      }], []);
    }).not.toThrow(); // YAML generation shouldn't fail, parsing should

    // Test invalid direction during parsing
    const invalidYaml = `
    constraints:
      - align:
          selector: "{x, y : Node | true}"
          direction: "invalid"
    `;
    
    expect(() => parseLayoutSpec(invalidYaml)).toThrow();
  });
});