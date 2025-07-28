import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { RemoveCommandParser, AtomCommandParser, DotNotationRelationParser } from '../src/components/ReplInterface/parsers/CoreParsers';

describe('Remove Commands Integration', () => {
  let instance: JSONDataInstance;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
    
    // Add some test data
    instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
    instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
    instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
  });

  describe('Parser integration and priority', () => {
    it('should have RemoveCommandParser with highest priority', () => {
      const removeParser = new RemoveCommandParser();
      const atomParser = new AtomCommandParser();
      const dotParser = new DotNotationRelationParser();
      
      // Check priorities
      expect(removeParser.getPriority()).toBe(200);
      expect(atomParser.getPriority()).toBe(100);
      expect(dotParser.getPriority()).toBe(115);
      
      // RemoveCommandParser should have highest priority
      expect(removeParser.getPriority()).toBeGreaterThan(atomParser.getPriority());
      expect(removeParser.getPriority()).toBeGreaterThan(dotParser.getPriority());
    });

    it('should handle remove commands correctly without conflicts', () => {
      const removeParser = new RemoveCommandParser();
      const atomParser = new AtomCommandParser();
      const dotParser = new DotNotationRelationParser();
      
      // Remove commands should be handled only by RemoveCommandParser
      expect(removeParser.canHandle('remove alice')).toBe(true);
      expect(atomParser.canHandle('remove alice')).toBe(false);
      expect(dotParser.canHandle('remove alice')).toBe(false);
      
      expect(removeParser.canHandle('remove alice.friend=bob')).toBe(true);
      expect(atomParser.canHandle('remove alice.friend=bob')).toBe(false);
      expect(dotParser.canHandle('remove alice.friend=bob')).toBe(false);
    });

    it('should not interfere with other parser functionality', () => {
      const removeParser = new RemoveCommandParser();
      const atomParser = new AtomCommandParser();
      const dotParser = new DotNotationRelationParser();
      
      // Non-remove commands should not be handled by RemoveCommandParser
      expect(removeParser.canHandle('Alice:Person')).toBe(false);
      expect(atomParser.canHandle('Alice:Person')).toBe(true);
      
      expect(removeParser.canHandle('alice.friend=bob')).toBe(false);
      expect(dotParser.canHandle('alice.friend=bob')).toBe(true);
      
      expect(removeParser.canHandle('charlie=Charlie:Person')).toBe(false);
      expect(atomParser.canHandle('charlie=Charlie:Person')).toBe(true);
    });

    it('should execute remove commands correctly in integration', () => {
      const removeParser = new RemoveCommandParser();
      
      // Verify initial state
      expect(instance.getAtoms().length).toBe(2);
      expect(instance.getRelations()[0].tuples.length).toBe(1);
      
      // Remove an atom
      const result1 = removeParser.execute('remove alice', instance);
      expect(result1.success).toBe(true);
      expect(instance.getAtoms().length).toBe(1);
      
      // Remove a relation tuple (recreate alice first)
      instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
      instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
      
      const result2 = removeParser.execute('remove alice.friend=bob', instance);
      expect(result2.success).toBe(true);
      expect(instance.getRelations()[0].tuples.length).toBe(0);
    });

    it('should handle error cases appropriately', () => {
      const removeParser = new RemoveCommandParser();
      
      // Try to remove non-existent atom or relation
      const result = removeParser.execute('remove nonexistent', instance);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Atom or relation not found: nonexistent');
    });
  });
});