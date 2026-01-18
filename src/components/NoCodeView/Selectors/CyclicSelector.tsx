import React from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { ConstraintData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

interface CyclicSelectorProps {
    /** Constraint data object containing type and parameters */
      constraintData: ConstraintData;
     /** Callback when constraint data is updated */
      onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

const CyclicSelector: React.FC<CyclicSelectorProps> = (props: CyclicSelectorProps) => {
    const handleParamsChange = (event: SelectorChangeEvent | React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = event.target;
        props.onUpdate({
            params: {
                ...props.constraintData.params,
                [name]: value
            }
        });
    };

  return (
    <>
    <div className="input-group">
        <div className="input-group-prepend">
            <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>Selector</span>
        </div>
        <SelectorInput 
            name="selector" 
            value={props.constraintData.params.selector as string || ''} 
            onChange={handleParamsChange}
            required
        />
    </div>
    <div className="input-group">
        <div className="input-group-prepend">
            <span className="input-group-text">Direction</span>
        </div>
        <select name="direction" onChange={ handleParamsChange } value={props.constraintData.params.direction as string || 'clockwise'}>
            <option value="clockwise">Clockwise</option>
            <option value="counterclockwise">Counterclockwise</option>
        </select>
    </div>
    </>
  )
}

export { CyclicSelector }