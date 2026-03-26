import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec, RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import {
    isTopConstraint, isLeftConstraint, isAlignmentConstraint,
    TopConstraint, LeftConstraint,
    negateAtomicConstraint, negateConjunction, negateDisjunction,
    DisjunctiveConstraint
} from '../src/layout/interfaces';

// ─── Test Data ───────────────────────────────────────────────────────────────

const twoNodeData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' }
    ],
    relations: [
        {
            id: 'r',
            name: 'r',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] }
            ]
        }
    ]
};

const threeNodeData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
    ],
    relations: [
        {
            id: 'next',
            name: 'next',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
                { atoms: ['C', 'A'], types: ['Node', 'Node'] }
            ]
        }
    ]
};

function createEvaluator(instance: JSONDataInstance) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

// ─── YAML Parsing Tests ─────────────────────────────────────────────────────

describe('NOT constraint YAML parsing', () => {
    it('parses not: orientation with negated=true', () => {
        const spec = parseLayoutSpec(`
constraints:
  - not:
      orientation:
        selector: r
        directions:
          - above
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(1);
        expect(relConstraints[0].negated).toBe(true);
        expect(relConstraints[0].directions).toEqual(['above']);
        expect(relConstraints[0].selector).toBe('r');
    });

    it('parses not: align with negated=true', () => {
        const spec = parseLayoutSpec(`
constraints:
  - not:
      align:
        selector: r
        direction: horizontal
`);
        const alignConstraints = spec.constraints.alignment;
        expect(alignConstraints).toHaveLength(1);
        expect(alignConstraints[0].negated).toBe(true);
        expect(alignConstraints[0].direction).toBe('horizontal');
    });

    it('parses not: cyclic with negated=true', () => {
        const spec = parseLayoutSpec(`
constraints:
  - not:
      cyclic:
        selector: next
        direction: clockwise
`);
        const cyclicConstraints = spec.constraints.orientation.cyclic;
        expect(cyclicConstraints).toHaveLength(1);
        expect(cyclicConstraints[0].negated).toBe(true);
        expect(cyclicConstraints[0].direction).toBe('clockwise');
    });

    it('throws on not: group (not yet supported)', () => {
        expect(() => parseLayoutSpec(`
constraints:
  - not:
      group:
        selector: nodes
        name: myGroup
`)).toThrow('NOT group constraints are not yet supported');
    });

    it('positive constraints have negated=false', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
`);
        expect(spec.constraints.orientation.relative[0].negated).toBe(false);
    });

    it('does not deduplicate positive vs negated', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
  - not:
      orientation:
        selector: r
        directions:
          - above
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(2);
        expect(relConstraints.filter(c => c.negated)).toHaveLength(1);
        expect(relConstraints.filter(c => !c.negated)).toHaveLength(1);
    });
});

// ─── Negation Utility Function Tests ────────────────────────────────────────

describe('negateAtomicConstraint', () => {
    const dummySource = new RelativeOrientationConstraint(['above'], 'r');

    const nodeA = { id: 'A', label: 'A', color: 'red', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
    const nodeB = { id: 'B', label: 'B', color: 'blue', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };

    it('negates TopConstraint by flipping with minDistance=0', () => {
        const top: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(top, dummySource);

        expect(result).toHaveLength(1); // Single alternative
        expect(result[0]).toHaveLength(1); // Single constraint
        const flipped = result[0][0];
        expect(isTopConstraint(flipped)).toBe(true);
        const tc = flipped as TopConstraint;
        expect(tc.top.id).toBe('B'); // Flipped
        expect(tc.bottom.id).toBe('A');
        expect(tc.minDistance).toBe(0);
    });

    it('negates LeftConstraint by flipping with minDistance=0', () => {
        const left: LeftConstraint = { left: nodeA, right: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(left, dummySource);

        expect(result).toHaveLength(1);
        expect(result[0]).toHaveLength(1);
        const flipped = result[0][0];
        expect(isLeftConstraint(flipped)).toBe(true);
        const lc = flipped as LeftConstraint;
        expect(lc.left.id).toBe('B');
        expect(lc.right.id).toBe('A');
        expect(lc.minDistance).toBe(0);
    });

    it('negates AlignmentConstraint (y-axis) into disjunction', () => {
        const align = { axis: 'y' as const, node1: nodeA, node2: nodeB, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(align, dummySource);

        // NOT same-Y → A above B OR B above A (2 alternatives)
        expect(result).toHaveLength(2);
        expect(isTopConstraint(result[0][0])).toBe(true);
        expect(isTopConstraint(result[1][0])).toBe(true);
    });

    it('negates AlignmentConstraint (x-axis) into disjunction', () => {
        const align = { axis: 'x' as const, node1: nodeA, node2: nodeB, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(align, dummySource);

        expect(result).toHaveLength(2);
        expect(isLeftConstraint(result[0][0])).toBe(true);
        expect(isLeftConstraint(result[1][0])).toBe(true);
    });
});

describe('negateConjunction (De Morgan)', () => {
    const dummySource = new RelativeOrientationConstraint(['above'], 'r');
    const nodeA = { id: 'A', label: 'A', color: 'red', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
    const nodeB = { id: 'B', label: 'B', color: 'blue', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };

    it('negates conjunction of two constraints into disjunction of two', () => {
        const c1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const c2: LeftConstraint = { left: nodeA, right: nodeB, minDistance: 15, sourceConstraint: dummySource };

        // NOT(A above B AND A left of B) = NOT(A above B) OR NOT(A left of B)
        const alternatives = negateConjunction([c1, c2], dummySource);
        expect(alternatives).toHaveLength(2);
        // Alt 1: B above A (flipped top)
        // Alt 2: B left of A (flipped left)
    });
});

describe('negateDisjunction (De Morgan)', () => {
    const dummySource = new CyclicOrientationConstraint('clockwise', 'next');
    const nodeA = { id: 'A', label: 'A', color: 'red', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
    const nodeB = { id: 'B', label: 'B', color: 'blue', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };

    it('negates disjunction into conjunction of disjunctions', () => {
        const alt1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const alt2: LeftConstraint = { left: nodeA, right: nodeB, minDistance: 15, sourceConstraint: dummySource };

        const disj = new DisjunctiveConstraint(dummySource, [[alt1], [alt2]]);

        // NOT(alt1 OR alt2) = NOT(alt1) AND NOT(alt2)
        const result = negateDisjunction(disj, dummySource);
        expect(result).toHaveLength(2); // Two new DisjunctiveConstraints (conjunction)

        // Each should have at least 1 alternative (the negated atom)
        expect(result[0].alternatives.length).toBeGreaterThanOrEqual(1);
        expect(result[1].alternatives.length).toBeGreaterThanOrEqual(1);
    });
});

// ─── Integration Tests: Layout Generation ───────────────────────────────────

describe('NOT orientation constraint integration', () => {
    it('negated orientation produces flipped constraints with minDistance=0', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - not:
      orientation:
        selector: r
        directions:
          - above
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
        const { layout } = layoutInstance.generateLayout(instance);

        // Should have conjunctive constraints (flipped with 0 min distance)
        expect(layout.constraints.length).toBeGreaterThan(0);

        // Find the negated constraint: should be TopConstraint with minDistance=0
        const topConstraints = layout.constraints.filter(isTopConstraint) as TopConstraint[];
        const zeroDistConstraints = topConstraints.filter(c => c.minDistance === 0);
        expect(zeroDistConstraints.length).toBeGreaterThan(0);
    });
});

describe('NOT alignment constraint integration', () => {
    it('negated alignment produces disjunctive constraint', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - not:
      align:
        selector: r
        direction: horizontal
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
        const { layout } = layoutInstance.generateLayout(instance);

        // Should have disjunctive constraints (NOT same-Y = above OR below)
        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);

        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(2); // Two alternatives: above or below
    });
});

describe('NOT cyclic constraint integration', () => {
    it('negated cyclic produces negated disjunctions via De Morgan', () => {
        const instance = new JSONDataInstance(threeNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - not:
      cyclic:
        selector: next
        direction: clockwise
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
        const { layout } = layoutInstance.generateLayout(instance);

        // Negated cyclic should produce multiple DisjunctiveConstraints
        // (one per rotational alternative that was negated)
        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);

        // Each negated alternative should have alternatives with minDistance=0
        for (const disj of layout.disjunctiveConstraints!) {
            expect(disj.alternatives.length).toBeGreaterThan(0);
            // Check that negated atoms have minDistance=0
            for (const alt of disj.alternatives) {
                for (const c of alt) {
                    if (isTopConstraint(c)) {
                        expect((c as TopConstraint).minDistance).toBe(0);
                    }
                    if (isLeftConstraint(c)) {
                        expect((c as LeftConstraint).minDistance).toBe(0);
                    }
                }
            }
        }
    });
});
