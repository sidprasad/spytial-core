import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { RemoveCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';

describe('Remove Commands', () => {
  let instance: JSONDataInstance;
  let parser: RemoveCommandParser;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
    parser = new RemoveCommandParser();
    
    // Add some test data
    instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
    instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
    instance.addAtom({ id: 'charlie', label: 'Charlie', type: 'Person' });
    // Adding relation tuples will automatically create the relation
    instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
    instance.addRelationTuple('friend', { atoms: ['alice', 'charlie'], types: ['Person', 'Person'] });
  });

  describe('Remove Atom by ID', () => {
    it('should remove atom by ID', () => {
      const result = parser.execute('remove alice', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('[alice] Removed atom: Alice:Person');
      expect(result.action).toBe('remove');
      expect(instance.getAtoms().find(a => a.id === 'alice')).toBeUndefined();
    });

    it('should handle non-existent atom ID', () => {
      const result = parser.execute('remove nonexistent', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Atom or relation not found: nonexistent');
    });
  });

  describe('Remove Atom by Label:Type', () => {
    it('should remove atom by label and type', () => {
      const result = parser.execute('remove Alice:Person', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('[alice] Removed atom: Alice:Person');
      expect(result.action).toBe('remove');
      expect(instance.getAtoms().find(a => a.id === 'alice')).toBeUndefined();
    });

    it('should handle non-existent atom by label:type', () => {
      const result = parser.execute('remove John:Person', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Atom not found: John:Person');
    });
  });

  describe('Remove Relation Tuple', () => {
    it('should remove specific relation tuple', () => {
      const result = parser.execute('remove alice.friend=bob', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('[alice.friend=bob] Removed tuple: friend(alice, bob)');
      expect(result.action).toBe('remove');
      
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      expect(friendRelation?.tuples.find(t => t.atoms[0] === 'alice' && t.atoms[1] === 'bob')).toBeUndefined();
      expect(friendRelation?.tuples.find(t => t.atoms[0] === 'alice' && t.atoms[1] === 'charlie')).toBeDefined();
    });

    it('should handle non-existent relation tuple', () => {
      const result = parser.execute('remove alice.friend=nonexistent', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Tuple not found: alice.friend=nonexistent');
    });

    it('should handle non-existent relation name', () => {
      const result = parser.execute('remove alice.unknown=bob', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe("Relation 'unknown' not found");
    });
  });

  describe('Remove Entire Relation', () => {
    it('should remove entire relation with all tuples', () => {
      const result = parser.execute('remove friend', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('[friend] Removed relation \'friend\' (2 tuples)');
      expect(result.action).toBe('remove');
      
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      expect(friendRelation?.tuples).toHaveLength(0);
    });

    it('should handle non-existent relation', () => {
      const result = parser.execute('remove nonexistent', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe("Atom or relation not found: nonexistent");
    });
  });

  describe('Parser Priority and Pattern Recognition', () => {
    it('should have high priority', () => {
      expect(parser.getPriority()).toBe(200);
    });

    it('should handle remove commands', () => {
      expect(parser.canHandle('remove alice')).toBe(true);
      expect(parser.canHandle('remove Alice:Person')).toBe(true);
      expect(parser.canHandle('remove alice.friend=bob')).toBe(true);
      expect(parser.canHandle('remove friend')).toBe(true);
    });

    it('should not handle non-remove commands', () => {
      expect(parser.canHandle('Alice:Person')).toBe(false);
      expect(parser.canHandle('alice.friend=bob')).toBe(false);
      expect(parser.canHandle('add Alice:Person')).toBe(false);
      expect(parser.canHandle('list')).toBe(false);
    });

    it('should not handle empty remove commands', () => {
      expect(parser.canHandle('remove')).toBe(false);
      expect(parser.canHandle('remove ')).toBe(false);
    });
  });

  describe('Help Text', () => {
    it('should provide helpful documentation', () => {
      const help = parser.getHelp();
      
      expect(help).toContain('Remove Commands (sugar syntax):');
      expect(help.some(line => line.includes('remove ID'))).toBe(true);
      expect(help.some(line => line.includes('remove Label:Type'))).toBe(true);
      expect(help.some(line => line.includes('remove source.relation=target'))).toBe(true);
      expect(help.some(line => line.includes('remove relation'))).toBe(true);
    });
  });
});