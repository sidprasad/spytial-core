import React, { useCallback } from 'react';
import { DirectiveData } from '../interfaces';

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
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value || undefined
      }
    });
  };

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Field</span>
        </div>
        <input
          type="text"
          name="field"
          className="form-control"
          defaultValue={props.directiveData.params.field as string || ''}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Selector</span>
        </div>
        <input
          type="text"
          name="selector"
          className="form-control code-input"
          defaultValue={props.directiveData.params.selector as string || ''}
          placeholder="Optional: target specific atoms (e.g., Person)"
          onChange={handleInputChange}
        />
      </div>
    </>
  );
};
