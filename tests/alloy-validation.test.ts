import { describe, it, expect } from 'vitest';
import { AlloyDataInstance, createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { AlloyInstance, AlloyType, AlloyAtom, AlloyRelation, AlloyTuple } from '../src/data-instance/alloy/alloy-instance';
import { ValidationSeverity } from '../src/data-instance/alloy/alloy-instance';

describe('Alloy Instance Validation and Reification', () => {
  describe('Type Validation', () => {
    it('should detect tuple arity mismatch', () => {
      const instance: AlloyInstance = {
        types: {
          'Node': {
            _: 'type',
            id: 'Node',
            types: ['Node', 'univ'],
            atoms: [
              { _: 'atom', id: 'Node0', type: 'Node' },
              { _: 'atom', id: 'Node1', type: 'Node' }
            ]
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {
          'edge': {
            _: 'relation',
            id: 'Node<:edge',
            name: 'edge',
            types: ['Node', 'Node'],
            tuples: [
              // Wrong arity - has 3 atoms instead of 2
              { _: 'tuple', atoms: ['Node0', 'Node1', 'Node0'], types: ['Node', 'Node', 'Node'] }
            ]
          }
        },
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const validation = dataInstance.validate();

      expect(validation.isValid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues.some(i => 
        i.severity === ValidationSeverity.ERROR && 
        i.message.includes('arity mismatch')
      )).toBe(true);
    });

    it('should detect type mismatch in tuples', () => {
      const instance: AlloyInstance = {
        types: {
          'Person': {
            _: 'type',
            id: 'Person',
            types: ['Person', 'univ'],
            atoms: [
              { _: 'atom', id: 'Alice', type: 'Person' },
              { _: 'atom', id: 'Bob', type: 'Person' }
            ]
          },
          'Int': {
            _: 'type',
            id: 'Int',
            types: ['Int', 'univ'],
            atoms: [
              { _: 'atom', id: '1', type: 'Int' }
            ],
            meta: { builtin: true }
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {
          'friend': {
            _: 'relation',
            id: 'Person<:friend',
            name: 'friend',
            types: ['Person', 'Person'], // Expects Person -> Person
            tuples: [
              // Wrong type - second position should be Person, but tuple claims Int
              { _: 'tuple', atoms: ['Alice', '1'], types: ['Person', 'Int'] }
            ]
          }
        },
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const validation = dataInstance.validate();

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(i => 
        i.severity === ValidationSeverity.ERROR && 
        i.message.includes('Type mismatch')
      )).toBe(true);
    });

    it('should detect non-existent atoms in tuples', () => {
      const instance: AlloyInstance = {
        types: {
          'Node': {
            _: 'type',
            id: 'Node',
            types: ['Node', 'univ'],
            atoms: [
              { _: 'atom', id: 'Node0', type: 'Node' }
            ]
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {
          'edge': {
            _: 'relation',
            id: 'Node<:edge',
            name: 'edge',
            types: ['Node', 'Node'],
            tuples: [
              // Node1 doesn't exist!
              { _: 'tuple', atoms: ['Node0', 'Node1'], types: ['Node', 'Node'] }
            ]
          }
        },
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const validation = dataInstance.validate();

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(i => 
        i.severity === ValidationSeverity.ERROR && 
        i.message.includes('does not exist')
      )).toBe(true);
    });
  });

  describe('Multiplicity Validation', () => {
    it('should detect violation of "one" multiplicity', () => {
      const instance: AlloyInstance = {
        types: {
          'Singleton': {
            _: 'type',
            id: 'Singleton',
            types: ['Singleton', 'univ'],
            atoms: [
              { _: 'atom', id: 'S0', type: 'Singleton' },
              { _: 'atom', id: 'S1', type: 'Singleton' }
            ],
            meta: { one: true } // Should have exactly 1 atom
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {},
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const validation = dataInstance.validate();

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(i => 
        i.severity === ValidationSeverity.ERROR && 
        i.message.includes('one')
      )).toBe(true);
    });

    it('should warn about abstract type instances', () => {
      const instance: AlloyInstance = {
        types: {
          'Abstract': {
            _: 'type',
            id: 'Abstract',
            types: ['Abstract', 'univ'],
            atoms: [
              { _: 'atom', id: 'A0', type: 'Abstract' }
            ],
            meta: { abstract: true }
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {},
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const validation = dataInstance.validate();

      expect(validation.issues.some(i => 
        i.severity === ValidationSeverity.WARNING && 
        i.message.includes('Abstract')
      )).toBe(true);
    });
  });

  describe('Builtin Type Validation', () => {
    it('should warn about non-integer atoms in Int type', () => {
      const instance: AlloyInstance = {
        types: {
          'Int': {
            _: 'type',
            id: 'Int',
            types: ['Int', 'univ'],
            atoms: [
              { _: 'atom', id: '1', type: 'Int' },
              { _: 'atom', id: 'notanumber', type: 'Int' } // Invalid
            ],
            meta: { builtin: true }
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {},
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const validation = dataInstance.validate();

      expect(validation.issues.some(i => 
        i.severity === ValidationSeverity.WARNING && 
        i.message.includes('non-integer')
      )).toBe(true);
    });
  });

  describe('Valid Instance', () => {
    it('should validate a correct instance with no errors', () => {
      const instance: AlloyInstance = {
        types: {
          'Node': {
            _: 'type',
            id: 'Node',
            types: ['Node', 'univ'],
            atoms: [
              { _: 'atom', id: 'Node0', type: 'Node' },
              { _: 'atom', id: 'Node1', type: 'Node' }
            ]
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          },
          'Int': {
            _: 'type',
            id: 'Int',
            types: ['Int', 'univ'],
            atoms: [],
            meta: { builtin: true }
          },
          'seq/Int': {
            _: 'type',
            id: 'seq/Int',
            types: ['seq/Int', 'univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {
          'edge': {
            _: 'relation',
            id: 'Node<:edge',
            name: 'edge',
            types: ['Node', 'Node'],
            tuples: [
              { _: 'tuple', atoms: ['Node0', 'Node1'], types: ['Node', 'Node'] }
            ]
          }
        },
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const validation = dataInstance.validate();

      expect(validation.isValid).toBe(true);
      expect(validation.issues.length).toBe(0);
    });
  });

  describe('Reification with Validation', () => {
    it('should include validation errors in reified output', () => {
      const instance: AlloyInstance = {
        types: {
          'Node': {
            _: 'type',
            id: 'Node',
            types: ['Node', 'univ'],
            atoms: [
              { _: 'atom', id: 'Node0', type: 'Node' }
            ]
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          },
          'Int': {
            _: 'type',
            id: 'Int',
            types: ['Int', 'univ'],
            atoms: [],
            meta: { builtin: true }
          },
          'seq/Int': {
            _: 'type',
            id: 'seq/Int',
            types: ['seq/Int', 'univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {
          'edge': {
            _: 'relation',
            id: 'Node<:edge',
            name: 'edge',
            types: ['Node', 'Node'],
            tuples: [
              // Invalid - references non-existent atom
              { _: 'tuple', atoms: ['Node0', 'Node99'], types: ['Node', 'Node'] }
            ]
          }
        },
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const reified = dataInstance.reify();

      // Check that validation issues are included as comments
      expect(reified).toContain('-- Validation Results:');
      expect(reified).toContain('-- Errors');
      expect(reified).toContain('-- WARNING: Instance has validation errors!');
    });

    it('should not include validation comments for valid instances', () => {
      const instance: AlloyInstance = {
        types: {
          'Node': {
            _: 'type',
            id: 'Node',
            types: ['Node', 'univ'],
            atoms: [
              { _: 'atom', id: 'Node0', type: 'Node' },
              { _: 'atom', id: 'Node1', type: 'Node' }
            ]
          },
          'univ': {
            _: 'type',
            id: 'univ',
            types: ['univ'],
            atoms: [],
            meta: { builtin: true }
          },
          'Int': {
            _: 'type',
            id: 'Int',
            types: ['Int', 'univ'],
            atoms: [],
            meta: { builtin: true }
          },
          'seq/Int': {
            _: 'type',
            id: 'seq/Int',
            types: ['seq/Int', 'univ'],
            atoms: [],
            meta: { builtin: true }
          }
        },
        relations: {
          'edge': {
            _: 'relation',
            id: 'Node<:edge',
            name: 'edge',
            types: ['Node', 'Node'],
            tuples: [
              { _: 'tuple', atoms: ['Node0', 'Node1'], types: ['Node', 'Node'] }
            ]
          }
        },
        skolems: {}
      };

      const dataInstance = new AlloyDataInstance(instance);
      const reified = dataInstance.reify();

      // Should not contain validation comments for valid instance
      expect(reified).not.toContain('-- Validation Results:');
      expect(reified).toContain('inst builtinstance');
      expect(reified).toContain('Node = `Node0+`Node1');
    });
  });
});
