/**
 * Tests for Code View / Structured Builder synchronization
 * 
 * These tests verify that:
 * 1. YAML is correctly generated from constraints/directives
 * 2. YAML is correctly parsed back into constraints/directives
 * 3. Sync works correctly when switching between views
 * 4. Edge cases like empty specs, invalid YAML, etc. are handled
 */

import { describe, it, expect } from 'vitest';
import { generateLayoutSpecYaml, validateYaml, validateSpytialSpec } from '../src/components/NoCodeView/CodeView';
import { parseLayoutSpecToData } from '../src/components/NoCodeView/NoCodeView';
import { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces';

describe('generateLayoutSpecYaml', () => {
  it('should generate empty string for empty constraints and directives', () => {
    const result = generateLayoutSpecYaml([], []);
    expect(result).toBe('');
  });

  it('should generate YAML for orientation constraint', () => {
    const constraints: ConstraintData[] = [
      {
        id: 'test-1',
        type: 'orientation',
        params: { directions: ['below'], selector: 'below' }
      }
    ];
    const result = generateLayoutSpecYaml(constraints, []);
    expect(result).toContain('constraints:');
    expect(result).toContain('orientation:');
    expect(result).toContain('below');
  });

  it('should generate YAML for align constraint', () => {
    const constraints: ConstraintData[] = [
      {
        id: 'test-1',
        type: 'align',
        params: { selector: 'aligned', direction: 'horizontal' }
      }
    ];
    const result = generateLayoutSpecYaml(constraints, []);
    expect(result).toContain('constraints:');
    expect(result).toContain('align:');
    expect(result).toContain('horizontal');
  });

  it('should generate YAML for directives', () => {
    const directives: DirectiveData[] = [
      {
        id: 'test-1',
        type: 'size',
        params: { selector: 'Node', width: 100, height: 50 }
      }
    ];
    const result = generateLayoutSpecYaml([], directives);
    expect(result).toContain('directives:');
    expect(result).toContain('size:');
    expect(result).toContain('100');
    expect(result).toContain('50');
  });

  it('should generate YAML for flag directive', () => {
    const directives: DirectiveData[] = [
      {
        id: 'test-1',
        type: 'flag',
        params: { flag: 'hideDisconnectedBuiltIns' }
      }
    ];
    const result = generateLayoutSpecYaml([], directives);
    expect(result).toContain('directives:');
    expect(result).toContain('flag: hideDisconnectedBuiltIns');
  });

  it('should include comments in generated YAML', () => {
    const constraints: ConstraintData[] = [
      {
        id: 'test-1',
        type: 'orientation',
        params: { directions: ['below'], selector: 'below' },
        comment: 'This is a comment'
      }
    ];
    const result = generateLayoutSpecYaml(constraints, []);
    expect(result).toContain('# This is a comment');
  });

  it('should generate both constraints and directives', () => {
    const constraints: ConstraintData[] = [
      {
        id: 'c1',
        type: 'orientation',
        params: { directions: ['below'], selector: 'below' }
      }
    ];
    const directives: DirectiveData[] = [
      {
        id: 'd1',
        type: 'flag',
        params: { flag: 'hideDisconnectedBuiltIns' }
      }
    ];
    const result = generateLayoutSpecYaml(constraints, directives);
    expect(result).toContain('constraints:');
    expect(result).toContain('directives:');
  });
});

describe('parseLayoutSpecToData', () => {
  it('should parse empty YAML', () => {
    const result = parseLayoutSpecToData('');
    expect(result.constraints).toEqual([]);
    expect(result.directives).toEqual([]);
  });

  it('should parse orientation constraint', () => {
    const yaml = `
constraints:
  - orientation: {directions: [below], selector: below}
`;
    const result = parseLayoutSpecToData(yaml);
    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0].type).toBe('orientation');
    expect(result.constraints[0].params.directions).toContain('below');
    expect(result.constraints[0].params.selector).toBe('below');
  });

  it('should parse align constraint', () => {
    const yaml = `
constraints:
  - align: {selector: aligned, direction: horizontal}
`;
    const result = parseLayoutSpecToData(yaml);
    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0].type).toBe('align');
    expect(result.constraints[0].params.direction).toBe('horizontal');
  });

  it('should parse size directive', () => {
    const yaml = `
directives:
  - size: {selector: Node, width: 100, height: 50}
`;
    const result = parseLayoutSpecToData(yaml);
    expect(result.directives).toHaveLength(1);
    expect(result.directives[0].type).toBe('size');
    expect(result.directives[0].params.width).toBe(100);
    expect(result.directives[0].params.height).toBe(50);
  });

  it('should parse flag directive', () => {
    const yaml = `
directives:
  - flag: hideDisconnectedBuiltIns
`;
    const result = parseLayoutSpecToData(yaml);
    expect(result.directives).toHaveLength(1);
    expect(result.directives[0].type).toBe('flag');
    expect(result.directives[0].params.flag).toBe('hideDisconnectedBuiltIns');
  });

  it('should parse multiple constraints and directives', () => {
    const yaml = `
constraints:
  - orientation: {directions: [below], selector: below}
  - align: {selector: aligned, direction: horizontal}
directives:
  - size: {selector: Node, width: 100, height: 50}
  - flag: hideDisconnectedBuiltIns
`;
    const result = parseLayoutSpecToData(yaml);
    expect(result.constraints).toHaveLength(2);
    expect(result.directives).toHaveLength(2);
  });

  it('should generate unique IDs for each item', () => {
    const yaml = `
constraints:
  - orientation: {directions: [below], selector: below}
  - align: {selector: aligned, direction: horizontal}
`;
    const result = parseLayoutSpecToData(yaml);
    expect(result.constraints[0].id).not.toBe(result.constraints[1].id);
  });
});

describe('round-trip: generate -> parse -> generate', () => {
  it('should preserve orientation constraint through round-trip', () => {
    const original: ConstraintData[] = [
      {
        id: 'test-1',
        type: 'orientation',
        params: { directions: ['below'], selector: 'below' }
      }
    ];
    
    const yaml = generateLayoutSpecYaml(original, []);
    const parsed = parseLayoutSpecToData(yaml);
    const regenerated = generateLayoutSpecYaml(parsed.constraints, parsed.directives);
    
    expect(regenerated).toContain('orientation:');
    expect(regenerated).toContain('below');
  });

  it('should preserve align constraint through round-trip', () => {
    const original: ConstraintData[] = [
      {
        id: 'test-1',
        type: 'align',
        params: { selector: 'aligned', direction: 'horizontal' }
      }
    ];
    
    const yaml = generateLayoutSpecYaml(original, []);
    const parsed = parseLayoutSpecToData(yaml);
    const regenerated = generateLayoutSpecYaml(parsed.constraints, parsed.directives);
    
    expect(regenerated).toContain('align:');
    expect(regenerated).toContain('horizontal');
  });

  it('should preserve directives through round-trip', () => {
    const original: DirectiveData[] = [
      {
        id: 'test-1',
        type: 'size',
        params: { selector: 'Node', width: 100, height: 50 }
      },
      {
        id: 'test-2',
        type: 'flag',
        params: { flag: 'hideDisconnectedBuiltIns' }
      }
    ];
    
    const yaml = generateLayoutSpecYaml([], original);
    const parsed = parseLayoutSpecToData(yaml);
    const regenerated = generateLayoutSpecYaml(parsed.constraints, parsed.directives);
    
    expect(regenerated).toContain('size:');
    expect(regenerated).toContain('flag: hideDisconnectedBuiltIns');
  });

  it('should handle complex spec from sample file', () => {
    const yaml = `
constraints:
  - align: {selector: aligned, direction: horizontal}
  - orientation: {directions: [below], selector: below}
  - group: {selector: parts, name: ' parts', addEdge: true}

directives:
  - size: {selector: Mouth, width: 300, height: 70}
  - size: {selector: Hair, width: 300, height: 100}
  - hideField: {field: parts}
  - flag: hideDisconnectedBuiltIns
  - hideAtom: {selector: Face}
`;
    
    const parsed = parseLayoutSpecToData(yaml);
    expect(parsed.constraints).toHaveLength(3);
    expect(parsed.directives).toHaveLength(5);
    
    const regenerated = generateLayoutSpecYaml(parsed.constraints, parsed.directives);
    expect(regenerated).toContain('align:');
    expect(regenerated).toContain('orientation:');
    expect(regenerated).toContain('group:');
    expect(regenerated).toContain('size:');
    expect(regenerated).toContain('hideField:');
    expect(regenerated).toContain('flag: hideDisconnectedBuiltIns');
  });
});

describe('validateYaml', () => {
  it('should return null for valid YAML', () => {
    const yaml = `
constraints:
  - orientation: {directions: [below], selector: below}
`;
    expect(validateYaml(yaml)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(validateYaml('')).toBeNull();
  });

  it('should return error for invalid YAML', () => {
    const invalidYaml = `
constraints:
  - orientation: {directions: [below]
`;
    const error = validateYaml(invalidYaml);
    expect(error).not.toBeNull();
    expect(error).toContain('YAML syntax error');
  });
});

describe('validateSpytialSpec', () => {
  it('should return isValid true for valid spec', () => {
    const yaml = `
constraints:
  - orientation: {directions: [below], selector: below}
directives:
  - flag: hideDisconnectedBuiltIns
`;
    const result = validateSpytialSpec(yaml);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('should return isValid true for empty string', () => {
    const result = validateSpytialSpec('');
    expect(result.isValid).toBe(true);
  });

  it('should return error for invalid YAML syntax', () => {
    const invalidYaml = `
constraints:
  - orientation: {directions: [below]
`;
    const result = validateSpytialSpec(invalidYaml);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('YAML syntax error');
  });

  it('should return warnings for unrecognized constraint types', () => {
    const yaml = `
constraints:
  - unknownType: {selector: test}
`;
    const result = validateSpytialSpec(yaml);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('unknownType');
  });

  it('should return warnings for unrecognized directive types', () => {
    const yaml = `
directives:
  - unknownDirective: {selector: test}
`;
    const result = validateSpytialSpec(yaml);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('unknownDirective');
  });
});
