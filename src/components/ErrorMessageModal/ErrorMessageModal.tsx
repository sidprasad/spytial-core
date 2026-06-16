import React, { useMemo, useState } from 'react';
import './ErrorMessageModal.css';
import { ErrorMessages, SystemError, SelectorErrorDetail } from './index';

/**
 * Props for ErrorMessageModal component
 * @public
 */
export interface ErrorMessageModalProps {
  /** Error object containing  */
  systemError?: SystemError;
  /**
   * Optional id of a `webcola-cnd-graph` element. When provided, hovering a
   * conflicting constraint highlights the referenced nodes in that diagram
   * (via the graph's public `highlightNodes` / `clearNodeHighlights` API).
   */
  graphElementId?: string;
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
export const ErrorMessageModal: React.FC<ErrorMessageModalProps> = ({ systemError, graphElementId }: ErrorMessageModalProps) => {
  const [highlightState, setHighlightState] = useState<HighlightState>({ ids: [], source: null });
  const [collapsed, setCollapsed] = useState(false);

  /** Minimal shape of the graph element's node-highlighting API */
  type GraphHighlightElement = HTMLElement & {
    highlightNodes?: (nodeIds: string[]) => boolean;
    clearNodeHighlights?: () => boolean;
  };

  /**
   * Highlight the diagram nodes referenced inside a hovered constraint item.
   * Node references carry a `data-node-id` attribute (see formatNodeLabel), so
   * we read them straight from the rendered DOM rather than parsing text.
   */
  const highlightGraphNodesFrom = (el: HTMLElement) => {
    if (!graphElementId) return;
    const graph = document.getElementById(graphElementId) as GraphHighlightElement | null;
    if (!graph || typeof graph.highlightNodes !== 'function') return;
    const ids = Array.from(el.querySelectorAll('[data-node-id]'))
      .map(n => n.getAttribute('data-node-id'))
      .filter((id): id is string => !!id);
    if (ids.length > 0) graph.highlightNodes(Array.from(new Set(ids)));
  };

  /** Clear any diagram node highlights this modal applied */
  const clearGraphNodeHighlights = () => {
    if (!graphElementId) return;
    const graph = document.getElementById(graphElementId) as GraphHighlightElement | null;
    if (graph && typeof graph.clearNodeHighlights === 'function') graph.clearNodeHighlights();
  };

  /**
   * Scroll a hovered item's correspondence into view in the *other* column.
   * The two columns scroll independently, so this reveals the related item
   * without disturbing the column the cursor is over — hover a source
   * constraint and the diagram column scrolls to its correspondence.
   */
  const scrollRelatedIntoView = (el: HTMLElement, relatedIds: string[]) => {
    if (relatedIds.length === 0) return;
    const container = el.closest('.constraint-columns');
    const target = container?.querySelector(`[data-constraint-id="${relatedIds[0]}"]`) as HTMLElement | null;
    // Feature-detect: scrollIntoView is absent in jsdom (tests) and some hosts
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  };

  /** Handle mouse enter for constraint highlighting */
  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>, node: ConstraintNode, source: 'source' | 'diagram') => {
    setHighlightState({ ids: [node.id, ...node.relatedIds], source });
    highlightGraphNodesFrom(e.currentTarget);
    scrollRelatedIntoView(e.currentTarget, node.relatedIds);
  };

  /**
   * Clear highlighting on mouse leave
  */
  const handleMouseLeave = () => {
    setHighlightState({ ids: [], source: null });
    clearGraphNodeHighlights();
  };

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
  const isPositionalError = systemError && (systemError.type === 'positional-error' || systemError.type === 'hidden-node-conflict') && systemError.messages;
  const isHiddenNodeError = systemError && systemError.type === 'hidden-node-conflict';
  const isSelectorError = systemError && systemError.type === 'selector-error' && systemError.errors?.length > 0;
  
  // If not a valid error, log error and return null
  if (!isOtherError && !isPositionalError && !isSelectorError) {
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
    } else if (errorType === 'selector-error') {
      return `Selector Error${systemError.errors.length > 1 ? 's' : ''} (${systemError.errors.length})`;
    } else {
      return 'Error';
    }
  }, [systemError]);

  
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

  // Compute header and description based on error type
  const headerText = useMemo(() => {
    if (isSelectorError) return 'Selector Evaluation Error';
    if (isOtherError) return 'Error';
    if (isHiddenNodeError) return 'Hidden Node Conflict';
    return 'Could not satisfy all constraints';
  }, [isSelectorError, isOtherError, isHiddenNodeError]);

  const descriptionText = useMemo(() => {
    if (isSelectorError) return 'One or more selectors in your layout specification could not be evaluated.';
    if (isOtherError) return 'An error occurred while processing your data.';
    if (isHiddenNodeError) return 'Some layout constraints reference atoms hidden by a hideAtom directive. Those atoms have been re-introduced into the diagram (shown despite the hide) so the relationships can be drawn. Re-introduced atoms are outlined with a dashed border.';
    return 'Your data causes the following visualization constraints to conflict.';
  }, [isSelectorError, isOtherError, isHiddenNodeError]);

  return (
    <div id="error-message-modal" className="mt-3 d-flex flex-column overflow-x-auto p-3 rounded border border-danger border-2">
      <div className="error-modal-header d-flex justify-content-between align-items-center">
        <h4 className="mb-0" style={{color: 'var(--bs-danger)'}}>{headerText}</h4>
        <button
          type="button"
          className="error-modal-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand error details' : 'Collapse error details'}
          title={collapsed ? 'Expand error details' : 'Collapse error details'}
          onClick={() => setCollapsed(c => !c)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <>
      <p>{descriptionText}</p>
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
          <p id="hover-instructions">Hover over the {isHiddenNodeError ? 'constraints' : 'conflicting constraints'} to see the corresponding diagram elements{isHiddenNodeError ? ' that were affected' : ' that cannot be visualized'}. </p>
          <div className="constraint-relationship-table">
            <div className="constraint-columns">
              <div className="constraint-column">
                <div className="constraint-column-header">Source Constraints</div>
                <div className="constraint-column-body source-constraints-cell">
                  {sourceConstraints.map(node => (
                    <div
                      key={node.id}
                      data-constraint-id={node.id}
                      className={`constraint-item ${getHighlightClass(node.id)}`}
                      onMouseEnter={(e) => handleMouseEnter(e, node, 'source')}
                      onMouseLeave={handleMouseLeave}
                    >
                      <code dangerouslySetInnerHTML={{ __html: node.content }}></code>
                    </div>
                  ))}
                </div>
              </div>
              <div className="constraint-column">
                <div className="constraint-column-header">Diagram Elements</div>
                <div className="constraint-column-body diagram-constraints-cell">
                  {diagramConstraints.map(node => (
                    <div
                      key={node.id}
                      data-constraint-id={node.id}
                      className={`constraint-item ${getHighlightClass(node.id)}`}
                      onMouseEnter={(e) => handleMouseEnter(e, node, 'diagram')}
                      onMouseLeave={handleMouseLeave}
                    >
                      <code dangerouslySetInnerHTML={{ __html: node.content }}></code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Selector Error Cards */}
      {isSelectorError && (
        <>
          <div className="card error-card">
            <div className="card-header bg-light">
              <strong>{errorHeader}</strong>
            </div>
            <div className="card-body">
              <p className="mb-2">The following selectors failed to evaluate. Check your selector syntax.</p>
              <ul className="list-unstyled mb-0">
                {systemError.errors.map((selectorError: SelectorErrorDetail, idx: number) => (
                  <li key={idx} className="mb-2 p-2 bg-light rounded">
                    <div><strong>Selector:</strong> <code>{selectorError.selector}</code></div>
                    <div><strong>Context:</strong> {selectorError.context}</div>
                    <div className="text-danger"><strong>Error:</strong> {selectorError.errorMessage}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
        </>
      )}
  </div>
  );
};
