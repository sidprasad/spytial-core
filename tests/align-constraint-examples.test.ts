import { describe, it, expect } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';

describe('Align Constraint Examples', () => {
  it('demonstrates horizontal alignment usage', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "{x, y : Node | some x.R and some y.R}"
      direction: "horizontal"
`;

    const spec = parseLayoutSpec(yamlSpec);
    const alignConstraint = spec.constraints.alignment[0];
    
    expect(alignConstraint.direction).toBe('horizontal');
    expect(alignConstraint.selector).toBe('{x, y : Node | some x.R and some y.R}');
    
    // Horizontal alignment ensures nodes have same Y coordinate
    expect(alignConstraint.toHTML()).toContain('horizontal');
  });

  it('demonstrates vertical alignment usage', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "{a, b : Node | connected[a, b]}"
      direction: "vertical"
`;

    const spec = parseLayoutSpec(yamlSpec);
    const alignConstraint = spec.constraints.alignment[0];
    
    expect(alignConstraint.direction).toBe('vertical');
    expect(alignConstraint.selector).toBe('{a, b : Node | connected[a, b]}');
    
    // Vertical alignment ensures nodes have same X coordinate
    expect(alignConstraint.toHTML()).toContain('vertical');
  });

  it('demonstrates multiple align constraints', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "{x, y : Node | x.type = y.type}"
      direction: "horizontal"
  - align:
      selector: "{a, b : Node | a.level = b.level}"
      direction: "vertical"
`;

    const spec = parseLayoutSpec(yamlSpec);
    
    expect(spec.constraints.alignment.length).toBe(2);
    
    const horizontalAlign = spec.constraints.alignment.find(c => c.direction === 'horizontal');
    const verticalAlign = spec.constraints.alignment.find(c => c.direction === 'vertical');
    
    expect(horizontalAlign).toBeDefined();
    expect(verticalAlign).toBeDefined();
    
    expect(horizontalAlign!.selector).toBe('{x, y : Node | x.type = y.type}');
    expect(verticalAlign!.selector).toBe('{a, b : Node | a.level = b.level}');
  });

  it('works with mixed constraint types', () => {
    const yamlSpec = `
constraints:
  - orientation:
      selector: "Edge"
      directions: ["left"]
  - align:
      selector: "{x, y : Node | x != y}"
      direction: "horizontal"
  - cyclic:
      selector: "{x : Node | some x.cycle}"
      direction: "clockwise"
`;

    const spec = parseLayoutSpec(yamlSpec);
    
    expect(spec.constraints.orientation.relative.length).toBe(1);
    expect(spec.constraints.alignment.length).toBe(1);
    expect(spec.constraints.orientation.cyclic.length).toBe(1);
    
    // Verify the align constraint is properly parsed alongside others
    const alignConstraint = spec.constraints.alignment[0];
    expect(alignConstraint.selector).toBe('{x, y : Node | x != y}');
    expect(alignConstraint.direction).toBe('horizontal');
  });
});