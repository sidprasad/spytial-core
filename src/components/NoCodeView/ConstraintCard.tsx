import React, { useCallback, useState } from 'react';
import { ORIENTATION_DESCRIPTION, CYCLIC_DESCRIPTION, ALIGN_DESCRIPTION, GROUPING_FIELD_DESCRIPTION, GROUPING_SELECTOR_DESCRIPTION, SIZE_DESCRIPTION, HIDEATOM_DESCRIPTION } from './constants';
import { CyclicSelector, 
    OrientationSelector, 
    AlignSelector,
    GroupByFieldSelector, 
    GroupBySelectorSelector,
    SizeSelector,
    HideAtomSelector, 
} from './index';
import { useHighlight } from './hooks';
import { ConstraintType } from './types';
import { ConstraintData, DirectiveData } from './interfaces';

/** Constraint types that support the hold: never (negation) modifier */
const NEGATABLE_TYPES: ReadonlySet<ConstraintType> = new Set([
    'orientation', 'cyclic', 'align', 'groupfield', 'groupselector'
]);

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

/**
 * Renders the appropriate selector component based on constraint type
 * 
 * @param type - The constraint type
 * @param constraintData - The constraint data
 * @param onUpdate - Callback for updates
 * @returns The appropriate selector component
 */
const renderSelectorComponent = (
    type: ConstraintType,
    constraintData: ConstraintData,
    onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void
): React.JSX.Element => {
    // For dual-use selectors (size, hideAtom), cast the onUpdate to the expected type
    const dualUseOnUpdate = onUpdate as (updates: Partial<Omit<ConstraintData | DirectiveData, 'id'>>) => void;
    
    switch (type) {
        case 'cyclic':
            return <CyclicSelector constraintData={constraintData} onUpdate={onUpdate}/>;
        case 'orientation':
            return <OrientationSelector constraintData={constraintData} onUpdate={onUpdate}/>;
        case 'align':
            return <AlignSelector constraintData={constraintData} onUpdate={onUpdate}/>;
        case 'groupfield':
            return <GroupByFieldSelector constraintData={constraintData} onUpdate={onUpdate}/>;
        case 'groupselector':
            return <GroupBySelectorSelector constraintData={constraintData} onUpdate={onUpdate}/>;
        case 'size':
            return <SizeSelector constraintData={constraintData} onUpdate={dualUseOnUpdate}/>;
        case 'hideAtom':
            return <HideAtomSelector constraintData={constraintData} onUpdate={dualUseOnUpdate}/>;
        default:
            return <OrientationSelector constraintData={constraintData} onUpdate={onUpdate}/>;
    }
};

const ConstraintCard = (props: ConstraintCardProps) => {
    const { isHighlighted } = useHighlight(1000); // Highlight for 1 second
    const [isEditingComment, setIsEditingComment] = useState(false);

    const isCollapsed = props.constraintData.collapsed ?? false;
    const isNegated = props.constraintData.params.hold === 'never';
    const isNegatable = NEGATABLE_TYPES.has(props.constraintData.type);

    /**
     * Toggle collapsed state
     */
    const toggleCollapse = useCallback(() => {
        props.onUpdate({ collapsed: !isCollapsed });
    }, [isCollapsed, props.onUpdate]);

    /**
     * Handle comment change
     */
    const handleCommentChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        props.onUpdate({ comment: e.target.value });
    }, [props.onUpdate]);

    const handleHoldToggle = useCallback(() => {
        const newParams = { ...props.constraintData.params };
        if (newParams.hold === 'never') {
            delete newParams.hold;
        } else {
            newParams.hold = 'never';
        }
        props.onUpdate({ params: newParams });
    }, [props.constraintData.params, props.onUpdate]);

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

        // Update the constraint type and reset params
        props.onUpdate({ type: selectedValue, params: {} });
    }, [props.onUpdate]);

    const classes = [
        props.className ? props.className : '',
        isHighlighted ? 'highlight' : '',
        'noCodeCard',
        isCollapsed ? 'noCodeCard--collapsed' : '',
        isNegated ? 'noCodeCard--negated' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            <div className="cardHeader" onClick={toggleCollapse} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse(); }}>
                <span className="collapse-chevron" aria-hidden="true">{isCollapsed ? '›' : '‹'}</span>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div className="cardHeader__controls" onClick={(e) => e.stopPropagation()}>
                    <select className="type-select" onChange={updateFields} value={props.constraintData.type} title="Choose constraint type">
                        <option value="orientation" title={ORIENTATION_DESCRIPTION}>Orientation</option>
                        <option value="cyclic" title={CYCLIC_DESCRIPTION}>Cyclic</option>
                        <option value="align" title={ALIGN_DESCRIPTION}>Align</option>
                        <option value="groupfield" title={GROUPING_FIELD_DESCRIPTION}>Group by field</option>
                        <option value="groupselector" title={GROUPING_SELECTOR_DESCRIPTION}>Group by selector</option>
                        <option value="size" title={SIZE_DESCRIPTION}>Size</option>
                        <option value="hideAtom" title={HIDEATOM_DESCRIPTION}>Hide Atom</option>
                    </select>
                    {isNegatable && (
                        <div className="negation-toggle" title="Toggle whether this constraint is negated">
                            <button
                                type="button"
                                className={`negation-toggle__option ${!isNegated ? 'negation-toggle__option--active' : ''}`}
                                onClick={() => { if (isNegated) handleHoldToggle(); }}
                            >
                                Holds
                            </button>
                            <button
                                type="button"
                                className={`negation-toggle__option negation-toggle__option--never ${isNegated ? 'negation-toggle__option--active' : ''}`}
                                onClick={() => { if (!isNegated) handleHoldToggle(); }}
                            >
                                Never
                            </button>
                        </div>
                    )}
                </div>
                <button className="closeButton" title="Remove constraint" aria-label="Remove constraint" type="button" onClick={(e) => { e.stopPropagation(); props.onRemove(); }}>
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            {!isCollapsed && (
                <>
                    <div className="params">
                        {renderSelectorComponent(props.constraintData.type, props.constraintData, props.onUpdate)}
                    </div>
                    <div className="commentSection">
                        {isEditingComment || props.constraintData.comment ? (
                            <input
                                type="text"
                                className="commentInput"
                                placeholder="Add a note..."
                                value={props.constraintData.comment || ''}
                                onChange={handleCommentChange}
                                onFocus={() => setIsEditingComment(true)}
                                onBlur={() => setIsEditingComment(false)}
                            />
                        ) : (
                            <button
                                type="button"
                                className="addCommentButton"
                                onClick={() => setIsEditingComment(true)}
                            >
                                + Add note
                            </button>
                        )}
                    </div>
                </>
            )}
            {isCollapsed && props.constraintData.comment && (
                <div className="collapsedComment" title={props.constraintData.comment}>
                    {props.constraintData.comment.length > 30
                        ? props.constraintData.comment.slice(0, 30) + '...'
                        : props.constraintData.comment}
                </div>
            )}
        </div>
    )
}

export { ConstraintCard };