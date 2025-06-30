import React, { useCallback, useState } from 'react';
import { ORIENTATION_DESCRIPTION, CYCLIC_DESCRIPTION, GROUPING_FIELD_DESCRIPTION, GROUPING_SELECTOR_DESCRIPTION } from './constants';
import { CyclicSelector, 
    OrientationSelector, 
    GroupByFieldSelector, 
    GroupBySelectorSelector, 
} from './index';

/**
 * Constraint types supported by the CND layout system
 * Following cnd-core TypeScript strict typing guidelines
 * 
 * @public
 */
type ConstraintType = 'orientation' | 'cyclic' | 'groupfield' | 'groupselector';

/**
 * Configuration options for constraint card component
 * Designed for tree-shaking optimization and client-side performance
 * 
 * @public
 * @interface ConstraintCardProps
 */
interface ConstraintCardProps {
  /** Current constraint type selection */
  constraintType?: ConstraintType;
  /** Callback when constraint type changes */
  onConstraintChange?: (constraintType: ConstraintType) => void;
  /** Callback when constraint is removed */
  onRemove: () => void;
  /** Additional CSS class name for styling */
  className?: string;
}

const ConstraintCard = (props: ConstraintCardProps) => {

    const [cardHTML, setCardHTML] = useState<React.JSX.Element>(<OrientationSelector />); // FIXME: Better way to set default?

    const removeConstraint = useCallback((event: any) => {
        props.onRemove();
    }, [props.onRemove]);

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
        if (selectedValue === "cyclic") {
            setCardHTML(<CyclicSelector />);
        } else if (selectedValue === "orientation") {
            setCardHTML(<OrientationSelector />);
        } else if (selectedValue === "groupfield") {
            setCardHTML(<GroupByFieldSelector />);
        } else if (selectedValue === "groupselector") {
            setCardHTML(<GroupBySelectorSelector />);
        }
        
        // Call the parent callback with the new constraint type
        props.onConstraintChange?.(selectedValue);
    }, [props.onConstraintChange]);

    return (
        <>
            <button className="close" title="Remove constraint" type="button" onClick= { () => removeConstraint(this) }>
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
        </>
    )
}

export { ConstraintCard };