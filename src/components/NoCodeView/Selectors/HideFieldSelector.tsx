import React, { useCallback } from 'react';
import { TUPLE_SELECTOR_TEXT, UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

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
      <div className="field-group">
        <label className="field-label">Field</label>
        <input
          type="text"
          name="field"
          defaultValue={props.directiveData.params.field as string || ''}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="field-group">
        <label className="field-label infolabel" title={UNARY_SELECTOR_TEXT}>
          Selector
        </label>
        <SelectorInput
          name="selector"
          value={props.directiveData.params.selector as string || ''}
          onChange={handleSelectorChange}
          placeholder="Optional: target specific source atoms (e.g., Person)"
        />
      </div>
      <div className="field-group">
        <label className="field-label infolabel" title={TUPLE_SELECTOR_TEXT}>
          Filter
        </label>
        <SelectorInput
          name="filter"
          value={props.directiveData.params.filter as string || ''}
          onChange={handleSelectorChange}
          placeholder="Optional: filter which tuples to hide (e.g., rel & (univ -> False))"
        />
      </div>
    </>
  );
};
