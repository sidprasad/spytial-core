import React, { useCallback } from 'react';
import { DirectiveData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

interface ProjectionSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for projection specification.
 * Specifies a signature to project and optional ordering selector.
 */
export const ProjectionSelector: React.FC<ProjectionSelectorProps> = (props: ProjectionSelectorProps) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value
      }
    });
  };

  const handleSelectorChange = useCallback((event: SelectorChangeEvent) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value
      }
    });
  }, [props]);

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Sig</span>
        </div>
        <input
          type="text"
          className="form-control"
          name="sig"
          defaultValue={props.directiveData.params.sig as string || ''}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span 
            className="input-group-text infolabel" 
            title="Selector to determine atom ordering in projection controls. Should return (atom, sortKey) pairs."
          >
            Order By
          </span>
        </div>
        <SelectorInput
          name="orderBy"
          value={props.directiveData.params.orderBy as string || ''}
          onChange={handleSelectorChange}
          placeholder="Optional: e.g., Time -> next"
        />
      </div>
    </>
  );
};
