import { describe, it, expect } from 'vitest';
import { 
  generateAlloySchema, 
  generateSQLSchema, 
  generateTextDescription 
} from '../src/data-instance/schema-descriptor';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';

describe('Schema Descriptor', () => {
  describe('generateAlloySchema', () => {
    it('should generate basic Alloy schema for simple types and relations', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'p1', type: 'Person', label: 'Alice' },
          { id: 'p2', type: 'Person', label: 'Bob' },
        ],
        relations: [
          {
            id: 'friend',
            name: 'friend',
            types: ['Person', 'Person'],
            tuples: [
              { atoms: ['p1', 'p2'], types: ['Person', 'Person'] }
            ],
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateAlloySchema(instance);

      expect(schema).toContain('sig Person {');
      expect(schema).toContain('friend: Person');
    });

    it('should handle type hierarchies when enabled', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 's1', type: 'Student', label: 'Alice' },
          { id: 'p1', type: 'Person', label: 'Bob' },
        ],
        relations: [],
        types: [
          { id: 'Person', types: ['Person'], atoms: [{ id: 'p1', type: 'Person', label: 'Bob' }], isBuiltin: false },
          { id: 'Student', types: ['Student', 'Person'], atoms: [{ id: 's1', type: 'Student', label: 'Alice' }], isBuiltin: false },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateAlloySchema(instance, { includeTypeHierarchy: true });

      expect(schema).toContain('sig Student extends Person');
    });

    it('should exclude built-in types by default', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'n1', type: 'Node', label: 'Node1' },
          { id: 'i1', type: 'Int', label: '5' },
        ],
        relations: [
          {
            id: 'value',
            name: 'value',
            types: ['Node', 'Int'],
            tuples: [{ atoms: ['n1', 'i1'], types: ['Node', 'Int'] }],
          },
        ],
        types: [
          { id: 'Node', types: ['Node'], atoms: [{ id: 'n1', type: 'Node', label: 'Node1' }], isBuiltin: false },
          { id: 'Int', types: ['Int'], atoms: [{ id: 'i1', type: 'Int', label: '5' }], isBuiltin: true },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateAlloySchema(instance);

      expect(schema).toContain('sig Node {');
      expect(schema).not.toContain('sig Int');
    });

    it('should include built-in types when requested', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'n1', type: 'Node', label: 'Node1' },
          { id: 'i1', type: 'Int', label: '5' },
        ],
        relations: [],
        types: [
          { id: 'Node', types: ['Node'], atoms: [{ id: 'n1', type: 'Node', label: 'Node1' }], isBuiltin: false },
          { id: 'Int', types: ['Int'], atoms: [{ id: 'i1', type: 'Int', label: '5' }], isBuiltin: true },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateAlloySchema(instance, { includeBuiltInTypes: true });

      expect(schema).toContain('sig Node {');
      expect(schema).toContain('sig Int {');
    });

    it('should handle multiple relations from the same type', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'n1', type: 'Node', label: 'Node1' },
          { id: 'n2', type: 'Node', label: 'Node2' },
        ],
        relations: [
          {
            id: 'left',
            name: 'left',
            types: ['Node', 'Node'],
            tuples: [{ atoms: ['n1', 'n2'], types: ['Node', 'Node'] }],
          },
          {
            id: 'right',
            name: 'right',
            types: ['Node', 'Node'],
            tuples: [],
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateAlloySchema(instance);

      expect(schema).toContain('left: Node');
      expect(schema).toContain('right: Node');
    });
  });

  describe('generateSQLSchema', () => {
    it('should generate SQL CREATE TABLE statements for types', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'p1', type: 'Person', label: 'Alice' },
          { id: 'p2', type: 'Person', label: 'Bob' },
        ],
        relations: [],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateSQLSchema(instance);

      expect(schema).toContain('CREATE TABLE Person');
      expect(schema).toContain('id VARCHAR PRIMARY KEY');
    });

    it('should generate SQL CREATE TABLE statements for relations', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'p1', type: 'Person', label: 'Alice' },
          { id: 'p2', type: 'Person', label: 'Bob' },
        ],
        relations: [
          {
            id: 'friend',
            name: 'friend',
            types: ['Person', 'Person'],
            tuples: [{ atoms: ['p1', 'p2'], types: ['Person', 'Person'] }],
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateSQLSchema(instance);

      expect(schema).toContain('CREATE TABLE friend');
      expect(schema).toContain('source_Person VARCHAR REFERENCES Person(id)');
      expect(schema).toContain('target_Person VARCHAR REFERENCES Person(id)');
    });

    it('should handle type hierarchies in comments', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 's1', type: 'Student', label: 'Alice' },
        ],
        relations: [],
        types: [
          { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
          { id: 'Student', types: ['Student', 'Person'], atoms: [{ id: 's1', type: 'Student', label: 'Alice' }], isBuiltin: false },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateSQLSchema(instance, { includeTypeHierarchy: true });

      expect(schema).toContain('CREATE TABLE Student');
      expect(schema).toContain('-- extends Person');
    });

    it('should skip built-in types by default', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'i1', type: 'Int', label: '5' },
        ],
        relations: [],
        types: [
          { id: 'Int', types: ['Int'], atoms: [{ id: 'i1', type: 'Int', label: '5' }], isBuiltin: true },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateSQLSchema(instance);

      expect(schema).not.toContain('CREATE TABLE Int');
    });

    it('should handle ternary relations correctly', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'p1', type: 'Person', label: 'Alice' },
          { id: 'p2', type: 'Person', label: 'Bob' },
          { id: 't1', type: 'Time', label: 'Monday' },
        ],
        relations: [
          {
            id: 'meeting',
            name: 'meeting',
            types: ['Person', 'Person', 'Time'],
            tuples: [{ atoms: ['p1', 'p2', 't1'], types: ['Person', 'Person', 'Time'] }],
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const schema = generateSQLSchema(instance);

      expect(schema).toContain('CREATE TABLE meeting');
      expect(schema).toContain('source_Person VARCHAR');
      expect(schema).toContain('target_Person VARCHAR');
      expect(schema).toContain('arg2_Time VARCHAR');
    });
  });

  describe('generateTextDescription', () => {
    it('should generate human-readable description', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'p1', type: 'Person', label: 'Alice' },
          { id: 'p2', type: 'Person', label: 'Bob' },
        ],
        relations: [
          {
            id: 'friend',
            name: 'friend',
            types: ['Person', 'Person'],
            tuples: [
              { atoms: ['p1', 'p2'], types: ['Person', 'Person'] }
            ],
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const description = generateTextDescription(instance);

      expect(description).toContain('Types:');
      expect(description).toContain('Person (2 atoms)');
      expect(description).toContain('Relations:');
      expect(description).toContain('friend: Person -> Person (1 tuple)');
    });

    it('should handle empty relations', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'p1', type: 'Person', label: 'Alice' },
        ],
        relations: [
          {
            id: 'friend',
            name: 'friend',
            types: ['Person', 'Person'],
            tuples: [],
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const description = generateTextDescription(instance);

      expect(description).toContain('friend: Person -> Person (0 tuples)');
    });

    it('should exclude built-in types by default', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'n1', type: 'Node', label: 'Node1' },
          { id: 'i1', type: 'Int', label: '5' },
        ],
        relations: [
          {
            id: 'value',
            name: 'value',
            types: ['Node', 'Int'],
            tuples: [{ atoms: ['n1', 'i1'], types: ['Node', 'Int'] }],
          },
        ],
        types: [
          { id: 'Node', types: ['Node'], atoms: [{ id: 'n1', type: 'Node', label: 'Node1' }], isBuiltin: false },
          { id: 'Int', types: ['Int'], atoms: [{ id: 'i1', type: 'Int', label: '5' }], isBuiltin: true },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const description = generateTextDescription(instance);

      expect(description).toContain('Node (1 atom)');
      expect(description).not.toContain('Int (1 atom)');
      expect(description).toContain('value: Node -> Int (1 tuple)');
    });

    it('should handle singular and plural correctly', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'p1', type: 'Person', label: 'Alice' },
        ],
        relations: [
          {
            id: 'friend',
            name: 'friend',
            types: ['Person', 'Person'],
            tuples: [
              { atoms: ['p1', 'p1'], types: ['Person', 'Person'] }
            ],
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);
      const description = generateTextDescription(instance);

      expect(description).toContain('Person (1 atom)');
      expect(description).toContain('friend: Person -> Person (1 tuple)');
    });
  });

  describe('Integration with real data formats', () => {
    it('should work with complex binary tree structure', () => {
      const jsonData: IJsonDataInstance = {
        atoms: [
          { id: 'Node0', type: 'Node', label: 'Node0' },
          { id: 'Node1', type: 'Node', label: 'Node1' },
          { id: 'Node2', type: 'Node', label: 'Node2' },
          { id: '5', type: 'Int', label: '5' },
          { id: '6', type: 'Int', label: '6' },
          { id: '7', type: 'Int', label: '7' },
        ],
        relations: [
          {
            id: 'left',
            name: 'left',
            types: ['Node', 'Node'],
            tuples: [
              { atoms: ['Node0', 'Node1'], types: ['Node', 'Node'] },
              { atoms: ['Node1', 'Node2'], types: ['Node', 'Node'] },
            ],
          },
          {
            id: 'right',
            name: 'right',
            types: ['Node', 'Node'],
            tuples: [
              { atoms: ['Node1', 'Node2'], types: ['Node', 'Node'] },
            ],
          },
          {
            id: 'key',
            name: 'key',
            types: ['Node', 'Int'],
            tuples: [
              { atoms: ['Node0', '7'], types: ['Node', 'Int'] },
              { atoms: ['Node1', '6'], types: ['Node', 'Int'] },
              { atoms: ['Node2', '5'], types: ['Node', 'Int'] },
            ],
          },
        ],
        types: [
          {
            id: 'Node',
            types: ['Node'],
            atoms: [
              { id: 'Node0', type: 'Node', label: 'Node0' },
              { id: 'Node1', type: 'Node', label: 'Node1' },
              { id: 'Node2', type: 'Node', label: 'Node2' },
            ],
            isBuiltin: false,
          },
          {
            id: 'Int',
            types: ['Int'],
            atoms: [
              { id: '5', type: 'Int', label: '5' },
              { id: '6', type: 'Int', label: '6' },
              { id: '7', type: 'Int', label: '7' },
            ],
            isBuiltin: true,
          },
        ],
      };

      const instance = new JSONDataInstance(jsonData);

      // Test Alloy schema
      const alloySchema = generateAlloySchema(instance);
      expect(alloySchema).toContain('sig Node {');
      expect(alloySchema).toContain('left: Node');
      expect(alloySchema).toContain('right: Node');
      expect(alloySchema).toContain('key: Int');

      // Test SQL schema
      const sqlSchema = generateSQLSchema(instance);
      expect(sqlSchema).toContain('CREATE TABLE Node');
      expect(sqlSchema).toContain('CREATE TABLE left');
      expect(sqlSchema).toContain('CREATE TABLE right');
      expect(sqlSchema).toContain('CREATE TABLE key');

      // Test text description
      const textDesc = generateTextDescription(instance);
      expect(textDesc).toContain('Node (3 atoms)');
      expect(textDesc).toContain('left: Node -> Node (2 tuples)');
      expect(textDesc).toContain('right: Node -> Node (1 tuple)');
      expect(textDesc).toContain('key: Node -> Int (3 tuples)');
    });
  });
});
