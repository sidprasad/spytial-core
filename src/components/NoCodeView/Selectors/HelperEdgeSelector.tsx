import React from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';

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

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>
            Selector
          </span>
        </div>
        <input
          type="text"
          name="selector"
          className="form-control code-input"
          defaultValue={selector}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, selector: e.target.value } })}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Edge Name</span>
        </div>
        <input
          type="text"
          name="name"
          className="form-control"
          defaultValue={name}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, name: e.target.value } })}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Color</span>
        </div>
        <input
          type="color"
          name="color"
          className="form-control"
          defaultValue={color}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, color: e.target.value } })}
        />
      </div>
    </>
  );
};
