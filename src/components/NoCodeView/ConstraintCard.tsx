import React, { useCallback, useState } from 'react';
import { ORIENTATION_DESCRIPTION, CYCLIC_DESCRIPTION, GROUPING_FIELD_DESCRIPTION, GROUPING_SELECTOR_DESCRIPTION, GROUPS_DESCRIPTION } from './constants';
import { CyclicSelector, 
    OrientationSelector, 
    GroupByFieldSelector, 
    GroupBySelectorSelector,
    GroupsSelector,
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
    const constraintsToSelectorComponentMap: Record<ConstraintType, React.JSX.Element> = {
        cyclic: <CyclicSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>,
        orientation: <OrientationSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>,
        groupfield: <GroupByFieldSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>,
        groupselector: <GroupBySelectorSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>,
        groups: <GroupsSelector constraintData={props.constraintData} onUpdate={props.onUpdate}/>,
    }

    const [cardHTML, setCardHTML] = useState<React.JSX.Element>(constraintsToSelectorComponentMap[props.constraintData.type]);
    
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

        // Constraint Fields
        setCardHTML(constraintsToSelectorComponentMap[selectedValue]);

        // Update the constraint type
        props.onUpdate({ type: selectedValue, params: {} });
    }, [props.onUpdate, props.constraintData]);

    const classes = [
        props.className ? props.className : '',
        isHighlighted ? 'highlight' : '',
        'noCodeCard',
    ].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            <button className="closeButton" title="Remove constraint" aria-label="Remove constraint" type="button" onClick= { props.onRemove }>
                <span aria-hidden="true">&times;</span>
            </button>
            <div className="input-group"> 
                <div className="input-group-prepend">
                    <span className="input-group-text" title="Choose constraint type">Constraint</span>
                </div>
                <select onChange={ updateFields } value={ props.constraintData.type }>
                    <option value="orientation" title={ORIENTATION_DESCRIPTION}>Orientation</option>
                    <option value="cyclic" title={CYCLIC_DESCRIPTION}>Cyclic</option>
                    <option value="groupfield" title={GROUPING_FIELD_DESCRIPTION}>Group by field</option>
                    <option value="groupselector"  title={GROUPING_SELECTOR_DESCRIPTION}>Group by selector</option>
                    <option value="groups" title={GROUPS_DESCRIPTION}>Groups (binary selector)</option>
                </select>
            </div>
            <div className="params">
                { cardHTML }
            </div>
        </div>
    )
}

export { ConstraintCard };