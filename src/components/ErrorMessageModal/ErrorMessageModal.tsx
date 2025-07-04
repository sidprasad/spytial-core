import React from 'react'
import { ErrorMessages } from '../../layout/constraint-validator'
import './ErrorMessageModal.css';

interface ErrorMessageModalProps {
    messages: ErrorMessages;
}

const ErrorMessageModal: React.FC<ErrorMessageModalProps> = (props: ErrorMessageModalProps) => {
  return (
    <div id="error-message-modal" className="mt-3 d-flex gap-3 overflow-x-auto">
        <div className="card m-auto error-card">
            <div className="card-header bg-light">
                <strong>In terms of CnD</strong>
            </div>
            <div className="card-body">
                Constraint: <br/> <code> {props.messages.conflictingConstraint} </code> <br/> conflicts with one (or some) the 
                following source constraints: <br/>


                ${ Object.keys(props.messages.minimalConflictingConstraints).map((key, index) => (
                    <>
                        <code key={index} className="highlight">{key}</code>
                        <br/>
                    </>
                ))}
            </div>
        </div>
        <div className="card m-auto error-card">
            <div className="card-header bg-light">
            <strong>In terms of diagram elements</strong>
            </div>
            <div className="card-body">
            

                Constraint: <br/> <code> {props.messages.conflictingConstraint} </code><br/> conflicts with the 
                following constraints: <br/>


                ${Object.values(props.messages.minimalConflictingConstraints).map((value) => (
                    <>
                        {value.map((constraint: string, index: number) => (
                            <code key={index} className="highlight">{constraint}</code>
                        ))}
                    </>
                ))}
            </div>
        </div>
    </div>
  )
}

export { ErrorMessageModal }