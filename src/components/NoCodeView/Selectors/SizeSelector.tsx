import React from 'react';
import { UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData, ConstraintData } from '../interfaces';
import { SelectorInput } from './SelectorInput';

interface SizeSelectorProps {
  /** Directive or Constraint data object containing type and parameters */
  directiveData?: DirectiveData;
  constraintData?: ConstraintData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData | ConstraintData, 'id'>>) => void;
}

/**
 * Minimal React component for size directive/constraint.
 * Includes selector input and width/height number inputs.
 */
export const SizeSelector: React.FC<SizeSelectorProps> = ({
  directiveData,
  constraintData,
  onUpdate
}) => {
  const data = directiveData || constraintData;
  if (!data) {
    throw new Error('SizeSelector requires either directiveData or constraintData');
  }
  
  const selector = (data.params.selector as string) || '';
  const width = (data.params.width as number) || 10;
  const height = (data.params.height as number) || 10;

  const handleSelectorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ params: { ...data.params, selector: event.target.value } });
  };

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={UNARY_SELECTOR_TEXT}>
            Selector
          </span>
        </div>
        <SelectorInput
          name="selector"
          value={selector}
          onChange={handleSelectorChange}
          required
        />
      </div>
      <div className="input-group">
        <label>
          <span className="input-group-text">Width</span>
        </label>
        <input
          type="number"
          name="width"
          className="form-control"
          defaultValue={width}
          onChange={(e) => onUpdate({ params: { ...data.params, width: Number(e.target.value) } })}
          required
        />
        <label>
          <span className="input-group-text">Height</span>
        </label>
        <input
          type="number"
          name="height"
          className="form-control"
          defaultValue={height}
          onChange={(e) => onUpdate({ params: { ...data.params, height: Number(e.target.value) } })}
          required
        />
      </div>
    </>
  );
};
