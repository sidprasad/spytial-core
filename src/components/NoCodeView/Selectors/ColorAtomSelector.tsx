import React, { useCallback } from 'react';
import { UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';

interface ColorAtomSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for atom color directive.
 * Includes selector input and color picker.
 */
export const ColorAtomSelector: React.FC<ColorAtomSelectorProps> = (props: ColorAtomSelectorProps) => {
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
    <>
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
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Color</span>
        </div>
        <input
          type="color"
          name="value"
          className="form-control"
          onChange={handleInputChange}
          required
        />
      </div>
    </>
  );
};
