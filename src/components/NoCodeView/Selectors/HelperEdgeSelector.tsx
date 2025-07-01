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
 * Includes selector input and edge name field.
 */
export const HelperEdgeSelector: React.FC<HelperEdgeSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const selector = (directiveData.params.selector as string) || '';
  const name = (directiveData.params.name as string) || '';

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
          className="form-control"
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
    </>
  );
};
