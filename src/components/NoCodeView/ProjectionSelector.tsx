import React, { useCallback } from 'react';
import { DirectiveData } from './interfaces';

interface ProjectionSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for projection directive.
 * Specifies a signature to project.
 */
export const ProjectionSelector: React.FC<ProjectionSelectorProps> = (props: ProjectionSelectorProps) => {
  const handleInputChange = useCallback((event) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value
      }
    });
  }, [props.onUpdate, props.directiveData.params]);

  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <span className="input-group-text">Sig</span>
      </div>
      <input
        type="text"
        className="form-control"
        name="sig"
        onChange={handleInputChange}
        required
      />
    </div>
  );
};
