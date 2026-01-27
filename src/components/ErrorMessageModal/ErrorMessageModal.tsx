import React, { useMemo, useState } from 'react';
import './ErrorMessageModal.css';
import { ErrorMessages, SystemError, QueryErrorDetails } from './index';

/**
 * Props for ErrorMessageModal component
 * @public
 */
export interface ErrorMessageModalProps {
  /** Error object containing  */
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
export const ErrorMessageModal: React.FC<ErrorMessageModalProps> = ({ systemError }: ErrorMessageModalProps) => {
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
  const isOtherError = systemError && 
    (systemError.type === 'parse-error' 
      || systemError.type === 'general-error' 
      || systemError.type === 'group-overlap-error'
    );
  const isPositionalError = systemError && systemError.type === 'positional-error' && systemError.messages;
  const isQueryError = systemError && systemError.type === 'query-error';
  
  // If not a valid error, log error and return null
  if (!isOtherError && !isPositionalError && !isQueryError) {
    console.error('Cannot display the following error:', systemError);
    return null;
  }

  /** Helper function to generate error header */
  const errorHeader = useMemo((): string => {
    const errorType = systemError.type;
    if (errorType === 'parse-error') {
      return `Parse Error ${systemError.source ? `(${systemError.source})` : ''}`;
    } else if (errorType === 'group-overlap-error') {
      return `Group Overlap Error ${systemError.source ? `(${systemError.source})` : ''}`;
    } else if (errorType === 'query-error') {
      const reason = systemError.details?.reason || 'unknown';
      switch (reason) {
        case 'hidden-element':
          return 'Query Error (Hidden Element)';
        case 'syntax-error':
          return 'Query Error (Syntax)';
        case 'missing-element':
          return 'Query Error (Missing Element)';
        default:
          return 'Query Error';
      }
    } else {
      return 'Error';
    }
  }, [systemError]);

  /** Helper function to get query error explanation */
  const getQueryErrorExplanation = (details: QueryErrorDetails): string => {
    switch (details.reason) {
      case 'hidden-element':
        return 'This error occurred because a selector references an element that has been hidden by a "hide" constraint. ' +
          'The hiding constraint is conflicting with another constraint that needs this element.';
      case 'syntax-error':
        return 'This error occurred due to a syntax error in the selector expression. Please check the selector syntax.';
      case 'missing-element':
        return 'This error occurred because a selector references an element that does not exist in the current data.';
      default:
        return 'An error occurred while evaluating a selector expression.';
    }
  };

  
  /** 
   * Transform constraints map into structured data with bidirectional relationships 
  */
  const constraintData = useMemo((): { sourceConstraints: ConstraintNode[]; diagramConstraints: ConstraintNode[] } => {
    const messages = isPositionalError ? systemError.messages : undefined;
    if (!messages) return { sourceConstraints: [], diagramConstraints: [] };

    function buildConstraintsMap(messages: ErrorMessages): Map<string, Set<string>> {
      const copy = new Map<string, Set<string>>();
      messages.minimalConflictingConstraints.forEach((value, key) => {
        if (!copy.has(key)) {
          copy.set(key, new Set());
        }
        value.forEach(val => copy.get(key)!.add(val));
      });

      // Add the source constraint itself
      if (!copy.has(messages.conflictingSourceConstraint)) {
        copy.set(messages.conflictingSourceConstraint, new Set([messages.conflictingConstraint]));
      } else {
        copy.get(messages.conflictingSourceConstraint)!.add(messages.conflictingConstraint);
      }

      return copy;
    }
    
    const constraintsMap = buildConstraintsMap(messages);
    const sourceConstraints: ConstraintNode[] = [];
    const diagramConstraints: ConstraintNode[] = [];
    const diagramMap = new Map<string, string>();
    
    // First pass to create diagram constraints with IDs
    [...constraintsMap.values()].forEach((constraints, groupIdx) => {
      [...constraints.values()].map((content, idx) => {
        const id = `diagram-${groupIdx}-${idx}`;
        diagramMap.set(content, id);
        diagramConstraints.push({ id, content, relatedIds: [] });
      });
    });
    
    // Second pass to create source constraints with relationships
    [...constraintsMap.entries()].forEach(([sourceContent, relatedContents], idx) => {
      const id = `source-${idx}`;
      const relatedIds = [...relatedContents.values()].map(content => diagramMap.get(content)!);
      
      sourceConstraints.push({ id, content: sourceContent, relatedIds });
      
      // Add back-references to diagram constraints
      relatedIds.forEach(relatedId => {
        const diagNode = diagramConstraints.find(d => d.id === relatedId);
        if (diagNode) diagNode.relatedIds.push(id);
      });
    });
    
    return { sourceConstraints, diagramConstraints };
  }, [systemError]);

  const { sourceConstraints, diagramConstraints } = constraintData;

  return (
    <div id="error-message-modal" className="mt-3 d-flex flex-column overflow-x-auto p-3 rounded border border-danger border-2">
      <h4 style={{color: 'var(--bs-danger)'}}>Could not satisfy all constraints</h4>
      <p>Your data causes the following visualization constraints to conflict.</p>
      {/* Parse/Generic/Group Error Card */}
      {isOtherError && (
        <>
          <div className="card error-card">
            <div className="card-header bg-light">
              <strong>
                { errorHeader }
              </strong>
            </div>
            <div className="card-body">
              <code dangerouslySetInnerHTML={{ __html: systemError.message }}></code>
            </div>
          </div>
        </>
      )}

      {/* (Positional) Constraint Error Cards */}
      { isPositionalError && (
        <>
          <p id="hover-instructions">Hover over the conflicting constraints to see the corresponding diagram elements that cannot be visualized. </p>
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

      {/* Query Error Card */}
      {isQueryError && (
        <>
          <div className="card error-card query-error-card">
            <div className="card-header bg-light">
              <strong>
                { errorHeader }
              </strong>
            </div>
            <div className="card-body">
              <p className="text-muted mb-2">
                {getQueryErrorExplanation(systemError.details)}
              </p>
              <div className="mb-2">
                <strong>Selector:</strong>{' '}
                <code>{systemError.details.selector}</code>
              </div>
              {systemError.details.missingElement && (
                <div className="mb-2">
                  <strong>Referenced Element:</strong>{' '}
                  <code>{systemError.details.missingElement}</code>
                </div>
              )}
              {systemError.details.sourceConstraint && (
                <div className="mb-2">
                  <strong>Source Constraint:</strong>{' '}
                  <code>{systemError.details.sourceConstraint}</code>
                </div>
              )}
              <div className="mt-3 p-2 bg-light rounded">
                <strong>Error Message:</strong>
                <code className="d-block mt-1" dangerouslySetInnerHTML={{ __html: systemError.message }}></code>
              </div>
            </div>
          </div>
        </>
      )}
  </div>
  );
};
