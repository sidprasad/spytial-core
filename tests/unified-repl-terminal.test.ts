import { describe, it, expect, beforeEach } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { ReplInterface, TerminalConfig } from '../src/components/ReplInterface/ReplInterface';
import { AtomCommandParser, DotNotationRelationParser, BatchCommandParser } from '../src/components/ReplInterface/parsers/CoreParsers';
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
        new PyretListParser(),            // Priority 120 - most specific pattern
        new BatchCommandParser(),         // Priority 115 - multi-command patterns  
        new DotNotationRelationParser(),  // Priority 115 - dot notation relations
        new AtomCommandParser(),          // Priority 100 - standard priority
        new InfoCommandParser()           // Priority 50 - fallback utility commands
      ].sort((a, b) => b.getPriority() - a.getPriority()), // Sort by priority descending
      placeholder: 'Examples:\nAlice:Person\nalice.friend=bob\n[list: 1,2,3,4]:numbers\nhelp\nreify'
    };
  });

  it('should have all required parsers in unified terminal', () => {
    expect(unifiedTerminal.parsers).toHaveLength(5);
    
    const parserTypes = unifiedTerminal.parsers.map(p => p.constructor.name);
    expect(parserTypes).toContain('AtomCommandParser');
    expect(parserTypes).toContain('DotNotationRelationParser');
    expect(parserTypes).toContain('PyretListParser');
    expect(parserTypes).toContain('InfoCommandParser');
    expect(parserTypes).toContain('BatchCommandParser');
  });

  it('should handle atom commands in unified terminal', () => {
    const atomParser = unifiedTerminal.parsers.find(p => p instanceof AtomCommandParser)!;
    
    expect(atomParser.canHandle('Alice:Person')).toBe(true);
    const result = atomParser.execute('Alice:Person', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('add');
    expect(instance.getAtoms()).toHaveLength(1);
    expect(instance.getAtoms()[0].label).toBe('Alice');
  });

  it('should handle relation commands in unified terminal', () => {
    // First add some atoms using sugar syntax
    const atomParser = unifiedTerminal.parsers.find(p => p instanceof AtomCommandParser)!;
    atomParser.execute('alice=Alice:Person', instance);
    atomParser.execute('bob=Bob:Person', instance);
    
    const relationParser = unifiedTerminal.parsers.find(p => p instanceof DotNotationRelationParser)!;
    
    expect(relationParser.canHandle('alice.friend=bob')).toBe(true);
    const result = relationParser.execute('alice.friend=bob', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('add');
    expect(instance.getRelations()).toHaveLength(1);
    expect(instance.getRelations()[0].name).toBe('friend');
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
    
    expect(pyretParser.canHandle('[list: 1,2,3]:numbers')).toBe(true);
    const result = pyretParser.execute('[list: 1,2,3]:numbers', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('add');
    // PyretListParser creates additional atoms, so we don't test exact count here
    expect(instance.getAtoms().length).toBeGreaterThan(0);
  });

  it('should handle dot notation relations in unified terminal', () => {
    // First add some atoms using implicit add
    const atomParser = unifiedTerminal.parsers.find(p => p instanceof AtomCommandParser)!;
    atomParser.execute('alice=Alice:Person', instance);
    atomParser.execute('bob=Bob:Person', instance);
    
    const dotRelParser = unifiedTerminal.parsers.find(p => p instanceof DotNotationRelationParser)!;
    
    expect(dotRelParser.canHandle('alice.friend=bob')).toBe(true);
    const result = dotRelParser.execute('alice.friend=bob', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('add');
    expect(instance.getRelations()).toHaveLength(1);
    expect(instance.getRelations()[0].name).toBe('friend');
    expect(instance.getRelations()[0].tuples[0].atoms).toEqual(['alice', 'bob']);
  });

  it('should handle reify command in unified terminal', () => {
    const infoParser = unifiedTerminal.parsers.find(p => p instanceof InfoCommandParser)!;
    
    expect(infoParser.canHandle('reify')).toBe(true);
    const result = infoParser.execute('reify', instance);
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('info');
    expect(result.message).toContain('Data Instance Structure');
  });

  it('should auto-detect command types correctly', () => {
    const parsers = unifiedTerminal.parsers;
    
    // Test that each command type is handled by the correct parser
    const atomCommand = 'Alice:Person';
    const relationCommand = 'alice.friend=bob';
    const pyretCommand = '[list: 1,2,3]:numbers';
    const infoCommand = 'help';
    
    // Atom command should be handled by AtomCommandParser
    const atomHandler = parsers.find(p => p.canHandle(atomCommand));
    expect(atomHandler).toBeInstanceOf(AtomCommandParser);
    
    // Relation command should be handled by DotNotationRelationParser  
    const relationHandler = parsers.find(p => p.canHandle(relationCommand));
    expect(relationHandler).toBeInstanceOf(DotNotationRelationParser);
    
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
    const relationParser = unifiedTerminal.parsers.find(p => p instanceof DotNotationRelationParser)!;
    const infoParser = unifiedTerminal.parsers.find(p => p instanceof InfoCommandParser)!;

    // Add atoms using sugar syntax
    atomParser.execute('alice=Alice:Person', instance);
    atomParser.execute('bob=Bob:Person', instance);
    expect(instance.getAtoms()).toHaveLength(2);
    
    // Add relation using sugar syntax
    relationParser.execute('alice.friend=bob', instance);
    expect(instance.getRelations()).toHaveLength(1);
    
    // Get status
    const statusResult = infoParser.execute('status', instance);
    expect(statusResult.success).toBe(true);
    expect(statusResult.message).toContain('Atoms: 2');
    expect(statusResult.message).toContain('Relations: 1');
  });
});