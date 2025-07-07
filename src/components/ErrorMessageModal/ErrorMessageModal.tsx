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

  const addHighlightOnMouseEnter = (e: React.MouseEvent<HTMLCodeElement>) => {
    if (e.currentTarget.className.startsWith('error-message-')) {
      const constraintId = e.currentTarget.className.replace('error-message-', '');
      const correspondingElements = document.querySelectorAll(
        `[class^="error-message-${constraintId}"]`);
      correspondingElements.forEach((element) => {
        element.classList.add('highlight');
      });
    }
  };

  const removeHighlightOnMouseLeave = (
    e: React.MouseEvent<HTMLCodeElement>
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
  const isSystemError = systemError && (systemError.type === 'parse-error' || systemError.type === 'general-error');
  if (!isSystemError && !messages) {
    console.error('SystemError is of invalid type:', systemError);
    return null; // Nothing to display
  }

  return (
    <div id="error-message-modal" className="mt-3 d-flex flex-column overflow-x-auto p-3 rounded border border-danger border-2">
      <h4 style={{color: 'var(--bs-danger)'}}>Could not produce a diagram</h4>
      <p>The instance being visualized is inconsistent with the Cope and Drag spec.</p>
      {/* Parse Error Card */}
      {isSystemError && (
        <>
          <div className="card error-card">
            <div className="card-header bg-light">
              <strong>
                {systemError.type === 'parse-error' && systemError.source 
                  ? `Parse Error (${systemError.source})`
                  : 'Error'
                }
              </strong>
            </div>
            <div className="card-body">
              <code dangerouslySetInnerHTML={{ __html: systemError.message }}></code>
            </div>
          </div>
        </>
      )}

      {/* Constraint Error Cards */}
      { messages && (
        <>
          <p><i>The graph below visualizes the localized area of the error on a valid instance with the conflicting set of constraints removed.</i></p>
          <div className="d-flex flex-row gap-3">
            <div className="card error-card">
              <div className="card-header bg-light">
                <strong>In terms of CnD</strong>
              </div>
              <div className="card-body">
                Constraint: <br />
                <code dangerouslySetInnerHTML={{__html: messages.conflictingSourceConstraint}}></code> <br />
                conflicts with one (or some) the following source constraints: <br />
                {[...messages.minimalConflictingConstraints.keys()].map(
                  (key: string, index) => {
                    console.log(
                      `Key: ${key}, Value: ${messages.minimalConflictingConstraints.get(key)}`
                    );
                    return (
                      <React.Fragment key={index}>
                        <code
                          onMouseEnter={addHighlightOnMouseEnter}
                          onMouseLeave={removeHighlightOnMouseLeave}
                          className={`error-message-${index}`}
                          dangerouslySetInnerHTML={{__html: key }}
                        >
                        </code>
                        <br />
                      </React.Fragment>
                    );
                  }
                )}
              </div>
            </div>

            <div className="card error-card">
              <div className="card-header bg-light">
                <strong>In terms of diagram elements</strong>
              </div>
              <div className="card-body">
                Constraint: <br />{' '}
                <code> {messages.conflictingConstraint} </code>
                <br /> conflicts with the following constraints: <br />
                {[...messages.minimalConflictingConstraints.values()].map(
                  (value, index1) => (
                    <React.Fragment key={index1}>
                      {value.map((constraint: string, index2) => (
                        <code
                          key={`${index1} ${index2}`}
                          onMouseEnter={addHighlightOnMouseEnter}
                          onMouseLeave={removeHighlightOnMouseLeave}
                          className={`error-message-${index1}`}
                        >
                          {constraint}
                        </code>
                      ))}
                    </React.Fragment>
                  )
                )}
              </div>
            </div>
          </div>
        </>
      )}
  </div>
  );
};
