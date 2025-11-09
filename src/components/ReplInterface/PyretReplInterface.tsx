/**
 * Pyret-specific REPL interface component
 * 
 * This component provides a REPL interface pre-configured for Pyret data instances.
 * It can be used as a standalone component or integrated into larger applications.
 * 
 * 
 * 
 * 
 * 
 * // TODO:
 * - List functionality is not correct, but we can get there!
 * - Relations can be 
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ReplInterface, ReplInterfaceProps, TerminalConfig } from './ReplInterface';
import { PyretDataInstance } from '../../data-instance/pyret/pyret-data-instance';
import { IInputDataInstance } from '../../data-instance/interfaces';
import { PyretEvaluator, PyretExpressionParser } from './parsers/PyretExpressionParser';
import { RemoveCommandParser, AtomCommandParser, DotNotationRelationParser } from './parsers/CoreParsers';
import { InfoCommandParser } from './parsers/ExtensibleParsers';
import { PyretIdAllocationParser } from './parsers/PyretIdAllocationParser';

export interface PyretReplInterfaceProps extends Omit<ReplInterfaceProps, 'instance'> {
  /** Initial Pyret data instance. If not provided, an empty instance will be created. */
  initialInstance?: PyretDataInstance;
  /** Callback fired when the instance changes */
  onChange?: (instance: PyretDataInstance) => void;
  /** Callback when Spytial specification is extracted from an expression */
  onCndSpecExtracted?: (spec: string) => void;
  /** Optional external Pyret evaluator (e.g., window.__internalRepl) */
  externalEvaluator?: PyretEvaluator;
}

/**
 * Create an empty PyretDataInstance
 */
function createEmptyPyretDataInstance(): PyretDataInstance {
  const emptyPyretObject = {
    dict: {},
    brands: {}
  };
  return new PyretDataInstance(emptyPyretObject);
}

/**
 * Pyret-specific REPL interface component that manages its own PyretDataInstance
 */
export const PyretReplInterface: React.FC<PyretReplInterfaceProps> = ({
  initialInstance,
  onChange,
  onCndSpecExtracted,
  externalEvaluator,
  ...replProps
}) => {
  const [instance, setInstance] = useState<PyretDataInstance>(
    () => initialInstance || createEmptyPyretDataInstance()
  );

  // Create terminal configuration with PyretExpressionParser if evaluator is available
  const terminals = useMemo(() => {
    const pyretExpressionParser = new PyretExpressionParser(externalEvaluator);
    const pyretIdAllocationParser = new PyretIdAllocationParser(externalEvaluator);
    
    const baseTerminals: TerminalConfig[] = [
      {
        id: 'unified',
        title: externalEvaluator ? 'Full Pyret REPL' : 'Enhanced REPL',
        description: externalEvaluator 
          ? 'Supports ID allocation (x=1), expression evaluation, and enhanced remove commands'
          : 'Supports ID allocation (x=1), enhanced remove commands, and basic operations',
        parsers: [
          new RemoveCommandParser(),        // Priority 200 - highest priority for remove commands
          new DotNotationRelationParser(),  // Priority 115 - dot notation relations
          pyretIdAllocationParser,          // Priority 110 - ID allocation syntax (x=1)
          new AtomCommandParser(),          // Priority 100 - standard atom commands (Label:Type)
          pyretExpressionParser,            // Priority 90 - Pyret expressions (only if evaluator available)
          new InfoCommandParser()           // Priority 50 - fallback utility commands
        ].filter(parser => {
          // Remove PyretExpressionParser if no external evaluator
          if (parser instanceof PyretExpressionParser && !externalEvaluator) {
            return false;
          }
          return true;
        }).sort((a, b) => b.getPriority() - a.getPriority()), // Sort by priority descending
        placeholder: 'x = 1\nalice = "Alice"\nremove alice.friend\nlist-ids'
      }
    ];
    
    return baseTerminals;
  }, [externalEvaluator]);

  // Handle instance changes
  const handleInstanceChange = (updatedInstance: IInputDataInstance) => {
    if (updatedInstance instanceof PyretDataInstance) {
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

export default PyretReplInterface;