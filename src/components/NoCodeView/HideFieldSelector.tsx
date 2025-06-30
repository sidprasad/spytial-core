import React from 'react';
import { DirectiveData } from './interfaces';

interface HideFieldSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for hide field directive.
 * Simple field input to specify which field to hide.
 */
export const HideFieldSelector: React.FC<HideFieldSelectorProps> = (props: HideFieldSelectorProps) => {
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
