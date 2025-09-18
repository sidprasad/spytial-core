import React, { useCallback } from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { ConstraintData } from '../interfaces';

interface AlignmentSelectorProps {
  /** Constraint data object containing type and parameters */
  constraintData: ConstraintData;
  /** Callback when constraint data is updated */
  onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

/**
 * React component for alignment constraint configuration.
 * Includes selector input and single-select direction dropdown for horizontal/vertical alignment.
 * 
 * Following cnd-core guidelines:
 * - Minimal, focused component
 * - TypeScript strict typing
 * - Functional component pattern
 * - Client-side optimized
 * 
 * @public
 */
export const AlignmentSelector: React.FC<AlignmentSelectorProps> = (props: AlignmentSelectorProps) => {
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: value
      }
    });
  }, [props]);

  const handleSelectChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: [value] // Wrap single value in array to match expected format
      }
    });
  }, [props]);

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>
            Selector
          </span>
        </div>
        <input
          type="text"
          name="selector"
          className="form-control code-input"
          defaultValue={props.constraintData.params.selector as string || ''}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Direction</span>
        </div>
        <select
          name="direction"
          className="form-control"
          defaultValue={
            Array.isArray(props.constraintData.params.direction) 
              ? (props.constraintData.params.direction as string[])[0] || ''
              : (props.constraintData.params.direction as string) || ''
          }
          onChange={handleSelectChange}
        >
          <option value="">Select direction...</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>
    </>
  );
};