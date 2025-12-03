import React from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { ConstraintData } from '../interfaces';
import { SelectorInput } from './SelectorInput';

interface AlignSelectorProps {
    /** Constraint data object containing type and parameters */
    constraintData: ConstraintData;
    /** Callback when constraint data is updated */
    onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

/**
 * React component for align constraint configuration.
 * Allows selection of tuple selector and alignment direction (horizontal or vertical).
 */
const AlignSelector: React.FC<AlignSelectorProps> = (props: AlignSelectorProps) => {
    const handleParamsChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
                    placeholder="e.g., Node + Person"
                />
            </div>
            <div className="input-group">
                <div className="input-group-prepend">
                    <span className="input-group-text">Direction</span>
                </div>
                <select 
                    name="direction" 
                    onChange={handleParamsChange} 
                    value={props.constraintData.params.direction as string || 'horizontal'}
                >
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                </select>
            </div>
        </>
    );
};

export { AlignSelector };