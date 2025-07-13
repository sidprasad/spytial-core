/**
 * Pyret-specific REPL interface component
 * 
 * This component provides a REPL interface pre-configured for Pyret data instances.
 * It can be used as a standalone component or integrated into larger applications.
 */

import React, { useState, useEffect } from 'react';
import { ReplInterface, ReplInterfaceProps } from './ReplInterface';
import { PyretDataInstance } from '../../data-instance/pyret/pyret-data-instance';
import { IInputDataInstance } from '../../data-instance/interfaces';

export interface PyretReplInterfaceProps extends Omit<ReplInterfaceProps, 'instance'> {
  /** Initial Pyret data instance. If not provided, an empty instance will be created. */
  initialInstance?: PyretDataInstance;
  /** Callback fired when the instance changes */
  onChange?: (instance: PyretDataInstance) => void;
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
  ...replProps
}) => {
  const [instance, setInstance] = useState<PyretDataInstance>(
    () => initialInstance || createEmptyPyretDataInstance()
  );

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
      {...replProps}
    />
  );
};

export default PyretReplInterface;