import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { ReplInterface, TerminalConfig } from '../src/components/ReplInterface/ReplInterface';
import { AtomCommandParser, RelationCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';
import { PyretListParser, InfoCommandParser } from '../src/components/ReplInterface/parsers/ExtensibleParsers';

describe('Unified REPL Terminal', () => {
  let instance: JSONDataInstance;
  let unifiedTerminal: TerminalConfig;

  beforeEach(() => {
    instance = new JSONDataInstance({
      atoms: [],
      relations: []
    });
    
    // Create the unified terminal configuration (same as in ReplInterface.tsx)
    unifiedTerminal = {
      id: 'unified',
      title: 'Unified Terminal',
      description: 'Supports atoms, relations, and extensions in one terminal',
      parsers: [
        new AtomCommandParser(), 
        new RelationCommandParser(), 
        new PyretListParser(), 
        new InfoCommandParser()
      ],
      placeholder: 'Examples:\nadd Alice:Person\nadd friends:alice->bob\nadd [list: 1,2,3,4]:numbers\nhelp'
    };
  });

  it('should have all required parsers in unified terminal', () => {
    expect(unifiedTerminal.parsers).toHaveLength(4);
    
    const parserTypes = unifiedTerminal.parsers.map(p => p.constructor.name);
    expect(parserTypes).toContain('AtomCommandParser');
    expect(parserTypes).toContain('RelationCommandParser');
    expect(parserTypes).toContain('PyretListParser');
    expect(parserTypes).toContain('InfoCommandParser');
  });

  it('should handle atom commands in unified terminal', () => {
    const atomParser = unifiedTerminal.parsers.find(p => p instanceof AtomCommandParser)!;
    
    expect(atomParser.canHandle('add Alice:Person')).toBe(true);
    const result = atomParser.execute('add Alice:Person', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('add');
    expect(instance.getAtoms()).toHaveLength(1);
    expect(instance.getAtoms()[0].label).toBe('Alice');
  });

  it('should handle relation commands in unified terminal', () => {
    // First add some atoms
    const atomParser = unifiedTerminal.parsers.find(p => p instanceof AtomCommandParser)!;
    atomParser.execute('add alice=Alice:Person', instance);
    atomParser.execute('add bob=Bob:Person', instance);
    
    const relationParser = unifiedTerminal.parsers.find(p => p instanceof RelationCommandParser)!;
    
    expect(relationParser.canHandle('add friends:alice->bob')).toBe(true);
    const result = relationParser.execute('add friends:alice->bob', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('add');
    expect(instance.getRelations()).toHaveLength(1);
    expect(instance.getRelations()[0].name).toBe('friends');
  });

  it('should handle info commands in unified terminal', () => {
    const infoParser = unifiedTerminal.parsers.find(p => p instanceof InfoCommandParser)!;
    
    expect(infoParser.canHandle('help')).toBe(true);
    expect(infoParser.canHandle('info')).toBe(true);
    expect(infoParser.canHandle('status')).toBe(true);
    expect(infoParser.canHandle('list')).toBe(true);
    
    const helpResult = infoParser.execute('help', instance);
    expect(helpResult.success).toBe(true);
    expect(helpResult.action).toBe('help');
    expect(helpResult.message).toContain('Available commands');
  });

  it('should handle pyret list commands in unified terminal', () => {
    const pyretParser = unifiedTerminal.parsers.find(p => p instanceof PyretListParser)!;
    
    expect(pyretParser.canHandle('add [list: 1,2,3]:numbers')).toBe(true);
    const result = pyretParser.execute('add [list: 1,2,3]:numbers', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('add');
    // PyretListParser creates additional atoms, so we don't test exact count here
    expect(instance.getAtoms().length).toBeGreaterThan(0);
  });

  it('should auto-detect command types correctly', () => {
    const parsers = unifiedTerminal.parsers;
    
    // Test that each command type is handled by the correct parser
    const atomCommand = 'add Alice:Person';
    const relationCommand = 'add friends:alice->bob';
    const pyretCommand = 'add [list: 1,2,3]:numbers';
    const infoCommand = 'help';
    
    // Atom command should be handled by AtomCommandParser
    const atomHandler = parsers.find(p => p.canHandle(atomCommand));
    expect(atomHandler).toBeInstanceOf(AtomCommandParser);
    
    // Relation command should be handled by RelationCommandParser  
    const relationHandler = parsers.find(p => p.canHandle(relationCommand));
    expect(relationHandler).toBeInstanceOf(RelationCommandParser);
    
    // Pyret command should be handled by PyretListParser
    const pyretHandler = parsers.find(p => p.canHandle(pyretCommand));
    expect(pyretHandler).toBeInstanceOf(PyretListParser);
    
    // Info command should be handled by InfoCommandParser
    const infoHandler = parsers.find(p => p.canHandle(infoCommand));
    expect(infoHandler).toBeInstanceOf(InfoCommandParser);
  });

  it('should properly route commands to the right parser', () => {
    // Test that multiple command types work in sequence
    const atomParser = unifiedTerminal.parsers.find(p => p instanceof AtomCommandParser)!;
    const relationParser = unifiedTerminal.parsers.find(p => p instanceof RelationCommandParser)!;
    const infoParser = unifiedTerminal.parsers.find(p => p instanceof InfoCommandParser)!;

    // Add atoms
    atomParser.execute('add alice=Alice:Person', instance);
    atomParser.execute('add bob=Bob:Person', instance);
    expect(instance.getAtoms()).toHaveLength(2);
    
    // Add relation
    relationParser.execute('add friends:alice->bob', instance);
    expect(instance.getRelations()).toHaveLength(1);
    
    // Get status
    const statusResult = infoParser.execute('status', instance);
    expect(statusResult.success).toBe(true);
    expect(statusResult.message).toContain('Atoms: 2');
    expect(statusResult.message).toContain('Relations: 1');
  });
});