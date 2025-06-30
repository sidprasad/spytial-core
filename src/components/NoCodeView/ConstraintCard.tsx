import React, { useCallback, useState } from 'react';
import { ORIENTATION_DESCRIPTION, CYCLIC_DESCRIPTION, GROUPING_FIELD_DESCRIPTION, GROUPING_SELECTOR_DESCRIPTION } from './constants';
import { CyclicSelector, 
    OrientationSelector, 
    GroupByFieldSelector, 
    GroupBySelectorSelector, 
} from './index';
import { useHighlight } from './hooks';
import { ConstraintType } from './types';
import { ConstraintData } from './interfaces';

/**
 * Configuration options for constraint card component
 * Designed for tree-shaking optimization and client-side performance
 * 
 * @public
 * @interface ConstraintCardProps
 */
interface ConstraintCardProps {
  /** Constraint data object containing type and parameters */
  constraintData: ConstraintData;
 /** Callback when constraint data is updated */
  onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
  /** Callback when constraint is removed */
  onRemove: () => void;
  /** Additional CSS class name for styling */
  className?: string;
}

const ConstraintCard = (props: ConstraintCardProps) => {
    const [cardHTML, setCardHTML] = useState<React.JSX.Element>(<OrientationSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>); // FIXME: Better way to set default?
    
    const { isHighlighted } = useHighlight(1000); // Highlight for 1 second

    /**
     * Handle constraint type change with proper event typing
     * Accesses HTMLSelectElement through event.target with type safety
     * 
     * @param event - Change event from select element containing the HTMLSelectElement
     */
    const updateFields = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        // Access the HTMLSelectElement through event.target
        const selectElement = event.target;
        const selectedValue = selectElement.value as ConstraintType;
        
        console.log('Select element value', selectedValue);

        // Constraint Fields
        // TODO: Use a mapping object to avoid multiple if-else statements
        if (selectedValue === "cyclic") {
            setCardHTML(<CyclicSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "orientation") {
            setCardHTML(<OrientationSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "groupfield") {
            setCardHTML(<GroupByFieldSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "groupselector") {
            setCardHTML(<GroupBySelectorSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>);
        }

        // Update the constraint type
        props.onUpdate({ type: selectedValue, params: {} });
    }, [props.onUpdate, props.constraintData]);

    // const classes = [
    //     isHighlighted && 'highlight',
    // ].filter(Boolean).join(' ');

    return (
        <div className={ isHighlighted ? 'highlight' : '' }>
            <button className="close" title="Remove constraint" type="button" onClick= { props.onRemove }>
                <span aria-hidden="true">&times;</span>
            </button>
            <div className="input-group"> 
                <div className="input-group-prepend">
                    <span className="input-group-text" title="Choose constraint type">Constraint</span>
                </div>
                <select onChange={ updateFields } >
                    <option value="orientation" title={ORIENTATION_DESCRIPTION}>Orientation</option>
                    <option value="cyclic" title={CYCLIC_DESCRIPTION}>Cyclic</option>
                    <option value="groupfield" title={GROUPING_FIELD_DESCRIPTION}>Group by field</option>
                    <option value="groupselector"  title={GROUPING_SELECTOR_DESCRIPTION}>Group by selector</option>
                </select>
            </div>
            <div className="params">
                { cardHTML }
            </div>
        </div>
    )
}

export { ConstraintCard };