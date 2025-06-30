import React from 'react';

interface ProjectionSelectorProps {
  /** Signature name */
  sig?: string;
  /** Callback when sig changes */
  onSigChange?: (value: string) => void;
}

/**
 * Minimal React component for projection directive.
 * Specifies a signature to project.
 */
export const ProjectionSelector: React.FC<ProjectionSelectorProps> = ({
  sig = '',
  onSigChange
}) => {
  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <span className="input-group-text">Sig</span>
      </div>
      <input
        type="text"
        className="form-control"
        name="sig"
        value={sig}
        onChange={(e) => onSigChange?.(e.target.value)}
        required
      />
    </div>
  );
};
