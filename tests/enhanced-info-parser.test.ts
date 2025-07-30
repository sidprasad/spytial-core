import { describe, it, expect, beforeEach } from 'vitest';
import { InfoCommandParser } from '../src/components/ReplInterface/parsers/ExtensibleParsers';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('Enhanced InfoCommandParser', () => {
  let instance: JSONDataInstance;
  let parser: InfoCommandParser;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
    parser = new InfoCommandParser();
    
    // Set up test data
    instance.addAtom({ id: 'alice_p1', label: 'Alice', type: 'Person' });
    instance.addAtom({ id: 'bob_p2', label: 'Bob', type: 'Person' });
    instance.addAtom({ id: 'company_o1', label: 'TechCorp', type: 'Organization' });
    instance.addAtom({ id: 'num_1', label: '42', type: 'Number' });
    
    // Add some relations
    instance.addRelationTuple('friend', { atoms: ['alice_p1', 'bob_p2'], types: ['Person', 'Person'] });
    instance.addRelationTuple('works_at', { atoms: ['alice_p1', 'company_o1'], types: ['Person', 'Organization'] });
    instance.addRelationTuple('works_at', { atoms: ['bob_p2', 'company_o1'], types: ['Person', 'Organization'] });
    instance.addRelationTuple('age', { atoms: ['alice_p1', 'num_1'], types: ['Person', 'Number'] });
  });

  describe('existing functionality', () => {
    it('should handle all utility commands', () => {
      expect(parser.canHandle('help')).toBe(true);
      expect(parser.canHandle('info')).toBe(true);
      expect(parser.canHandle('status')).toBe(true);
      expect(parser.canHandle('list')).toBe(true);
      expect(parser.canHandle('clear')).toBe(true);
      expect(parser.canHandle('reify')).toBe(true);
    });

    it('should provide status information', () => {
      const result = parser.execute('info', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Instance Status:');
      expect(result.message).toContain('Atoms: 4');
      expect(result.message).toContain('Relations: 3');
      expect(result.message).toContain('Tuples: 4');
      expect(result.message).toContain('Person: 2');
      expect(result.message).toContain('Organization: 1');
    });

    it('should list all contents', () => {
      const result = parser.execute('list', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Instance Contents:');
      expect(result.message).toContain('[alice_p1] Alice:Person');
      expect(result.message).toContain('[bob_p2] Bob:Person');
      expect(result.message).toContain('friend:');
      expect(result.message).toContain('(alice_p1, bob_p2)');
    });
  });

  describe('new functionality - list-ids command', () => {
    it('should handle list-ids command', () => {
      expect(parser.canHandle('list-ids')).toBe(true);
    });

    it('should list atom IDs grouped by type', () => {
      const result = parser.execute('list-ids', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Internal Atom IDs:');
      
      // Should group by type
      expect(result.message).toContain('Person:');
      expect(result.message).toContain('ID: alice_p1  Label: Alice');
      expect(result.message).toContain('ID: bob_p2  Label: Bob');
      
      expect(result.message).toContain('Organization:');
      expect(result.message).toContain('ID: company_o1  Label: TechCorp');
      
      expect(result.message).toContain('Number:');
      expect(result.message).toContain('ID: num_1  Label: 42');
      
      expect(result.message).toContain('Total: 4 atoms');
    });

    it('should handle empty instance for list-ids', () => {
      const emptyInstance = new JSONDataInstance({ atoms: [], relations: [] });
      const result = parser.execute('list-ids', emptyInstance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('No atoms found in instance.');
    });
  });

  describe('new functionality - list-edges command', () => {
    it('should handle list-edges command', () => {
      expect(parser.canHandle('list-edges')).toBe(true);
    });

    it('should list edge IDs with relation details', () => {
      const result = parser.execute('list-edges', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Internal Edge IDs:');
      
      // Should show relations and edge IDs
      expect(result.message).toContain('Relation: friend');
      expect(result.message).toContain('Edge ID: friend:alice_p1->bob_p2');
      expect(result.message).toContain('Tuple: (alice_p1, bob_p2)');
      
      expect(result.message).toContain('Relation: works_at');
      expect(result.message).toContain('Edge ID: works_at:alice_p1->company_o1');
      expect(result.message).toContain('Edge ID: works_at:bob_p2->company_o1');
      
      expect(result.message).toContain('Relation: age');
      expect(result.message).toContain('Edge ID: age:alice_p1->num_1');
      
      expect(result.message).toContain('Total: 4 edges across 3 relations');
    });

    it('should handle empty relations for list-edges', () => {
      const emptyInstance = new JSONDataInstance({ atoms: [], relations: [] });
      const result = parser.execute('list-edges', emptyInstance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('No relations/edges found in instance.');
    });

    it('should handle relations with no tuples', () => {
      const instanceWithEmptyRelation = new JSONDataInstance({ atoms: [], relations: [] });
      instanceWithEmptyRelation.addAtom({ id: 'test', label: 'Test', type: 'Test' });
      
      const result = parser.execute('list-edges', instanceWithEmptyRelation);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('No relations/edges found in instance.');
    });
  });

  describe('updated help and patterns', () => {
    it('should include new commands in patterns', () => {
      const patterns = parser.getCommandPatterns();
      expect(patterns).toContain('list-ids');
      expect(patterns).toContain('list-edges');
    });

    it('should include new commands in help text', () => {
      const help = parser.getHelp();
      const helpText = help.join('\n');
      
      expect(helpText).toContain('list-ids');
      expect(helpText).toContain('list-edges');
      expect(helpText).toContain('List internal atom IDs');
      expect(helpText).toContain('List internal edge IDs');
    });

    it('should include new commands in general help', () => {
      const result = parser.execute('help', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('list-ids');
      expect(result.message).toContain('list-edges');
      expect(result.message).toContain('List internal atom IDs grouped by type');
      expect(result.message).toContain('List internal edge IDs for all relations');
    });
  });

  describe('case insensitivity and edge cases', () => {
    it('should handle commands case-insensitively', () => {
      expect(parser.canHandle('LIST-IDS')).toBe(true);
      expect(parser.canHandle('List-Edges')).toBe(true);
      expect(parser.canHandle('LIST-ids')).toBe(true);
    });

    it('should execute commands case-insensitively', () => {
      const result1 = parser.execute('LIST-IDS', instance);
      expect(result1.success).toBe(true);
      expect(result1.message).toContain('Internal Atom IDs:');
      
      const result2 = parser.execute('List-Edges', instance);
      expect(result2.success).toBe(true);
      expect(result2.message).toContain('Internal Edge IDs:');
    });

    it('should maintain correct priority', () => {
      expect(parser.getPriority()).toBe(50);
    });

    it('should handle whitespace in commands', () => {
      expect(parser.canHandle('  list-ids  ')).toBe(true);
      expect(parser.canHandle('  list-edges  ')).toBe(true);
    });
  });

  describe('integration with complex data structures', () => {
    beforeEach(() => {
      // Add more complex relations
      instance.addRelationTuple('manages', { atoms: ['bob_p2', 'alice_p1', 'company_o1'], types: ['Person', 'Person', 'Organization'] }); // 3-ary relation
    });

    it('should handle n-ary relations in edge listing', () => {
      const result = parser.execute('list-edges', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Relation: manages');
      expect(result.message).toContain('Edge ID: manages:bob_p2->alice_p1->company_o1');
      expect(result.message).toContain('Tuple: (bob_p2, alice_p1, company_o1)');
      expect(result.message).toContain('Total: 5 edges across 4 relations');
    });

    it('should maintain consistent formatting across different relation arities', () => {
      const result = parser.execute('list-edges', instance);
      
      // Binary relations
      expect(result.message).toContain('Edge ID: friend:alice_p1->bob_p2');
      // Ternary relations  
      expect(result.message).toContain('Edge ID: manages:bob_p2->alice_p1->company_o1');
      
      // All should follow the same pattern
      const lines = result.message.split('\n');
      const edgeIdLines = lines.filter(line => line.includes('Edge ID:'));
      
      edgeIdLines.forEach(line => {
        expect(line).toMatch(/^\s*Edge ID: \w+:\w+(->\w+)*$/);
      });
    });
  });
});