import React, { useCallback, useState } from 'react'
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
import { DirectiveData } from './interfaces';
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

const DirectiveCard: React.FC<DirectiveCardProps> = (props: DirectiveCardProps) => {
    const directiveToSelectorComponentMap: Record<DirectiveData['type'], React.JSX.Element> = {
        "attribute": <AttributeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "hideField": <HideFieldSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "hideAtom": <HideAtomSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "icon": <IconSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "atomColor": <ColorAtomSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "edgeColor": <ColorEdgeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "size": <SizeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "projection": <ProjectionSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "flag": <FlagSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
        "inferredEdge": <HelperEdgeSelector directiveData={props.directiveData} onUpdate={props.onUpdate}/>,
    }

    const [cardHTML, setCardHTML] = useState<React.JSX.Element>(directiveToSelectorComponentMap[props.directiveData.type]);

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

        // Directive Fields
        // TODO: Refactor to use a mapping object instead of if-else chain
        // This way, the initial type can also use this mapping
        setCardHTML(directiveToSelectorComponentMap[selectedValue]);
        
        // Call the parent callback with the new directive type
        props.onUpdate({ type: selectedValue, params: {} })
    }, [props.onUpdate, props.directiveData]);

    const classes = [
        isHighlighted && 'highlight',
        'noCodeCard',
    ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
        <button className="closeButton" title="Remove directive" type="button" onClick= { props.onRemove }>
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
            { cardHTML }
        </div>
    </div>
  )
}

export { DirectiveCard }