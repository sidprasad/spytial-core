import React, { useCallback } from 'react';
import styles from './CndLayoutInterface.module.css';

/**
 * Configuration options for the CND Layout Interface component
 */
export interface CndLayoutInterfaceProps {
  /** Current YAML value */
  value: string;
  /** Callback when YAML value changes */
  onChange: (value: string) => void;
  /** Whether to show No Code View */
  isNoCodeView: boolean;
  /** Callback when view mode changes */
  onViewChange: (isNoCodeView: boolean) => void;
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
export const CndLayoutInterface: React.FC<CndLayoutInterfaceProps> = ({
  value,
  onChange,
  isNoCodeView,
  onViewChange,
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
    onViewChange(event.target.checked);
  }, [disabled, onViewChange]);

  /**
   * Handle textarea value change
   * @param event - The change event from the textarea
   */
  const handleTextareaChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    onChange(event.target.value);
  }, [disabled, onChange]);

  // Combine CSS classes
  const containerClasses = [
    styles.container,
    className,
    disabled ? styles.disabled : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} aria-label={ariaLabel}>
      {/* Header with label and toggle switch */}
      <div className={styles.header}>
        <label htmlFor="cnd-layout-toggle" className={styles.mainLabel}>
          CND Layout Specification ({isNoCodeView ? 'No Code' : 'Code'} View):
        </label>
        
        <div className={styles.toggleContainer}>
          <span className={`${styles.toggleLabel} ${!isNoCodeView ? styles.active : ''}`}>
            Code View
          </span>
          
          <label className={styles.toggle} htmlFor="cnd-layout-toggle">
            <input
              id="cnd-layout-toggle"
              type="checkbox"
              checked={isNoCodeView}
              onChange={handleToggleChange}
              disabled={disabled}
              className={styles.toggleInput}
              aria-describedby="toggle-description"
            />
            <span className={styles.toggleSlider}></span>
          </label>
          
          <span className={`${styles.toggleLabel} ${isNoCodeView ? styles.active : ''}`}>
            No Code View
          </span>
        </div>
      </div>

      {/* Hidden description for screen readers */}
      <div id="toggle-description" className="sr-only">
        Toggle between Code View (text editor) and No Code View (visual editor) for CND layout specification
      </div>

      {/* Content area */}
      <div className={styles.content}>
        {isNoCodeView ? (
          // No Code View - Visual interface placeholder
          <div className={styles.noCodeView} role="region" aria-label="Visual CND Layout Editor">
            <div className={styles.placeholder}>
              <div className={styles.placeholderIcon}>🎨</div>
              <h3 className={styles.placeholderTitle}>Visual Layout Editor</h3>
              <p className={styles.placeholderText}>
                This visual interface for creating CND layout specifications will be integrated here.
                Switch to Code View to edit YAML directly.
              </p>
              <div className={styles.placeholderFeatures}>
                <div className={styles.feature}>📐 Constraint Editor</div>
                <div className={styles.feature}>🎯 Directive Builder</div>
                <div className={styles.feature}>🔧 Layout Tools</div>
              </div>
            </div>
          </div>
        ) : (
          // Code View - Text area for YAML editing
          <div className={styles.codeView} role="region" aria-label="YAML Code Editor">
            <textarea
              id="webcola-cnd"
              className={`form-control ${styles.textarea}`}
              value={value}
              onChange={handleTextareaChange}
              disabled={disabled}
              rows={12}
              spellCheck={false}
              aria-label="CND Layout Specification YAML"
              aria-describedby="yaml-help"
            />
            <div id="yaml-help" className={styles.helpText}>
              Enter your CND layout specification in YAML format. 
              Use the toggle above to switch to the visual editor.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CndLayoutInterface;
