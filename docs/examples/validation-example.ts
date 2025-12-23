/**
 * Example: Using Alloy Instance Validation
 * 
 * This example demonstrates how to use the validation features
 * of AlloyDataInstance to detect and report issues before reification.
 * 
 * Note: In production, import from 'spytial-core' package:
 * import { AlloyDataInstance, ValidationSeverity, AlloyInstance } from 'spytial-core';
 */

import { 
  AlloyDataInstance, 
  ValidationSeverity
} from 'spytial-core';
import type { AlloyInstance } from 'spytial-core';

// Example 1: Valid instance
console.log('Example 1: Valid Instance');
const validInstance: AlloyInstance = {
  types: {
    'Node': {
      _: 'type',
      id: 'Node',
      types: ['Node', 'univ'],
      atoms: [
        { _: 'atom', id: 'Node0', type: 'Node' },
        { _: 'atom', id: 'Node1', type: 'Node' }
      ]
    },
    'univ': { _: 'type', id: 'univ', types: ['univ'], atoms: [], meta: { builtin: true } },
    'Int': { _: 'type', id: 'Int', types: ['Int', 'univ'], atoms: [], meta: { builtin: true } },
    'seq/Int': { _: 'type', id: 'seq/Int', types: ['seq/Int', 'univ'], atoms: [], meta: { builtin: true } }
  },
  relations: {
    'edge': {
      _: 'relation',
      id: 'Node<:edge',
      name: 'edge',
      types: ['Node', 'Node'],
      tuples: [{ _: 'tuple', atoms: ['Node0', 'Node1'], types: ['Node', 'Node'] }]
    }
  },
  skolems: {}
};

const validDataInstance = new AlloyDataInstance(validInstance);
const validation = validDataInstance.validate();
console.log('Is valid:', validation.isValid);
console.log('Reified:', validDataInstance.reify());
