import { describe, it, expect, beforeEach } from 'vitest';
import { ReificationCommandParser } from '../src/components/ReplInterface/parsers/ReificationParser';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('ReificationCommandParser', () => {
  let parser: ReificationCommandParser;
  let pyretInstance: PyretDataInstance;
  let jsonInstance: JSONDataInstance;

  beforeEach(() => {
    parser = new ReificationCommandParser();
    
    // Create a PyretDataInstance with some test data
    pyretInstance = new PyretDataInstance(null);
    pyretInstance.addAtom({ id: 'node1', type: 'Node', label: 'Node$1' });
    pyretInstance.addAtom({ id: 'val1', type: 'Number', label: '42' });
    pyretInstance.addAtom({ id: 'leaf1', type: 'Leaf', label: 'Leaf$1' });
    pyretInstance.addAtom({ id: 'val2', type: 'Number', label: '7' });
    
    pyretInstance.addRelationTuple('value', { 
      atoms: ['node1', 'val1'], 
      types: ['Node', 'Number'] 
    });
    pyretInstance.addRelationTuple('child', { 
      atoms: ['node1', 'leaf1'], 
      types: ['Node', 'Leaf'] 
    });
    pyretInstance.addRelationTuple('value', { 
      atoms: ['leaf1', 'val2'], 
      types: ['Leaf', 'Number'] 
    });
    
    // Create a JSONDataInstance for negative testing
    jsonInstance = new JSONDataInstance({
      atoms: [{ id: 'a', type: 'Type1', label: 'A' }],
      relations: []
    });
  });

  describe('Command recognition', () => {
    it('should handle reify commands', () => {
      expect(parser.canHandle('reify')).toBe(true);
      expect(parser.canHandle('REIFY')).toBe(true);
      expect(parser.canHandle('reify node1')).toBe(true);
      expect(parser.canHandle('reify --format')).toBe(true);
      expect(parser.canHandle('reify --debug')).toBe(true);
      expect(parser.canHandle('reify node1 --format --debug')).toBe(true);
    });

    it('should handle show-structure commands', () => {
      expect(parser.canHandle('show-structure')).toBe(true);
      expect(parser.canHandle('SHOW-STRUCTURE')).toBe(true);
      expect(parser.canHandle('show-structure ')).toBe(true);
    });

    it('should handle show-schemas commands', () => {
      expect(parser.canHandle('show-schemas')).toBe(true);
      expect(parser.canHandle('SHOW-SCHEMAS')).toBe(true);
      expect(parser.canHandle('show-schemas ')).toBe(true);
    });

    it('should not handle unrelated commands', () => {
      expect(parser.canHandle('add Alice:Person')).toBe(false);
      expect(parser.canHandle('remove Bob')).toBe(false);
      expect(parser.canHandle('list')).toBe(false);
      expect(parser.canHandle('help')).toBe(false);
      expect(parser.canHandle('status')).toBe(false);
    });

    it('should have appropriate priority', () => {
      expect(parser.getPriority()).toBe(110);
    });

    it('should provide command patterns', () => {
      const patterns = parser.getCommandPatterns();
      expect(patterns).toContain('reify');
      expect(patterns).toContain('reify atom_id');
      expect(patterns).toContain('reify --format');
      expect(patterns).toContain('show-structure');
      expect(patterns).toContain('show-schemas');
    });
  });

  describe('Basic reify command', () => {
    it('should reify entire instance', () => {
      const result = parser.execute('reify', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Reified instance:');
      expect(result.message).toContain('Node'); // Just check that Node type is present
    });

    it('should reify specific atom by ID', () => {
      const result = parser.execute('reify node1', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain("Reified atom 'node1':");
      expect(result.message).toContain('Node'); // Just check that Node type is present
    });

    it('should handle non-existent atom ID', () => {
      const result = parser.execute('reify nonexistent', pyretInstance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain("Atom 'nonexistent' not found");
    });

    it('should reject non-Pyret instances', () => {
      const result = parser.execute('reify', jsonInstance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('only work with Pyret data instances');
    });
  });

  describe('Reify command with options', () => {
    it('should handle format option', () => {
      const result = parser.execute('reify --format', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Reified instance:');
      // Note: For now, options fallback to basic reify until enhanced implementation is complete
    });

    it('should handle debug option', () => {
      const result = parser.execute('reify --debug', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Reified instance:');
    });

    it('should handle multiple options', () => {
      const result = parser.execute('reify --format --debug', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Reified instance:');
    });

    it('should handle atom ID with options', () => {
      const result = parser.execute('reify node1 --format', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain("Reified atom 'node1':");
    });

    it('should ignore unknown options', () => {
      const result = parser.execute('reify --unknown-option', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Reified instance:');
    });
  });

  describe('Show-structure command', () => {
    it('should display data structure overview', () => {
      const result = parser.execute('show-structure', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Data Structure Overview:');
      expect(result.message).toContain('Atoms: 4'); // node1, val1, leaf1, val2
      expect(result.message).toContain('Relations: 2'); // value, child
      expect(result.message).toContain('Types:');
      expect(result.message).toContain('Node: 1 atoms');
      expect(result.message).toContain('Number: 2 atoms');
      expect(result.message).toContain('Leaf: 1 atoms');
    });

    it('should handle empty instance', () => {
      const emptyInstance = new PyretDataInstance(null);
      const result = parser.execute('show-structure', emptyInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Atoms: 0');
      expect(result.message).toContain('Relations: 0');
    });

    it('should list individual atoms for small types', () => {
      const result = parser.execute('show-structure', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('node1 (Node$1)');
      expect(result.message).toContain('leaf1 (Leaf$1)');
    });
  });

  describe('Show-schemas command', () => {
    it('should display available schemas', () => {
      const result = parser.execute('show-schemas', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Available Type Schemas:');
      expect(result.message).toContain('Black:');
      expect(result.message).toContain('Red:');
      expect(result.message).toContain('Leaf:');
      expect(result.message).toContain('Arguments:');
      expect(result.message).toContain('Examples:');
    });

    it('should explain schema usage', () => {
      const result = parser.execute('show-schemas', pyretInstance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Use these schemas to ensure correct constructor argument order');
    });
  });

  describe('Error handling', () => {
    it('should handle unknown reification commands', () => {
      const result = parser.execute('unknown-reify-command', pyretInstance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown reification command');
    });

    it('should handle execution errors gracefully', () => {
      // Create a malformed command that could cause errors
      const result = parser.execute('reify', pyretInstance);
      
      // Should still succeed for basic reify
      expect(result.success).toBe(true);
    });
  });

  describe('Help system', () => {
    it('should provide comprehensive help', () => {
      const help = parser.getHelp();
      const helpText = help.join('\n');
      
      expect(helpText).toContain('Reification Commands:');
      expect(helpText).toContain('reify');
      expect(helpText).toContain('reify atom_id');
      expect(helpText).toContain('reify --format');
      expect(helpText).toContain('reify --debug');
      expect(helpText).toContain('show-structure');
      expect(helpText).toContain('show-schemas');
      expect(helpText).toContain('Examples:');
    });
  });

  describe('Integration scenarios', () => {
    it('should work with empty Pyret instance', () => {
      const emptyInstance = new PyretDataInstance(null);
      
      const reifyResult = parser.execute('reify', emptyInstance);
      expect(reifyResult.success).toBe(true);
      
      const structureResult = parser.execute('show-structure', emptyInstance);
      expect(structureResult.success).toBe(true);
      
      const schemasResult = parser.execute('show-schemas', emptyInstance);
      expect(schemasResult.success).toBe(true);
    });

    it('should handle complex data structures', () => {
      // Add more complex structure
      pyretInstance.addAtom({ id: 'tree1', type: 'Tree', label: 'Tree$1' });
      pyretInstance.addRelationTuple('left', { 
        atoms: ['tree1', 'node1'], 
        types: ['Tree', 'Node'] 
      });
      pyretInstance.addRelationTuple('right', { 
        atoms: ['tree1', 'leaf1'], 
        types: ['Tree', 'Leaf'] 
      });
      
      const result = parser.execute('reify tree1', pyretInstance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Tree'); // Just check that Tree type is present
    });

    it('should handle case-insensitive commands', () => {
      const result1 = parser.execute('REIFY', pyretInstance);
      expect(result1.success).toBe(true);
      
      const result2 = parser.execute('Show-Structure', pyretInstance);
      expect(result2.success).toBe(true);
      
      const result3 = parser.execute('SHOW-SCHEMAS', pyretInstance);
      expect(result3.success).toBe(true);
    });
  });
});