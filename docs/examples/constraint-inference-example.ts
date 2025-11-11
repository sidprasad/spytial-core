/**
 * Example: Constraint Inference from User Interactions
 * 
 * This example demonstrates how the constraint inference system
 * can detect spatial relationships from a sequence of user actions.
 */

import { ConstraintInference, UIAction, LayoutState } from '../src/layout/constraint-inference';

console.log('=== Constraint Inference Example ===\n');

// Create inference instance with custom configuration
const inference = new ConstraintInference({
  epsilon: 5,
  minSupport: 2,
  cyclicThreshold: 0.8
});

// Scenario: User creates a horizontally aligned layout
console.log('Scenario: User aligns three nodes horizontally\n');

// Step 1: Initial scattered positions
const action1: UIAction = {
  type: 'multiSelect',
  timestamp: 1000,
  atomIds: ['NodeA', 'NodeB', 'NodeC']
};

const layout1: LayoutState = {
  timestamp: 1000,
  positions: new Map([
    ['NodeA', { x: 100, y: 95 }],
    ['NodeB', { x: 200, y: 105 }],
    ['NodeC', { x: 300, y: 98 }]
  ])
};

inference.addAction(action1, layout1);
console.log('Step 1: Multi-select three nodes');
console.log('  NodeA: (100, 95)');
console.log('  NodeB: (200, 105)');
console.log('  NodeC: (300, 98)');
console.log(`  Facts detected: ${inference.getFacts().length}`);
console.log('');

// Step 2: User clicks align button (horizontal)
const action2: UIAction = {
  type: 'alignButton',
  timestamp: 2000,
  atomIds: ['NodeA', 'NodeB', 'NodeC'],
  direction: 'horizontal'
};

const layout2: LayoutState = {
  timestamp: 2000,
  positions: new Map([
    ['NodeA', { x: 100, y: 100 }],
    ['NodeB', { x: 200, y: 100 }],
    ['NodeC', { x: 300, y: 100 }]
  ])
};

inference.addAction(action2, layout2);
console.log('Step 2: User clicks align horizontally');
console.log('  NodeA: (100, 100)');
console.log('  NodeB: (200, 100)');
console.log('  NodeC: (300, 100)');
console.log(`  Facts detected: ${inference.getFacts().length}`);
console.log('');

// Step 3: User drags all nodes together (group movement)
const action3: UIAction = {
  type: 'drag',
  timestamp: 3000,
  atomIds: ['NodeA', 'NodeB', 'NodeC']
};

const layout3: LayoutState = {
  timestamp: 3000,
  positions: new Map([
    ['NodeA', { x: 150, y: 150 }],
    ['NodeB', { x: 250, y: 150 }],
    ['NodeC', { x: 350, y: 150 }]
  ])
};

inference.addAction(action3, layout3);
console.log('Step 3: User drags all nodes together');
console.log('  NodeA: (150, 150)');
console.log('  NodeB: (250, 150)');
console.log('  NodeC: (350, 150)');
console.log(`  Facts detected: ${inference.getFacts().length}`);
console.log('');

// Analyze stable facts
console.log('=== Stable Facts ===\n');
const stableFacts = inference.getStableFacts();

stableFacts.forEach((fact, index) => {
  console.log(`${index + 1}. ${fact.type}(${fact.atomIds.join(', ')})`);
  console.log(`   Support: ${Array.from(fact.support).join(', ')} (${fact.support.size} occurrences)`);
  if (fact.killed !== undefined) {
    console.log(`   Killed at: time ${fact.killed}`);
  }
  if (fact.metadata) {
    console.log(`   Metadata:`, JSON.stringify(fact.metadata, null, 2));
  }
  console.log('');
});

console.log(`Total stable facts: ${stableFacts.length}`);
console.log('');

// Show specific constraint types
const alignedH = stableFacts.filter(f => f.type === 'aligned_h');
const orderedH = stableFacts.filter(f => f.type === 'ordered_h');
const group = stableFacts.filter(f => f.type === 'group');
const leftOf = stableFacts.filter(f => f.type === 'leftOf');

console.log('=== Summary by Type ===\n');
console.log(`Horizontal alignment: ${alignedH.length}`);
console.log(`Horizontal ordering: ${orderedH.length}`);
console.log(`Group movement: ${group.length}`);
console.log(`Left-of relationships: ${leftOf.length}`);
console.log('');

// Demonstrate cyclic pattern detection
console.log('=== Bonus: Cyclic Pattern Detection ===\n');

const cyclicInference = new ConstraintInference();

// Create a square arrangement
const squareAction: UIAction = {
  type: 'ringGesture',
  timestamp: 1000,
  atomIds: ['A', 'B', 'C', 'D']
};

const squareLayout: LayoutState = {
  timestamp: 1000,
  positions: new Map([
    ['A', { x: 100, y: 100 }],
    ['B', { x: 200, y: 100 }],
    ['C', { x: 200, y: 200 }],
    ['D', { x: 100, y: 200 }]
  ])
};

cyclicInference.addAction(squareAction, squareLayout);

const cyclicFacts = cyclicInference.getFacts().filter(f => f.type === 'cyclic');
if (cyclicFacts.length > 0) {
  console.log('Detected cyclic pattern:');
  cyclicFacts.forEach(fact => {
    console.log(`  Nodes: ${fact.atomIds.join(', ')}`);
    console.log(`  Ring score: ${fact.metadata?.ringScore}`);
  });
} else {
  console.log('No cyclic pattern detected');
}

console.log('\n=== Example Complete ===');
