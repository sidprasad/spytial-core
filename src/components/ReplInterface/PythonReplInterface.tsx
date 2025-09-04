/**
 * Python-specific REPL interface component
 * 
 * This component provides a spatial REPL interface pre-configured for Python-like evaluation.
 * It can be used as a standalone component or integrated into larger applications.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ReplInterface, ReplInterfaceProps, TerminalConfig } from './ReplInterface';
import { JSONDataInstance } from '../../data-instance/json-data-instance';
import { PythonEvaluator } from '../../evaluators/python-evaluator';
import { IInputDataInstance } from '../../data-instance/interfaces';

export interface PythonReplInterfaceProps extends Omit<ReplInterfaceProps, 'instance'> {
  /** Initial JSON data instance. If not provided, an empty instance will be created. */
  initialInstance?: JSONDataInstance;
  /** Callback fired when the instance changes */
  onChange?: (instance: JSONDataInstance) => void;
}

/**
 * Create an empty JSONDataInstance
 */
function createEmptyJSONDataInstance(): JSONDataInstance {
  return new JSONDataInstance({ atoms: [], relations: [] });
}

/**
 * Python-specific REPL interface component that manages its own JSONDataInstance
 */
export const PythonReplInterface: React.FC<PythonReplInterfaceProps> = ({
  initialInstance,
  onChange,
  customEvaluators = [],
  terminalConfig,
  ...otherProps
}) => {
  // State for managing the JSON data instance
  const [instance, setInstance] = useState<JSONDataInstance>(() => 
    initialInstance || createEmptyJSONDataInstance()
  );

  // Handle instance changes from ReplInterface
  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    if (newInstance instanceof JSONDataInstance) {
      setInstance(newInstance);
      onChange?.(newInstance);
    }
  };

  // Configure evaluators for Python
  const evaluators = useMemo(() => {
    const pythonEvaluator = new PythonEvaluator();
    return [pythonEvaluator, ...customEvaluators];
  }, [customEvaluators]);

  // Terminal configuration with Python-specific settings
  const pythonTerminalConfig: TerminalConfig = {
    welcomeMessage: "Python Spatial REPL - Type Python expressions to manipulate data\nExample: atom('user1', 'User'), [x*2 for x in range(5)]",
    prompt: ">>> ",
    helpText: `Python Spatial REPL Commands:
• atom(id, type, label=None) - Create an atom
• relation(id, name, from_atom, to_atom) - Create a relation  
• print(...) - Print to console
• len(obj) - Get length of object
• range(start, stop=None, step=1) - Generate range of numbers
• list(iterable) - Create list
• dict(obj) - Create dictionary
• set(iterable) - Create set
• tuple(*args) - Create tuple
• data_instance - Access current data for querying

Examples:
  atom('alice', 'Person', 'Alice Smith')
  [x for x in range(10) if x % 2 == 0]
  sum([1, 2, 3, 4, 5])
  len(['a', 'b', 'c'])
  print('Hello, World!')`,
    ...terminalConfig
  };

  // Update instance when initialInstance prop changes
  useEffect(() => {
    if (initialInstance && initialInstance !== instance) {
      setInstance(initialInstance);
    }
  }, [initialInstance, instance]);

  return (
    <ReplInterface
      {...otherProps}
      instance={instance}
      onChange={handleInstanceChange}
      customEvaluators={evaluators}
      terminalConfig={pythonTerminalConfig}
    />
  );
};