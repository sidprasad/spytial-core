/**
 * Python-specific REPL interface component
 * 
 * This component provides a REPL interface pre-configured for Python data instances.
 * It can be used as a standalone component or integrated into larger applications.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ReplInterface, ReplInterfaceProps, TerminalConfig } from './ReplInterface';
import { PythonDataInstance } from '../../data-instance/python/python-data-instance';
import { IInputDataInstance } from '../../data-instance/interfaces';
import { PythonEvaluator, PythonExpressionParser } from './parsers/PythonExpressionParser';
import { PythonIdAllocationParser } from './parsers/PythonIdAllocationParser';
import { RemoveCommandParser, AtomCommandParser, DotNotationRelationParser } from './parsers/CoreParsers';
import { InfoCommandParser } from './parsers/ExtensibleParsers';

export interface PythonReplInterfaceProps extends Omit<ReplInterfaceProps, 'instance' | 'onChange'> {
  /** Initial Python data instance. If not provided, an empty instance will be created. */
  initialInstance?: PythonDataInstance;
  /** Callback fired when the instance changes */
  onChange?: (instance: PythonDataInstance) => void;
  /** Callback when CnD specification is extracted from an expression */
  onCndSpecExtracted?: (spec: string) => void;
  /** Optional external Python evaluator (e.g., pyodide instance) */
  externalEvaluator?: PythonEvaluator;
}

/**
 * Create an empty PythonDataInstance
 */
function createEmptyPythonDataInstance(): PythonDataInstance {
  const emptyPythonObject = {
    __class__: { __name__: 'object' }
  };
  return new PythonDataInstance(emptyPythonObject);
}

/**
 * Python-specific REPL interface component that manages its own PythonDataInstance
 */
export const PythonReplInterface: React.FC<PythonReplInterfaceProps> = ({
  initialInstance,
  onChange,
  onCndSpecExtracted,
  externalEvaluator,
  ...replProps
}) => {
  const [instance, setInstance] = useState<PythonDataInstance>(
    () => initialInstance || createEmptyPythonDataInstance()
  );

  // Create terminal configuration with PythonExpressionParser if evaluator is available
  const terminals = useMemo(() => {
    const pythonExpressionParser = new PythonExpressionParser(externalEvaluator);
    const pythonIdAllocationParser = new PythonIdAllocationParser(externalEvaluator);
    
    const baseTerminals: TerminalConfig[] = [
      {
        id: 'unified',
        title: externalEvaluator ? 'Full Python REPL' : 'Enhanced REPL',
        description: externalEvaluator 
          ? 'Supports Python variable assignment (x = 1), expression evaluation, and enhanced remove commands'
          : 'Supports basic Python syntax, enhanced remove commands, and basic operations',
        parsers: [
          new RemoveCommandParser(),        // Priority 200 - highest priority for remove commands
          new DotNotationRelationParser(),  // Priority 115 - dot notation relations
          pythonIdAllocationParser,         // Priority 110 - Python variable assignment (x = 1)
          new AtomCommandParser(),          // Priority 100 - standard atom commands (Label:Type)
          pythonExpressionParser,           // Priority 90 - Python expressions (only if evaluator available)
          new InfoCommandParser()           // Priority 50 - fallback utility commands
        ].filter(parser => {
          // Remove PythonExpressionParser if no external evaluator
          if (parser instanceof PythonExpressionParser && !externalEvaluator) {
            return false;
          }
          return true;
        }).sort((a, b) => b.getPriority() - a.getPriority()), // Sort by priority descending
        placeholder: 'x = 1\nalice = "Alice"\nremove alice.name\nlist-ids'
      }
    ];
    
    return baseTerminals;
  }, [externalEvaluator]);

  // Handle instance changes
  const handleInstanceChange = (updatedInstance: IInputDataInstance) => {
    if (updatedInstance instanceof PythonDataInstance) {
      setInstance(updatedInstance);
      onChange?.(updatedInstance);
    }
  };

  // Update instance when initialInstance prop changes
  useEffect(() => {
    if (initialInstance && initialInstance !== instance) {
      setInstance(initialInstance);
    }
  }, [initialInstance]);

  return (
    <ReplInterface
      instance={instance}
      onChange={handleInstanceChange}
      onCndSpecExtracted={onCndSpecExtracted}
      terminals={terminals}
      {...replProps}
    />
  );
};

export default PythonReplInterface;