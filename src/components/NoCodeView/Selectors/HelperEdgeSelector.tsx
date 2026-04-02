import React from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

interface HelperEdgeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for helper/inferred edge directive.
 * Includes selector input, edge name field, and optional color picker.
 */
export const HelperEdgeSelector: React.FC<HelperEdgeSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const selector = (directiveData.params.selector as string) || '';
  const name = (directiveData.params.name as string) || '';
  const color = (directiveData.params.color as string) || '#000000';
  const style = (directiveData.params.style as string) || '';
  const weight = directiveData.params.weight as number | undefined;

  const handleSelectorChange = (event: SelectorChangeEvent) => {
    onUpdate({ params: { ...directiveData.params, selector: event.target.value } });
  };

  return (
    <>
      <div className="field-group">
        <label className="field-label infolabel" title={TUPLE_SELECTOR_TEXT}>
          Selector
        </label>
        <SelectorInput
          name="selector"
          value={selector}
          onChange={handleSelectorChange}
          required
        />
      </div>
      <div className="field-group">
        <label className="field-label">Edge Name</label>
        <input
          type="text"
          name="name"
          defaultValue={name}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, name: e.target.value } })}
          required
        />
      </div>
      <div className="field-group">
        <label className="field-label">Color</label>
        <input
          type="color"
          name="color"
          defaultValue={color}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, color: e.target.value } })}
        />
      </div>
      <div className="field-group">
        <label className="field-label">Style</label>
        <select
          name="style"
          value={style}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, style: e.target.value || undefined } })}
        >
          <option value="">Default</option>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
      <div className="field-group">
        <label className="field-label">Weight</label>
        <input
          type="number"
          name="weight"
          min="0"
          step="0.5"
          value={weight ?? ''}
          placeholder="Default"
          onChange={(e) => {
            const rawValue = e.target.value;
            const parsed = rawValue === '' ? undefined : Number(rawValue);
            onUpdate({ params: { ...directiveData.params, weight: parsed } });
          }}
        />
      </div>
    </>
  );
};
