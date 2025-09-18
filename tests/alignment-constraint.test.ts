import { describe, it, expect } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';

describe('Alignment Constraint', () => {
  it('should parse horizontal alignment constraint from YAML', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "Node"
      direction: ["horizontal"]
`;

    const layoutSpec = parseLayoutSpec(yamlSpec);
    
    expect(layoutSpec.constraints.alignment).toHaveLength(1);
    expect(layoutSpec.constraints.alignment[0].selector).toBe('Node');
    expect(layoutSpec.constraints.alignment[0].direction).toBe('horizontal');
  });

  it('should parse vertical alignment constraint from YAML', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "Edge"
      direction: ["vertical"]
`;

    const layoutSpec = parseLayoutSpec(yamlSpec);
    
    expect(layoutSpec.constraints.alignment).toHaveLength(1);
    expect(layoutSpec.constraints.alignment[0].selector).toBe('Edge');
    expect(layoutSpec.constraints.alignment[0].direction).toBe('vertical');
  });

  it('should handle direction as string instead of array', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "Node"
      direction: "horizontal"
`;

    const layoutSpec = parseLayoutSpec(yamlSpec);
    
    expect(layoutSpec.constraints.alignment).toHaveLength(1);
    expect(layoutSpec.constraints.alignment[0].direction).toBe('horizontal');
  });

  it('should throw error when selector is missing', () => {
    const yamlSpec = `
constraints:
  - align:
      direction: ["horizontal"]
`;

    expect(() => parseLayoutSpec(yamlSpec)).toThrow('Alignment constraint must have a selector');
  });

  it('should throw error when direction is missing', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "Node"
`;

    expect(() => parseLayoutSpec(yamlSpec)).toThrow('Alignment constraint must have a direction');
  });

  it('should throw error for invalid direction', () => {
    const yamlSpec = `
constraints:
  - align:
      selector: "Node"
      direction: ["diagonal"]
`;

    expect(() => parseLayoutSpec(yamlSpec)).toThrow("Alignment constraint direction must be 'horizontal' or 'vertical'");
  });

  it('should work alongside other constraints', () => {
    const yamlSpec = `
constraints:
  - orientation:
      selector: "r"
      directions:
        - right
  - align:
      selector: "Node"
      direction: ["horizontal"]
`;

    const layoutSpec = parseLayoutSpec(yamlSpec);
    
    expect(layoutSpec.constraints.orientation.relative).toHaveLength(1);
    expect(layoutSpec.constraints.alignment).toHaveLength(1);
    expect(layoutSpec.constraints.alignment[0].selector).toBe('Node');
    expect(layoutSpec.constraints.alignment[0].direction).toBe('horizontal');
  });
});