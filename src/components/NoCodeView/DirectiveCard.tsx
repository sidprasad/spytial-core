import React, { useCallback } from 'react'
import {
    AttributeSelector, 
    FlagSelector, 
    IconSelector, 
    SizeSelector, 
    ColorAtomSelector, 
    ColorEdgeSelector, 
    HideFieldSelector, 
    HideAtomSelector, 
    HelperEdgeSelector, 
    ProjectionSelector 
} from './index';
import { useHighlight } from './hooks';
import { DirectiveData, ConstraintData } from './interfaces';
import { DirectiveType } from './types';

/**
 * Configuration options for constraint card component
 * Designed for tree-shaking optimization and client-side performance
 * 
 * @public
 * @interface DirectiveCardProps
 */
interface DirectiveCardProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
  /** Callback when Directive is removed */
  onRemove: () => void;
  /** Additional CSS class name for styling */
  className?: string;
}

/**
 * Renders the appropriate selector component based on directive type
 * 
 * @param type - The directive type
 * @param directiveData - The directive data
 * @param onUpdate - Callback for updates
 * @returns The appropriate selector component
 */
const renderSelectorComponent = (
    type: DirectiveType,
    directiveData: DirectiveData,
    onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void
): React.JSX.Element => {
    // For dual-use selectors (size, hideAtom), cast the onUpdate to the expected type
    const dualUseOnUpdate = onUpdate as (updates: Partial<Omit<ConstraintData | DirectiveData, 'id'>>) => void;
    
    switch (type) {
        case 'attribute':
            return <AttributeSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        case 'hideField':
            return <HideFieldSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        case 'hideAtom':
            return <HideAtomSelector directiveData={directiveData} onUpdate={dualUseOnUpdate}/>;
        case 'icon':
            return <IconSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        case 'atomColor':
            return <ColorAtomSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        case 'edgeColor':
            return <ColorEdgeSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        case 'size':
            return <SizeSelector directiveData={directiveData} onUpdate={dualUseOnUpdate}/>;
        case 'projection':
            return <ProjectionSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        case 'flag':
            return <FlagSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        case 'inferredEdge':
            return <HelperEdgeSelector directiveData={directiveData} onUpdate={onUpdate}/>;
        default:
            return <FlagSelector directiveData={directiveData} onUpdate={onUpdate}/>;
    }
};

const DirectiveCard: React.FC<DirectiveCardProps> = (props: DirectiveCardProps) => {
    const { isHighlighted } = useHighlight(1000); // Highlight for 1 second

    /**
     * Handle directive type change with proper event typing
     * Accesses HTMLSelectElement through event.target with type safety
     * 
     * @param event - Change event from select element containing the HTMLSelectElement
     */
    const updateFields = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        // Access the HTMLSelectElement through event.target
        const selectElement = event.target;
        const selectedValue = selectElement.value as DirectiveType;
        
        // Call the parent callback with the new directive type and reset params
        props.onUpdate({ type: selectedValue, params: {} })
    }, [props.onUpdate]);

    const classes = [
        isHighlighted && 'highlight',
        'noCodeCard',
    ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
        <button className="closeButton" title="Remove directive" aria-label="Remove directive" type="button" onClick= { props.onRemove }>
            <span aria-hidden="true">&times;</span>
        </button>
        <div className="input-group">
            <div className="input-group-prepend">
                <span className="input-group-text">Directive</span>
            </div>
            <select onChange={ updateFields } value={ props.directiveData.type }>
                <option value="flag">Visibility Flag</option>
                <option value="hideAtom">Hide Atom</option>
                <option value="attribute">Attribute</option>
                <option value="hideField">Hide Field</option>
                <option value="icon">Icon</option>
                <option value="atomColor">Color (Atom)</option>
                <option value="edgeColor">Color (Edge)</option>
                <option value="size">Size</option>
                <option value="projection">Projection</option>
                <option value="inferredEdge">Inferred Edge</option>
            </select>
        </div>
        <div className="params">
            { renderSelectorComponent(props.directiveData.type, props.directiveData, props.onUpdate) }
        </div>
    </div>
  )
}

export { DirectiveCard }