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



  describe('semicolon-separated commands (sugar syntax)', () => {
    it('should handle mixed atom and relation commands', () => {
      const result = parser.execute('Alice:Person; Bob:Person; Alice.friend=Bob', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('Batch command completed');
      expect(result.message).toContain('Alice:Person');
      expect(result.message).toContain('Bob:Person');
      expect(result.message).toContain('friend(Alice, Bob)');
      
      const atoms = instance.getAtoms();
      const relations = instance.getRelations();
      expect(atoms.length).toBe(2);
      expect(relations.length).toBe(1);
      expect(relations[0].name).toBe('friend');
    });



    it('should handle partial failures in batch', () => {
      const result = parser.execute('Alice:Person; Bob:Person; invalid_relation', instance);
      
      expect(result.success).toBe(true); // Partial success
      expect(result.message).toContain('partially completed');
      expect(result.message).toContain('2/3 commands');
      expect(result.message).toContain('Errors:');
    });
  });

  describe('command detection', () => {
    it('should recognize semicolon-separated commands', () => {
      expect(parser.canHandle('Alice:Person; Bob:Person')).toBe(true);
      expect(parser.canHandle('p1=Alice:Person; p2=Bob:Person')).toBe(true);
      expect(parser.canHandle('Alice:Person')).toBe(false); // Single command
      expect(parser.canHandle('Alice')).toBe(false); // Invalid format
    });

    it('should recognize semicolon-separated commands (sugar syntax)', () => {
      expect(parser.canHandle('Alice:Person; Bob:Person')).toBe(true);
      expect(parser.canHandle('Alice:Person; alice.friend=Bob')).toBe(true);
      expect(parser.canHandle('Alice:Person')).toBe(false); // Single command
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
    expect(patterns).toContain('Alice:Person; bob=Bob:Person; alice.friend=bob');
  });

  it('should provide comprehensive help', () => {
    const help = parser.getHelp();
    expect(help.join('\n')).toContain('Batch Commands (sugar syntax)');
    expect(help.join('\n')).toContain('command1; command2; command3');
  });
});