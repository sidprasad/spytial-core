/**
 * Types and interfaces for the Pyret Input Controller
 */

/**
 * A free-form Pyret expression that can contain any valid Pyret code
 */
export interface PyretExpression {
  id: string;
  expression: string;
  type: 'expression';
  isValid?: boolean;
  errorMessage?: string;
}

/**
 * A structured Pyret constructor with named fields
 */
export interface PyretConstructor {
  id: string;
  name: string;
  fields: PyretField[];
  type: 'constructor';
}

/**
 * A field within a Pyret constructor
 */
export interface PyretField {
  name: string;
  value: PyretValue;
  isOptional?: boolean;
}

/**
 * A list builder helper for easy list construction
 */
export interface PyretListBuilder {
  id: string;
  elements: PyretValue[];
  type: 'list-builder';
}

/**
 * Union type for different types of Pyret values
 */
export type PyretValue = 
  | PyretExpression
  | PyretConstructor
  | PyretPrimitive
  | PyretReference
  | PyretListBuilder;

/**
 * A primitive Pyret value (number, string, boolean)
 */
export interface PyretPrimitive {
  id: string;
  value: string | number | boolean;
  type: 'primitive';
  dataType: 'Number' | 'String' | 'Boolean';
}

/**
 * A reference to another Pyret value by ID
 */
export interface PyretReference {
  id: string;
  targetId: string;
  type: 'reference';
  targetName?: string; // Display name for the reference
}

/**
 * Predefined Pyret data types that can be used in dropdowns
 */
export interface PyretDataType {
  name: string;
  constructors: string[];
  fields: { [constructorName: string]: string[] };
}

/**
 * Example List data type that can be used as reference
 * This is not automatically included - users must pass it via customTypes config
 */
export const EXAMPLE_LIST_TYPE: PyretDataType = {
  name: 'List',
  constructors: ['empty', 'link'],
  fields: {
    'empty': [],
    'link': ['first', 'rest']
  }
};

/**
 * Example types array for demonstration purposes
 * Contains just the List type as per feedback to keep only List example
 */
export const EXAMPLE_PYRET_TYPES: PyretDataType[] = [EXAMPLE_LIST_TYPE];

/**
 * Configuration for the PyretInputController
 */
export interface PyretInputControllerConfig {
  /** Whether to allow free-form expressions */
  allowExpressions?: boolean;
  /** Whether to auto-generate IDs */
  autoGenerateIds?: boolean;
  /** Custom data types to include in dropdowns - users must provide these */
  customTypes?: PyretDataType[];
  /** Whether to show compact display (hide IDs, etc.) */
  compactDisplay?: boolean;
}

/**
 * State for the PyretInputController component
 */
export interface PyretInputState {
  values: Map<string, PyretValue>;
  declaredTypes: PyretDataType[];
  selectedRootId?: string;
  errors: Map<string, string>;
}