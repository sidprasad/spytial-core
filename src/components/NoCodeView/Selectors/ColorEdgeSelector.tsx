import React from 'react';
import { TUPLE_SELECTOR_TEXT, UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

interface ColorEdgeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for edge style directive.
 * Includes field input, color picker, line style, weight, label visibility, and edge visibility.
 */
export const ColorEdgeSelector: React.FC<ColorEdgeSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const field = (directiveData.params.field as string) || '';
  const value = (directiveData.params.value as string) || '#000000';
  const selector = (directiveData.params.selector as string) || '';
  const filter = (directiveData.params.filter as string) || '';
  const style = (directiveData.params.style as string) || '';
  const weight = directiveData.params.weight as number | undefined;
  const showLabel = directiveData.params.showLabel as boolean | undefined;
  const hidden = directiveData.params.hidden as boolean | undefined;

  const handleSelectorChange = (event: SelectorChangeEvent) => {
    const { name, value } = event.target;
    onUpdate({ params: { ...directiveData.params, [name]: value || undefined } });
  };

  return (
    <>
      <div className="field-group">
        <label className="field-label">Field</label>
        <input
          type="text"
          name="field"
          defaultValue={field}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, field: e.target.value } })}
          required
        />
      </div>
      <div className="field-group">
        <label className="field-label infolabel" title={UNARY_SELECTOR_TEXT}>
          Selector
        </label>
        <SelectorInput
          name="selector"
          value={selector}
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
          value={filter}
          onChange={handleSelectorChange}
          placeholder="Optional: filter which tuples to style (e.g., rel & (univ -> True))"
        />
      </div>
      <div className="field-group">
        <label className="field-label">Color</label>
        <input
          type="color"
          name="value"
          defaultValue={value}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, value: e.target.value } })}
          required
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
      <label className="inline-toggle">
        <input
          type="checkbox"
          name="showLabel"
          checked={showLabel !== false}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, showLabel: e.target.checked ? undefined : false } })}
        />
        <span>Show Edge Label</span>
      </label>
      <label className="inline-toggle">
        <input
          type="checkbox"
          name="hidden"
          checked={hidden === true}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, hidden: e.target.checked ? true : undefined } })}
        />
        <span>Hide Edge</span>
      </label>
    </>
  );
};
