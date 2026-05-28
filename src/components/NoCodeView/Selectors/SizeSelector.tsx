import React from 'react';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData, ConstraintData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

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
  const width = typeof data.params.width === 'number' ? data.params.width : DEFAULT_NODE_WIDTH;
  const height = typeof data.params.height === 'number' ? data.params.height : DEFAULT_NODE_HEIGHT;

  const handleSelectorChange = (event: SelectorChangeEvent) => {
    onUpdate({ params: { ...data.params, selector: event.target.value } });
  };

  return (
    <>
      <div className="field-group">
        <label className="field-label infolabel" title={UNARY_SELECTOR_TEXT}>
          Selector
        </label>
        <SelectorInput
          name="selector"
          value={selector}
          onChange={handleSelectorChange}
          required
        />
      </div>
      <div className="field-group field-group--inline">
        <label className="field-label">Width</label>
        <input
          type="number"
          name="width"
          min={1}
          step={1}
          defaultValue={width}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0) {
              onUpdate({ params: { ...data.params, width: next } });
            }
          }}
          required
        />
      </div>
      <div className="field-group field-group--inline">
        <label className="field-label">Height</label>
        <input
          type="number"
          name="height"
          min={1}
          step={1}
          defaultValue={height}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0) {
              onUpdate({ params: { ...data.params, height: next } });
            }
          }}
          required
        />
      </div>
    </>
  );
};
