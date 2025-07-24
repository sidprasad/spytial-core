import * as React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { IInputDataInstance } from '../../data-instance/interfaces';
import { ICommandParser, CommandResult, AtomCommandParser, RelationCommandParser, DotNotationRelationParser, BatchCommandParser, RemoveCommandParser } from './parsers/CoreParsers';
import { PyretListParser, InfoCommandParser } from './parsers/ExtensibleParsers';
import './ReplInterface.css';

/**
 * Configuration for a terminal in the REPL interface
 */
export interface TerminalConfig {
  id: string;
  title: string;
  description: string;
  parsers: ICommandParser[];
  placeholder?: string;
}

/**
 * Props for the ReplInterface component
 */
export interface ReplInterfaceProps {
  /** The data instance to build/modify - REQUIRED */
  instance: IInputDataInstance;
  /** Callback when the instance changes */
  onChange?: (instance: IInputDataInstance) => void;
  /** Callback when CnD specification is extracted from an expression */
  onCndSpecExtracted?: (spec: string) => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** CSS class name for styling */
  className?: string;
  /** Custom terminal configurations (defaults to 3 standard terminals) */
  terminals?: TerminalConfig[];
}

/**
 * Output line for terminal display
 */
interface OutputLine {
  id: string;
  type: 'command' | 'success' | 'error' | 'info' | 'help';
  message: string;
  timestamp: Date;
}

/**
 * State for a single terminal
 */
interface TerminalState {
  input: string;
  output: OutputLine[];
  isExecuting: boolean;
}

/**
 * Default terminal configuration - unified terminal supporting all commands
 * Parsers are ordered by priority (higher priority first)
 */
const DEFAULT_TERMINALS: TerminalConfig[] = [
  {
    id: 'unified',
    title: '',
    description: 'Supports atoms, relations, and extensions in one terminal',
    parsers: [
      new RemoveCommandParser(),        // Priority 200 - highest priority for remove commands
      new PyretListParser(),            // Priority 120 - most specific pattern
      new BatchCommandParser(),         // Priority 115 - multi-command patterns  
      new DotNotationRelationParser(),  // Priority 115 - dot notation relations
      new AtomCommandParser(),          // Priority 100 - standard priority
      new InfoCommandParser()           // Priority 50 - fallback utility commands
    ].sort((a, b) => b.getPriority() - a.getPriority()), // Sort by priority descending
    placeholder: 'Examples:\nAlice:Person\nalice.friend=bob\nremove alice\n[list: 1,2,3,4]:numbers\nhelp\nreify'
  }
];

/**
 * REPL-like interface for building data instances with command-line style input
 * 
 * Provides a unified terminal that supports:
 * - Atoms: add/remove atoms with Label:Type syntax
 * - Relations: add/remove relations with name:atom->atom syntax  
 * - Extensions: Language-specific commands (Pyret lists, etc.)
 * - Utility commands: help, info, list, clear
 * 
 * The terminal supports:
 * - Command history with up/down arrows
 * - Help system
 * - Multi-line input
 * - Extensible parser system
 * - Auto-detection of command types
 */
export const ReplInterface: React.FC<ReplInterfaceProps> = ({
  instance,
  onChange,
  onCndSpecExtracted,
  disabled = false,
  className = '',
  terminals = DEFAULT_TERMINALS
}) => {
  // State for each terminal
  const [terminalStates, setTerminalStates] = useState<Record<string, TerminalState>>(() => {
    const initialState: Record<string, TerminalState> = {};
    terminals.forEach(terminal => {
      initialState[terminal.id] = {
        input: '',
        output: [{
          id: 'welcome',
          type: 'info',
          message: `Type 'help' for available commands.`,
          timestamp: new Date()
        }],
        isExecuting: false
      };
    });
    return initialState;
  });

  // References to terminal output containers for auto-scrolling
  const outputRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Get current stats from instance
  const atoms = instance.getAtoms();
  const relations = instance.getRelations();
  const tupleCount = relations.reduce((sum, rel) => sum + rel.tuples.length, 0);

  // Notify parent when instance changes
  const notifyChange = useCallback(() => {
    if (onChange) {
      onChange(instance);
    }
  }, [instance, onChange]);

  // Auto-scroll terminal output to bottom
  const scrollToBottom = useCallback((terminalId: string) => {
    const outputRef = outputRefs.current[terminalId];
    if (outputRef) {
      outputRef.scrollTop = outputRef.scrollHeight;
    }
  }, []);

  // Add output line to terminal
  const addOutputLine = useCallback((terminalId: string, line: Omit<OutputLine, 'id' | 'timestamp'>) => {
    setTerminalStates(prev => ({
      ...prev,
      [terminalId]: {
        ...prev[terminalId],
        output: [
          ...prev[terminalId].output,
          {
            ...line,
            id: `${Date.now()}-${Math.random()}`,
            timestamp: new Date()
          }
        ]
      }
    }));
    
    // Scroll to bottom after state update
    setTimeout(() => scrollToBottom(terminalId), 0);
  }, [scrollToBottom]);

  // Execute command in terminal
  const executeCommand = useCallback(async (terminalId: string, command: string) => {
    const terminal = terminals.find(t => t.id === terminalId);
    if (!terminal) return;

    const trimmedCommand = command.trim();
    if (!trimmedCommand) return;

    // Set executing state
    setTerminalStates(prev => ({
      ...prev,
      [terminalId]: {
        ...prev[terminalId],
        isExecuting: true
      }
    }));

    // Add command to output
    addOutputLine(terminalId, {
      type: 'command',
      message: trimmedCommand
    });

    // Try to execute with each parser (they are already sorted by priority)
    let result: CommandResult | null = null;
    let handlingParser: ICommandParser | null = null;
    
    for (const parser of terminal.parsers) {
      if (parser.canHandle(trimmedCommand)) {
        handlingParser = parser;
        try {
          const executeResult = parser.execute(trimmedCommand, instance);
          // Handle both sync and async results
          result = await Promise.resolve(executeResult);
          break;
        } catch (error) {
          result = {
            success: false,
            message: error instanceof Error ? error.message : 'Execution failed'
          };
          break;
        }
      }
    }

    // If no parser handled it, provide helpful error with available patterns
    if (!result) {
      const availablePatterns = terminal.parsers
        .flatMap(parser => parser.getCommandPatterns())
        .slice(0, 8) // Limit to avoid overwhelming output
        .join('\n  ');
      
      result = {
        success: false,
        message: `Unknown command: ${trimmedCommand}\n\nAvailable patterns:\n  ${availablePatterns}\n\nType 'help' for detailed information.`
      };
    }

    // Add result to output
    addOutputLine(terminalId, {
      type: result.success ? (result.action === 'help' ? 'help' : result.action === 'info' ? 'info' : 'success') : 'error',
      message: result.message
    });

    // Clear executing state and input
    setTerminalStates(prev => ({
      ...prev,
      [terminalId]: {
        ...prev[terminalId],
        input: '',
        isExecuting: false
      }
    }));

    // Notify parent of changes if command was successful and modified data
    if (result.success && (result.action === 'add' || result.action === 'remove')) {
      notifyChange();
    }

    // Notify parent if CnD specification was extracted
    if (result.success && result.extractedCndSpec && onCndSpecExtracted) {
      onCndSpecExtracted(result.extractedCndSpec);
    }
  }, [terminals, instance, addOutputLine, notifyChange, onCndSpecExtracted]);

  // Handle input change
  const handleInputChange = useCallback((terminalId: string, value: string) => {
    setTerminalStates(prev => ({
      ...prev,
      [terminalId]: {
        ...prev[terminalId],
        input: value
      }
    }));
  }, []);

  // Handle execute button click
  const handleExecute = useCallback(async (terminalId: string) => {
    const state = terminalStates[terminalId];
    if (!state || state.isExecuting) return;

    const commands = state.input.split('\n').map(cmd => cmd.trim()).filter(cmd => cmd);
    
    // Execute each command in sequence (await each one)
    for (const command of commands) {
      await executeCommand(terminalId, command);
    }
  }, [terminalStates, executeCommand]);

  // Handle key press in input
  const handleKeyPress = useCallback((e: React.KeyboardEvent, terminalId: string) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleExecute(terminalId);
    }
  }, [handleExecute]);

  // Clear terminal output
  const clearTerminal = useCallback((terminalId: string) => {
    setTerminalStates(prev => ({
      ...prev,
      [terminalId]: {
        ...prev[terminalId],
        output: []
      }
    }));
  }, []);

  // Show help for terminal
  const showHelp = useCallback((terminalId: string) => {
    const terminal = terminals.find(t => t.id === terminalId);
    if (!terminal) return;

    let helpText = `${terminal.title} Help:\n\n`;
    
    terminal.parsers.forEach(parser => {
      const help = parser.getHelp();
      helpText += help.join('\n') + '\n\n';
    });

    addOutputLine(terminalId, {
      type: 'help',
      message: helpText.trim()
    });
  }, [terminals, addOutputLine]);

  // Global clear all
  const clearAll = useCallback(() => {
    try {
      // Clear the instance
      const atomIds = instance.getAtoms().map(a => a.id);
      atomIds.forEach(id => instance.removeAtom(id));
      
      // Add success message to all terminals
      terminals.forEach(terminal => {
        addOutputLine(terminal.id, {
          type: 'success',
          message: `Instance cleared (removed ${atomIds.length} atoms)`
        });
      });
      
      notifyChange();
    } catch (error) {
      // Add error message to all terminals
      terminals.forEach(terminal => {
        addOutputLine(terminal.id, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to clear instance'
        });
      });
    }
  }, [instance, terminals, addOutputLine, notifyChange]);

  return (
    <div className={`repl-interface ${className}`}>
      <div className="repl-interface__main">
        <div className="repl-interface__header">
          <div className="repl-interface__stats">
            <span>{atoms.length} atoms</span>
            <span>{relations.length} relations</span>
            <span>{tupleCount} tuples</span>
          </div>
        </div>

        <div className="repl-interface__terminals">
          {terminals.map(terminal => {
            const state = terminalStates[terminal.id];
            if (!state) return null;

            return (
              <div key={terminal.id} className="repl-terminal">
                <div className="repl-terminal__header">
                  <div 
                    className="repl-terminal__help"
                    onClick={() => showHelp(terminal.id)}
                    title="Show help"
                  >
                    ?
                  </div>
                </div>

                <div 
                  className="repl-terminal__output"
                  ref={ref => { outputRefs.current[terminal.id] = ref; }}
                >
                  {state.output.map(line => (
                    <div key={line.id} className={`repl-output-line ${line.type}`}>
                      {line.message.split('\n').map((textLine, index) => (
                        <div key={index}>{textLine}</div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="repl-terminal__input">
                  <textarea
                    value={state.input}
                    onChange={(e) => handleInputChange(terminal.id, e.target.value)}
                    onKeyDown={(e) => handleKeyPress(e, terminal.id)}
                    placeholder={terminal.placeholder}
                    disabled={disabled || state.isExecuting}
                    rows={3}
                  />
                  
                  <div className="repl-terminal__controls">
                    <button
                      className="repl-terminal__execute"
                      onClick={() => handleExecute(terminal.id)}
                      disabled={disabled || state.isExecuting || !state.input.trim()}
                      title="Execute commands (Ctrl+Enter)"
                    >
                      {state.isExecuting ? 'Executing...' : 'Execute'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="repl-interface__actions">
          <button
            className="repl-interface__action-button danger"
            onClick={clearAll}
            disabled={disabled}
            title="Clear entire instance"
          >
            Clear All Data
          </button>
          
          <button
            className="repl-interface__action-button"
            onClick={() => {
              terminals.forEach(terminal => {
                addOutputLine(terminal.id, {
                  type: 'info',
                  message: `Instance Status: ${atoms.length} atoms, ${relations.length} relations, ${tupleCount} tuples`
                });
              });
            }}
            disabled={disabled}
            title="Show status in all terminals"
          >
            Show Status
          </button>
        </div>
      </div>

      <div className="repl-interface__sidebar">
        <div className="repl-interface__sidebar-section">
          <h3>Atoms ({atoms.length})</h3>
          {atoms.length === 0 ? (
            <div className="repl-interface__empty">No atoms</div>
          ) : (
            atoms.map(atom => (
              <div key={atom.id} className="repl-interface__item">
                <div className="repl-interface__item-header">{atom.label}:{atom.type}</div>
                {atom.id !== atom.label && (
                  <div className="repl-interface__item-detail">ID: {atom.id}</div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="repl-interface__sidebar-section">
          <h3>Relations ({relations.length})</h3>
          {relations.length === 0 ? (
            <div className="repl-interface__empty">No relations</div>
          ) : (
            relations.map(relation => (
              <div key={relation.name} className="repl-interface__sidebar-section">
                <div className="repl-interface__item">
                  <div className="repl-interface__item-header">{relation.name}</div>
                  <div className="repl-interface__item-detail">{relation.tuples.length} tuples</div>
                </div>
                {relation.tuples.map((tuple, index) => (
                  <div key={index} className="repl-interface__item" style={{marginLeft: '10px', fontSize: '0.75rem'}}>
                    <div className="repl-interface__item-detail">
                      {relation.name}({tuple.atoms.join(', ')})
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};