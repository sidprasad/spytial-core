import React, { useCallback } from 'react';
import { DirectiveData } from '../interfaces';

interface AttributeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * React component for new attribute directive configuration.
 * Supports selector-based attributes with key-value pairs.
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
          <span className="input-group-text">Target Selector</span>
        </div>
        <input
          type="text"
          name="selector"
          className="form-control code-input"
          defaultValue={props.directiveData.params.selector as string || ''}
          placeholder="Selector for atoms to apply attribute to (e.g., Person)"
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Attribute Key</span>
        </div>
        <input
          type="text"
          name="key"
          className="form-control"
          defaultValue={props.directiveData.params.key as string || ''}
          placeholder="Name of the attribute (e.g., age, status)"
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Value Selector</span>
        </div>
        <input
          type="text"
          name="valueSelector"
          className="form-control code-input"
          defaultValue={props.directiveData.params.valueSelector as string || ''}
          placeholder="Selector for values to collect (e.g., Person.age, ~Person.status)"
          onChange={handleInputChange}
          required
        />
      </div>
    </>
  );
};
