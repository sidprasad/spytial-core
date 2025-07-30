import { describe, it, expect } from 'vitest';
import { PyretReplInterface } from '../src/components/ReplInterface/PyretReplInterface';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { PyretIdAllocationParser } from '../src/components/ReplInterface/parsers/PyretIdAllocationParser';
import { RemoveCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';
import { InfoCommandParser } from '../src/components/ReplInterface/parsers/ExtensibleParsers';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('Enhanced Pyret REPL Integration', () => {
  describe('ID Allocation Feature Demonstration', () => {
    it('should support x=1 syntax for primitives', async () => {
      const instance = new JSONDataInstance({ atoms: [], relations: [] });
      const parser = new PyretIdAllocationParser();
      
      // Test various primitive assignments
      const tests = [
        { cmd: 'x = 1', expectedType: 'Number', expectedLabel: '1' },
        { cmd: 'name = "Alice"', expectedType: 'String', expectedLabel: 'Alice' },
        { cmd: 'flag = true', expectedType: 'Boolean', expectedLabel: 'true' },
        { cmd: 'pi = 3.14', expectedType: 'Number', expectedLabel: '3.14' }
      ];
      
      for (const test of tests) {
        const result = await parser.execute(test.cmd, instance);
        expect(result.success).toBe(true);
        expect(result.message).toContain(`[${test.cmd.split('=')[0].trim()}]`);
      }
      
      // Verify all atoms were created with correct IDs
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(4);
      expect(atoms.find(a => a.id === 'x' && a.type === 'Number')).toBeDefined();
      expect(atoms.find(a => a.id === 'name' && a.type === 'String')).toBeDefined();
      expect(atoms.find(a => a.id === 'flag' && a.type === 'Boolean')).toBeDefined();
      expect(atoms.find(a => a.id === 'pi' && a.type === 'Number')).toBeDefined();
    });

    it('should prevent ID conflicts', async () => {
      const instance = new JSONDataInstance({ atoms: [], relations: [] });
      const parser = new PyretIdAllocationParser();
      
      // Add first atom
      await parser.execute('x = 1', instance);
      
      // Try to add another with same ID
      const result = await parser.execute('x = 2', instance);
      expect(result.success).toBe(false);
      expect(result.message).toContain('already in use');
      
      // Should still only have one atom
      expect(instance.getAtoms().length).toBe(1);
    });
  });

  describe('Enhanced Remove Feature Demonstration', () => {
    it('should support remove Atom.REL syntax', async () => {
      const instance = new JSONDataInstance({ atoms: [], relations: [] });
      const parser = new RemoveCommandParser();
      
      // Set up test data
      instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
      instance.addAtom({ id: 'charlie', label: 'Charlie', type: 'Person' });
      
      instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
      instance.addRelationTuple('friend', { atoms: ['alice', 'charlie'], types: ['Person', 'Person'] });
      instance.addRelationTuple('colleague', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
      
      // Remove all friend relations from alice
      const result = parser.execute('remove alice.friend', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('2 friend relations');
      
      // Verify alice has no friend relations but colleague relation remains
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      const aliceFriendTuples = friendRelation?.tuples.filter(t => t.atoms[0] === 'alice') || [];
      expect(aliceFriendTuples.length).toBe(0);
      
      const colleagueRelation = instance.getRelations().find(r => r.name === 'colleague');
      expect(colleagueRelation?.tuples.length).toBe(1);
    });

    it('should support remove edge by ID', async () => {
      const instance = new JSONDataInstance({ atoms: [], relations: [] });
      const parser = new RemoveCommandParser();
      
      // Set up test data
      instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
      
      instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
      instance.addRelationTuple('friend', { atoms: ['bob', 'alice'], types: ['Person', 'Person'] });
      
      // Remove specific edge by ID
      const result = parser.execute('remove friend:alice->bob', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('friend:alice->bob');
      
      // Verify only the specific edge was removed
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      expect(friendRelation?.tuples.length).toBe(1);
      expect(friendRelation?.tuples[0].atoms).toEqual(['bob', 'alice']);
    });
  });

  describe('ID Exposure Feature Demonstration', () => {
    it('should list all atom IDs with list-ids command', async () => {
      const instance = new JSONDataInstance({ atoms: [], relations: [] });
      const parser = new InfoCommandParser();
      
      // Add test data
      instance.addAtom({ id: 'alice_p1', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'bob_p2', label: 'Bob', type: 'Person' });
      instance.addAtom({ id: 'company_o1', label: 'TechCorp', type: 'Organization' });
      
      const result = parser.execute('list-ids', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Internal Atom IDs:');
      expect(result.message).toContain('Person:');
      expect(result.message).toContain('ID: alice_p1  Label: Alice');
      expect(result.message).toContain('ID: bob_p2  Label: Bob');
      expect(result.message).toContain('Organization:');
      expect(result.message).toContain('ID: company_o1  Label: TechCorp');
      expect(result.message).toContain('Total: 3 atoms');
    });

    it('should list all edge IDs with list-edges command', async () => {
      const instance = new JSONDataInstance({ atoms: [], relations: [] });
      const parser = new InfoCommandParser();
      
      // Add test data
      instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
      
      instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
      instance.addRelationTuple('colleague', { atoms: ['bob', 'alice'], types: ['Person', 'Person'] });
      
      const result = parser.execute('list-edges', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Internal Edge IDs:');
      expect(result.message).toContain('Relation: friend');
      expect(result.message).toContain('Edge ID: friend:alice->bob');
      expect(result.message).toContain('Tuple: (alice, bob)');
      expect(result.message).toContain('Relation: colleague');
      expect(result.message).toContain('Edge ID: colleague:bob->alice');
      expect(result.message).toContain('Total: 2 edges across 2 relations');
    });
  });

  describe('Parser Priority and Integration', () => {
    it('should have correct parser priorities for proper command resolution', () => {
      const removeParser = new RemoveCommandParser();
      const idAllocationParser = new PyretIdAllocationParser();
      const infoParser = new InfoCommandParser();
      
      // Verify priorities
      expect(removeParser.getPriority()).toBe(200); // Highest - remove commands
      expect(idAllocationParser.getPriority()).toBe(110); // Higher than atom commands
      expect(infoParser.getPriority()).toBe(50); // Lowest - utility fallback
      
      // Verify command handling
      expect(removeParser.canHandle('remove alice.friend')).toBe(true);
      expect(idAllocationParser.canHandle('x = 1')).toBe(true);
      expect(infoParser.canHandle('list-ids')).toBe(true);
      
      // Verify no conflicts
      expect(idAllocationParser.canHandle('remove alice.friend')).toBe(false);
      expect(removeParser.canHandle('x = 1')).toBe(false);
    });
  });

  describe('Pyret-like REPL Behavior', () => {
    it('should resemble Pyret REPL behavior instead of exposing add A:A syntax', () => {
      const idAllocationParser = new PyretIdAllocationParser();
      const infoParser = new InfoCommandParser();
      
      // Should handle Pyret-style assignment
      expect(idAllocationParser.canHandle('x = 1')).toBe(true);
      expect(idAllocationParser.canHandle('alice = "Alice"')).toBe(true);
      
      // Should NOT handle traditional add syntax (that's for AtomCommandParser with lower priority)
      expect(idAllocationParser.canHandle('add A:A')).toBe(false);
      expect(idAllocationParser.canHandle('Alice:Person')).toBe(false);
      
      // Should provide Pyret-like commands
      expect(infoParser.canHandle('list-ids')).toBe(true);
      expect(infoParser.canHandle('list-edges')).toBe(true);
      
      // Help should reflect Pyret-style usage
      const idHelp = idAllocationParser.getHelp();
      expect(idHelp.join('\n')).toContain('x = 1');
      expect(idHelp.join('\n')).toContain('name = "Alice"');
      expect(idHelp.join('\n')).not.toContain('add A:A');
    });
  });
});