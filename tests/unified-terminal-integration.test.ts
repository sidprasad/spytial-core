import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { AtomCommandParser, RelationCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';
import { InfoCommandParser } from '../src/components/ReplInterface/parsers/ExtensibleParsers';

describe('Unified Terminal Integration', () => {
  let instance: JSONDataInstance;
  let atomParser: AtomCommandParser;
  let relationParser: RelationCommandParser;
  let infoParser: InfoCommandParser;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
    
    atomParser = new AtomCommandParser();
    relationParser = new RelationCommandParser();
    infoParser = new InfoCommandParser();
  });

  it('should simulate a complete workflow in the unified terminal', () => {
    // Start with empty instance
    expect(instance.getAtoms()).toHaveLength(0);
    expect(instance.getRelations()).toHaveLength(0);
    
    // Add some atoms (like a user would in the unified terminal)
    let result = atomParser.execute('add alice=Alice:Person', instance);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Added atom');
    
    result = atomParser.execute('add bob=Bob:Person', instance);
    expect(result.success).toBe(true);
    
    result = atomParser.execute('add charlie=Charlie:Person', instance);
    expect(result.success).toBe(true);
    
    // Verify atoms were added
    expect(instance.getAtoms()).toHaveLength(3);
    
    // Add relations (like a user would in the unified terminal)
    result = relationParser.execute('add friends(alice, bob)', instance);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Added relation');
    
    result = relationParser.execute('add knows(alice, charlie)', instance);
    expect(result.success).toBe(true);
    
    result = relationParser.execute('add likes(bob, charlie)', instance);
    expect(result.success).toBe(true);
    
    // Verify relations were added
    expect(instance.getRelations()).toHaveLength(3);
    
    // Get status (like a user would in the unified terminal)
    result = infoParser.execute('status', instance);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Atoms: 3');
    expect(result.message).toContain('Relations: 3');
    expect(result.message).toContain('Tuples: 3');
    
    // Get detailed list (like a user would in the unified terminal)
    result = infoParser.execute('list', instance);
    expect(result.success).toBe(true);
    expect(result.message).toContain('alice');
    expect(result.message).toContain('bob');
    expect(result.message).toContain('charlie');
    expect(result.message).toContain('friends');
    expect(result.message).toContain('knows');
    expect(result.message).toContain('likes');
    
    // Remove an atom (like a user would in the unified terminal)
    result = atomParser.execute('remove charlie', instance);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Removed atom');
    
    // Verify the atom and related relations were cleaned up
    expect(instance.getAtoms()).toHaveLength(2);
    
    // Final status check
    result = infoParser.execute('status', instance);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Atoms: 2');
  });

  it('should handle commands in any order like a unified terminal would', () => {
    // Mix different command types randomly (simulating user input)
    const commands = [
      { parser: infoParser, command: 'status' },
      { parser: atomParser, command: 'add alice=Alice:Person' },
      { parser: infoParser, command: 'list' },
      { parser: atomParser, command: 'add bob=Bob:Person' },
      { parser: relationParser, command: 'add friends(alice, bob)' },
      { parser: infoParser, command: 'status' },
      { parser: atomParser, command: 'add charlie=Charlie:Person' },
      { parser: relationParser, command: 'add knows(alice, charlie)' },
      { parser: infoParser, command: 'list' }
    ];
    
    // Execute all commands in sequence
    for (const { parser, command } of commands) {
      const result = parser.execute(command, instance);
      expect(result.success).toBe(true);
    }
    
    // Verify final state
    expect(instance.getAtoms()).toHaveLength(3);
    expect(instance.getRelations()).toHaveLength(2);
    
    const finalStatus = infoParser.execute('status', instance);
    expect(finalStatus.success).toBe(true);
    expect(finalStatus.message).toContain('Atoms: 3');
    expect(finalStatus.message).toContain('Relations: 2');
  });
});