import { describe, it, expect, beforeEach } from 'vitest';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

describe('PyretDataInstance.fromExpression', () => {
  let mockEvaluator: { run: (code: string) => Promise<unknown> };

  beforeEach(() => {
    mockEvaluator = {
      run: async (code: string) => {
        if (code === '"hello"') {
          return { answer: 'hello' };
        } else if (code === '42') {
          return { answer: 42 };
        } else if (code === 'true') {
          return { answer: true };
        } else if (code === 'test(42)') {
          return { 
            answer: {
              dict: { value: 42 },
              brands: { '$brandtest1': true }
            }
          };
        } else if (code === 'error-expression') {
          return { exn: 'Test error message' };
        } else if (code === '"test"') {
          return { answer: 'test' };
        } else if (code === 'complex-object') {
          return {
            answer: {
              dict: { 
                name: 'testObject',
                value: 100,
                nested: {
                  dict: { inner: 'data' },
                  brands: { '$brandinner1': true }
                }
              },
              brands: { '$brandcomplex1': true }
            }
          };
        }
        throw new Error(`Unsupported test expression: ${code}`);
      }
    };
  });

  it('should create instance from string expression', async () => {
    const instance = await PyretDataInstance.fromExpression('"hello"', false, mockEvaluator);
    
    const atoms = instance.getAtoms();
    expect(atoms).toHaveLength(1);
    expect(atoms[0].type).toBe('String');
    expect(atoms[0].label).toBe('hello');
  });

  it('should create instance from number expression', async () => {
    const instance = await PyretDataInstance.fromExpression('42', false, mockEvaluator);
    
    const atoms = instance.getAtoms();
    expect(atoms).toHaveLength(1);
    expect(atoms[0].type).toBe('Number');
    expect(atoms[0].label).toBe('42');
  });

  it('should create instance from boolean expression', async () => {
    const instance = await PyretDataInstance.fromExpression('true', false, mockEvaluator);
    
    const atoms = instance.getAtoms();
    expect(atoms).toHaveLength(1);
    expect(atoms[0].type).toBe('Boolean');
    expect(atoms[0].label).toBe('true');
  });

  it('should create instance from complex object expression', async () => {
    const instance = await PyretDataInstance.fromExpression('test(42)', false, mockEvaluator);
    
    const atoms = instance.getAtoms();
    expect(atoms.length).toBeGreaterThan(0);
    
    // Should have the main object and its field values
    const testAtom = atoms.find(atom => atom.type === 'test');
    expect(testAtom).toBeDefined();
    
    const numberAtom = atoms.find(atom => atom.type === 'Number' && atom.label === '42');
    expect(numberAtom).toBeDefined();
  });

  it('should throw error for failed expression evaluation', async () => {
    await expect(
      PyretDataInstance.fromExpression('error-expression', false, mockEvaluator)
    ).rejects.toThrow('Failed to evaluate Pyret expression: Test error message');
  });

  it('should pass showFunctions parameter to constructor', async () => {
    const instance = await PyretDataInstance.fromExpression('"test"', true, mockEvaluator);
    
    // The instance should be created with showFunctions = true
    // This is harder to test directly, but we can verify the instance was created
    expect(instance).toBeInstanceOf(PyretDataInstance);
    expect(instance.getAtoms()).toHaveLength(1);
  });

  it('should set external evaluator on created instance', async () => {
    const instance = await PyretDataInstance.fromExpression('"test"', false, mockEvaluator);
    
    // Verify the external evaluator was set
    expect(instance.hasExternalEvaluator()).toBe(true);
    expect(instance.getExternalEvaluator()).toBe(mockEvaluator);
  });

  it('should handle complex nested objects', async () => {
    const instance = await PyretDataInstance.fromExpression('complex-object', false, mockEvaluator);
    
    const atoms = instance.getAtoms();
    expect(atoms.length).toBeGreaterThan(1);
    
    // Should have atoms for the main object, its fields, and nested objects
    const complexAtom = atoms.find(atom => atom.type === 'complex');
    expect(complexAtom).toBeDefined();
    
    const relations = instance.getRelations();
    expect(relations.length).toBeGreaterThan(0);
  });
});