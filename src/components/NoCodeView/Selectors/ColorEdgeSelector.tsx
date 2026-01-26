import React from 'react';
import { DirectiveData } from '../interfaces';

interface ColorEdgeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for edge style directive.
 * Includes field input, color picker, line style, weight, and label visibility.
 */
export const ColorEdgeSelector: React.FC<ColorEdgeSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const field = (directiveData.params.field as string) || '';
  const value = (directiveData.params.value as string) || '#000000';
  const selector = (directiveData.params.selector as string) || '';
  const style = (directiveData.params.style as string) || '';
  const weight = directiveData.params.weight as number | undefined;
  const showLabel = directiveData.params.showLabel as boolean | undefined;

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
          <span className="input-group-text">Selector</span>
        </div>
        <input
          type="text"
          name="selector"
          className="form-control code-input"
          defaultValue={selector}
          placeholder="Optional: target specific atoms (e.g., Person)"
          onChange={(e) => onUpdate({ params: { ...directiveData.params, selector: e.target.value || undefined } })}
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
    </>
  );
};
