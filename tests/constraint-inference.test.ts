import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ConstraintInference, 
  UIAction, 
  LayoutState,
  DEFAULT_EPSILON 
} from '../src/layout/constraint-inference';

describe('ConstraintInference', () => {
  let inference: ConstraintInference;

  beforeEach(() => {
    inference = new ConstraintInference();
  });

  describe('Basic Setup', () => {
    it('should initialize with empty state', () => {
      expect(inference.getFacts()).toEqual([]);
      expect(inference.getCurrentLayout()).toBeUndefined();
    });

    it('should accept custom configuration', () => {
      const customInference = new ConstraintInference({
        epsilon: 10,
        minSupport: 3,
        cyclicThreshold: 0.9
      });
      expect(customInference).toBeDefined();
    });

    it('should reset to initial state', () => {
      const action: UIAction = {
        type: 'drag',
        timestamp: 1000,
        atomIds: ['A']
      };
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }]
        ])
      };
      inference.addAction(action, layout);
      
      expect(inference.getFacts().length).toBeGreaterThan(0);
      
      inference.reset();
      expect(inference.getFacts()).toEqual([]);
      expect(inference.getCurrentLayout()).toBeUndefined();
    });
  });

  describe('Predicate: leftOf', () => {
    it('should detect leftOf relationship', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }]
        ])
      };

      const action: UIAction = {
        type: 'drag',
        timestamp: 1000,
        atomIds: ['A']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const leftOfFact = facts.find(f => 
        f.type === 'leftOf' && 
        f.atomIds[0] === 'A' && 
        f.atomIds[1] === 'B'
      );

      expect(leftOfFact).toBeDefined();
      expect(leftOfFact?.support.has(0)).toBe(true);
    });

    it('should not detect leftOf when positions are reversed', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 200, y: 100 }],
          ['B', { x: 100, y: 100 }]
        ])
      };

      const action: UIAction = {
        type: 'drag',
        timestamp: 1000,
        atomIds: ['A']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const leftOfFact = facts.find(f => 
        f.type === 'leftOf' && 
        f.atomIds[0] === 'A' && 
        f.atomIds[1] === 'B'
      );

      // Should not have support at time 0
      expect(leftOfFact?.support.has(0)).toBeFalsy();
    });

    it('should respect epsilon tolerance', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 103, y: 100 }] // Within epsilon
        ])
      };

      const action: UIAction = {
        type: 'drag',
        timestamp: 1000,
        atomIds: ['A']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const leftOfFact = facts.find(f => 
        f.type === 'leftOf' && 
        f.atomIds[0] === 'A' && 
        f.atomIds[1] === 'B'
      );

      // Should not hold because difference is less than epsilon
      expect(leftOfFact?.support.has(0)).toBeFalsy();
    });
  });

  describe('Predicate: above', () => {
    it('should detect above relationship', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 100, y: 200 }]
        ])
      };

      const action: UIAction = {
        type: 'drag',
        timestamp: 1000,
        atomIds: ['A']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const aboveFact = facts.find(f => 
        f.type === 'above' && 
        f.atomIds[0] === 'A' && 
        f.atomIds[1] === 'B'
      );

      expect(aboveFact).toBeDefined();
      expect(aboveFact?.support.has(0)).toBe(true);
    });
  });

  describe('Predicate: aligned_v (vertical alignment)', () => {
    it('should detect vertical alignment', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 50 }],
          ['B', { x: 100, y: 150 }],
          ['C', { x: 100, y: 250 }]
        ])
      };

      const action: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const alignedFact = facts.find(f => f.type === 'aligned_v');

      expect(alignedFact).toBeDefined();
      expect(alignedFact?.support.has(0)).toBe(true);
      expect(alignedFact?.atomIds).toContain('A');
      expect(alignedFact?.atomIds).toContain('B');
      expect(alignedFact?.atomIds).toContain('C');
    });

    it('should not detect alignment when nodes are not aligned', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 50 }],
          ['B', { x: 150, y: 150 }],
          ['C', { x: 200, y: 250 }]
        ])
      };

      const action: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const alignedFact = facts.find(f => 
        f.type === 'aligned_v' && f.support.has(0)
      );

      expect(alignedFact).toBeUndefined();
    });
  });

  describe('Predicate: aligned_h (horizontal alignment)', () => {
    it('should detect horizontal alignment', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 50, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 250, y: 100 }]
        ])
      };

      const action: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const alignedFact = facts.find(f => f.type === 'aligned_h');

      expect(alignedFact).toBeDefined();
      expect(alignedFact?.support.has(0)).toBe(true);
    });
  });

  describe('Predicate: ordered_h (horizontal ordering)', () => {
    it('should detect stable horizontal ordering', () => {
      // First layout
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 50, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 250, y: 100 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action1, layout1);

      // Second layout with same order but different positions
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 60, y: 110 }],
          ['B', { x: 160, y: 110 }],
          ['C', { x: 260, y: 110 }]
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      const orderedFact = facts.find(f => f.type === 'ordered_h');

      expect(orderedFact).toBeDefined();
      expect(orderedFact?.support.has(1)).toBe(true);
    });

    it('should detect when ordering is violated', () => {
      // First layout
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 50, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 250, y: 100 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action1, layout1);

      // Second layout with reversed order
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 250, y: 110 }],
          ['B', { x: 160, y: 110 }],
          ['C', { x: 60, y: 110 }]
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A']
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      const orderedFact = facts.find(f => 
        f.type === 'ordered_h' &&
        f.atomIds.includes('A') &&
        f.atomIds.includes('B') &&
        f.atomIds.includes('C')
      );

      // Should be killed at time 1
      expect(orderedFact?.killed).toBe(1);
    });
  });

  describe('Predicate: ordered_v (vertical ordering)', () => {
    it('should detect stable vertical ordering', () => {
      // First layout
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 50 }],
          ['B', { x: 100, y: 150 }],
          ['C', { x: 100, y: 250 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action1, layout1);

      // Second layout with same order
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 110, y: 60 }],
          ['B', { x: 110, y: 160 }],
          ['C', { x: 110, y: 260 }]
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      const orderedFact = facts.find(f => f.type === 'ordered_v');

      expect(orderedFact).toBeDefined();
      expect(orderedFact?.support.has(1)).toBe(true);
    });
  });

  describe('Predicate: cyclic', () => {
    it('should detect cyclic arrangement', () => {
      // Create a square arrangement
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }],
          ['C', { x: 200, y: 200 }],
          ['D', { x: 100, y: 200 }]
        ])
      };

      const action: UIAction = {
        type: 'ringGesture',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C', 'D']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const cyclicFact = facts.find(f => f.type === 'cyclic');

      expect(cyclicFact).toBeDefined();
      expect(cyclicFact?.support.has(0)).toBe(true);
    });

    it('should not detect cyclic for linear arrangement', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }],
          ['C', { x: 300, y: 100 }]
        ])
      };

      const action: UIAction = {
        type: 'ringGesture',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const cyclicFact = facts.find(f => 
        f.type === 'cyclic' && f.support.has(0)
      );

      expect(cyclicFact).toBeUndefined();
    });

    it('should detect cyclic for circular arrangement', () => {
      // Create a circle with 6 points
      const radius = 100;
      const centerX = 200;
      const centerY = 200;
      const numPoints = 6;

      const positions = new Map<string, { x: number; y: number }>();
      for (let i = 0; i < numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints;
        const id = String.fromCharCode(65 + i); // A, B, C, D, E, F
        positions.set(id, {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        });
      }

      const layout: LayoutState = {
        timestamp: 1000,
        positions
      };

      const action: UIAction = {
        type: 'ringGesture',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C', 'D', 'E', 'F']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const cyclicFact = facts.find(f => f.type === 'cyclic');

      expect(cyclicFact).toBeDefined();
      expect(cyclicFact?.support.has(0)).toBe(true);
      expect(cyclicFact?.metadata?.ringScore).toBeGreaterThan(0.8);
    });
  });

  describe('Predicate: group', () => {
    it('should detect group movement', () => {
      // First layout
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 125, y: 150 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action1, layout1);

      // Second layout with uniform translation
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 150, y: 150 }],
          ['B', { x: 200, y: 150 }],
          ['C', { x: 175, y: 200 }]
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      const groupFact = facts.find(f => f.type === 'group');

      expect(groupFact).toBeDefined();
      expect(groupFact?.support.has(1)).toBe(true);
      expect(groupFact?.metadata?.translation).toEqual({ dx: 50, dy: 50 });
    });

    it('should not detect group for non-uniform movement', () => {
      // First layout
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 150, y: 100 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B']
      };

      inference.addAction(action1, layout1);

      // Second layout with different translations
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 150, y: 150 }], // moved (50, 50)
          ['B', { x: 180, y: 110 }]  // moved (30, 10)
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A', 'B']
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      const groupFact = facts.find(f => 
        f.type === 'group' && f.support.has(1)
      );

      expect(groupFact).toBeUndefined();
    });
  });

  describe('Transfer Function: drag', () => {
    it('should recompute facts for dragged atoms', () => {
      // Initial layout
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }]
        ])
      };

      const action1: UIAction = {
        type: 'drag',
        timestamp: 1000,
        atomIds: ['A']
      };

      inference.addAction(action1, layout1);

      // Drag A to the right of B
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 250, y: 100 }],
          ['B', { x: 200, y: 100 }]
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A']
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      const leftOfFact = facts.find(f => 
        f.type === 'leftOf' && 
        f.atomIds[0] === 'A' && 
        f.atomIds[1] === 'B'
      );

      // Should be killed at time 1 because A is no longer left of B
      expect(leftOfFact?.killed).toBe(1);
    });
  });

  describe('Transfer Function: alignButton', () => {
    it('should add horizontal alignment constraint', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 200, y: 100 }]
        ])
      };

      const action: UIAction = {
        type: 'alignButton',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C'],
        direction: 'horizontal'
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const alignedFact = facts.find(f => f.type === 'aligned_h');

      expect(alignedFact).toBeDefined();
      expect(alignedFact?.support.has(0)).toBe(true);
    });

    it('should add vertical alignment constraint', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 50 }],
          ['B', { x: 100, y: 150 }],
          ['C', { x: 100, y: 250 }]
        ])
      };

      const action: UIAction = {
        type: 'alignButton',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C'],
        direction: 'vertical'
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const alignedFact = facts.find(f => f.type === 'aligned_v');

      expect(alignedFact).toBeDefined();
      expect(alignedFact?.support.has(0)).toBe(true);
    });

    it('should drop conflicting ordered_v when adding horizontal alignment', () => {
      // First create vertical ordering
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 50 }],
          ['B', { x: 100, y: 150 }],
          ['C', { x: 100, y: 250 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action1, layout1);

      // Then align horizontally (which conflicts with vertical ordering)
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 200, y: 100 }]
        ])
      };

      const action2: UIAction = {
        type: 'alignButton',
        timestamp: 2000,
        atomIds: ['A', 'B', 'C'],
        direction: 'horizontal'
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      const orderedVFact = facts.find(f => f.type === 'ordered_v');

      // Should be killed at time 1
      expect(orderedVFact?.killed).toBe(1);
    });
  });

  describe('Transfer Function: distributeButton', () => {
    it('should add horizontal ordering constraint', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 50, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 250, y: 100 }]
        ])
      };

      const action: UIAction = {
        type: 'distributeButton',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C'],
        direction: 'horizontal'
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const orderedFact = facts.find(f => f.type === 'ordered_h');

      expect(orderedFact).toBeDefined();
      expect(orderedFact?.support.has(0)).toBe(true);
    });

    it('should add vertical ordering constraint', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 50 }],
          ['B', { x: 100, y: 150 }],
          ['C', { x: 100, y: 250 }]
        ])
      };

      const action: UIAction = {
        type: 'distributeButton',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C'],
        direction: 'vertical'
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const orderedFact = facts.find(f => f.type === 'ordered_v');

      expect(orderedFact).toBeDefined();
      expect(orderedFact?.support.has(0)).toBe(true);
    });
  });

  describe('Transfer Function: ringGesture', () => {
    it('should add cyclic constraint', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }],
          ['C', { x: 200, y: 200 }],
          ['D', { x: 100, y: 200 }]
        ])
      };

      const action: UIAction = {
        type: 'ringGesture',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C', 'D']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      const cyclicFact = facts.find(f => f.type === 'cyclic');

      expect(cyclicFact).toBeDefined();
      expect(cyclicFact?.support.has(0)).toBe(true);
    });
  });

  describe('Transfer Function: multiSelect', () => {
    it('should cache selection for set-level operations', () => {
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 100, y: 150 }],
          ['C', { x: 100, y: 200 }]
        ])
      };

      const action: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      
      // Should detect vertical alignment
      const alignedFact = facts.find(f => f.type === 'aligned_v');
      expect(alignedFact).toBeDefined();
    });

    it('should check for candidate facts on multi-select', () => {
      // Horizontally aligned nodes
      const layout: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 50, y: 100 }],
          ['B', { x: 150, y: 100 }],
          ['C', { x: 250, y: 100 }]
        ])
      };

      const action: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action, layout);

      const facts = inference.getFacts();
      
      // Should detect both horizontal alignment and ordering
      const alignedHFact = facts.find(f => f.type === 'aligned_h');
      const orderedHFact = facts.find(f => f.type === 'ordered_h');
      
      expect(alignedHFact?.support.has(0)).toBe(true);
      expect(orderedHFact?.support.has(0)).toBe(true);
    });
  });

  describe('Stable Facts', () => {
    it('should identify stable facts with sufficient support', () => {
      const customInference = new ConstraintInference({ minSupport: 2 });

      // Add same constraint across multiple actions
      for (let i = 0; i < 3; i++) {
        const layout: LayoutState = {
          timestamp: 1000 * (i + 1),
          positions: new Map([
            ['A', { x: 100 + i * 10, y: 100 }],
            ['B', { x: 200 + i * 10, y: 100 }]
          ])
        };

        const action: UIAction = {
          type: 'drag',
          timestamp: 1000 * (i + 1),
          atomIds: ['A']
        };

        customInference.addAction(action, layout);
      }

      const stableFacts = customInference.getStableFacts();
      
      // leftOf should be stable (supported at times 0, 1, 2)
      const leftOfFact = stableFacts.find(f => 
        f.type === 'leftOf' && 
        f.atomIds[0] === 'A' && 
        f.atomIds[1] === 'B'
      );

      expect(leftOfFact).toBeDefined();
      expect(leftOfFact?.support.size).toBeGreaterThanOrEqual(2);
    });

    it('should not include killed facts in stable facts', () => {
      const customInference = new ConstraintInference({ minSupport: 1 });

      // First layout: A left of B
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }]
        ])
      };

      const action1: UIAction = {
        type: 'drag',
        timestamp: 1000,
        atomIds: ['A']
      };

      customInference.addAction(action1, layout1);

      // Second layout: A right of B (kills the leftOf constraint)
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 250, y: 100 }],
          ['B', { x: 200, y: 100 }]
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A']
      };

      customInference.addAction(action2, layout2);

      const stableFacts = customInference.getStableFacts();
      const leftOfFact = stableFacts.find(f => 
        f.type === 'leftOf' && 
        f.atomIds[0] === 'A' && 
        f.atomIds[1] === 'B'
      );

      // Should not be in stable facts because it was killed
      expect(leftOfFact).toBeUndefined();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle sequence of drag operations', () => {
      // Start with three nodes in a row
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }],
          ['C', { x: 300, y: 100 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action1, layout1);

      // Drag all three down (group movement)
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 100, y: 150 }],
          ['B', { x: 200, y: 150 }],
          ['C', { x: 300, y: 150 }]
        ])
      };

      const action2: UIAction = {
        type: 'drag',
        timestamp: 2000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action2, layout2);

      const facts = inference.getFacts();
      
      // Should maintain horizontal alignment
      const alignedHFact = facts.find(f => f.type === 'aligned_h');
      expect(alignedHFact?.support.has(0)).toBe(true);
      expect(alignedHFact?.support.has(1)).toBe(true);
      
      // Should detect group movement
      const groupFact = facts.find(f => f.type === 'group');
      expect(groupFact?.support.has(1)).toBe(true);
    });

    it('should handle alignment button followed by drag', () => {
      // Initial scattered positions
      const layout1: LayoutState = {
        timestamp: 1000,
        positions: new Map([
          ['A', { x: 100, y: 95 }],
          ['B', { x: 200, y: 105 }],
          ['C', { x: 300, y: 98 }]
        ])
      };

      const action1: UIAction = {
        type: 'multiSelect',
        timestamp: 1000,
        atomIds: ['A', 'B', 'C']
      };

      inference.addAction(action1, layout1);

      // Align horizontally
      const layout2: LayoutState = {
        timestamp: 2000,
        positions: new Map([
          ['A', { x: 100, y: 100 }],
          ['B', { x: 200, y: 100 }],
          ['C', { x: 300, y: 100 }]
        ])
      };

      const action2: UIAction = {
        type: 'alignButton',
        timestamp: 2000,
        atomIds: ['A', 'B', 'C'],
        direction: 'horizontal'
      };

      inference.addAction(action2, layout2);

      // Drag one node (should break alignment)
      const layout3: LayoutState = {
        timestamp: 3000,
        positions: new Map([
          ['A', { x: 100, y: 150 }],
          ['B', { x: 200, y: 100 }],
          ['C', { x: 300, y: 100 }]
        ])
      };

      const action3: UIAction = {
        type: 'drag',
        timestamp: 3000,
        atomIds: ['A']
      };

      inference.addAction(action3, layout3);

      const facts = inference.getFacts();
      const alignedHFact = facts.find(f => f.type === 'aligned_h');

      // Alignment should be killed at time 2
      expect(alignedHFact?.support.has(1)).toBe(true);
      expect(alignedHFact?.killed).toBe(2);
    });
  });
});
