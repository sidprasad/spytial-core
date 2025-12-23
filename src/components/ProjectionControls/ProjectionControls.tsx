import React from 'react';
import './ProjectionControls.css';

/**
 * Data structure for a single projection choice
 */
export interface ProjectionChoice {
  /** The type being projected */
  type: string;
  /** The currently selected atom to project on */
  projectedAtom: string;
  /** All available atoms for this type */
  atoms: string[];
}

/**
 * Props for the ProjectionControls component
 */
export interface ProjectionControlsProps {
  /** Projection data from layout generation */
  projectionData: ProjectionChoice[];
  /** Callback when a projection selection changes */
  onProjectionChange: (type: string, atomId: string) => void;
  /** Additional CSS class name */
  className?: string;
  /** Whether the controls are disabled */
  disabled?: boolean;
}

/**
 * ProjectionControls component
 * 
 * Displays dropdown selectors for each projected type in a Forge/Alloy instance.
 * Allows users to dynamically select which specific atom to project on for each
 * projected signature.
 * 
 * This component is specifically designed for Forge/Alloy contexts where projection
 * is a common operation. It examines the projected types and creates interactive
 * selectors for them.
 * 
 * @example
 * ```tsx
 * const projectionData = [
 *   { type: 'State', projectedAtom: 'State0', atoms: ['State0', 'State1', 'State2'] },
 *   { type: 'Process', projectedAtom: 'P1', atoms: ['P1', 'P2'] }
 * ];
 * 
 * <ProjectionControls
 *   projectionData={projectionData}
 *   onProjectionChange={(type, atomId) => {
 *     console.log(`Changed ${type} projection to ${atomId}`);
 *     // Update projections and regenerate layout
 *   }}
 * />
 * ```
 * 
 * @public
 */
export const ProjectionControls: React.FC<ProjectionControlsProps> = ({
  projectionData,
  onProjectionChange,
  className = '',
  disabled = false
}) => {
  // Don't render if there are no projections
  if (!projectionData || projectionData.length === 0) {
    return null;
  }

  return (
    <div 
      className={`projection-controls ${className}`}
      role="region"
      aria-label="Projection Controls"
    >
      <div className="projection-controls__header">
        <h3 className="projection-controls__title">Projections</h3>
        <p className="projection-controls__description">
          Select which atom to project for each type
        </p>
      </div>
      
      <div className="projection-controls__list">
        {projectionData.map((projection) => (
          <div 
            key={projection.type} 
            className="projection-controls__item"
          >
            <label 
              htmlFor={`projection-${projection.type}`}
              className="projection-controls__label"
            >
              {projection.type}
            </label>
            
            <select
              id={`projection-${projection.type}`}
              className="projection-controls__select"
              value={projection.projectedAtom}
              onChange={(e) => onProjectionChange(projection.type, e.target.value)}
              disabled={disabled || projection.atoms.length === 0}
              aria-label={`Select atom to project for ${projection.type}`}
            >
              {projection.atoms.length === 0 ? (
                <option value="">No atoms available</option>
              ) : (
                projection.atoms.map((atom) => (
                  <option key={atom} value={atom}>
                    {atom}
                  </option>
                ))
              )}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};
