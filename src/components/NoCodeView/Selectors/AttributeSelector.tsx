import React, { useCallback } from 'react';
import { TUPLE_SELECTOR_TEXT, UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

interface AttributeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for attribute field selection.
 * Includes field input, optional selector for source atoms, and optional filter for attribute values.
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

  const handleSelectorChange = (event: SelectorChangeEvent) => {
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
          <span className="input-group-text infolabel" title={UNARY_SELECTOR_TEXT}>
            Selector
          </span>
        </div>
        <SelectorInput
          name="selector"
          value={props.directiveData.params.selector as string || ''}
          onChange={handleSelectorChange}
          placeholder="Optional: target specific source atoms (e.g., Person)"
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>
            Filter
          </span>
        </div>
        <SelectorInput
          name="filter"
          value={props.directiveData.params.filter as string || ''}
          onChange={handleSelectorChange}
          placeholder="Optional: filter which values to show (e.g., rel & (univ -> True))"
        />
      </div>
    </>
  );
};
