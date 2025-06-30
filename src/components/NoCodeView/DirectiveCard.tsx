import React, { useCallback, useState } from 'react'
import {
    AttributeSelector, 
    FlagSelector, 
    IconSelector, 
    SizeSelector, 
    ColorAtomSelector, 
    ColorEdgeSelector, 
    HideFieldSelector, 
    HelperEdgeSelector, 
    ProjectionSelector 
} from './index';
import { useHighlight } from './hooks';
import { DirectiveData } from './interfaces';

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

const DirectiveCard: React.FC<DirectiveCardProps> = (props: DirectiveCardProps) => {
    const [cardHTML, setCardHTML] = useState<React.JSX.Element>(<FlagSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);

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
        
        console.log('Select element value', selectedValue);

        // Directive Fields
        // TODO: Refactor to use a mapping object instead of if-else chain
        // This way, the initial type can also use this mapping
        if (selectedValue === "attribute") {
            setCardHTML(<AttributeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "hideField") {
            setCardHTML(<HideFieldSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "icon") {
            setCardHTML(<IconSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "atomColor") {
            setCardHTML(<ColorAtomSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "edgeColor") {
            setCardHTML(<ColorEdgeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "size") { 
            setCardHTML(<SizeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "projection") {
            setCardHTML(<ProjectionSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "flag") {
            setCardHTML(<FlagSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        } else if (selectedValue === "inferredEdge") {
            setCardHTML(<HelperEdgeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>);
        }
        
        // Call the parent callback with the new directive type
        props.onUpdate({ type: selectedValue, params: {} })
    }, [props.onUpdate, props.directiveData]);

    const classes = [
        isHighlighted && 'highlight',
    ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
        <button className="close" title="Remove directive" type="button" onClick= { props.onRemove }>
            <span aria-hidden="true">&times;</span>
        </button>
        <div className="input-group">
            <div className="input-group-prepend">
                <span className="input-group-text">Directive</span>
            </div>
            <select onChange={ updateFields }>
                <option value="flag">Visibility Flag</option>
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
            { cardHTML }
        </div>
    </div>
  )
}

export { DirectiveCard }