import React from 'react';
import { DirectiveData } from '../interfaces';

interface ColorEdgeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for edge color directive.
 * Includes field input and color picker.
 */
export const ColorEdgeSelector: React.FC<ColorEdgeSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const field = (directiveData.params.field as string) || '';
  const value = (directiveData.params.value as string) || '#000000';
  const selector = (directiveData.params.selector as string) || '';

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
    </>
  );
};
