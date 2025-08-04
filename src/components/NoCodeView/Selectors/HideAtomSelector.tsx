import React, { useCallback } from 'react';
import { UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';

interface HideAtomSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for hide atom directive.
 * Simple selector input to specify which atoms to hide.
 */
export const HideAtomSelector: React.FC<HideAtomSelectorProps> = (props: HideAtomSelectorProps) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value
      }
    });
  };

  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <span className="input-group-text infolabel" title={UNARY_SELECTOR_TEXT}>
          Selector
        </span>
      </div>
      <input
        type="text"
        name="selector"
        className="form-control"
        defaultValue={props.directiveData.params.selector as string || ''}
        onChange={handleInputChange}
        required
      />
    </div>
  );
};