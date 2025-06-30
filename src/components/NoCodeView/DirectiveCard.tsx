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

/**
 * Directive types supported by the CND layout system
 * Following cnd-core TypeScript strict typing guidelines
 * 
 * @public
 */
type DirectiveType = 'attribute' | 'hideField' | 'icon' | 'atomColor' | 'edgeColor' | 'size' | 'projection' | 'flag' | 'inferredEdge';

/**
 * Configuration options for constraint card component
 * Designed for tree-shaking optimization and client-side performance
 * 
 * @public
 * @interface DirectiveCardProps
 */
interface DirectiveCardProps {
  /** Current Directive type selection */
  directiveType?: DirectiveType;
  /** Callback when Directive type changes */
  onDirectiveChange?: (directiveType: DirectiveType) => void;
  /** Callback when Directive is removed */
  onRemove: () => void;
  /** Additional CSS class name for styling */
  className?: string;
}

const DirectiveCard: React.FC<DirectiveCardProps> = (props: DirectiveCardProps) => {
    const [cardHTML, setCardHTML] = useState<React.JSX.Element>(<FlagSelector />); // FIXME: Better way to set default?

    const removeDirective = () => {

    };

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
            setCardHTML(<AttributeSelector />);
        } else if (selectedValue === "hideField") {
            setCardHTML(<HideFieldSelector />);
        } else if (selectedValue === "icon") {
            setCardHTML(<IconSelector />);
        } else if (selectedValue === "atomColor") {
            setCardHTML(<ColorAtomSelector />);
        } else if (selectedValue === "edgeColor") {
            setCardHTML(<ColorEdgeSelector />);
        } else if (selectedValue === "size") { 
            setCardHTML(<SizeSelector />);
        } else if (selectedValue === "projection") {
            setCardHTML(<ProjectionSelector />);
        } else if (selectedValue === "flag") {
            setCardHTML(<FlagSelector />);
        } else if (selectedValue === "inferredEdge") {
            setCardHTML(<HelperEdgeSelector />);
        }
        
        // Call the parent callback with the new directive type
        props.onDirectiveChange?.(selectedValue);
    }, [props.onDirectiveChange]);

  return (
    <>
        <button className="close" title="Remove directive" type="button" onClick= { removeDirective }>
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
    </>
  )
}

export { DirectiveCard }