import React from 'react';
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

/**
 * Modal component for displaying error messages in a structured format
 * Supports both constraint conflicts and parse errors
 * @public
 */
export const ErrorMessageModal: React.FC<ErrorMessageModalProps> = (
  { messages, systemError }: ErrorMessageModalProps
) => {

  /**
   * Add a highlight class to elements on mouse enter
   * @param e React.MouseEvent<HTMLElement> 
   */
  const addHighlightOnMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (e.currentTarget.className.startsWith('error-message-')) {
      const constraintId = e.currentTarget.className.replace('error-message-', '');
      const correspondingElements = document.querySelectorAll(
        `[class^="error-message-${constraintId}"]`);
      correspondingElements.forEach((element) => {
        element.classList.add('highlight');
      });
    }
  };

  /**
   * Remove the highlight class from elements on mouse leave
   * @param e React.MouseEvent<HTMLElement>
   */
  const removeHighlightOnMouseLeave = (
    e: React.MouseEvent<HTMLElement>
  ) => {
    if (e.currentTarget.className.startsWith('error-message-')) {
      const constraintId = e.currentTarget.className.replace('error-message-', '');
      const correspondingElements = document.querySelectorAll(
        `[class^="error-message-${constraintId}"]`);
      correspondingElements.forEach((element) => {
        element.classList.remove('highlight');
      });
    }
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

  const getConflictingConstraintsMap = (): Map<string, string[]> => {
    if (!messages) return new Map();

    // Copy the minimalConflictingConstraints to a new Map
    const conflictingConstraintsMap = new Map<string, string[]>();
    messages.minimalConflictingConstraints.forEach((value, key) => {
      conflictingConstraintsMap.set(key, [...value]);
    });

    // Add the conflicting source constraint and diagram constraints to map
    const conflictingElements = conflictingConstraintsMap.get(messages.conflictingConstraint) || [];
    conflictingElements.push(messages.conflictingConstraint);
    conflictingConstraintsMap.set(messages.conflictingSourceConstraint, conflictingElements);

    return conflictingConstraintsMap;
  }

  const conflictingConstraintsMap = getConflictingConstraintsMap();

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
          <div className="d-flex flex-row gap-3 mb-3">
            <div className="card error-card">
              <div className="card-header bg-light">
                <strong>Set of conflicting CnD constraints</strong>
              </div>
              <div className="card-body">
                {[...conflictingConstraintsMap.keys()].map((sourceConstraint, index) => (
                    <React.Fragment key={index}>
                      <code
                        onMouseEnter={addHighlightOnMouseEnter}
                        onMouseLeave={removeHighlightOnMouseLeave}
                        className={`error-message-${index}`}
                      >
                        {sourceConstraint}
                      </code>
                      <br />
                    </React.Fragment>
                  ))
                }
              </div>
            </div>

            <div className="card error-card">
              <div className="card-header bg-light">
                <strong>Set of conflicting diagram elements</strong>
              </div>
              <div className="card-body">
                {[...conflictingConstraintsMap.values()].map((value, index1) => (
                    <React.Fragment key={index1}>
                      {value.map((constraint: string, index2) => (
                        <React.Fragment key={`${index1} ${index2}`}>
                          <code
                            onMouseEnter={addHighlightOnMouseEnter}
                            onMouseLeave={removeHighlightOnMouseLeave}
                            className={`error-message-${index1}`}
                          >
                            {constraint}
                          </code>
                          <br />
                        </React.Fragment>
                      ))}
                      <br />
                    </React.Fragment>
                  ))
                }
              </div>
            </div>
          </div>
        </>
      )}
  </div>
  );
};
