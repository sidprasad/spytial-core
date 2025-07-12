import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { PyretDataInstance } from '../../data-instance/pyret/pyret-data-instance';
import { IInputDataInstance } from '../../data-instance/interfaces';
import {
  PyretValue,
  PyretConstructor,
  PyretExpression,
  PyretPrimitive,
  PyretReference,
  PyretListBuilder,
  PyretDataType,
  PyretInputControllerConfig,
  PyretInputState,
  EXAMPLE_LIST_TYPE
} from './types';
import './PyretInputController.css';

export interface PyretInputControllerProps {
  /** The data instance to build/modify - can be any IInputDataInstance */
  instance?: IInputDataInstance;
  /** Callback when the instance changes */
  onChange?: (instance: IInputDataInstance) => void;
  /** Configuration for the controller */
  config?: PyretInputControllerConfig;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** CSS class name for styling */
  className?: string;
}

/**
 * Generate a unique ID for Pyret values
 */
function generatePyretId(type: string, existingIds: Set<string>): string {
  let counter = 1;
  let candidateId = `${type.toLowerCase()}-${counter}`;
  
  while (existingIds.has(candidateId)) {
    counter++;
    candidateId = `${type.toLowerCase()}-${counter}`;
  }
  
  return candidateId;
}

/**
 * PyretInputController - A specialized React component for constructing Pyret data instances
 * 
 * Provides a more programming-language-friendly interface compared to the generic InstanceBuilder.
 * Features include:
 * - Dropdown selection for declared data types and constructors
 * - Automatic ID generation with compact display
 * - Support for free-form PyretExpression input
 * - Better UX for programming language constructs
 */
export const PyretInputController: React.FC<PyretInputControllerProps> = ({
  instance,
  onChange,
  config = {},
  disabled = false,
  className = ''
}) => {
  const {
    allowExpressions = true,
    autoGenerateIds = true,
    customTypes = [],
    compactDisplay = true
  } = config;

  // Internal state for Pyret values
  const [state, setState] = useState<PyretInputState>({
    values: new Map(),
    declaredTypes: customTypes, // Only use the types passed by the user
    errors: new Map()
  });

  // Form state for creating new values
  const [newValueForm, setNewValueForm] = useState<{
    type: 'constructor' | 'expression' | 'primitive' | 'list-builder';
    dataType?: string;
    constructorName?: string;
    expression?: string;
    primitiveType?: 'Number' | 'String' | 'Boolean';
    primitiveValue?: string;
    listElements?: string; // Comma-separated values for list builder
  }>({
    type: 'constructor'
  });

  // Error state
  const [error, setError] = useState<string>('');

  /**
   * Convert the current Pyret values to a PyretDataInstance
   */
  const convertToPyretDataInstance = useCallback((): PyretDataInstance => {
    try {
      if (state.selectedRootId && state.values.has(state.selectedRootId)) {
        const rootValue = state.values.get(state.selectedRootId)!;
        const pyretObject = convertValueToPyretObject(rootValue, state.values);
        return new PyretDataInstance(pyretObject);
      }
      
      // If no root selected or root not found, create an empty instance
      return new PyretDataInstance({ dict: {}, brands: {} });
    } catch (err) {
      console.error('Error converting to PyretDataInstance:', err);
      return new PyretDataInstance({ dict: {}, brands: {} });
    }
  }, [state.values, state.selectedRootId]);

  /**
   * Convert a PyretValue to a Pyret runtime object
   */
  const convertValueToPyretObject = (value: PyretValue, allValues: Map<string, PyretValue>): any => {
    switch (value.type) {
      case 'primitive':
        return value.value;
        
      case 'expression':
        // For expressions, we'll create a simple object representation
        return {
          dict: { expression: value.expression },
          brands: { '$brandExpression1': true },
          $name: 'Expression'
        };
        
      case 'reference':
        const referencedValue = allValues.get(value.targetId);
        if (referencedValue) {
          return convertValueToPyretObject(referencedValue, allValues);
        }
        return { dict: {}, brands: {} };
        
      case 'list-builder':
        // Convert list-builder to a Pyret list structure
        let listObj: any = {
          dict: {},
          brands: { '$brandempty1': true },
          $name: 'empty'
        };
        
        // Build the list from right to left (rest to first)
        for (let i = value.elements.length - 1; i >= 0; i--) {
          const element = convertValueToPyretObject(value.elements[i], allValues);
          listObj = {
            dict: { first: element, rest: listObj },
            brands: { '$brandlink1': true },
            $name: 'link'
          };
        }
        
        return listObj;
        
      case 'constructor':
        const dict: any = {};
        value.fields.forEach(field => {
          dict[field.name] = convertValueToPyretObject(field.value, allValues);
        });
        
        return {
          dict,
          brands: { [`$brand${value.name}1`]: true },
          $name: value.name
        };
        
      default:
        return { dict: {}, brands: {} };
    }
  };

  /**
   * Notify parent when instance changes
   */
  const notifyChange = useCallback(() => {
    if (onChange) {
      const newInstance = convertToPyretDataInstance();
      onChange(newInstance);
    }
  }, [onChange, convertToPyretDataInstance]);

  /**
   * Add a new Pyret value
   */
  const handleAddValue = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const existingIds = new Set(state.values.keys());
      let newValue: PyretValue;
      
      switch (newValueForm.type) {
        case 'list-builder':
          // Parse comma-separated elements and create primitives
          const elementsStr = newValueForm.listElements || '';
          const elementValues: PyretValue[] = [];
          
          if (elementsStr.trim()) {
            const elements = elementsStr.split(',').map(s => s.trim()).filter(s => s);
            elements.forEach((element, index) => {
              // Try to parse as number first, then boolean, then string
              let value: string | number | boolean = element;
              let dataType: 'Number' | 'String' | 'Boolean' = 'String';
              
              const numValue = parseFloat(element);
              if (!isNaN(numValue) && isFinite(numValue) && element === numValue.toString()) {
                value = numValue;
                dataType = 'Number';
              } else if (element.toLowerCase() === 'true' || element.toLowerCase() === 'false') {
                value = element.toLowerCase() === 'true';
                dataType = 'Boolean';
              }
              
              const elementValue: PyretPrimitive = {
                id: generatePyretId(`list-elem-${index}`, existingIds),
                value,
                type: 'primitive',
                dataType
              };
              
              elementValues.push(elementValue);
              existingIds.add(elementValue.id);
            });
          }
          
          newValue = {
            id: generatePyretId('list', existingIds),
            elements: elementValues,
            type: 'list-builder'
          } as PyretListBuilder;
          break;
        
        case 'primitive':
          if (!newValueForm.primitiveType || !newValueForm.primitiveValue) {
            setError('Primitive type and value are required');
            return;
          }
          
          let primitiveValue: string | number | boolean = newValueForm.primitiveValue;
          if (newValueForm.primitiveType === 'Number') {
            primitiveValue = parseFloat(newValueForm.primitiveValue);
            if (isNaN(primitiveValue)) {
              setError('Invalid number value');
              return;
            }
          } else if (newValueForm.primitiveType === 'Boolean') {
            primitiveValue = newValueForm.primitiveValue.toLowerCase() === 'true';
          }
          
          newValue = {
            id: generatePyretId('primitive', existingIds),
            value: primitiveValue,
            type: 'primitive',
            dataType: newValueForm.primitiveType
          } as PyretPrimitive;
          break;
          
        case 'expression':
          if (!newValueForm.expression) {
            setError('Expression is required');
            return;
          }
          
          newValue = {
            id: generatePyretId('expression', existingIds),
            expression: newValueForm.expression,
            type: 'expression'
          } as PyretExpression;
          break;
          
        case 'constructor':
          if (!newValueForm.constructorName) {
            setError('Constructor is required');
            return;
          }
          
          const dataType = state.declaredTypes.find(t => 
            t.constructors.includes(newValueForm.constructorName!)
          );
          
          if (!dataType) {
            setError('Unknown constructor');
            return;
          }
          
          const fieldNames = dataType.fields[newValueForm.constructorName];
          const fields = fieldNames.map(fieldName => ({
            name: fieldName,
            value: {
              id: generatePyretId('placeholder', existingIds),
              expression: '...',
              type: 'expression'
            } as PyretExpression
          }));
          
          newValue = {
            id: generatePyretId(newValueForm.constructorName, existingIds),
            name: newValueForm.constructorName,
            fields,
            type: 'constructor'
          } as PyretConstructor;
          break;
          
        default:
          setError('Invalid value type');
          return;
      }
      
      setState(prev => ({
        ...prev,
        values: new Map(prev.values).set(newValue.id, newValue)
      }));
      
      // Reset form
      setNewValueForm({ type: 'constructor' });
      setError('');
      
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add value');
    }
  }, [newValueForm, state.values, state.declaredTypes, notifyChange]);

  /**
   * Remove a value
   */
  const handleRemoveValue = useCallback((valueId: string) => {
    setState(prev => {
      const newValues = new Map(prev.values);
      newValues.delete(valueId);
      
      // Clear root selection if it was the removed value
      const newSelectedRootId = prev.selectedRootId === valueId ? undefined : prev.selectedRootId;
      
      return {
        ...prev,
        values: newValues,
        selectedRootId: newSelectedRootId
      };
    });
    
    notifyChange();
  }, [notifyChange]);

  /**
   * Update a field value in a constructor
   */
  const handleUpdateField = useCallback((constructorId: string, fieldName: string, newValue: PyretValue) => {
    setState(prev => {
      const constructor = prev.values.get(constructorId) as PyretConstructor;
      if (!constructor || constructor.type !== 'constructor') {
        return prev;
      }
      
      const updatedConstructor: PyretConstructor = {
        ...constructor,
        fields: constructor.fields.map(field => 
          field.name === fieldName ? { ...field, value: newValue } : field
        )
      };
      
      const newValues = new Map(prev.values);
      newValues.set(constructorId, updatedConstructor);
      
      return {
        ...prev,
        values: newValues
      };
    });
    
    notifyChange();
  }, [notifyChange]);

  /**
   * Set the root value for reification
   */
  const handleSetRoot = useCallback((valueId: string) => {
    setState(prev => ({
      ...prev,
      selectedRootId: valueId
    }));
    notifyChange();
  }, [notifyChange]);

  /**
   * Generate Pyret code from current values
   */
  const generatePyretCode = useCallback((): string => {
    const pyretInstance = convertToPyretDataInstance();
    return pyretInstance.reify() as string;
  }, [convertToPyretDataInstance]);

  // Get available constructors for dropdown
  const availableConstructors = state.declaredTypes.flatMap(dataType => 
    dataType.constructors.map(constructor => ({
      constructor,
      dataType: dataType.name
    }))
  );

  return (
    <div className={`pyret-input-controller ${className}`}>
      <div className="pyret-input-controller__header">
        <h2>Pyret Input Controller</h2>
        <div className="pyret-input-controller__stats">
          <span>{state.values.size} values</span>
          {state.selectedRootId && <span>Root: {state.selectedRootId}</span>}
        </div>
      </div>

      {error && (
        <div className="pyret-input-controller__error">
          {error}
          <button 
            type="button" 
            onClick={() => setError('')}
            aria-label="Clear error"
          >
            ×
          </button>
        </div>
      )}

      <div className="pyret-input-controller__content">
        {/* Add Value Form */}
        <section className="pyret-input-controller__section">
          <h3>Add New Value</h3>
          
          <form onSubmit={handleAddValue} className="pyret-input-controller__form">
            <div className="form-row">
              <select
                value={newValueForm.type}
                onChange={(e) => setNewValueForm(prev => ({ 
                  ...prev, 
                  type: e.target.value as any 
                }))}
                disabled={disabled}
              >
                <option value="constructor">Data Constructor</option>
                <option value="list-builder">List (easy mode)</option>
                <option value="primitive">Primitive Value</option>
                {allowExpressions && <option value="expression">Free Expression</option>}
              </select>
            </div>

            {newValueForm.type === 'constructor' && (
              <div className="form-row">
                <select
                  value={newValueForm.constructorName || ''}
                  onChange={(e) => setNewValueForm(prev => ({ 
                    ...prev, 
                    constructorName: e.target.value 
                  }))}
                  disabled={disabled}
                  required
                >
                  <option value="">Select Constructor</option>
                  {availableConstructors.map(({ constructor, dataType }) => (
                    <option key={constructor} value={constructor}>
                      {constructor} ({dataType})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {newValueForm.type === 'list-builder' && (
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Enter list elements separated by commas (e.g., 1, 2, 3)"
                  value={newValueForm.listElements || ''}
                  onChange={(e) => setNewValueForm(prev => ({ 
                    ...prev, 
                    listElements: e.target.value 
                  }))}
                  disabled={disabled}
                />
                <small>Elements are auto-typed as Number, Boolean, or String</small>
              </div>
            )}

            {newValueForm.type === 'primitive' && (
              <>
                <div className="form-row">
                  <select
                    value={newValueForm.primitiveType || ''}
                    onChange={(e) => setNewValueForm(prev => ({ 
                      ...prev, 
                      primitiveType: e.target.value as any 
                    }))}
                    disabled={disabled}
                    required
                  >
                    <option value="">Select Type</option>
                    <option value="Number">Number</option>
                    <option value="String">String</option>
                    <option value="Boolean">Boolean</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Value"
                    value={newValueForm.primitiveValue || ''}
                    onChange={(e) => setNewValueForm(prev => ({ 
                      ...prev, 
                      primitiveValue: e.target.value 
                    }))}
                    disabled={disabled}
                    required
                  />
                </div>
              </>
            )}

            {newValueForm.type === 'expression' && (
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Pyret expression"
                  value={newValueForm.expression || ''}
                  onChange={(e) => setNewValueForm(prev => ({ 
                    ...prev, 
                    expression: e.target.value 
                  }))}
                  disabled={disabled}
                  required
                />
              </div>
            )}

            <div className="form-row">
              <button type="submit" disabled={disabled}>
                Add Value
              </button>
            </div>
          </form>
        </section>

        {/* Values List */}
        <section className="pyret-input-controller__section">
          <h3>Values</h3>
          
          <div className="pyret-input-controller__values">
            {state.values.size === 0 ? (
              <p className="empty-state">No values yet. Add one above.</p>
            ) : (
              Array.from(state.values.values()).map((value) => (
                <div key={value.id} className={`value-item ${value.type}`}>
                  <div className="value-header">
                    <div className="value-info">
                      {!compactDisplay && <span className="value-id">{value.id}</span>}
                      <span className="value-type">{value.type}</span>
                      {value.type === 'constructor' && (
                        <span className="constructor-name">{value.name}</span>
                      )}
                    </div>
                    <div className="value-actions">
                      <button
                        type="button"
                        onClick={() => handleSetRoot(value.id)}
                        disabled={disabled}
                        className={`root-button ${state.selectedRootId === value.id ? 'active' : ''}`}
                      >
                        {state.selectedRootId === value.id ? '★' : '☆'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveValue(value.id)}
                        disabled={disabled}
                        className="remove-button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {value.type === 'constructor' && (
                    <div className="constructor-fields">
                      {value.fields.map((field) => (
                        <div key={field.name} className="field-item">
                          <label>{field.name}:</label>
                          <span className="field-value">
                            {field.value.type === 'expression' ? 
                              field.value.expression : 
                              `${field.value.type}(${field.value.id})`
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {value.type === 'expression' && (
                    <div className="expression-content">
                      <code>{value.expression}</code>
                    </div>
                  )}

                  {value.type === 'primitive' && (
                    <div className="primitive-content">
                      <span className="primitive-type">{value.dataType}:</span>
                      <span className="primitive-value">{String(value.value)}</span>
                    </div>
                  )}

                  {value.type === 'list-builder' && (
                    <div className="list-builder-content">
                      <span className="list-length">{value.elements.length} elements:</span>
                      <span className="list-elements">
                        [{value.elements.map(elem => elem.type === 'primitive' ? String(elem.value) : elem.id).join(', ')}]
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Generated Code */}
        <section className="pyret-input-controller__section">
          <h3>Generated Pyret Code</h3>
          <div className="generated-code">
            <pre><code>{generatePyretCode()}</code></pre>
          </div>
        </section>
      </div>
    </div>
  );
};