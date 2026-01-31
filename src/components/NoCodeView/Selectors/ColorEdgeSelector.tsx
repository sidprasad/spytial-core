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
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Field</span>
        </div>
        <input
          type="text"
          name="field"
          className="form-control"
          defaultValue={field}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, field: e.target.value } })}
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
          value={selector}
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
          value={filter}
          onChange={handleSelectorChange}
          placeholder="Optional: filter which tuples to style (e.g., rel & (univ -> True))"
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
          defaultValue={value}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, value: e.target.value } })}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Style</span>
        </div>
        <select
          name="style"
          className="form-control"
          value={style}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, style: e.target.value || undefined } })}
        >
          <option value="">Default</option>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Weight</span>
        </div>
        <input
          type="number"
          name="weight"
          className="form-control"
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
      <div className="input-group">
        <div className="form-check">
          <input
            type="checkbox"
            name="showLabel"
            className="form-check-input"
            id="showLabel-checkbox"
            checked={showLabel !== false}
            onChange={(e) => onUpdate({ params: { ...directiveData.params, showLabel: e.target.checked ? undefined : false } })}
          />
          <label className="form-check-label" htmlFor="showLabel-checkbox">
            Show Edge Label
          </label>
        </div>
      </div>
      <div className="input-group">
        <div className="form-check">
          <input
            type="checkbox"
            name="hidden"
            className="form-check-input"
            id="hidden-checkbox"
            checked={hidden === true}
            onChange={(e) => onUpdate({ params: { ...directiveData.params, hidden: e.target.checked ? true : undefined } })}
          />
          <label className="form-check-label" htmlFor="hidden-checkbox">
            Hide Edge
          </label>
        </div>
      </div>
    </>
  );
};
