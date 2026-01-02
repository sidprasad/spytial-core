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
  /** Active editor tab: 'raw' or 'structured' */
  activeTab: 'raw' | 'structured';
  /** Callback when tab changes */
  onTabChange: (tab: 'raw' | 'structured') => void;
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
 * CND Layout Interface component with tabs for Raw Editor and Structured Editor
 * 
 * Provides a tabbed interface for CND layout specification editing:
 * - Raw Editor: Text area for direct YAML editing
 * - Structured Editor: Visual interface for constraint/directive editing
 * 
 * This is a controlled component that requires parent state management.
 * 
 * @example
 * ```tsx
 * <CndLayoutInterface
 *   value={yamlValue}
 *   onChange={setYamlValue}
 *   activeTab='structured'
 *   onTabChange={setActiveTab}
 * />
 * ```
 */
const CndLayoutInterface: React.FC<CndLayoutInterfaceProps> = ({
  yamlValue,
  onChange,
  activeTab,
  onTabChange,
  constraints,
  setConstraints,
  directives,
  setDirectives,
  className = '',
  disabled = false,
  'aria-label': ariaLabel = 'CND Layout Specification Interface',
}) => {
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

  /**
   * Get current state as a snapshot
   */
  const getCurrentSnapshot = useCallback((): Snapshot => {
    // In Structured Editor, generate YAML from constraints/directives for consistency
    const currentYaml = activeTab === 'structured'
      ? generateLayoutSpecYaml(constraints, directives)
      : yamlValue;
    return {
      yaml: currentYaml,
      constraints: JSON.parse(JSON.stringify(constraints)), // Deep clone
      directives: JSON.parse(JSON.stringify(directives)),   // Deep clone
    };
  }, [activeTab, yamlValue, constraints, directives]);

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
   * Handle tab click
   * @param tab - The tab to switch to
   */
  const handleTabClick = useCallback((tab: 'raw' | 'structured') => {
    if (disabled || tab === activeTab) return;

    if (tab === 'raw') {
      // If switching to Raw Editor, generate YAML from current constraints/directives
      const generatedYaml = generateLayoutSpecYaml(constraints, directives);
      onChange(generatedYaml);
    }

    onTabChange(tab);
  }, [disabled, activeTab, onTabChange, onChange, constraints, directives]);

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

  return (
    <section id="cnd-layout-interface-container" className={containerClasses} aria-label={ariaLabel}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        {/* Tabs */}
        <ul className="nav nav-tabs cnd-layout-interface__tabs" role="tablist">
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'raw' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'raw'}
              aria-controls="raw-editor-panel"
              id="raw-editor-tab"
              onClick={() => handleTabClick('raw')}
              disabled={disabled}
            >
              Raw Editor
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'structured' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'structured'}
              aria-controls="structured-editor-panel"
              id="structured-editor-tab"
              onClick={() => handleTabClick('structured')}
              disabled={disabled}
            >
              Structured Editor
            </button>
          </li>
        </ul>

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

      {/* Content area with Bootstrap styling */}
      <div className="tab-content cnd-layout-interface__content">
        <div
          className={`tab-pane fade ${activeTab === 'raw' ? 'show active' : ''}`}
          id="raw-editor-panel"
          role="tabpanel"
          aria-labelledby="raw-editor-tab"
        >
          {activeTab === 'raw' && (
            <CodeView constraints={constraints} directives={directives} yamlValue={yamlValue} handleTextareaChange={handleTextareaChange} disabled={disabled}/>
          )}
        </div>
        <div
          className={`tab-pane fade ${activeTab === 'structured' ? 'show active' : ''}`}
          id="structured-editor-panel"
          role="tabpanel"
          aria-labelledby="structured-editor-tab"
        >
          {activeTab === 'structured' && (
            <NoCodeView yamlValue={yamlValue} constraints={constraints} setConstraints={setConstraints} directives={directives} setDirectives={setDirectives}/>
          )}
        </div>
      </div>
    </section>
  );
};

/**
 * Named export for better tree-shaking support following spytial-core guidelines
 * Avoids default exports to improve bundler optimization
 */
export { CndLayoutInterface };
