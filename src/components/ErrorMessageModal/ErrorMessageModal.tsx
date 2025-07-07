import React from 'react';
import { ErrorMessages } from '../../layout/constraint-validator';
import './ErrorMessageModal.css';

interface ErrorMessageModalProps {
  messages: ErrorMessages;
}

const ErrorMessageModal: React.FC<ErrorMessageModalProps> = (
  props: ErrorMessageModalProps
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

  return (
    <div id="error-message-modal" className="mt-3 d-flex gap-3 overflow-x-auto">
      <div className="card m-auto error-card">
        <div className="card-header bg-light">
          <strong>In terms of CnD</strong>
        </div>
        <div className="card-body">
          Constraint: <br />
          <code dangerouslySetInnerHTML={{__html: props.messages.conflictingSourceConstraint}}></code> <br />
          conflicts with one (or some) the following source constraints: <br />
          {[...props.messages.minimalConflictingConstraints.keys()].map(
            (key: string, index) => {
              console.log(
                `Key: ${key}, Value: ${props.messages.minimalConflictingConstraints.get(key)}`
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
      <div className="card m-auto error-card">
        <div className="card-header bg-light">
          <strong>In terms of diagram elements</strong>
        </div>
        <div className="card-body">
          Constraint: <br />{' '}
          <code> {props.messages.conflictingConstraint} </code>
          <br /> conflicts with the following constraints: <br />
          {[...props.messages.minimalConflictingConstraints.values()].map(
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
  );
};

export { ErrorMessageModal };
