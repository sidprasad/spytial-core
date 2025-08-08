import { describe, it, expect, beforeEach } from 'vitest';
import { PythonExpressionParser } from '../src/components/ReplInterface/parsers/PythonExpressionParser';
import { PythonDataInstance } from '../src/data-instance/python/python-data-instance';

describe('PythonExpressionParser', () => {
  let parser: PythonExpressionParser;
  let instance: PythonDataInstance;

  beforeEach(() => {
    parser = new PythonExpressionParser();
    instance = new PythonDataInstance();
  });

  describe('constructor and configuration', () => {
    it('should create parser without evaluator', () => {
      expect(parser.hasEvaluator()).toBe(false);
      expect(parser.getEvaluator()).toBeNull();
    });

    it('should accept external evaluator', () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      
      const parserWithEvaluator = new PythonExpressionParser(mockEvaluator);
      expect(parserWithEvaluator.hasEvaluator()).toBe(true);
      expect(parserWithEvaluator.getEvaluator()).toBe(mockEvaluator);
    });

    it('should update evaluator', () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      
      parser.setEvaluator(mockEvaluator);
      expect(parser.hasEvaluator()).toBe(true);
      expect(parser.getEvaluator()).toBe(mockEvaluator);
    });
  });

  describe('canHandle', () => {
    it('should reject commands when no evaluator is available', () => {
      expect(parser.canHandle('1 + 2')).toBe(false);
      expect(parser.canHandle('[1, 2, 3]')).toBe(false);
      expect(parser.canHandle('print("hello")')).toBe(false);
    });

    it('should accept commands when evaluator is available', () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      parser.setEvaluator(mockEvaluator);

      expect(parser.canHandle('1 + 2')).toBe(true);
      expect(parser.canHandle('[1, 2, 3]')).toBe(true);
      expect(parser.canHandle('{"key": "value"}')).toBe(true);
    });

    it('should reject empty commands', () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      parser.setEvaluator(mockEvaluator);

      expect(parser.canHandle('')).toBe(false);
      expect(parser.canHandle('   ')).toBe(false);
    });

    it('should reject specific REPL commands', () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      parser.setEvaluator(mockEvaluator);

      expect(parser.canHandle('help')).toBe(false);
      expect(parser.canHandle('info')).toBe(false);
      expect(parser.canHandle('clear')).toBe(false);
      expect(parser.canHandle('reify')).toBe(false);
      expect(parser.canHandle('remove something')).toBe(false);
    });

    it('should reject atom declarations', () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      parser.setEvaluator(mockEvaluator);

      expect(parser.canHandle('alice:Person')).toBe(false);
      expect(parser.canHandle('bob : User')).toBe(false);
    });

    it('should reject dot notation relations', () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      parser.setEvaluator(mockEvaluator);

      expect(parser.canHandle('alice.friend = bob')).toBe(false);
      expect(parser.canHandle('user.name = "Alice"')).toBe(false);
    });
  });

  describe('execute', () => {
    it('should reject parsing with non-PythonDataInstance', async () => {
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(42)
      };
      parser.setEvaluator(mockEvaluator);

      // Create a mock instance that's not a PythonDataInstance
      const mockInstance = {
        addAtom: () => {},
        removeAtom: () => {},
        getAtoms: () => [],
        getRelations: () => [],
        getTypes: () => [],
      } as any;

      const result = await parser.execute('1 + 1', mockInstance);
      expect(result.success).toBe(false);
      expect(result.message).toContain('PythonDataInstance');
    });

    it('should handle primitive evaluation results', async () => {
      const mockEvaluator = {
        runPython: async (code: string) => {
          if (code === '1 + 1') return 2;
          if (code === '"hello"') return 'hello';
          return eval(code);
        }
      };
      parser.setEvaluator(mockEvaluator);

      const result = await parser.execute('1 + 1', instance);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Python expression evaluated successfully');
      
      // Check that an atom was added for the result
      const atoms = instance.getAtoms();
      expect(atoms.length).toBeGreaterThan(0);
      const resultAtom = atoms.find(atom => atom.label === '2');
      expect(resultAtom).toBeDefined();
      expect(resultAtom?.type).toBe('int');
    });

    it('should handle evaluation errors', async () => {
      const mockEvaluator = {
        runPython: async (code: string) => {
          throw new Error('Syntax error');
        }
      };
      parser.setEvaluator(mockEvaluator);

      const result = await parser.execute('invalid syntax', instance);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Python evaluation failed');
      expect(result.message).toContain('Syntax error');
    });

    it('should handle complex object evaluation results', async () => {
      const mockEvaluator = {
        runPython: async (code: string) => {
          if (code === '[1, 2, 3]') {
            return {
              '0': 1,
              '1': 2, 
              '2': 3,
              __class__: { __name__: 'list' }
            };
          }
          return eval(code);
        }
      };
      parser.setEvaluator(mockEvaluator);

      const result = await parser.execute('[1, 2, 3]', instance);
      expect(result.success).toBe(true);
      
      // Check that atoms and relations were created
      const atoms = instance.getAtoms();
      const relations = instance.getRelations();
      expect(atoms.length).toBeGreaterThan(0);
      expect(relations.length).toBeGreaterThan(0);
    });
  });

  describe('priority and help', () => {
    it('should have correct priority', () => {
      expect(parser.getPriority()).toBe(90);
    });

    it('should provide help text', () => {
      const help = parser.getHelp();
      expect(help).toBeInstanceOf(Array);
      expect(help.length).toBeGreaterThan(0);
      expect(help.join(' ')).toContain('Python');
      
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      parser.setEvaluator(mockEvaluator);
      
      const helpWithEvaluator = parser.getHelp();
      expect(helpWithEvaluator).toBeInstanceOf(Array);
      expect(helpWithEvaluator.join(' ')).toContain('Python');
    });

    it('should provide command patterns', () => {
      const patterns = parser.getCommandPatterns();
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
    });
  });
});