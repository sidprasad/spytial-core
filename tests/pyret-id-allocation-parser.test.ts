import { describe, it, expect, beforeEach } from 'vitest';
import { PyretIdAllocationParser } from '../src/components/ReplInterface/parsers/PyretIdAllocationParser';
import { PyretEvaluator, PyretEvaluationResult } from '../src/components/ReplInterface/parsers/PyretExpressionParser';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('PyretIdAllocationParser', () => {
  let instance: JSONDataInstance;
  let parser: PyretIdAllocationParser;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
  });

  describe('without external evaluator', () => {
    beforeEach(() => {
      parser = new PyretIdAllocationParser();
    });

    it('should handle primitive number assignment', () => {
      expect(parser.canHandle('x = 1')).toBe(true);
      expect(parser.canHandle('num = 42')).toBe(true);
      expect(parser.canHandle('float_val = 3.14')).toBe(true);
    });

    it('should handle primitive string assignment', () => {
      expect(parser.canHandle('name = "Alice"')).toBe(true);
      expect(parser.canHandle('msg = \'hello\'')).toBe(true);
      expect(parser.canHandle('text = `world`')).toBe(true);
    });

    it('should handle primitive boolean assignment', () => {
      expect(parser.canHandle('flag = true')).toBe(true);
      expect(parser.canHandle('isValid = false')).toBe(true);
    });

    it('should not handle invalid syntax', () => {
      expect(parser.canHandle('x')).toBe(false);
      expect(parser.canHandle('= 1')).toBe(false);
      expect(parser.canHandle('remove x')).toBe(false);
      expect(parser.canHandle('help')).toBe(false);
    });

    it('should not handle dot notation relations', () => {
      expect(parser.canHandle('alice.friend=bob')).toBe(false);
    });

    it('should not handle invalid identifiers', () => {
      expect(parser.canHandle('123 = 1')).toBe(false);
      expect(parser.canHandle('add = 1')).toBe(false);
      expect(parser.canHandle('remove = 1')).toBe(false);
    });

    it('should execute primitive number assignment', async () => {
      const result = await parser.execute('x = 1', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('[x]');
      expect(result.message).toContain('x = 1');
      expect(result.message).toContain('Number');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(1);
      expect(atoms[0].id).toBe('x');
      expect(atoms[0].label).toBe('1');
      expect(atoms[0].type).toBe('Number');
    });

    it('should execute primitive string assignment', async () => {
      const result = await parser.execute('name = "Alice"', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('[name]');
      expect(result.message).toContain('Alice');
      expect(result.message).toContain('String');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(1);
      expect(atoms[0].id).toBe('name');
      expect(atoms[0].label).toBe('Alice');
      expect(atoms[0].type).toBe('String');
    });

    it('should execute primitive boolean assignment', async () => {
      const result = await parser.execute('flag = true', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('[flag]');
      expect(result.message).toContain('true');
      expect(result.message).toContain('Boolean');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(1);
      expect(atoms[0].id).toBe('flag');
      expect(atoms[0].label).toBe('true');
      expect(atoms[0].type).toBe('Boolean');
    });

    it('should reject assignment to existing ID', async () => {
      // Add an atom first
      instance.addAtom({ id: 'x', label: 'existing', type: 'Test' });
      
      const result = await parser.execute('x = 1', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('already in use');
    });

    it('should reject complex expressions without evaluator', async () => {
      const result = await parser.execute('node = Black(1, 2)', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No external Pyret evaluator available');
    });
  });

  describe('with external evaluator', () => {
    let mockEvaluator: PyretEvaluator;

    beforeEach(() => {
      mockEvaluator = {
        run: async (code: string) => ({
          success: true,
          result: { dict: { value: code }, brands: { '$brandtest': true } }
        }),
        runtime: {
          isSuccessResult: (result: PyretEvaluationResult) => result.success === true
        }
      };
      parser = new PyretIdAllocationParser(mockEvaluator);
    });

    it('should handle complex expressions with evaluator', () => {
      expect(parser.canHandle('node = Black(1, 2)')).toBe(true);
      expect(parser.canHandle('mylist = [list: 1, 2, 3]')).toBe(true);
      expect(parser.canHandle('tree = node(1, empty, empty)')).toBe(true);
    });

    it('should still handle primitive assignments', async () => {
      const result = await parser.execute('x = 42', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('[x]');
      expect(result.message).toContain('42');
      expect(result.message).toContain('Number');
    });

    it('should have correct priority', () => {
      expect(parser.getPriority()).toBe(110);
    });

    it('should provide appropriate command patterns', () => {
      const patterns = parser.getCommandPatterns();
      expect(patterns).toContain('x = 1');
      expect(patterns).toContain('alice = "Alice"');
      expect(patterns).toContain('node = Black(...)');
      expect(patterns.length).toBeGreaterThan(3);
    });

    it('should provide help text with and without evaluator', () => {
      const helpWithEvaluator = parser.getHelp();
      expect(helpWithEvaluator.join('\n')).toContain('Complex Examples');
      expect(helpWithEvaluator.join('\n')).toContain('Black(1, 2)');
      
      const parserWithoutEvaluator = new PyretIdAllocationParser();
      const helpWithoutEvaluator = parserWithoutEvaluator.getHelp();
      expect(helpWithoutEvaluator.join('\n')).toContain('external Pyret evaluator');
      expect(helpWithoutEvaluator.join('\n')).toContain('primitive values');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      parser = new PyretIdAllocationParser();
    });

    it('should handle whitespace in assignments', () => {
      expect(parser.canHandle('  x   =   1  ')).toBe(true);
    });

    it('should reject invalid assignment syntax', async () => {
      const result = await parser.execute('x == 1', instance);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid assignment syntax');
    });

    it('should reject reserved words as IDs', () => {
      expect(parser.canHandle('add = 1')).toBe(false);
      expect(parser.canHandle('remove = 1')).toBe(false);
      expect(parser.canHandle('help = 1')).toBe(false);
    });
  });
});