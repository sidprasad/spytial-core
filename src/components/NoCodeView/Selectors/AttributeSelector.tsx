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
 * Simple field input for attribute directives with prominence option.
 */
export const AttributeSelector: React.FC<AttributeSelectorProps> = (props: AttributeSelectorProps) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: type === 'checkbox' ? checked : (value || undefined)
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
          value={props.directiveData.params.field as string || ''}
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
          value={props.directiveData.params.selector as string || ''}
          placeholder="Optional: target specific atoms (e.g., Person)"
          onChange={handleInputChange}
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <div className="input-group-text">
            <input
              type="checkbox"
              id="prominent"
              name="prominent"
              checked={props.directiveData.params.prominent as boolean || false}
              onChange={handleInputChange}
            />
          </div>
        </div>
        <div className="form-control d-flex align-items-center">
          <label htmlFor="prominent" className="mb-0">
            <strong>Prominent</strong> <small className="text-muted">(larger & bold)</small>
          </label>
        </div>
      </div>
    </>
  );
};
