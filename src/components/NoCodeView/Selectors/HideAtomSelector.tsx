import React, { useCallback } from 'react';
import { UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData, ConstraintData } from '../interfaces';
import { SelectorInput } from './SelectorInput';

interface HideAtomSelectorProps {
  /** Directive or Constraint data object containing type and parameters */
  directiveData?: DirectiveData;
  constraintData?: ConstraintData;
  /** Callback when directive/constraint data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData | ConstraintData, 'id'>>) => void;
}

/**
 * Minimal React component for hide atom directive/constraint.
 * Simple selector input to specify which atoms to hide.
 */
export const HideAtomSelector: React.FC<HideAtomSelectorProps> = (props: HideAtomSelectorProps) => {
  const data = props.directiveData || props.constraintData;
  if (!data) {
    throw new Error('HideAtomSelector requires either directiveData or constraintData');
  }
  
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...data.params,
        [name]: value
      }
    });
  };

  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <span className="input-group-text infolabel" title={UNARY_SELECTOR_TEXT}>
          Selector
        </span>
      </div>
      <SelectorInput
        name="selector"
        value={data.params.selector as string || ''}
        onChange={handleInputChange}
        required
        placeholder="e.g., HiddenNode"
      />
    </div>
  );
};