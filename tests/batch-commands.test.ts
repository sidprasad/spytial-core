import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { BatchCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';

describe('BatchCommandParser', () => {
  let parser: BatchCommandParser;
  let instance: JSONDataInstance;

  beforeEach(() => {
    parser = new BatchCommandParser();
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
  });

  describe('comma-separated atoms', () => {
    it('should handle multiple atoms in one command', () => {
      const result = parser.execute('add Alice:Person, Bob:Person, Charlie:Person', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('Added 3 atoms');
      expect(result.message).toContain('Alice:Person');
      expect(result.message).toContain('Bob:Person');
      expect(result.message).toContain('Charlie:Person');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(3);
      expect(atoms.map(a => a.label)).toContain('Alice');
      expect(atoms.map(a => a.label)).toContain('Bob');
      expect(atoms.map(a => a.label)).toContain('Charlie');
    });

    it('should handle atoms with explicit IDs', () => {
      const result = parser.execute('add p1=Alice:Person, p2=Bob:Person', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('Added 2 atoms');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(2);
      expect(atoms.find(a => a.id === 'p1')?.label).toBe('Alice');
      expect(atoms.find(a => a.id === 'p2')?.label).toBe('Bob');
    });

    it('should handle partial failures gracefully', () => {
      // Try to add some atoms with invalid syntax mixed in
      const result = parser.execute('add Alice:Person, InvalidSyntax, Charlie:Person', instance);
      
      // Should be partial success since some atoms were valid
      expect(result.success).toBe(true);
      expect(result.message).toContain('Added 2/3 atoms');
      expect(result.message).toContain('Errors:');
      expect(result.message).toContain('InvalidSyntax');
    });
  });

  describe('semicolon-separated commands', () => {
    it('should handle mixed atom and relation commands', () => {
      const result = parser.execute('add Alice:Person; add Bob:Person; add friends(Alice, Bob)', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('Batch command completed');
      expect(result.message).toContain('Alice:Person');
      expect(result.message).toContain('Bob:Person');
      expect(result.message).toContain('friends(Alice, Bob)');
      
      const atoms = instance.getAtoms();
      const relations = instance.getRelations();
      expect(atoms.length).toBe(2);
      expect(relations.length).toBe(1);
      expect(relations[0].name).toBe('friends');
    });

    it('should handle add and remove operations', () => {
      // First add some atoms
      instance.addAtom({ id: 'Alice', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'Bob', label: 'Bob', type: 'Person' });
      
      const result = parser.execute('add Charlie:Person; remove Alice:Person', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Batch command completed');
      expect(result.message).toContain('1 added');
      expect(result.message).toContain('1 removed');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(2); // Bob + Charlie
      expect(atoms.map(a => a.label)).toContain('Bob');
      expect(atoms.map(a => a.label)).toContain('Charlie');
      expect(atoms.map(a => a.label)).not.toContain('Alice');
    });

    it('should handle partial failures in batch', () => {
      const result = parser.execute('add Alice:Person; add Bob:Person; add invalid_relation', instance);
      
      expect(result.success).toBe(true); // Partial success
      expect(result.message).toContain('partially completed');
      expect(result.message).toContain('2/3 commands');
      expect(result.message).toContain('Errors:');
    });
  });

  describe('command detection', () => {
    it('should recognize comma-separated atoms', () => {
      expect(parser.canHandle('add Alice:Person, Bob:Person')).toBe(true);
      expect(parser.canHandle('add p1=Alice:Person, p2=Bob:Person')).toBe(true);
      expect(parser.canHandle('add Alice:Person')).toBe(false); // Single atom
      expect(parser.canHandle('add Alice')).toBe(false); // Invalid format
    });

    it('should recognize semicolon-separated commands', () => {
      expect(parser.canHandle('add Alice:Person; add Bob:Person')).toBe(true);
      expect(parser.canHandle('add Alice:Person; add friends(Alice, Bob)')).toBe(true);
      expect(parser.canHandle('add Alice:Person; remove Bob:Person')).toBe(true);
      expect(parser.canHandle('add Alice:Person')).toBe(false); // Single command
    });

    it('should not handle invalid patterns', () => {
      expect(parser.canHandle('add Alice:Person -> Bob:Person')).toBe(false);
      expect(parser.canHandle('remove all')).toBe(false);
      expect(parser.canHandle('help')).toBe(false);
    });
  });

  it('should have appropriate priority', () => {
    expect(parser.getPriority()).toBe(115);
  });

  it('should provide helpful command patterns', () => {
    const patterns = parser.getCommandPatterns();
    expect(patterns).toContain('add Label1:Type1, Label2:Type2, Label3:Type3');
    expect(patterns).toContain('add Alice:Person; add Bob:Person; add friends(Alice, Bob)');
  });

  it('should provide comprehensive help', () => {
    const help = parser.getHelp();
    expect(help.join('\n')).toContain('Batch Commands');
    expect(help.join('\n')).toContain('add Label1:Type1, Label2:Type2');
    expect(help.join('\n')).toContain('command1; command2; command3');
  });
});