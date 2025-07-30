import { describe, it, expect, beforeEach } from 'vitest';
import { RemoveCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('Enhanced RemoveCommandParser', () => {
  let instance: JSONDataInstance;
  let parser: RemoveCommandParser;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
    parser = new RemoveCommandParser();
    
    // Set up test data
    instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
    instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
    instance.addAtom({ id: 'charlie', label: 'Charlie', type: 'Person' });
    
    // Add some relations
    instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
    instance.addRelationTuple('friend', { atoms: ['alice', 'charlie'], types: ['Person', 'Person'] });
    instance.addRelationTuple('colleague', { atoms: ['bob', 'charlie'], types: ['Person', 'Person'] });
  });

  describe('existing functionality', () => {
    it('should remove atoms by ID', () => {
      const result = parser.execute('remove alice', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('remove');
      expect(result.message).toContain('[alice]');
      
      const atoms = instance.getAtoms();
      expect(atoms.find(a => a.id === 'alice')).toBeUndefined();
    });

    it('should remove specific relation tuples', () => {
      const result = parser.execute('remove alice.friend=bob', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('friend(alice, bob)');
      
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      expect(friendRelation).toBeDefined();
      expect(friendRelation!.tuples.find(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'bob'
      )).toBeUndefined();
      
      // Other friend relations should remain
      expect(friendRelation!.tuples.find(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'charlie'
      )).toBeDefined();
    });

    it('should remove entire relations', () => {
      const result = parser.execute('remove friend', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('friend');
      
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      expect(friendRelation?.tuples.length).toBe(0);
    });
  });

  describe('new functionality - remove Atom.REL', () => {
    it('should handle Atom.REL pattern', () => {
      expect(parser.canHandle('remove alice.friend')).toBe(true);
      expect(parser.canHandle('remove bob.colleague')).toBe(true);
    });

    it('should remove all relations of specific type from atom', () => {
      const result = parser.execute('remove alice.friend', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('remove');
      expect(result.message).toContain('[alice.friend]');
      expect(result.message).toContain('2 friend relations');
      
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      expect(friendRelation).toBeDefined();
      
      // Alice should have no friend relations
      const aliceFriendTuples = friendRelation!.tuples.filter(t => t.atoms[0] === 'alice');
      expect(aliceFriendTuples.length).toBe(0);
      
      // Other relations should remain
      const colleagueRelation = instance.getRelations().find(r => r.name === 'colleague');
      expect(colleagueRelation?.tuples.length).toBe(1);
    });

    it('should report when no relations found for atom', () => {
      const result = parser.execute('remove charlie.friend', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No friend relations found for atom \'charlie\'');
    });

    it('should report when atom not found', () => {
      const result = parser.execute('remove david.friend', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Atom \'david\' not found');
    });

    it('should report when relation not found', () => {
      const result = parser.execute('remove alice.enemy', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Relation \'enemy\' not found');
    });
  });

  describe('new functionality - remove edge by ID', () => {
    it('should handle edge ID pattern', () => {
      expect(parser.canHandle('remove friend:alice->bob')).toBe(true);
      expect(parser.canHandle('remove colleague:bob->charlie')).toBe(true);
    });

    it('should remove specific edge by ID', () => {
      const result = parser.execute('remove friend:alice->bob', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('remove');
      expect(result.message).toContain('[friend:alice->bob]');
      expect(result.message).toContain('friend(alice, bob)');
      
      const friendRelation = instance.getRelations().find(r => r.name === 'friend');
      expect(friendRelation).toBeDefined();
      
      // Specific edge should be removed
      expect(friendRelation!.tuples.find(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'bob'
      )).toBeUndefined();
      
      // Other edges should remain
      expect(friendRelation!.tuples.find(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'charlie'
      )).toBeDefined();
    });

    it('should report when edge not found', () => {
      const result = parser.execute('remove friend:bob->alice', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Edge \'friend:bob->alice\' not found');
    });

    it('should report when relation not found for edge ID', () => {
      const result = parser.execute('remove enemy:alice->bob', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Relation \'enemy\' not found');
    });

    it('should handle invalid edge ID format', () => {
      const result = parser.execute('remove invalidedge', instance);
      
      // Should try as atom first, then relation, then fail
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('command patterns and help', () => {
    it('should include new patterns in command patterns', () => {
      const patterns = parser.getCommandPatterns();
      expect(patterns).toContain('remove Atom.REL');
      expect(patterns).toContain('remove edge_id');
    });

    it('should include new examples in help text', () => {
      const help = parser.getHelp();
      const helpText = help.join('\n');
      
      expect(helpText).toContain('remove Atom.REL');
      expect(helpText).toContain('remove alice.friend');
      expect(helpText).toContain('remove friend:alice->bob');
      expect(helpText).toContain('Remove all REL relations from Atom');
      expect(helpText).toContain('Remove specific edge by ID');
    });
  });

  describe('priority and edge cases', () => {
    it('should maintain high priority', () => {
      expect(parser.getPriority()).toBe(200);
    });

    it('should handle commands with whitespace', () => {
      expect(parser.canHandle('  remove alice.friend  ')).toBe(true);
      expect(parser.canHandle('  remove friend:alice->bob  ')).toBe(true);
    });

    it('should distinguish between different remove patterns', () => {
      // Atom.REL vs source.relation=target
      expect(parser.canHandle('remove alice.friend')).toBe(true);
      expect(parser.canHandle('remove alice.friend=bob')).toBe(true);
      
      // These should be handled by different logic paths
      const resultAtomRel = parser.execute('remove alice.friend', instance);
      expect(resultAtomRel.message).toContain('friend relations from');
      
      // Reset instance
      instance.addRelationTuple('friend', { atoms: ['alice', 'bob'], types: ['Person', 'Person'] });
      
      const resultSpecific = parser.execute('remove alice.friend=bob', instance);
      expect(resultSpecific.message).toContain('friend(alice, bob)');
    });
  });
});