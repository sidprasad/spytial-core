import React from 'react';
import { DirectiveData } from '../interfaces';

interface HideAtomSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * React component for hideAtom directive configuration.
 * Provides a text input for entering selector expressions to hide atoms.
 * 
 * Supports any selector expression that can be evaluated by the layout evaluator,
 * enabling flexible atom hiding based on type, name, or complex expressions.
 */
export const HideAtomSelector: React.FC<HideAtomSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const selector = directiveData.params.selector as string || '';

  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <span className="input-group-text">Selector</span>
      </div>
      <input
        type="text"
        name="selector"
        className="form-control"
        placeholder="e.g., Int, univ, A + B"
        value={selector}
        onChange={(e) => onUpdate({ params: { ...directiveData.params, selector: e.target.value } })}
        title="Enter a selector expression to hide matching atoms. Examples: 'Int' (hide all Int atoms), 'univ' (hide builtin types), 'A + B' (hide atoms A and B)"
      />
    </div>
  );
};