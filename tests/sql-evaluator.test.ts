import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLEvaluator, SQLEvaluatorResult } from '../src/evaluators/sql-evaluator';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { EvaluationContext } from '../src/evaluators/interfaces';

/**
 * Test suite for SQLEvaluator
 * 
 * Tests the SQL-based evaluator implementation that uses AlaSQL
 * to query IDataInstance data with SQL syntax.
 */
describe('SQLEvaluator', () => {
  let evaluator: SQLEvaluator;

  beforeEach(() => {
    evaluator = new SQLEvaluator();
  });

  afterEach(() => {
    evaluator.dispose();
  });

  /**
   * Create a simple test data instance with people and friendships
   */
  function createSimpleDataInstance(): JSONDataInstance {
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Alice', type: 'Person', label: 'Alice' },
        { id: 'Bob', type: 'Person', label: 'Bob' },
        { id: 'Charlie', type: 'Person', label: 'Charlie' },
        { id: 'TechCorp', type: 'Company', label: 'TechCorp' }
      ],
      relations: [
        {
          id: 'friends',
          name: 'friends',
          types: ['Person', 'Person'],
          tuples: [
            { atoms: ['Alice', 'Bob'], types: ['Person', 'Person'] },
            { atoms: ['Bob', 'Charlie'], types: ['Person', 'Person'] }
          ]
        },
        {
          id: 'worksAt',
          name: 'worksAt',
          types: ['Person', 'Company'],
          tuples: [
            { atoms: ['Alice', 'TechCorp'], types: ['Person', 'Company'] },
            { atoms: ['Bob', 'TechCorp'], types: ['Person', 'Company'] }
          ]
        }
      ]
    };
    return new JSONDataInstance(jsonData);
  }

  /**
   * Create a data instance with unary relations
   */
  function createUnaryRelationDataInstance(): JSONDataInstance {
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Node1', type: 'Node', label: 'Node 1' },
        { id: 'Node2', type: 'Node', label: 'Node 2' },
        { id: 'Node3', type: 'Node', label: 'Node 3' }
      ],
      relations: [
        {
          id: 'selected',
          name: 'selected',
          types: ['Node'],
          tuples: [
            { atoms: ['Node1'], types: ['Node'] },
            { atoms: ['Node3'], types: ['Node'] }
          ]
        }
      ]
    };
    return new JSONDataInstance(jsonData);
  }

  /**
   * Create a data instance with ternary (3-ary) relations
   */
  function createTernaryRelationDataInstance(): JSONDataInstance {
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'Person1', type: 'Person', label: 'Person 1' },
        { id: 'Person2', type: 'Person', label: 'Person 2' },
        { id: 'Project1', type: 'Project', label: 'Project 1' },
        { id: 'Role1', type: 'Role', label: 'Developer' }
      ],
      relations: [
        {
          id: 'assignment',
          name: 'assignment',
          types: ['Person', 'Project', 'Role'],
          tuples: [
            { atoms: ['Person1', 'Project1', 'Role1'], types: ['Person', 'Project', 'Role'] }
          ]
        }
      ]
    };
    return new JSONDataInstance(jsonData);
  }

  describe('Initialization', () => {
    it('should not be ready before initialization', () => {
      expect(evaluator.isReady()).toBe(false);
    });

    it('should be ready after initialization', () => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
      expect(evaluator.isReady()).toBe(true);
    });

    it('should throw error if initialized with invalid data', () => {
      expect(() => {
        evaluator.initialize({ sourceData: 'invalid' as unknown as any });
      }).toThrow('Invalid context.sourceData: Expected an instance of IDataInstance');
    });

    it('should create table schemas after initialization', () => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
      
      const schemas = evaluator.getTableSchemas();
      expect(schemas.length).toBeGreaterThan(0);
      
      // Should have atoms and types tables
      expect(schemas.some(s => s.name === 'atoms')).toBe(true);
      expect(schemas.some(s => s.name === 'types')).toBe(true);
      
      // Should have relation tables
      expect(schemas.some(s => s.name === 'friends')).toBe(true);
      expect(schemas.some(s => s.name === 'worksAt')).toBe(true);
    });
  });

  describe('Basic Queries', () => {
    beforeEach(() => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should query all atoms', () => {
      const result = evaluator.evaluate('SELECT * FROM atoms');
      expect(result.isError()).toBe(false);
      expect(result.noResult()).toBe(false);
      
      const raw = result.getRawResult();
      expect(Array.isArray(raw)).toBe(true);
      expect((raw as any[]).length).toBe(4); // Alice, Bob, Charlie, TechCorp
    });

    it('should query atoms by type', () => {
      const result = evaluator.evaluate("SELECT id FROM atoms WHERE type = 'Person'");
      expect(result.isError()).toBe(false);
      
      const atoms = result.selectedAtoms();
      expect(atoms).toHaveLength(3);
      expect(atoms).toContain('Alice');
      expect(atoms).toContain('Bob');
      expect(atoms).toContain('Charlie');
    });

    it('should query atoms by id', () => {
      const result = evaluator.evaluate("SELECT id FROM atoms WHERE id = 'Alice'");
      expect(result.isError()).toBe(false);
      
      const atoms = result.selectedAtoms();
      expect(atoms).toHaveLength(1);
      expect(atoms[0]).toBe('Alice');
    });

    it('should query relation tuples', () => {
      const result = evaluator.evaluate('SELECT src, tgt FROM friends');
      expect(result.isError()).toBe(false);
      
      const tuples = result.selectedTwoples();
      expect(tuples).toHaveLength(2);
      expect(tuples).toContainEqual(['Alice', 'Bob']);
      expect(tuples).toContainEqual(['Bob', 'Charlie']);
    });

    it('should support COUNT aggregate', () => {
      const result = evaluator.evaluate('SELECT COUNT(*) as cnt FROM atoms');
      expect(result.isError()).toBe(false);
      
      const raw = result.getRawResult();
      expect(Array.isArray(raw)).toBe(true);
      expect((raw as any[])[0][0]).toBe(4);
    });

    it('should support GROUP BY', () => {
      const result = evaluator.evaluate('SELECT type, COUNT(*) as cnt FROM atoms GROUP BY type');
      expect(result.isError()).toBe(false);
      
      const raw = result.getRawResult() as any[];
      expect(raw.length).toBe(2); // Person and Company
    });
  });

  describe('Join Queries', () => {
    beforeEach(() => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should join atoms with relations', () => {
      const result = evaluator.evaluate(`
        SELECT a.label, b.label 
        FROM friends f 
        JOIN atoms a ON f.src = a.id 
        JOIN atoms b ON f.tgt = b.id
      `);
      expect(result.isError()).toBe(false);
      
      // Check the raw result
      const raw = result.getRawResult() as any[];
      expect(raw.length).toBe(2);
    });

    it('should support self-joins on atoms', () => {
      const result = evaluator.evaluate(`
        SELECT a.id, b.id 
        FROM atoms a, atoms b 
        WHERE a.type = b.type AND a.id < b.id
      `);
      expect(result.isError()).toBe(false);
      
      // Check raw result - should find pairs of same-type atoms
      const raw = result.getRawResult() as any[];
      expect(raw.length).toBeGreaterThan(0);
    });
  });

  describe('Unary Relations', () => {
    beforeEach(() => {
      const dataInstance = createUnaryRelationDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should create single-column tables for unary relations', () => {
      const schemas = evaluator.getTableSchemas();
      const selectedSchema = schemas.find(s => s.name === 'rel_selected');
      
      expect(selectedSchema).toBeDefined();
      expect(selectedSchema!.columns).toEqual(['atom']);
    });

    it('should query unary relations', () => {
      const result = evaluator.evaluate('SELECT atom FROM rel_selected');
      expect(result.isError()).toBe(false);
      
      const atoms = result.selectedAtoms();
      expect(atoms).toHaveLength(2);
      expect(atoms).toContain('Node1');
      expect(atoms).toContain('Node3');
    });
  });

  describe('Ternary Relations', () => {
    beforeEach(() => {
      const dataInstance = createTernaryRelationDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should create multi-column tables for ternary relations', () => {
      const schemas = evaluator.getTableSchemas();
      const assignmentSchema = schemas.find(s => s.name === 'assignment');
      
      expect(assignmentSchema).toBeDefined();
      expect(assignmentSchema!.columns).toEqual(['elem_0', 'elem_1', 'elem_2']);
    });

    it('should query ternary relations', () => {
      const result = evaluator.evaluate('SELECT * FROM assignment');
      expect(result.isError()).toBe(false);
      
      const tuples = result.selectedTuplesAll();
      expect(tuples).toHaveLength(1);
      expect(tuples[0]).toEqual(['Person1', 'Project1', 'Role1']);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should return error result for invalid SQL', () => {
      const result = evaluator.evaluate('SELECTT * FROMM invalid_syntax');
      expect(result.isError()).toBe(true);
      
      const pp = result.prettyPrint();
      expect(pp).toContain('Error');
    });

    it('should return error result for non-existent table', () => {
      const result = evaluator.evaluate('SELECT * FROM nonexistent_table');
      expect(result.isError()).toBe(true);
    });

    it('should throw error when evaluating before initialization', () => {
      const uninitializedEvaluator = new SQLEvaluator();
      expect(() => {
        uninitializedEvaluator.evaluate('SELECT * FROM atoms');
      }).toThrow('Evaluator not initialized');
    });
  });

  describe('Caching', () => {
    beforeEach(() => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should cache query results', () => {
      const query = 'SELECT * FROM atoms';
      
      const result1 = evaluator.evaluate(query);
      const result2 = evaluator.evaluate(query);
      
      expect(result1.getRawResult()).toEqual(result2.getRawResult());
    });

    it('should track cache size in memory stats', () => {
      evaluator.evaluate('SELECT * FROM atoms');
      evaluator.evaluate('SELECT * FROM friends');
      
      const stats = evaluator.getMemoryStats();
      expect(stats.cacheSize).toBe(2);
    });

    it('should clear cache on re-initialization', () => {
      evaluator.evaluate('SELECT * FROM atoms');
      
      const stats1 = evaluator.getMemoryStats();
      expect(stats1.cacheSize).toBe(1);
      
      const newInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: newInstance });
      
      const stats2 = evaluator.getMemoryStats();
      expect(stats2.cacheSize).toBe(0);
    });
  });

  describe('Result Methods', () => {
    beforeEach(() => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('prettyPrint should format tuples correctly', () => {
      const result = evaluator.evaluate('SELECT src, tgt FROM friends');
      const pp = result.prettyPrint();
      
      expect(pp).toContain('->');
      expect(pp).toContain(',');
    });

    it('noResult should return true for empty results', () => {
      const result = evaluator.evaluate("SELECT * FROM atoms WHERE id = 'NonExistent'");
      expect(result.noResult()).toBe(true);
    });

    it('noResult should return false for non-empty results', () => {
      const result = evaluator.evaluate('SELECT * FROM atoms');
      expect(result.noResult()).toBe(false);
    });

    it('getExpression should return the original query', () => {
      const query = 'SELECT * FROM atoms';
      const result = evaluator.evaluate(query);
      expect(result.getExpression()).toBe(query);
    });
  });

  describe('Types Table', () => {
    beforeEach(() => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should query types table', () => {
      const result = evaluator.evaluate('SELECT id FROM types');
      expect(result.isError()).toBe(false);
      
      const raw = result.getRawResult();
      expect(Array.isArray(raw)).toBe(true);
    });

    it('should include isBuiltin column', () => {
      const result = evaluator.evaluate('SELECT id, isBuiltin FROM types');
      expect(result.isError()).toBe(false);
    });
  });

  describe('Memory Management', () => {
    it('should dispose correctly', () => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
      evaluator.evaluate('SELECT * FROM atoms');
      
      evaluator.dispose();
      
      expect(evaluator.isReady()).toBe(false);
      const stats = evaluator.getMemoryStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.tableCount).toBe(0);
    });

    it('should report memory stats correctly', () => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
      
      const stats = evaluator.getMemoryStats();
      expect(stats.maxCacheSize).toBe(1000);
      expect(stats.tableCount).toBeGreaterThan(0);
    });
  });

  describe('Database Isolation', () => {
    it('should isolate data between multiple evaluator instances', () => {
      // Create two separate data instances with different data
      const jsonData1: IJsonDataInstance = {
        atoms: [
          { id: 'Instance1_Alice', type: 'Person', label: 'Alice from Instance 1' }
        ],
        relations: []
      };
      
      const jsonData2: IJsonDataInstance = {
        atoms: [
          { id: 'Instance2_Bob', type: 'Person', label: 'Bob from Instance 2' }
        ],
        relations: []
      };
      
      const instance1 = new JSONDataInstance(jsonData1);
      const instance2 = new JSONDataInstance(jsonData2);
      
      // Create two evaluators
      const evaluator1 = new SQLEvaluator();
      const evaluator2 = new SQLEvaluator();
      
      // Initialize both
      evaluator1.initialize({ sourceData: instance1 });
      evaluator2.initialize({ sourceData: instance2 });
      
      // Query each evaluator - they should return their own data
      const result1 = evaluator1.evaluate('SELECT id FROM atoms');
      const result2 = evaluator2.evaluate('SELECT id FROM atoms');
      
      const atoms1 = result1.selectedAtoms();
      const atoms2 = result2.selectedAtoms();
      
      // Verify isolation
      expect(atoms1).toHaveLength(1);
      expect(atoms1[0]).toBe('Instance1_Alice');
      expect(atoms2).toHaveLength(1);
      expect(atoms2[0]).toBe('Instance2_Bob');
      
      // Cleanup
      evaluator1.dispose();
      evaluator2.dispose();
    });

    it('should not affect other evaluators when one is disposed', () => {
      const jsonData1: IJsonDataInstance = {
        atoms: [{ id: 'Alice', type: 'Person', label: 'Alice' }],
        relations: []
      };
      
      const jsonData2: IJsonDataInstance = {
        atoms: [{ id: 'Bob', type: 'Person', label: 'Bob' }],
        relations: []
      };
      
      const evaluator1 = new SQLEvaluator();
      const evaluator2 = new SQLEvaluator();
      
      evaluator1.initialize({ sourceData: new JSONDataInstance(jsonData1) });
      evaluator2.initialize({ sourceData: new JSONDataInstance(jsonData2) });
      
      // Dispose evaluator1
      evaluator1.dispose();
      
      // Evaluator2 should still work
      const result = evaluator2.evaluate('SELECT id FROM atoms');
      expect(result.isError()).toBe(false);
      const atoms = result.selectedAtoms();
      expect(atoms).toHaveLength(1);
      expect(atoms[0]).toBe('Bob');
      
      evaluator2.dispose();
    });

    it('should not affect other evaluators when one is reinitialized', () => {
      const jsonData1: IJsonDataInstance = {
        atoms: [{ id: 'Alice', type: 'Person', label: 'Alice' }],
        relations: []
      };
      
      const jsonData2: IJsonDataInstance = {
        atoms: [{ id: 'Bob', type: 'Person', label: 'Bob' }],
        relations: []
      };
      
      const jsonData3: IJsonDataInstance = {
        atoms: [{ id: 'Charlie', type: 'Person', label: 'Charlie' }],
        relations: []
      };
      
      const evaluator1 = new SQLEvaluator();
      const evaluator2 = new SQLEvaluator();
      
      evaluator1.initialize({ sourceData: new JSONDataInstance(jsonData1) });
      evaluator2.initialize({ sourceData: new JSONDataInstance(jsonData2) });
      
      // Reinitialize evaluator1 with different data
      evaluator1.initialize({ sourceData: new JSONDataInstance(jsonData3) });
      
      // Evaluator2 should still have its original data
      const result2 = evaluator2.evaluate('SELECT id FROM atoms');
      expect(result2.selectedAtoms()[0]).toBe('Bob');
      
      // Evaluator1 should have the new data
      const result1 = evaluator1.evaluate('SELECT id FROM atoms');
      expect(result1.selectedAtoms()[0]).toBe('Charlie');
      
      evaluator1.dispose();
      evaluator2.dispose();
    });
  });

  describe('Special Characters in Table Names', () => {
    it('should sanitize relation names with special characters', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'A', type: 'Node', label: 'A' },
          { id: 'B', type: 'Node', label: 'B' }
        ],
        relations: [
          {
            id: 'has-link',
            name: 'has-link',
            types: ['Node', 'Node'],
            tuples: [
              { atoms: ['A', 'B'], types: ['Node', 'Node'] }
            ]
          }
        ]
      };
      
      const instance = new JSONDataInstance(jsonData);
      evaluator.initialize({ sourceData: instance });
      
      // The relation should be queryable (with sanitized name)
      const schemas = evaluator.getTableSchemas();
      const linkSchema = schemas.find(s => s.description.includes('has-link'));
      expect(linkSchema).toBeDefined();
      
      // Query the sanitized table name
      const result = evaluator.evaluate(`SELECT * FROM ${linkSchema!.name}`);
      expect(result.isError()).toBe(false);
    });

    it('should handle reserved SQL keywords in relation names', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'A', type: 'Node', label: 'A' }
        ],
        relations: [
          {
            id: 'select',
            name: 'select',
            types: ['Node'],
            tuples: [
              { atoms: ['A'], types: ['Node'] }
            ]
          }
        ]
      };
      
      const instance = new JSONDataInstance(jsonData);
      evaluator.initialize({ sourceData: instance });
      
      // The relation should be prefixed to avoid SQL reserved word conflict
      const schemas = evaluator.getTableSchemas();
      const selectSchema = schemas.find(s => s.description.includes('select'));
      expect(selectSchema).toBeDefined();
      expect(selectSchema!.name).toBe('rel_select');
    });
  });

  describe('Advanced SQL Features', () => {
    beforeEach(() => {
      const dataInstance = createSimpleDataInstance();
      evaluator.initialize({ sourceData: dataInstance });
    });

    it('should support LIKE operator', () => {
      const result = evaluator.evaluate("SELECT id FROM atoms WHERE id LIKE 'A%'");
      expect(result.isError()).toBe(false);
      
      const atoms = result.selectedAtoms();
      expect(atoms).toContain('Alice');
    });

    it('should support ORDER BY', () => {
      const result = evaluator.evaluate('SELECT id FROM atoms ORDER BY id ASC');
      expect(result.isError()).toBe(false);
      
      const atoms = result.selectedAtoms();
      expect(atoms[0]).toBe('Alice');
    });

    it('should support DISTINCT', () => {
      const result = evaluator.evaluate('SELECT DISTINCT type FROM atoms');
      expect(result.isError()).toBe(false);
      
      const raw = result.getRawResult() as any[];
      expect(raw.length).toBe(2); // Person and Company
    });

    it('should support subqueries', () => {
      const result = evaluator.evaluate(`
        SELECT id FROM atoms 
        WHERE id IN (SELECT src FROM friends)
      `);
      expect(result.isError()).toBe(false);
      
      const atoms = result.selectedAtoms();
      expect(atoms).toContain('Alice');
      expect(atoms).toContain('Bob');
    });

    it('should support UNION', () => {
      const result = evaluator.evaluate(`
        SELECT src as person FROM friends
        UNION
        SELECT tgt as person FROM friends
      `);
      expect(result.isError()).toBe(false);
      
      const atoms = result.selectedAtoms();
      // Should have unique set of all people in friends relation
      expect(atoms).toContain('Alice');
      expect(atoms).toContain('Bob');
      expect(atoms).toContain('Charlie');
    });
  });
});

describe('SQLEvaluatorResult', () => {
  it('should correctly identify singleton results', () => {
    const result = new SQLEvaluatorResult(42, 'SELECT 42');
    expect(result.isSingleton()).toBe(true);
    expect(result.singleResult()).toBe(42);
  });

  it('should correctly identify error results', () => {
    const errorResult = { error: { message: 'Test error', code: 'TEST' } };
    const result = new SQLEvaluatorResult(errorResult, 'SELECT');
    expect(result.isError()).toBe(true);
    expect(result.prettyPrint()).toContain('Test error');
  });

  it('should handle string singleton', () => {
    const result = new SQLEvaluatorResult('hello', "SELECT 'hello'");
    expect(result.isSingleton()).toBe(true);
    expect(result.singleResult()).toBe('hello');
  });

  it('should handle boolean singleton', () => {
    const result = new SQLEvaluatorResult(true, 'SELECT true');
    expect(result.isSingleton()).toBe(true);
    expect(result.singleResult()).toBe(true);
    expect(result.prettyPrint()).toBe('true');
  });

  it('should throw when calling singleResult on non-singleton', () => {
    const result = new SQLEvaluatorResult([['a', 'b'], ['c', 'd']], 'SELECT');
    expect(() => result.singleResult()).toThrow();
  });

  it('should throw when calling selectedAtoms on singleton', () => {
    const result = new SQLEvaluatorResult(42, 'SELECT');
    expect(() => result.selectedAtoms()).toThrow();
  });
});
