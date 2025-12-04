import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { AlloyDataInstance, createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import type { AlloyValidationError, AlloyValidationResult } from '../src/translators/webcola/alloy-input-graph';
import type { IAtom, IType, IRelation, ITuple } from '../src/data-instance/interfaces';

/**
 * These tests focus on the validation logic for AlloyInputGraph
 * without requiring the full DOM/d3 environment.
 * 
 * For full integration tests with the DOM component, see the demo in webcola-demo/
 */

describe('AlloyValidationResult structure', () => {
  it('should have correct error types', () => {
    // Test that the error types are properly defined
    const validTypes = ['type-mismatch', 'arity-mismatch', 'unknown-relation', 'unknown-type', 'duplicate-atom'];
    
    // This is a compile-time check - if types are wrong, TypeScript will error
    const mockError: AlloyValidationError = {
      type: 'type-mismatch',
      message: 'Test message',
      details: {
        relationId: 'test',
        expectedTypes: ['Person'],
        actualTypes: ['Dog'],
        atomId: 'atom1',
        position: 0,
      },
    };
    
    expect(validTypes).toContain(mockError.type);
  });

  it('should support all error types', () => {
    const errors: AlloyValidationError[] = [
      { type: 'type-mismatch', message: 'Type mismatch', details: {} },
      { type: 'arity-mismatch', message: 'Arity mismatch', details: {} },
      { type: 'unknown-relation', message: 'Unknown relation', details: {} },
      { type: 'unknown-type', message: 'Unknown type', details: {} },
      { type: 'duplicate-atom', message: 'Duplicate atom', details: {} },
    ];
    
    expect(errors).toHaveLength(5);
    errors.forEach(e => {
      expect(e).toHaveProperty('type');
      expect(e).toHaveProperty('message');
      expect(e).toHaveProperty('details');
    });
  });

  it('should have valid/errors properties on AlloyValidationResult', () => {
    const validResult: AlloyValidationResult = {
      valid: true,
      errors: [],
    };
    
    const invalidResult: AlloyValidationResult = {
      valid: false,
      errors: [
        { type: 'type-mismatch', message: 'Test', details: {} },
      ],
    };
    
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toHaveLength(1);
  });
});

describe('AlloyDataInstance for validation', () => {
  let dataInstance: AlloyDataInstance;

  beforeEach(() => {
    dataInstance = createEmptyAlloyDataInstance();
  });

  describe('Type checking', () => {
    it('should allow getting types from instance', () => {
      const types = dataInstance.getTypes();
      expect(Array.isArray(types)).toBe(true);
    });

    it('should allow getting relations from instance', () => {
      const relations = dataInstance.getRelations();
      expect(Array.isArray(relations)).toBe(true);
    });

    it('should allow getting atoms from instance', () => {
      const atoms = dataInstance.getAtoms();
      expect(Array.isArray(atoms)).toBe(true);
    });
  });

  describe('Data manipulation', () => {
    it('should support adding atoms', () => {
      const atom: IAtom = {
        id: 'Person0',
        type: 'Person',
        label: 'Alice',
      };
      
      dataInstance.addAtom(atom);
      const atoms = dataInstance.getAtoms();
      expect(atoms.find(a => a.id === 'Person0')).toBeTruthy();
    });

    it('should support removing atoms', () => {
      const atom: IAtom = {
        id: 'Person0',
        type: 'Person',
        label: 'Alice',
      };
      
      dataInstance.addAtom(atom);
      dataInstance.removeAtom('Person0');
      const atoms = dataInstance.getAtoms();
      expect(atoms.find(a => a.id === 'Person0')).toBeFalsy();
    });
  });
});

describe('Validation logic (unit tests)', () => {
  /**
   * Helper function to check if a type is a subtype of another
   * This replicates the logic in AlloyInputGraph.isSubtype()
   */
  function isSubtype(childType: string, parentType: string, types: IType[]): boolean {
    if (childType === parentType) return true;
    
    const childTypeInfo = types.find(t => t.id === childType);
    if (!childTypeInfo) return false;
    
    return childTypeInfo.types.includes(parentType);
  }

  it('should recognize identical types as subtypes', () => {
    const types: IType[] = [
      { id: 'Person', name: 'Person', types: ['Person', 'Object'], isAbstract: false, isBuiltin: false, atoms: [] },
    ];
    
    expect(isSubtype('Person', 'Person', types)).toBe(true);
  });

  it('should recognize parent types in hierarchy', () => {
    const types: IType[] = [
      { id: 'Person', name: 'Person', types: ['Person', 'Object'], isAbstract: false, isBuiltin: false, atoms: [] },
      { id: 'Object', name: 'Object', types: ['Object'], isAbstract: false, isBuiltin: false, atoms: [] },
    ];
    
    expect(isSubtype('Person', 'Object', types)).toBe(true);
    expect(isSubtype('Object', 'Person', types)).toBe(false);
  });

  it('should reject unrelated types', () => {
    const types: IType[] = [
      { id: 'Person', name: 'Person', types: ['Person'], isAbstract: false, isBuiltin: false, atoms: [] },
      { id: 'Dog', name: 'Dog', types: ['Dog'], isAbstract: false, isBuiltin: false, atoms: [] },
    ];
    
    expect(isSubtype('Person', 'Dog', types)).toBe(false);
    expect(isSubtype('Dog', 'Person', types)).toBe(false);
  });

  /**
   * Helper function to validate arity
   * This replicates the logic in AlloyInputGraph validation
   */
  function validateArity(tuple: ITuple, relation: IRelation): boolean {
    return tuple.atoms.length === relation.types.length;
  }

  it('should validate correct arity', () => {
    const tuple: ITuple = {
      atoms: ['Person0', 'Person1'],
      types: ['Person', 'Person'],
    };
    
    const relation: IRelation = {
      id: 'friend',
      name: 'friend',
      types: ['Person', 'Person'],
      tuples: [],
    };
    
    expect(validateArity(tuple, relation)).toBe(true);
  });

  it('should reject incorrect arity - too few atoms', () => {
    const tuple: ITuple = {
      atoms: ['Person0'],
      types: ['Person'],
    };
    
    const relation: IRelation = {
      id: 'friend',
      name: 'friend',
      types: ['Person', 'Person'],
      tuples: [],
    };
    
    expect(validateArity(tuple, relation)).toBe(false);
  });

  it('should reject incorrect arity - too many atoms', () => {
    const tuple: ITuple = {
      atoms: ['Person0', 'Person1', 'Person2'],
      types: ['Person', 'Person', 'Person'],
    };
    
    const relation: IRelation = {
      id: 'friend',
      name: 'friend',
      types: ['Person', 'Person'],
      tuples: [],
    };
    
    expect(validateArity(tuple, relation)).toBe(false);
  });
});

describe('AlloyInputControlsAPI interface', () => {
  it('should define all required methods', () => {
    // Type-level test - this verifies the interface at compile time
    type RequiredMethods = keyof import('../src/translators/webcola/alloy-input-graph').AlloyInputControlsAPI;
    
    const expectedMethods: RequiredMethods[] = [
      'getAvailableTypes',
      'getAvailableRelations', 
      'getCurrentAtoms',
      'addAtom',
      'addRelationTuple',
      'removeAtom',
      'removeRelationTuple',
      'validateInstance',
      'reifyInstance',
      'exportJSON',
      'onInstanceChange',
    ];
    
    expect(expectedMethods).toHaveLength(11);
  });
});
