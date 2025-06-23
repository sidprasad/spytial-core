/**
 * @fileoverview
 * Tests for SMT-LIB data instance implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  SmtLibDataInstance,
  parseSmtLibModel,
  createSmtLibDataInstance,
  isSmtLibDataInstance,
  type SmtLibConfig 
} from '../src/data-instance/smtlib/smtlib-data-instance';

// Simple example model for testing
function createExampleSmtLibModel(): string {
  return `
(model
  (define-fun x () Int 5)
  (define-fun y () Int 10)
  (define-fun add (a Int b Int) Int (+ a b))
  (define-fun result () Int (add x y))
  (define-fun final () Int (result))
)`;
}

describe('SmtLibDataInstance', () => {
  let sampleModel: ReturnType<typeof parseSmtLibModel>;
  let dataInstance: SmtLibDataInstance;

  beforeEach(() => {
    const modelText = createExampleSmtLibModel();
    sampleModel = parseSmtLibModel(modelText);
    dataInstance = new SmtLibDataInstance(sampleModel) as SmtLibDataInstance;
  });

  describe('Constructor and Basic Properties', () => {
    it('should create instance with default config', () => {
      expect(dataInstance).toBeInstanceOf(SmtLibDataInstance);
      expect(isSmtLibDataInstance(dataInstance)).toBe(true);
    });

    it('should create instance with custom config', () => {
      const config: Partial<SmtLibConfig> = {
        includeBuiltinSorts: false,
        createDependencyRelations: false
      };
      
      const customInstance = new SmtLibDataInstance(sampleModel, config);
      expect(isSmtLibDataInstance(customInstance)).toBe(true);
    });
  });

  describe('Model Parsing', () => {
    it('should parse basic SMT-LIB model', () => {
      const modelText = `
        (model
          (define-fun x () Int 5)
          (define-fun y () Int 10)
          (define-fun add (a Int b Int) Int (+ a b))
        )
      `;
      
      const model = parseSmtLibModel(modelText);
      expect(model.definitions.length).toBe(3);
      expect(model.id).toBe('smtlib-model');
    });

    it('should handle pipe-quoted identifiers', () => {
      const modelText = `
        (model
          (define-fun |complex name| () Bool true)
          (define-fun |another complex| (|param name| Int) Int |param name|)
        )
      `;
      
      const model = parseSmtLibModel(modelText);
      expect(model.definitions.length).toBe(2);
      
      const complexDef = model.definitions.find(d => d.name === 'complex name');
      expect(complexDef).toBeDefined();
      expect(complexDef?.isConstant).toBe(true);
    });

    it('should extract dependencies correctly', () => {
      const modelText = `
        (model
          (define-fun x () Int 5)
          (define-fun y () Int x)
          (define-fun z () Int (+ x y))
        )
      `;
      
      const model = parseSmtLibModel(modelText);
      
      const yDef = model.definitions.find(d => d.name === 'y');
      const zDef = model.definitions.find(d => d.name === 'z');
      
      expect(yDef?.dependencies).toContain('x');
      expect(zDef?.dependencies).toContain('x');
      expect(zDef?.dependencies).toContain('y');
    });
  });

  describe('Types', () => {
    it('should return all types including built-ins', () => {
      const types = dataInstance.getTypes();
      expect(types.length).toBeGreaterThan(0);
      
      // Should have built-in types
      const intType = types.find(t => t.id === 'Int');
      const boolType = types.find(t => t.id === 'Bool');
      
      expect(intType).toBeDefined();
      expect(intType?.isBuiltin).toBe(true);
      expect(boolType).toBeDefined();
      expect(boolType?.isBuiltin).toBe(true);
    });

    it('should get atom type correctly', () => {
      const atomType = dataInstance.getAtomType('x');
      expect(atomType).toBeDefined();
      expect(atomType?.id).toBe('Int');
    });

    it('should exclude built-in types when configured', () => {
      const config: Partial<SmtLibConfig> = {
        includeBuiltinSorts: false
      };
      
      const instance = new SmtLibDataInstance(sampleModel, config);
      const types = instance.getTypes();
      
      const builtinTypes = types.filter(t => t.isBuiltin);
      expect(builtinTypes.length).toBe(0);
    });
  });

  describe('Atoms', () => {
    it('should return all constant atoms', () => {
      const atoms = dataInstance.getAtoms();
      expect(atoms.length).toBeGreaterThan(0);
      
      // Should have constants from example model
      const atomIds = atoms.map(a => a.id);
      expect(atomIds).toContain('x');
      expect(atomIds).toContain('y');
    });

    it('should assign correct types to atoms', () => {
      const atoms = dataInstance.getAtoms();
      
      const atomX = atoms.find(a => a.id === 'x');
      const atomY = atoms.find(a => a.id === 'y');
      
      expect(atomX?.type).toBe('Int');
      expect(atomY?.type).toBe('Int');
    });
  });

  describe('Relations', () => {
    it('should create dependency relations', () => {
      const relations = dataInstance.getRelations();
      
      const dependsRelation = relations.find(r => r.id === 'smtlib_depends');
      expect(dependsRelation).toBeDefined();
      expect(dependsRelation?.types).toEqual(['String', 'String']);
    });

    it('should create function relations for non-constants', () => {
      const modelText = `
        (model
          (define-fun add (a Int b Int) Int (+ a b))
          (define-fun multiply (x Int y Int) Int (* x y))
        )
      `;
      
      const model = parseSmtLibModel(modelText);
      const instance = new SmtLibDataInstance(model);
      const relations = instance.getRelations();
      
      const addRelation = relations.find(r => r.id === 'smtlib_add');
      const multiplyRelation = relations.find(r => r.id === 'smtlib_multiply');
      
      expect(addRelation).toBeDefined();
      expect(addRelation?.types).toEqual(['Int', 'Int', 'Int']); // 2 params + return
      
      expect(multiplyRelation).toBeDefined();
      expect(multiplyRelation?.types).toEqual(['Int', 'Int', 'Int']);
    });
  });

  describe('Dependency Tuples', () => {
    it('should create dependency tuples', () => {
      const relations = dataInstance.getRelations();
      const dependsRelation = relations.find(r => r.id === 'smtlib_depends');
      
      expect(dependsRelation).toBeDefined();
      expect(dependsRelation?.tuples.length).toBeGreaterThan(0);
      
      // Check for specific dependencies from example model
      const dependencies = dependsRelation?.tuples.map(t => `${t.atoms[0]} -> ${t.atoms[1]}`);
      expect(dependencies).toContain('x -> result'); // result depends on x
    });
  });

  describe('Projections', () => {
    it('should apply projections correctly', () => {
      const projected = dataInstance.applyProjections(['x', 'y']);
      
      const atoms = projected.getAtoms();
      const atomIds = atoms.map(a => a.id);
      
      expect(atomIds).toContain('x');
      expect(atomIds).toContain('y');
      
      // Should not contain other atoms
      const allAtoms = dataInstance.getAtoms();
      const otherAtoms = allAtoms.filter(a => !['x', 'y'].includes(a.id));
      
      for (const atom of otherAtoms) {
        expect(atomIds).not.toContain(atom.id);
      }
    });

    it('should include dependencies in projections', () => {
      // Project something that depends on x
      const relations = dataInstance.getRelations();
      const dependsRelation = relations.find(r => r.id === 'smtlib_depends');
      const dependentOnX = dependsRelation?.tuples
        .filter(t => t.atoms[0] === 'x')
        .map(t => t.atoms[1])[0];
      
      if (dependentOnX) {
        const projected = dataInstance.applyProjections([dependentOnX]);
        const atoms = projected.getAtoms();
        const atomIds = atoms.map(a => a.id);
        
        expect(atomIds).toContain(dependentOnX);
        // May also contain x due to dependency inclusion logic
      }
    });
  });

  describe('Graph Generation', () => {
    it('should generate graph representation', () => {
      const graph = dataInstance.generateGraph();
      
      expect(graph.nodeCount()).toBeGreaterThan(0);
      expect(graph.isDirected()).toBe(true);
    });

    it('should include node data in graph', () => {
      const graph = dataInstance.generateGraph();
      
      const nodeIds = graph.nodes();
      expect(nodeIds.length).toBeGreaterThan(0);
      
      // Check node data
      const firstNode = graph.node(nodeIds[0]);
      expect(firstNode).toBeDefined();
      expect(firstNode.id).toBeDefined();
      expect(firstNode.type).toBeDefined();
    });

    it('should handle disconnected node filtering', () => {
      const graphWithDisconnected = dataInstance.generateGraph(false, false);
      const graphFiltered = dataInstance.generateGraph(true, false);
      
      // Filtered graph should have same or fewer nodes
      expect(graphFiltered.nodeCount()).toBeLessThanOrEqual(graphWithDisconnected.nodeCount());
    });
  });
});

describe('SMT-LIB Parsing Edge Cases', () => {
  it('should handle empty model', () => {
    const modelText = '(model)';
    const model = parseSmtLibModel(modelText);
    
    expect(model.definitions.length).toBe(0);
    expect(model.sorts.length).toBe(0);
  });

  it('should handle complex expressions', () => {
    const modelText = `
      (model
        (define-fun complex (x Int y Int) Bool 
          (ite (= x 0) 
               (> y 10) 
               (and (< x 5) (>= y 0))))
      )
    `;
    
    const model = parseSmtLibModel(modelText);
    expect(model.definitions.length).toBe(1);
    
    const complexDef = model.definitions[0];
    expect(complexDef.name).toBe('complex');
    expect(complexDef.parameters.length).toBe(2);
    expect(complexDef.sort).toBe('Bool');
  });

  it('should handle sort declarations', () => {
    const modelText = `
      (model
        (declare-sort MySort 0)
        (declare-sort ParametricSort 2)
        (define-fun x () MySort element1)
      )
    `;
    
    const model = parseSmtLibModel(modelText);
    expect(model.sorts.length).toBe(2);
    
    const mySort = model.sorts.find(s => s.name === 'MySort');
    const parametricSort = model.sorts.find(s => s.name === 'ParametricSort');
    
    expect(mySort?.arity).toBe(0);
    expect(parametricSort?.arity).toBe(2);
  });
});

describe('Convenience Functions', () => {
  it('should create data instance from model text', () => {
    const modelText = createExampleSmtLibModel();
    const dataInstance = createSmtLibDataInstance(modelText);
    
    expect(isSmtLibDataInstance(dataInstance)).toBe(true);
    expect(dataInstance.getAtoms().length).toBeGreaterThan(0);
  });

  it('should create example model', () => {
    const modelText = createExampleSmtLibModel();
    expect(modelText).toContain('define-fun');
    expect(modelText).toContain('model');
    
    const model = parseSmtLibModel(modelText);
    expect(model.definitions.length).toBeGreaterThan(0);
  });
});
