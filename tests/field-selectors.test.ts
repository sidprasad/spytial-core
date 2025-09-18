import { describe, it, expect } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';

describe('Field-based directives with selectors', () => {
  it('should parse field directives with selectors', () => {
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'name'
      value: 'red'
      selector: 'Person'
  - attribute:
      field: 'age'
      selector: 'Person'
  - hideField:
      field: 'secret'
      selector: 'User'
constraints:
  - group:
      field: 'owns'
      groupOn: 0
      addToGroup: 1
      selector: 'Car'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    // Test edge color directive with selector
    expect(layoutSpec.directives.edgeColors).toHaveLength(1);
    expect(layoutSpec.directives.edgeColors[0].field).toBe('name');
    expect(layoutSpec.directives.edgeColors[0].color).toBe('red');
    expect(layoutSpec.directives.edgeColors[0].selector).toBe('Person');
    
    // Test attribute directive with selector
    expect(layoutSpec.directives.attributes).toHaveLength(1);
    expect(layoutSpec.directives.attributes[0].field).toBe('age');
    expect(layoutSpec.directives.attributes[0].selector).toBe('Person');
    
    // Test hidden field directive with selector
    expect(layoutSpec.directives.hiddenFields).toHaveLength(1);
    expect(layoutSpec.directives.hiddenFields[0].field).toBe('secret');
    expect(layoutSpec.directives.hiddenFields[0].selector).toBe('User');
    
    // Test group by field constraint with selector
    expect(layoutSpec.constraints.grouping.byfield).toHaveLength(1);
    expect(layoutSpec.constraints.grouping.byfield[0].field).toBe('owns');
    expect(layoutSpec.constraints.grouping.byfield[0].selector).toBe('Car');
  });

  it('should parse field directives without selectors (legacy)', () => {
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'name'
      value: 'blue'
  - attribute:
      field: 'age'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    // Test legacy directives work
    expect(layoutSpec.directives.edgeColors).toHaveLength(1);
    expect(layoutSpec.directives.edgeColors[0].field).toBe('name');
    expect(layoutSpec.directives.edgeColors[0].color).toBe('blue');
    expect(layoutSpec.directives.edgeColors[0].selector).toBeUndefined();
    
    expect(layoutSpec.directives.attributes).toHaveLength(1);
    expect(layoutSpec.directives.attributes[0].field).toBe('age');
    expect(layoutSpec.directives.attributes[0].selector).toBeUndefined();
  });
});