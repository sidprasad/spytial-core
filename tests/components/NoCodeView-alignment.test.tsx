import { describe, expect, it } from 'vitest';
import { parseLayoutSpecToData } from '../../src/components/NoCodeView/NoCodeView';
import { generateLayoutSpecYaml } from '../../src/components/NoCodeView/CodeView';
import { ConstraintData, DirectiveData } from '../../src/components/NoCodeView/interfaces';

describe('NoCodeView Alignment Constraint Integration', () => {
  
  describe('parseLayoutSpecToData', () => {
    it('should parse alignment constraint from YAML', () => {
      const yamlString = `
constraints:
  - align:
      selector: "Node"
      direction: ["horizontal"]
`;

      const result = parseLayoutSpecToData(yamlString);
      
      expect(result.constraints).toHaveLength(1);
      expect(result.constraints[0].type).toBe('align');
      expect(result.constraints[0].params).toEqual({
        selector: "Node",
        direction: ["horizontal"]
      });
    });

    it('should parse multiple alignment constraints', () => {
      const yamlString = `
constraints:
  - align:
      selector: "Node"
      direction: ["horizontal"]
  - align:
      selector: "Edge"
      direction: ["vertical"]
`;

      const result = parseLayoutSpecToData(yamlString);
      
      expect(result.constraints).toHaveLength(2);
      expect(result.constraints[0].type).toBe('align');
      expect(result.constraints[1].type).toBe('align');
      expect(result.constraints[0].params.direction).toEqual(["horizontal"]);
      expect(result.constraints[1].params.direction).toEqual(["vertical"]);
    });

    it('should parse alignment constraints alongside other constraint types', () => {
      const yamlString = `
constraints:
  - orientation:
      selector: "r"
      directions: ["right"]
  - align:
      selector: "Node"
      direction: ["horizontal"]
`;

      const result = parseLayoutSpecToData(yamlString);
      
      expect(result.constraints).toHaveLength(2);
      expect(result.constraints[0].type).toBe('orientation');
      expect(result.constraints[1].type).toBe('align');
    });
  });

  describe('generateLayoutSpecYaml', () => {
    it('should generate YAML for alignment constraints', () => {
      const constraints: ConstraintData[] = [
        {
          id: '1',
          type: 'align',
          params: {
            selector: 'Node',
            direction: ['horizontal']
          }
        }
      ];
      const directives: DirectiveData[] = [];

      const yaml = generateLayoutSpecYaml(constraints, directives);
      
      expect(yaml).toContain('constraints:');
      expect(yaml).toContain('align:');
      expect(yaml).toContain('selector: Node');
      expect(yaml).toContain('direction:');
      expect(yaml).toContain('- horizontal');
    });

    it('should generate YAML for mixed constraint types', () => {
      const constraints: ConstraintData[] = [
        {
          id: '1',
          type: 'orientation',
          params: {
            selector: 'r',
            directions: ['right']
          }
        },
        {
          id: '2',
          type: 'align',
          params: {
            selector: 'Node',
            direction: ['vertical']
          }
        }
      ];
      const directives: DirectiveData[] = [];

      const yaml = generateLayoutSpecYaml(constraints, directives);
      
      expect(yaml).toContain('orientation:');
      expect(yaml).toContain('align:');
      expect(yaml).toContain('selector: r');
      expect(yaml).toContain('selector: Node');
      expect(yaml).toContain('- vertical');
    });
  });

  describe('Round-trip conversion', () => {
    it('should maintain alignment constraint data through parse and generate cycle', () => {
      const originalYaml = `
constraints:
  - align:
      selector: Node
      direction:
        - horizontal
`;

      const parsed = parseLayoutSpecToData(originalYaml);
      const regeneratedYaml = generateLayoutSpecYaml(parsed.constraints, parsed.directives);
      const reparsed = parseLayoutSpecToData(regeneratedYaml);

      expect(reparsed.constraints).toHaveLength(1);
      expect(reparsed.constraints[0].type).toBe('align');
      expect(reparsed.constraints[0].params.selector).toBe('Node');
      expect(reparsed.constraints[0].params.direction).toEqual(['horizontal']);
    });
  });
});