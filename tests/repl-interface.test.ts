import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { AtomCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';
import { PyretListParser, InfoCommandParser } from '../src/components/ReplInterface/parsers/ExtensibleParsers';

describe('ReplInterface Parsers', () => {
  let instance: JSONDataInstance;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
  });

  describe('AtomCommandParser', () => {
    let parser: AtomCommandParser;

    beforeEach(() => {
      parser = new AtomCommandParser();
    });

    it('should handle sugar syntax commands', () => {
      expect(parser.canHandle('Alice:Person')).toBe(true);
      expect(parser.canHandle('p1=Bob:Person')).toBe(true);
      expect(parser.canHandle('add Alice:Person')).toBe(false); // No more explicit add
      expect(parser.canHandle('remove Bob:Person')).toBe(false); // No more explicit remove
      expect(parser.canHandle('list')).toBe(false);
    });

    it('should add atoms with generated IDs (sugar syntax)', () => {
      const result = parser.execute('Alice:Person', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.message).toContain('Alice:Person');
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(1);
      expect(atoms[0].label).toBe('Alice');
      expect(atoms[0].type).toBe('Person');
    });

    it('should add atoms with explicit IDs (sugar syntax)', () => {
      const result = parser.execute('p1=Alice:Person', instance);
      
      expect(result.success).toBe(true);
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBe(1);
      expect(atoms[0].id).toBe('p1');
      expect(atoms[0].label).toBe('Alice');
    });

    it('should handle errors gracefully', () => {
      const result = parser.execute('invalid_syntax', instance);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid syntax');
    });
  });



  describe('PyretListParser', () => {
    let parser: PyretListParser;

    beforeEach(() => {
      parser = new PyretListParser();
    });

    it('should handle Pyret list commands', () => {
      expect(parser.canHandle('add [list: 1,2,3]:numbers')).toBe(true);
      expect(parser.canHandle('remove numbers-1')).toBe(true);
      expect(parser.canHandle('add Alice:Person')).toBe(false);
      expect(parser.canHandle('add friends(alice, bob)')).toBe(false);
    });

    it('should add number lists', () => {
      const result = parser.execute('add [list: 1,2,3,4]:numbers', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      
      const atoms = instance.getAtoms();
      
      // Should have: 1, 2, 3, 4 (as atoms) + the list atom + 4 link atoms = 9 total
      expect(atoms.length).toBe(9);
      
      // Check that number atoms were created
      const numberAtoms = atoms.filter(a => a.type === 'Number');
      expect(numberAtoms.length).toBe(4);
      
      // Check that list atom was created
      const listAtoms = atoms.filter(a => a.type === 'numbers');
      expect(listAtoms.length).toBe(1);
      
      // Check that relations were created
      const relations = instance.getRelations();
      expect(relations.length).toBeGreaterThan(0);
    });

    it('should add string lists with quoted items', () => {
      const result = parser.execute('add [list: "red","green","blue"]:colors', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      
      const atoms = instance.getAtoms();
      // Should have: red, green, blue (as atoms) + the list atom + 3 link atoms = 7 total
      expect(atoms.length).toBe(7);
      
      // Check that string atoms were created (unquoted labels)
      const stringAtoms = atoms.filter(a => a.type === 'String');
      expect(stringAtoms.length).toBe(3);
      
      // Check atom labels are correct (without quotes)
      const labels = stringAtoms.map(a => a.label).sort();
      expect(labels).toEqual(['blue', 'green', 'red']);
      
      // Check that list atom was created  
      const listAtoms = atoms.filter(a => a.type === 'colors');
      expect(listAtoms.length).toBe(1);
    });

    it('should handle existing atoms in lists', () => {
      // Add some atoms first
      instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
      
      const result = parser.execute('add [list: alice,bob]:people', instance);
      
      expect(result.success).toBe(true);
      
      const atoms = instance.getAtoms();
      // Should have: alice, bob (existing) + the list atom + 2 link atoms = 5 total
      expect(atoms.length).toBe(5);
    });
  });

  describe('InfoCommandParser', () => {
    let parser: InfoCommandParser;

    beforeEach(() => {
      parser = new InfoCommandParser();
      // Add some test data
      instance.addAtom({ id: 'alice', label: 'Alice', type: 'Person' });
      instance.addAtom({ id: 'bob', label: 'Bob', type: 'Person' });
    });

    it('should handle info commands', () => {
      expect(parser.canHandle('help')).toBe(true);
      expect(parser.canHandle('info')).toBe(true);
      expect(parser.canHandle('status')).toBe(true);
      expect(parser.canHandle('list')).toBe(true);
      expect(parser.canHandle('clear')).toBe(true);
    });

    it('should provide status information', () => {
      const result = parser.execute('status', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('info');
      expect(result.message).toContain('Atoms: 2');
    });

    it('should list contents', () => {
      const result = parser.execute('list', instance);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Alice');
      expect(result.message).toContain('Bob');
    });

    it('should clear instance', () => {
      expect(instance.getAtoms().length).toBe(2);
      
      const result = parser.execute('clear', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('remove');
      expect(instance.getAtoms().length).toBe(0);
    });

    it('should provide help', () => {
      const result = parser.execute('help', instance);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('help');
      expect(result.message).toContain('Available commands');
    });
  });
});