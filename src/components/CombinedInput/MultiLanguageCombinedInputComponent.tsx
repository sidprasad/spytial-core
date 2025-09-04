/**
 * Multi-Language Combined Input Component
 * 
 * A spatial REPL component that supports multiple programming languages
 * (JavaScript, Python, Pyret) with the same layout interface and visualization.
 * 
 * This extends the original CombinedInputComponent to support different evaluators
 * and provides language-specific REPL interfaces.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PyretReplInterface } from '../ReplInterface/PyretReplInterface';
import { JavaScriptReplInterface } from '../ReplInterface/JavaScriptReplInterface';
import { PythonReplInterface } from '../ReplInterface/PythonReplInterface';
import { CndLayoutInterface } from '../CndLayoutInterface';
import { PyretDataInstance } from '../../data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../../data-instance/json-data-instance';
import { IInputDataInstance } from '../../data-instance/interfaces';
import { PyretEvaluator } from '../ReplInterface/parsers/PyretExpressionParser';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { ConstraintData, DirectiveData } from '../NoCodeView/interfaces';

export type SupportedLanguage = 'pyret' | 'javascript' | 'python';

export interface MultiLanguageCombinedInputConfig {
  /** Programming language for the REPL */
  language?: SupportedLanguage;
  /** Initial CnD specification */
  cndSpec?: string;
  /** Initial data instance (will be converted based on language) */
  dataInstance?: IInputDataInstance;
  /** External Pyret evaluator (only used for Pyret language) */
  pyretEvaluator?: PyretEvaluator;
  /** Projection atoms for layout generation */
  projections?: Record<string, any>;
  /** Container height (default: 600px) */
  height?: string;
  /** Container width (default: 100%) */
  width?: string;
  /** Whether to show layout interface (default: true) */
  showLayoutInterface?: boolean;
  /** Whether to auto-apply layout changes (default: true) */
  autoApplyLayout?: boolean;
  /** Custom styling */
  style?: React.CSSProperties;
  /** CSS class name */
  className?: string;
}

export interface MultiLanguageCombinedInputProps extends MultiLanguageCombinedInputConfig {
  /** Callback when data instance changes */
  onInstanceChange?: (instance: IInputDataInstance) => void;
  /** Callback when CnD spec changes */
  onSpecChange?: (spec: string) => void;
  /** Callback when layout is applied */
  onLayoutApplied?: (layout: any) => void;
  /** Callback when language changes */
  onLanguageChange?: (language: SupportedLanguage) => void;
}

/**
 * Multi-Language Combined Input Component
 * 
 * Provides a spatial REPL environment with support for multiple programming languages.
 * Each language has its own optimized REPL interface while sharing the same
 * layout interface and visualization components.
 */
export const MultiLanguageCombinedInputComponent: React.FC<MultiLanguageCombinedInputProps> = ({
  language = 'javascript',
  cndSpec = '',
  dataInstance: initialDataInstance,
  pyretEvaluator,
  projections = {},
  height = '600px',
  width = '100%',
  showLayoutInterface = true,
  autoApplyLayout = true,
  style,
  className,
  onInstanceChange,
  onSpecChange,
  onLayoutApplied,
  onLanguageChange
}) => {
  // State management
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(language);
  const [currentCndSpec, setCurrentCndSpec] = useState(cndSpec);
  const [currentDataInstance, setCurrentDataInstance] = useState<IInputDataInstance>(() => {
    if (initialDataInstance) {
      return initialDataInstance;
    }
    // Create appropriate empty instance based on language
    return currentLanguage === 'pyret' 
      ? new PyretDataInstance({ dict: {}, brands: {} })
      : new JSONDataInstance({ atoms: [], relations: [] });
  });
  
  const [isStale, setIsStale] = useState(false);
  const layoutInstanceRef = useRef<LayoutInstance | null>(null);
  const sgqEvaluatorRef = useRef<SGraphQueryEvaluator | null>(null);

  // Convert data instance when language changes
  const convertDataInstanceForLanguage = useCallback((
    instance: IInputDataInstance, 
    targetLanguage: SupportedLanguage
  ): IInputDataInstance => {
    if (targetLanguage === 'pyret') {
      if (instance instanceof PyretDataInstance) {
        return instance;
      }
      // Convert to PyretDataInstance
      const atoms = instance.getAtoms();
      const relations = instance.getRelations();
      
      // Create a basic Pyret object structure
      const pyretObject = {
        dict: {},
        brands: {}
      };
      
      const pyretInstance = new PyretDataInstance(pyretObject);
      
      // Add atoms and relations
      atoms.forEach(atom => pyretInstance.addAtom(atom));
      relations.forEach(relation => pyretInstance.addRelation(relation));
      
      return pyretInstance;
    } else {
      if (instance instanceof JSONDataInstance) {
        return instance;
      }
      // Convert to JSONDataInstance
      const atoms = instance.getAtoms();
      const relations = instance.getRelations();
      
      return new JSONDataInstance({
        atoms: atoms.map(atom => ({
          id: atom.id,
          type: atom.type,
          label: atom.label
        })),
        relations: relations.map(relation => ({
          id: relation.id,
          name: relation.name,
          types: relation.types,
          tuples: relation.tuples.map(tuple => ({
            atoms: tuple.atoms,
            types: tuple.types
          }))
        }))
      });
    }
  }, []);

  // Handle language change
  const handleLanguageChange = useCallback((newLanguage: SupportedLanguage) => {
    const convertedInstance = convertDataInstanceForLanguage(currentDataInstance, newLanguage);
    setCurrentLanguage(newLanguage);
    setCurrentDataInstance(convertedInstance);
    onLanguageChange?.(newLanguage);
    onInstanceChange?.(convertedInstance);
  }, [currentDataInstance, convertDataInstanceForLanguage, onLanguageChange, onInstanceChange]);

  // Handle data instance changes
  const handleInstanceChange = useCallback((newInstance: IInputDataInstance) => {
    setCurrentDataInstance(newInstance);
    setIsStale(true);
    onInstanceChange?.(newInstance);
  }, [onInstanceChange]);

  // Handle CnD spec changes
  const handleSpecChange = useCallback((newSpec: string) => {
    setCurrentCndSpec(newSpec);
    setIsStale(true);
    onSpecChange?.(newSpec);
  }, [onSpecChange]);

  // Initialize SGQ evaluator
  useEffect(() => {
    if (!sgqEvaluatorRef.current) {
      sgqEvaluatorRef.current = new SGraphQueryEvaluator();
    }
    
    try {
      sgqEvaluatorRef.current.initialize({ sourceData: currentDataInstance });
    } catch (error) {
      console.warn('Failed to initialize SGQ evaluator:', error);
    }
  }, [currentDataInstance]);

  // Apply layout when needed
  const applyLayout = useCallback(() => {
    if (!currentCndSpec.trim() || !sgqEvaluatorRef.current) {
      return;
    }

    try {
      const layoutSpec = parseLayoutSpec(currentCndSpec);
      layoutInstanceRef.current = new LayoutInstance(layoutSpec, sgqEvaluatorRef.current, 0, true);
      
      const { layout } = layoutInstanceRef.current.generateLayout(currentDataInstance, projections);
      setIsStale(false);
      onLayoutApplied?.(layout);
      
      // Emit layout event for visualization components
      window.dispatchEvent(new CustomEvent('spatial-repl-layout-updated', {
        detail: { layout, spec: currentCndSpec, instance: currentDataInstance }
      }));
      
    } catch (error) {
      console.error('Layout generation failed:', error);
    }
  }, [currentCndSpec, currentDataInstance, projections, onLayoutApplied]);

  // Auto-apply layout when enabled
  useEffect(() => {
    if (autoApplyLayout && isStale) {
      const timer = setTimeout(applyLayout, 500);
      return () => clearTimeout(timer);
    }
  }, [autoApplyLayout, isStale, applyLayout]);

  // Render appropriate REPL interface based on language
  const renderReplInterface = () => {
    const commonProps = {
      onChange: handleInstanceChange,
      height: '300px'
    };

    switch (currentLanguage) {
      case 'pyret':
        return (
          <PyretReplInterface
            {...commonProps}
            initialInstance={currentDataInstance as PyretDataInstance}
            externalEvaluator={pyretEvaluator}
          />
        );
      case 'javascript':
        return (
          <JavaScriptReplInterface
            {...commonProps}
            initialInstance={currentDataInstance as JSONDataInstance}
          />
        );
      case 'python':
        return (
          <PythonReplInterface
            {...commonProps}
            initialInstance={currentDataInstance as JSONDataInstance}
          />
        );
      default:
        return (
          <JavaScriptReplInterface
            {...commonProps}
            initialInstance={currentDataInstance as JSONDataInstance}
          />
        );
    }
  };

  return (
    <div 
      className={`multi-language-combined-input ${className || ''}`}
      style={{ 
        width, 
        height, 
        display: 'flex', 
        flexDirection: 'column',
        border: '1px solid #ddd',
        borderRadius: '8px',
        overflow: 'hidden',
        ...style 
      }}
    >
      {/* Language Selector Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #ddd',
        gap: '16px'
      }}>
        <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Language:</label>
        <select 
          value={currentLanguage}
          onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '14px'
          }}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="pyret">Pyret</option>
        </select>
        
        {isStale && (
          <div style={{ 
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '12px', color: '#666' }}>Layout outdated</span>
            <button
              onClick={applyLayout}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Apply Layout
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ 
        flex: 1, 
        display: 'flex',
        minHeight: 0
      }}>
        {/* Left Panel: REPL */}
        <div style={{ 
          flex: 1, 
          borderRight: showLayoutInterface ? '1px solid #ddd' : 'none',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {renderReplInterface()}
        </div>

        {/* Right Panel: Layout Interface */}
        {showLayoutInterface && (
          <div style={{ 
            flex: 1,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <CndLayoutInterface
              cndSpec={currentCndSpec}
              onCndSpecChange={handleSpecChange}
              height="100%"
            />
          </div>
        )}
      </div>
    </div>
  );
};