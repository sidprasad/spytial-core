import { describe, it, expect } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('Tag Directive Parsing', () => {
  it('should parse tag directive with all fields', () => {
    const layoutSpecStr = `
directives:
  - tag:
      toTag: 'Person'
      name: 'status'
      value: 'Person.status'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    expect(layoutSpec.directives.tags).toHaveLength(1);
    expect(layoutSpec.directives.tags[0].toTag).toBe('Person');
    expect(layoutSpec.directives.tags[0].name).toBe('status');
    expect(layoutSpec.directives.tags[0].value).toBe('Person.status');
  });

  it('should parse multiple tag directives', () => {
    const layoutSpecStr = `
directives:
  - tag:
      toTag: 'Person'
      name: 'age'
      value: 'Person.age'
  - tag:
      toTag: 'Car'
      name: 'owner'
      value: 'Car.ownedBy'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    expect(layoutSpec.directives.tags).toHaveLength(2);
    expect(layoutSpec.directives.tags[0].name).toBe('age');
    expect(layoutSpec.directives.tags[1].name).toBe('owner');
  });

  it('should have empty tags array by default', () => {
    const layoutSpecStr = `
directives:
  - color:
      value: 'red'
      selector: 'Person'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    expect(layoutSpec.directives.tags).toHaveLength(0);
  });
});

describe('Tag Directive Integration', () => {
  it('should add binary selector results as simple attributes', () => {
    // Create a test data instance with Person -> age relationship
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Alice', type: 'Person', label: 'Alice' },
        { id: 'Bob', type: 'Person', label: 'Bob' },
        { id: '25', type: 'Int', label: '25' },
        { id: '30', type: 'Int', label: '30' }
      ],
      relations: [
        { 
          id: 'age',
          name: 'age',
          types: ['Person', 'Int'],
          tuples: [
            { atoms: ['Alice', '25'], types: ['Person', 'Int'] },
            { atoms: ['Bob', '30'], types: ['Person', 'Int'] }
          ]
        }
      ]
    };

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(dataInstance);

    const layoutSpecStr = `
directives:
  - tag:
      toTag: 'Person'
      name: 'age'
      value: 'age'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0);
    const result = layoutInstance.generateLayout(dataInstance);
    
    // Find Alice and Bob nodes
    const aliceNode = result.layout.nodes.find(n => n.id === 'Alice');
    const bobNode = result.layout.nodes.find(n => n.id === 'Bob');
    
    expect(aliceNode).toBeDefined();
    expect(bobNode).toBeDefined();
    
    // Check that age tags are present as attributes
    expect(aliceNode?.attributes?.['age']).toContain('25');
    expect(bobNode?.attributes?.['age']).toContain('30');
  });

  it('should add ternary selector results with bracket notation', () => {
    // Create a test data instance with ternary relation
    // score: Person -> Subject -> Int
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Alice', type: 'Person', label: 'Alice' },
        { id: 'Bob', type: 'Person', label: 'Bob' },
        { id: 'Math', type: 'Subject', label: 'Math' },
        { id: 'English', type: 'Subject', label: 'English' },
        { id: '95', type: 'Int', label: '95' },
        { id: '87', type: 'Int', label: '87' },
        { id: '78', type: 'Int', label: '78' },
        { id: '92', type: 'Int', label: '92' }
      ],
      relations: [
        { 
          id: 'score',
          name: 'score',
          types: ['Person', 'Subject', 'Int'],
          tuples: [
            { atoms: ['Alice', 'Math', '95'], types: ['Person', 'Subject', 'Int'] },
            { atoms: ['Alice', 'English', '87'], types: ['Person', 'Subject', 'Int'] },
            { atoms: ['Bob', 'Math', '78'], types: ['Person', 'Subject', 'Int'] },
            { atoms: ['Bob', 'English', '92'], types: ['Person', 'Subject', 'Int'] }
          ]
        }
      ]
    };

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(dataInstance);

    const layoutSpecStr = `
directives:
  - tag:
      toTag: 'Person'
      name: 'score'
      value: 'score'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0);
    const result = layoutInstance.generateLayout(dataInstance);
    
    // Find Alice node
    const aliceNode = result.layout.nodes.find(n => n.id === 'Alice');
    
    expect(aliceNode).toBeDefined();
    
    // Check that scores are present with bracket notation
    // For ternary tuples, format is: name[middle]: last
    expect(aliceNode?.attributes?.['score[Math]']).toContain('95');
    expect(aliceNode?.attributes?.['score[English]']).toContain('87');
  });

  it('should only add tags to nodes matching toTag selector', () => {
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Alice', type: 'Person', label: 'Alice' },
        { id: 'Tesla', type: 'Car', label: 'Tesla' },
        { id: '25', type: 'Int', label: '25' }
      ],
      relations: [
        { 
          id: 'age',
          name: 'age',
          types: ['Person', 'Int'],
          tuples: [
            { atoms: ['Alice', '25'], types: ['Person', 'Int'] }
          ]
        }
      ]
    };

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(dataInstance);

    const layoutSpecStr = `
directives:
  - tag:
      toTag: 'Person'
      name: 'age'
      value: 'age'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0);
    const result = layoutInstance.generateLayout(dataInstance);
    
    const teslaNode = result.layout.nodes.find(n => n.id === 'Tesla');
    
    // Tesla (Car) should not have age attribute since it's not selected by 'Person'
    expect(teslaNode?.attributes?.['age']).toBeUndefined();
  });

  it('should handle quaternary and higher arity selectors', () => {
    // Create a test with 4-ary relation: graded: Teacher -> Student -> Subject -> Grade
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Prof_Smith', type: 'Teacher', label: 'Prof Smith' },
        { id: 'Alice', type: 'Student', label: 'Alice' },
        { id: 'Math', type: 'Subject', label: 'Math' },
        { id: 'A+', type: 'Grade', label: 'A+' }
      ],
      relations: [
        { 
          id: 'graded',
          name: 'graded',
          types: ['Teacher', 'Student', 'Subject', 'Grade'],
          tuples: [
            { atoms: ['Prof_Smith', 'Alice', 'Math', 'A+'], types: ['Teacher', 'Student', 'Subject', 'Grade'] }
          ]
        }
      ]
    };

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(dataInstance);

    const layoutSpecStr = `
directives:
  - tag:
      toTag: 'Teacher'
      name: 'graded'
      value: 'graded'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0);
    const result = layoutInstance.generateLayout(dataInstance);
    
    const profNode = result.layout.nodes.find(n => n.id === 'Prof_Smith');
    
    expect(profNode).toBeDefined();
    
    // For 4-ary tuples, format is: name[mid1][mid2]: last
    expect(profNode?.attributes?.['graded[Alice][Math]']).toContain('A+');
  });

  it('should not interfere with edge-based attributes', () => {
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Alice', type: 'Person', label: 'Alice' },
        { id: '25', type: 'Int', label: '25' },
        { id: '100', type: 'Int', label: '100' }
      ],
      relations: [
        { 
          id: 'age',
          name: 'age',
          types: ['Person', 'Int'],
          tuples: [{ atoms: ['Alice', '25'], types: ['Person', 'Int'] }]
        },
        { 
          id: 'height',
          name: 'height',
          types: ['Person', 'Int'],
          tuples: [{ atoms: ['Alice', '100'], types: ['Person', 'Int'] }]
        }
      ]
    };

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(dataInstance);

    // Use both regular attribute (edge-based) and tag (selector-based)
    const layoutSpecStr = `
directives:
  - attribute:
      field: 'age'
  - tag:
      toTag: 'Person'
      name: 'height'
      value: 'height'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0);
    const result = layoutInstance.generateLayout(dataInstance);
    
    const aliceNode = result.layout.nodes.find(n => n.id === 'Alice');
    
    expect(aliceNode).toBeDefined();
    // Both attribute types should be present
    expect(aliceNode?.attributes?.['age']).toContain('25');
    expect(aliceNode?.attributes?.['height']).toContain('100');
  });
});
