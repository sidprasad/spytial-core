import React, { useCallback, useEffect, useRef, useState } from 'react';
import './CndLayoutInterface.css';
import { NoCodeView } from './NoCodeView/NoCodeView';
import { ConstraintData, DirectiveData } from './NoCodeView/interfaces';
import { CodeView, generateLayoutSpecYaml } from './NoCodeView/CodeView';

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
  /** Default/initial YAML value to populate the editor with */
  defaultValue?: string;
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
  defaultValue,
}) => {
  // Track if we've applied the default value to avoid re-applying on every render
  const hasAppliedDefault = useRef(false);
  
  // Undo/Redo state - store the previous snapshot
  // We store the full state: yaml + constraints + directives
  interface Snapshot {
    yaml: string;
    constraints: ConstraintData[];
    directives: DirectiveData[];
  }
  
  const [undoSnapshot, setUndoSnapshot] = useState<Snapshot | null>(null);
  const [redoSnapshot, setRedoSnapshot] = useState<Snapshot | null>(null);
  const isUndoRedoAction = useRef(false);
  const lastSnapshotRef = useRef<string>(''); // JSON string of last snapshot for comparison

  // Apply default value on mount if provided and yamlValue is empty
  useEffect(() => {
    if (defaultValue && !hasAppliedDefault.current && !yamlValue) {
      hasAppliedDefault.current = true;
      onChange(defaultValue);
    }
  }, [defaultValue, yamlValue, onChange]);

  /**
   * Get current state as a snapshot
   */
  const getCurrentSnapshot = useCallback((): Snapshot => {
    // In No Code View, generate YAML from constraints/directives for consistency
    const currentYaml = isNoCodeView 
      ? generateLayoutSpecYaml(constraints, directives)
      : yamlValue;
    return {
      yaml: currentYaml,
      constraints: JSON.parse(JSON.stringify(constraints)), // Deep clone
      directives: JSON.parse(JSON.stringify(directives)),   // Deep clone
    };
  }, [isNoCodeView, yamlValue, constraints, directives]);

  /**
   * Save current state to undo stack (called before making changes)
   */
  const saveToUndo = useCallback(() => {
    if (isUndoRedoAction.current) return;
    
    const snapshot = getCurrentSnapshot();
    const snapshotStr = JSON.stringify(snapshot);
    
    // Only save if state actually changed
    if (snapshotStr !== lastSnapshotRef.current) {
      setUndoSnapshot({
        yaml: lastSnapshotRef.current ? JSON.parse(lastSnapshotRef.current).yaml : '',
        constraints: lastSnapshotRef.current ? JSON.parse(lastSnapshotRef.current).constraints : [],
        directives: lastSnapshotRef.current ? JSON.parse(lastSnapshotRef.current).directives : [],
      });
      setRedoSnapshot(null); // Clear redo when new changes are made
      lastSnapshotRef.current = snapshotStr;
    }
  }, [getCurrentSnapshot]);

  // Track changes and save to undo - debounced to avoid too many snapshots
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      // Update last snapshot after undo/redo
      lastSnapshotRef.current = JSON.stringify(getCurrentSnapshot());
      return;
    }

    // Debounce: wait 500ms after last change before saving snapshot
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      const snapshot = getCurrentSnapshot();
      const snapshotStr = JSON.stringify(snapshot);
      
      if (lastSnapshotRef.current && snapshotStr !== lastSnapshotRef.current) {
        // Save the PREVIOUS state to undo
        const prevSnapshot = JSON.parse(lastSnapshotRef.current) as Snapshot;
        setUndoSnapshot(prevSnapshot);
        setRedoSnapshot(null);
      }
      lastSnapshotRef.current = snapshotStr;
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [yamlValue, constraints, directives, getCurrentSnapshot]);

  // Initialize lastSnapshotRef on mount
  useEffect(() => {
    if (!lastSnapshotRef.current) {
      lastSnapshotRef.current = JSON.stringify(getCurrentSnapshot());
    }
  }, []);

  /**
   * Handle undo action - restore the previous state
   */
  const handleUndo = useCallback(() => {
    if (!undoSnapshot || disabled) return;
    
    isUndoRedoAction.current = true;
    
    // Save current state to redo before undoing
    setRedoSnapshot(getCurrentSnapshot());
    
    // Restore the undo snapshot
    onChange(undoSnapshot.yaml);
    setConstraints(() => undoSnapshot.constraints);
    setDirectives(() => undoSnapshot.directives);
    
    // Clear undo
    setUndoSnapshot(null);
  }, [undoSnapshot, disabled, getCurrentSnapshot, onChange, setConstraints, setDirectives]);

  /**
   * Handle redo action - restore the state before undo
   */
  const handleRedo = useCallback(() => {
    if (!redoSnapshot || disabled) return;
    
    isUndoRedoAction.current = true;
    
    // Save current state to undo before redoing
    setUndoSnapshot(getCurrentSnapshot());
    
    // Restore the redo snapshot
    onChange(redoSnapshot.yaml);
    setConstraints(() => redoSnapshot.constraints);
    setDirectives(() => redoSnapshot.directives);
    
    // Clear redo
    setRedoSnapshot(null);
  }, [redoSnapshot, disabled, getCurrentSnapshot, onChange, setConstraints, setDirectives]);

  /**
   * Handle toggle switch change
   * @param event - The change event from the toggle input
   */
  const handleToggleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!event.target.checked) {
      // If switching to Code View, generate YAML from current constraints/directives
      const generatedYaml = generateLayoutSpecYaml(constraints, directives);
      onChange(generatedYaml);
    }

    onViewChange(event.target.checked);
  }, [disabled, onViewChange, onChange, constraints, directives]);

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
    <section id="cnd-layout-interface-container" className={containerClasses} aria-label={ariaLabel}>
      <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
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
              role='switch'
            />
            <span className="cnd-layout-interface__toggle-slider"></span>
          </label>
          
          <span className={toggleLabelNoCodeClasses}>
            No Code View
          </span>
        </div>

        {/* Undo/Redo buttons */}
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="cnd-layout-interface__undo-btn"
            onClick={handleUndo}
            disabled={disabled || !undoSnapshot}
            aria-label="Undo last change"
            title="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            className="cnd-layout-interface__redo-btn"
            onClick={handleRedo}
            disabled={disabled || !redoSnapshot}
            aria-label="Redo last change"
            title="Redo"
          >
            ↷
          </button>
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
          <CodeView constraints={constraints} directives={directives} yamlValue={yamlValue} handleTextareaChange={handleTextareaChange} disabled={disabled}/>
        )}
      </div>
    </section>
  );
};

/**
 * Named export for better tree-shaking support following spytial-core guidelines
 * Avoids default exports to improve bundler optimization
 */
export { CndLayoutInterface };
