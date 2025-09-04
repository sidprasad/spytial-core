/**
 * JavaScript-specific REPL interface component
 * 
 * This component provides a spatial REPL interface pre-configured for JavaScript evaluation.
 * It can be used as a standalone component or integrated into larger applications.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ReplInterface, ReplInterfaceProps, TerminalConfig } from './ReplInterface';
import { JSONDataInstance } from '../../data-instance/json-data-instance';
import { JavaScriptEvaluator } from '../../evaluators/javascript-evaluator';
import { IInputDataInstance } from '../../data-instance/interfaces';

export interface JavaScriptReplInterfaceProps extends Omit<ReplInterfaceProps, 'instance'> {
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
 * JavaScript-specific REPL interface component that manages its own JSONDataInstance
 */
export const JavaScriptReplInterface: React.FC<JavaScriptReplInterfaceProps> = ({
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

  // Configure evaluators for JavaScript
  const evaluators = useMemo(() => {
    const jsEvaluator = new JavaScriptEvaluator();
    return [jsEvaluator, ...customEvaluators];
  }, [customEvaluators]);

  // Terminal configuration with JavaScript-specific settings
  const jsTerminalConfig: TerminalConfig = {
    welcomeMessage: "JavaScript Spatial REPL - Type JavaScript expressions to manipulate data\nExample: atom('user1', 'User'), [1, 2, 3].map(x => x * 2)",
    prompt: "js> ",
    helpText: `JavaScript Spatial REPL Commands:
• atom(id, type, label?) - Create an atom
• relation(id, name, fromAtom, toAtom) - Create a relation  
• console.log(...) - Print to console
• Math.*, Array.*, Object.* - Standard JavaScript utilities
• dataInstance - Access current data for querying

Examples:
  atom('alice', 'Person', 'Alice Smith')
  [1, 2, 3, 4, 5].filter(x => x % 2 === 0)
  Math.max(10, 20, 5)
  Object.keys({a: 1, b: 2})`,
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
      terminalConfig={jsTerminalConfig}
    />
  );
};