import React from 'react';
import { DirectiveData } from './interfaces';

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
          value={field}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, field: e.target.value } })}
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
          value={value}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, value: e.target.value } })}
          required
        />
      </div>
    </>
  );
};
