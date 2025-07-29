import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { AtomCommandParser, DotNotationRelationParser } from '../src/components/ReplInterface/parsers/CoreParsers';
import { InfoCommandParser } from '../src/components/ReplInterface/parsers/ExtensibleParsers';

describe('Pyret REPL Changes', () => {
  let instance: JSONDataInstance;
  let atomParser: AtomCommandParser;
  let dotRelParser: DotNotationRelationParser;
  let infoParser: InfoCommandParser;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
    atomParser = new AtomCommandParser();
    dotRelParser = new DotNotationRelationParser();
    infoParser = new InfoCommandParser();
  });

  describe('Implicit "add" functionality', () => {
    it('should handle implicit add for atoms without "add" prefix', () => {
      const result = atomParser.execute('Alice:Person', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('[Alice]');
      expect(result.message).toContain('Alice:Person');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(1);
      expect(atoms[0].id).toBe('Alice');
      expect(atoms[0].label).toBe('Alice');
      expect(atoms[0].type).toBe('Person');
    });

    it('should handle implicit add with explicit ID', () => {
      const result = atomParser.execute('p1=Alice:Person', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('[p1]');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(1);
      expect(atoms[0].id).toBe('p1');
      expect(atoms[0].label).toBe('Alice');
      expect(atoms[0].type).toBe('Person');
    });


  });

  describe('Dot notation relations', () => {
    beforeEach(() => {
      // Add some atoms first
      atomParser.execute('alice=Alice:Person', instance);
      atomParser.execute('bob=Bob:Person', instance);
    });

    it('should handle dot notation relations (implicit add)', () => {
      const result = dotRelParser.execute('alice.friend=bob', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('[alice.friend=bob]');
      expect(result.message).toContain('friend(alice, bob)');
      
      const relations = instance.getRelations();
      expect(relations.length).toBe(1);
      expect(relations[0].name).toBe('friend');
      expect(relations[0].tuples).toHaveLength(1);
      expect(relations[0].tuples[0].atoms).toEqual(['alice', 'bob']);
    });



    it('should require atoms to exist before creating relations', () => {
      const result = dotRelParser.execute('charlie.friend=david', instance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('charlie');
      expect(result.message).toContain('does not exist');
    });
  });

  describe('ID display for easy referencing', () => {
    it('should show IDs prominently in atom addition messages', () => {
      const result = atomParser.execute('Alice:Person', instance);
      
      expect(result.message).toMatch(/^\[Alice\]/);
      expect(result.message).toContain('Added atom: Alice:Person');
    });



    it('should show IDs prominently in list command', () => {
      atomParser.execute('Alice:Person', instance);
      atomParser.execute('bob=Bob:Person', instance);
      
      const result = infoParser.execute('list', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('[Alice] Alice:Person');
      expect(result.message).toContain('[bob] Bob:Person');
    });
  });

  describe('Reify command', () => {
    it('should handle reify command for generic data instances', () => {
      atomParser.execute('Alice:Person', instance);
      atomParser.execute('Bob:Person', instance);
      dotRelParser.execute('Alice.friend=Bob', instance);
      
      const result = infoParser.execute('reify', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Data Instance Structure');
      expect(result.message).toContain('[Alice] Alice:Person');
      expect(result.message).toContain('[Bob] Bob:Person');
      expect(result.message).toContain('friend:');
      expect(result.message).toContain('(Alice, Bob)');
    });

    it('should be handled by InfoCommandParser', () => {
      expect(infoParser.canHandle('reify')).toBe(true);
    });
  });

  describe('Parser priorities and handling', () => {
    it('should detect atom commands correctly (sugar syntax only)', () => {
      expect(atomParser.canHandle('Alice:Person')).toBe(true);
      expect(atomParser.canHandle('p1=Alice:Person')).toBe(true);
      expect(atomParser.canHandle('add Alice:Person')).toBe(false); // No more explicit add
      expect(atomParser.canHandle('remove Alice')).toBe(false); // No more explicit remove
    });

    it('should detect dot notation relation commands correctly (sugar syntax only)', () => {
      expect(dotRelParser.canHandle('alice.friend=bob')).toBe(true);
      expect(dotRelParser.canHandle('add alice.friend=bob')).toBe(false); // No more explicit add
      expect(dotRelParser.canHandle('remove alice.friend=bob')).toBe(false); // No more explicit remove
    });

    it('should not confuse command types', () => {
      // Atom parser should not handle dot notation
      expect(atomParser.canHandle('alice.friend=bob')).toBe(false);
      
      // Dot notation parser should not handle atom commands
      expect(dotRelParser.canHandle('Alice:Person')).toBe(false);
      
      // Neither should handle utility commands
      expect(atomParser.canHandle('help')).toBe(false);
      expect(dotRelParser.canHandle('reify')).toBe(false);
    });
  });
});