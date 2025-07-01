import React, { useCallback } from 'react';
import './CndLayoutInterface.css';
import { NoCodeView } from './NoCodeView/NoCodeView';
import { ConstraintData, DirectiveData } from './NoCodeView/interfaces';
import { CodeView } from './NoCodeView/CodeView';

/**
 * Configuration options for the CND Layout Interface component
 */
export interface CndLayoutInterfaceProps {
  /** Current YAML value */
  yamlValue: string;
  /** Callback when YAML value changes */
  onChange: (value: string) => void;
  /** Whether to show No Code View */
  isNoCodeView: boolean;
  /** Callback when view mode changes */
  onViewChange: (isNoCodeView: boolean) => void;
  /** Constraints */
  constraints: ConstraintData[];
  /** Callback to update constraints */
  setConstraints: (updater: (prev: ConstraintData[]) => ConstraintData[]) => void;
  /** Directives */
  directives: DirectiveData[];
  /** Callback to update directives */
  setDirectives: (updater: (prev: DirectiveData[]) => DirectiveData[]) => void;
  /** Additional CSS class name */
  className?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** ARIA label for accessibility */
  'aria-label'?: string;
}

/**
 * CND Layout Interface component with toggle between Code View and No Code View
 * 
 * Provides a toggle interface for CND layout specification editing:
 * - Code View: Text area for direct YAML editing
 * - No Code View: Visual interface for constraint/directive editing (placeholder)
 * 
 * This is a controlled component that requires parent state management.
 * 
 * @example
 * ```tsx
 * <CndLayoutInterface
 *   value={yamlValue}
 *   onChange={setYamlValue}
 *   isNoCodeView={isVisual}
 *   onViewChange={setIsVisual}
 * />
 * ```
 */
const CndLayoutInterface: React.FC<CndLayoutInterfaceProps> = ({
  yamlValue,
  onChange,
  isNoCodeView,
  onViewChange,
  constraints,
  setConstraints,
  directives,
  setDirectives,
  className = '',
  disabled = false,
  'aria-label': ariaLabel = 'CND Layout Specification Interface',
}) => {
  /**
   * Handle toggle switch change
   * @param event - The change event from the toggle input
   */
  const handleToggleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    onViewChange?.(event.target.checked);
  }, [disabled, onViewChange]);

  /**
   * Handle textarea value change with proper event handling
   * Optimized for performance with useCallback memoization
   * 
   * @param event - The change event from the textarea
   */
  const handleTextareaChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    onChange(event.target.value);
  }, [disabled, onChange]);

  // Build CSS classes combining Bootstrap and custom styles for optimal tree-shaking
  const containerClasses = [
    'cnd-layout-interface',
    'container-fluid', // Bootstrap fluid container
    disabled && 'cnd-layout-interface--disabled',
    className,
  ].filter(Boolean).join(' ');

  const toggleLabelCodeClasses = [
    'cnd-layout-interface__toggle-label',
    'small', // Bootstrap small text
    !isNoCodeView && 'text-primary fw-semibold', // Bootstrap active styling
  ].filter(Boolean).join(' ');

  const toggleLabelNoCodeClasses = [
    'cnd-layout-interface__toggle-label',
    'small', // Bootstrap small text
    isNoCodeView && 'text-primary fw-semibold', // Bootstrap active styling
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} aria-label={ariaLabel}>
      {/* Header with Bootstrap flex utilities */}
      <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
        <label htmlFor="cnd-layout-toggle" className="h6 mb-0 text-dark">
          CND Layout Specification ({isNoCodeView ? 'No Code' : 'Code'} View):
        </label>
        
        {/* Toggle container with Bootstrap spacing */}
        <div className="d-flex align-items-center gap-3">
          <span className={toggleLabelCodeClasses}>
            Code View
          </span>
          
          <label className="cnd-layout-interface__toggle" htmlFor="cnd-layout-toggle">
            <input
              id="cnd-layout-toggle"
              type="checkbox"
              checked={isNoCodeView}
              onChange={handleToggleChange}
              disabled={disabled}
              className="cnd-layout-interface__toggle-input"
              aria-describedby="cnd-layout-toggle-description"
            />
            <span className="cnd-layout-interface__toggle-slider"></span>
          </label>
          
          <span className={toggleLabelNoCodeClasses}>
            No Code View
          </span>
        </div>
      </div>

      {/* Hidden description for screen readers - Bootstrap sr-only utility */}
      <div id="cnd-layout-toggle-description" className="visually-hidden">
        Toggle between Code View (text editor) and No Code View (visual editor) for CND layout specification
      </div>

      {/* Content area with Bootstrap styling */}
      <div className="cnd-layout-interface__content">
        {isNoCodeView ? (
          // No Code View - Bootstrap card layout
          <NoCodeView yamlValue={yamlValue} constraints={constraints} setConstraints={setConstraints} directives={directives} setDirectives={setDirectives}/>
        ) : (
          // Code View - Bootstrap form styling
          <CodeView constraints={constraints} directives={directives} yamlValue={yamlValue} handleTextareaChange={handleTextareaChange}/>
        )}
      </div>
    </div>
  );
};

/**
 * Named export for better tree-shaking support following cnd-core guidelines
 * Avoids default exports to improve bundler optimization
 */
export { CndLayoutInterface };
