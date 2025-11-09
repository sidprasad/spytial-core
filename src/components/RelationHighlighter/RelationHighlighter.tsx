import React, { useEffect, useRef, useState } from 'react';
import './RelationHighlighter.css';

interface RelationHighlighterProps {
  /** ID of the webcola-spytial-graph HTML element */
  graphElementId: string;
}

// Type for the webcola-spytial-graph element with its public API
interface WebColaGraphElement extends HTMLElement {
  highlightRelation(relationName: string): boolean;
  clearHighlightRelation(relationName: string): boolean;
  getAllRelations(): string[];
}

// Type for the relations-available custom event
interface RelationsAvailableEvent extends CustomEvent {
  detail: {
    relations: string[];
    count: number;
    timestamp: number;
    graphId: string;
  };
}

/**
 * Component that provides an interactive list of relations for highlighting in a WebCola graph.
 * Listens to the graph's custom events and provides hover-based relation highlighting.
 */
export const RelationHighlighter: React.FC<RelationHighlighterProps> = ({ 
  graphElementId 
}) => {
  // State for available relations and collapsible container
  const [relations, setRelations] = useState<string[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  // Ref to the webcola-spytial-graph element
  const graphElementRef = useRef<WebColaGraphElement | null>(null);

  useEffect(() => {
    // Get reference to the webcola-spytial-graph element
    const element = document.getElementById(graphElementId) as WebColaGraphElement | null;
    graphElementRef.current = element;
    
    if (!graphElementRef.current) {
      console.warn(`RelationHighlighter: Element with id "${graphElementId}" not found`);
      return;
    }

    // Event handler for relations-available custom event
    const handleRelationsAvailable = (event: unknown) => {
      const customEvent = event as RelationsAvailableEvent;
      const { relations: availableRelations } = customEvent.detail;
      setRelations(availableRelations || []);
    };

    // Attach event listener
    graphElementRef.current.addEventListener('relations-available', handleRelationsAvailable);

    // Cleanup function to remove event listener
    return () => {
      if (graphElementRef.current) {
        graphElementRef.current.removeEventListener('relations-available', handleRelationsAvailable);
      }
    };
  }, [graphElementId]);

  /**
   * Handle mouse enter on relation item - only highlight if within content area
   * Prevents highlighting when hovering over scrollbars
   */
  const handleRelationHover = (event: React.MouseEvent<HTMLLIElement>, relationName: string) => {
    const currentTarget = event.currentTarget;
    const parentList = currentTarget.parentElement;
    
    if (!parentList) return;
    
    // Get mouse position relative to the parent list
    const rect = parentList.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Only highlight if mouse is within the scrollable content area
    // clientWidth/clientHeight exclude scrollbars
    if (mouseX >= 0 && mouseX <= parentList.clientWidth && 
        mouseY >= 0 && mouseY <= parentList.clientHeight) {
      
      if (graphElementRef.current && typeof graphElementRef.current.highlightRelation === 'function') {
        graphElementRef.current.highlightRelation(relationName);
      }
    }
  };

  /**
   * Handle mouse leave on relation item - only clear if mouse leaves the entire list area
   * Prevents clearing when moving to scrollbars within the list
   */
  const handleRelationLeave = (relationName: string) => {
    // Clear highlighting when mouse truly leaves the list area
    if (graphElementRef.current && typeof graphElementRef.current.clearHighlightRelation === 'function') {
      graphElementRef.current.clearHighlightRelation(relationName);
    }
  };

  // Toggle collapsible container
  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <div className="relation-highlighter">
      {/* Collapsible header */}
      <div className="relation-highlighter-header" onClick={toggleCollapsed}>
        <h3 className="relation-highlighter-title">
          Relations ({relations.length})
        </h3>
        <button 
          className={`collapse-toggle ${isCollapsed ? 'collapsed' : ''}`}
          aria-label={isCollapsed ? 'Expand relations' : 'Collapse relations'}
        >
          ▼
        </button>
      </div>

      {/* Collapsible content */}
      <div className={`relation-highlighter-content ${isCollapsed ? 'collapsed' : ''}`}>
        {relations.length === 0 ? (
          <p className="no-relations">No relations available</p>
        ) : (
          <ul className="relation-list">
            {relations.map((relation) => (
              <li 
                key={relation}
                className="relation-item"
                onMouseEnter={(event) => handleRelationHover(event, relation)}
                onMouseLeave={() => handleRelationLeave(relation)}
              >
                {relation}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};