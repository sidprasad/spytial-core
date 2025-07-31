import React, { useState } from 'react';
import './ErrorMessageModal.css';
import { ErrorMessages, SystemError } from './index';

/**
 * Props for ErrorMessageModal component
 * @public
 */
export interface ErrorMessageModalProps {
  /** Error messages for constraint conflicts */
  messages?: ErrorMessages;
  /** System error for parse/general errors */
  systemError?: SystemError;
}

/** Constraint node with bidirectional relationships */
type ConstraintNode = {
  id: string;
  content: string;
  relatedIds: string[];
};

/** Highlight state tracking */
type HighlightState = {
  ids: string[];
  source: 'source' | 'diagram' | null;
};

/**
 * Modal component for displaying error messages in a structured format
 * Supports both constraint conflicts and parse errors
 * @public
 */
export const ErrorMessageModal: React.FC<ErrorMessageModalProps> = ({ messages, systemError }: ErrorMessageModalProps) => {
  const [highlightState, setHighlightState] = useState<HighlightState>({ ids: [], source: null });

  /** Handle mouse enter for constraint highlighting */
  const handleMouseEnter = (node: ConstraintNode, source: 'source' | 'diagram') => {
    setHighlightState({ ids: [node.id, ...node.relatedIds], source });
  };

  /** 
   * Clear highlighting on mouse leave 
  */
  const handleMouseLeave = () => setHighlightState({ ids: [], source: null });

  /** 
   * Get CSS class for constraint highlighting 
  */
  const getHighlightClass = (nodeId: string): string => {
    if (!highlightState.ids.includes(nodeId)) return '';
    return highlightState.source === 'source' ? 'highlight-source' : 'highlight-diagram';
  };

  // Validate systemError type
  const isSystemError = systemError && 
    (systemError.type === 'parse-error' 
      || systemError.type === 'general-error' 
      || systemError.type === 'group-overlap-error'
    );
  
  // If neither messages nor positional error is provided, log error and return null
  if (!isSystemError && !messages) {
    console.error('SystemError is of invalid type:', systemError);
    return null; // Nothing to display
  }

  /** Helper function to generate error header */
  const generateErrorHeader = (systemError: SystemError): string => {
    const errorType = systemError.type;
    if (errorType === 'parse-error') {
      return `Parse Error ${systemError.source ? `(${systemError.source})` : ''}`;
    } else if (errorType === 'group-overlap-error') {
      return `Group Overlap Error ${systemError.source ? `(${systemError.source})` : ''}`;
    } else {
      return 'Error';
    }
  }

  /** 
   * Build conflicting constraints map from error messages 
  */
  const buildConstraintsMap = (): Map<string, string[]> => {
    if (!messages) return new Map();
    
    const map = new Map<string, string[]>();
    messages.minimalConflictingConstraints.forEach((value, key) => map.set(key, [...value]));
    
    // Add source constraint to its related diagram elements
    const relatedElements = map.get(messages.conflictingConstraint) || [];
    relatedElements.push(messages.conflictingConstraint);
    map.set(messages.conflictingSourceConstraint, relatedElements);
    
    return map;
  };

  /** 
   * Transform constraints map into structured data with bidirectional relationships 
  */
  const prepareConstraintData = (): { sourceConstraints: ConstraintNode[]; diagramConstraints: ConstraintNode[] } => {
    if (!messages) return { sourceConstraints: [], diagramConstraints: [] };
    
    const constraintsMap = buildConstraintsMap();
    const sourceConstraints: ConstraintNode[] = [];
    const diagramConstraints: ConstraintNode[] = [];
    const diagramMap = new Map<string, string>();
    
    // First pass to create diagram constraints with IDs
    [...constraintsMap.values()].forEach((constraints, groupIdx) => {
      constraints.forEach((content, idx) => {
        const id = `diagram-${groupIdx}-${idx}`;
        diagramMap.set(content, id);
        diagramConstraints.push({ id, content, relatedIds: [] });
      });
    });
    
    // Second pass to create source constraints with relationships
    [...constraintsMap.entries()].forEach(([sourceContent, relatedContents], idx) => {
      const id = `source-${idx}`;
      const relatedIds = relatedContents.map(content => diagramMap.get(content)!);
      
      sourceConstraints.push({ id, content: sourceContent, relatedIds });
      
      // Add back-references to diagram constraints
      relatedIds.forEach(relatedId => {
        const diagNode = diagramConstraints.find(d => d.id === relatedId);
        if (diagNode) diagNode.relatedIds.push(id);
      });
    });
    
    return { sourceConstraints, diagramConstraints };
  };

  const { sourceConstraints, diagramConstraints } = prepareConstraintData();

  return (
    <div id="error-message-modal" className="mt-3 d-flex flex-column overflow-x-auto p-3 rounded border border-danger border-2">
      <h4 style={{color: 'var(--bs-danger)'}}>Could not produce a diagram</h4>
      <p>Your instance cannot be visualized with the current CnD spec.</p>
      {/* Parse/Generic/Group Error Card */}
      {isSystemError && (
        <>
          <div className="card error-card">
            <div className="card-header bg-light">
              <strong>
                { generateErrorHeader(systemError) }
              </strong>
            </div>
            <div className="card-body">
              <code dangerouslySetInnerHTML={{ __html: systemError.message }}></code>
            </div>
          </div>
        </>
      )}

      {/* (Positional) Constraint Error Cards */}
      { messages && (
        <>
          <p>Hover over the conflicting constraints to see the corresponding diagram elements that cannot be visualized. </p>
          <div className="constraint-relationship-table">
            <table className="table table-bordered">
              <thead>
                <tr>
                  <th>Source Constraints</th>
                  <th>Diagram Elements</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="source-constraints-cell p-0">
                    {sourceConstraints.map(node => (
                      <div 
                        key={node.id}
                        data-constraint-id={node.id}
                        className={`constraint-item ${getHighlightClass(node.id)}`}
                        onMouseEnter={() => handleMouseEnter(node, 'source')}
                        onMouseLeave={handleMouseLeave}
                      >
                        <code dangerouslySetInnerHTML={{ __html: node.content }}></code>
                      </div>
                    ))}
                  </td>
                  <td className="diagram-constraints-cell p-0">
                    <div className="d-flex flex-column h-100">
                      {diagramConstraints.map(node => (
                        <div 
                          key={node.id}
                          data-constraint-id={node.id}
                          className={`constraint-item ${getHighlightClass(node.id)}`}
                          onMouseEnter={() => handleMouseEnter(node, 'diagram')}
                          onMouseLeave={handleMouseLeave}
                        >
                          <code dangerouslySetInnerHTML={{ __html: node.content }}></code>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
  </div>
  );
};
