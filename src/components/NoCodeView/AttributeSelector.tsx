import React from 'react';
import { DirectiveData } from './interfaces';

interface AttributeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for attribute field selection.
 * Simple field input for attribute directives.
 */
export const AttributeSelector: React.FC<AttributeSelectorProps> = (props: AttributeSelectorProps) => {
  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <span className="input-group-text">Field</span>
      </div>
      <input
        type="text"
        name="field"
        className="form-control"
        onChange={(event) => {
          const { name, value } = event.target;
          props.onUpdate({
            params: {
              ...props.directiveData.params,
              [name]: value
            }
          });
        }}
        required
      />
    </div>
  );
};
