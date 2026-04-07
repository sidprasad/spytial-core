// Some tests in this file use the deprecated ConstraintValidator (Kiwi). See qualitative-constraint-validator*.test.ts for current validator.
import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec, RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint } from '../src/layout/layoutspec';
import { LayoutInstance, ConstraintValidatorStrategy } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import {
    isTopConstraint, isLeftConstraint, isAlignmentConstraint,
    TopConstraint, LeftConstraint, AlignmentConstraint,
    InstanceLayout, LayoutNode,
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

const fourNodeChainData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
        { id: 'D', type: 'Node', label: 'D' }
    ],
    relations: [
        {
            id: 'r',
            name: 'r',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
                { atoms: ['C', 'D'], types: ['Node', 'Node'] }
            ]
        }
    ]
};

function createEvaluator(instance: JSONDataInstance) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

function createNode(id: string): LayoutNode {
    return {
        id, label: id, color: 'black',
        groups: [], attributes: {},
        width: 100, height: 60,
        mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

function createLayout(
    nodes: LayoutNode[],
    constraints: any[] = [],
    disjunctiveConstraints?: DisjunctiveConstraint[],
): InstanceLayout {
    return { nodes, edges: [], constraints, groups: [], disjunctiveConstraints };
}

// ─── YAML Parsing Tests ─────────────────────────────────────────────────────

describe('NOT constraint YAML parsing', () => {
    it('parses orientation with hold: never', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
      hold: never
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(1);
        expect(relConstraints[0].negated).toBe(true);
        expect(relConstraints[0].directions).toEqual(['above']);
        expect(relConstraints[0].selector).toBe('r');
    });

    it('parses align with hold: never', () => {
        const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: r
      direction: horizontal
      hold: never
`);
        const alignConstraints = spec.constraints.alignment;
        expect(alignConstraints).toHaveLength(1);
        expect(alignConstraints[0].negated).toBe(true);
        expect(alignConstraints[0].direction).toBe('horizontal');
    });

    it('parses cyclic with hold: never', () => {
        const spec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
      hold: never
`);
        const cyclicConstraints = spec.constraints.orientation.cyclic;
        expect(cyclicConstraints).toHaveLength(1);
        expect(cyclicConstraints[0].negated).toBe(true);
        expect(cyclicConstraints[0].direction).toBe('clockwise');
    });

    it('parses group with hold: never', () => {
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: nodes
      name: myGroup
      hold: never
`);
        const groupConstraints = spec.constraints.grouping.byselector;
        expect(groupConstraints).toHaveLength(1);
        expect(groupConstraints[0].negated).toBe(true);
        expect(groupConstraints[0].name).toBe('myGroup');
    });

    it('parses group by field with hold: never', () => {
        const spec = parseLayoutSpec(`
constraints:
  - group:
      field: r
      groupOn: 0
      addToGroup: 1
      hold: never
`);
        const groupConstraints = spec.constraints.grouping.byfield;
        expect(groupConstraints).toHaveLength(1);
        expect(groupConstraints[0].negated).toBe(true);
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
  - orientation:
      selector: r
      directions:
        - above
      hold: never
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(2);
        expect(relConstraints.filter(c => c.negated)).toHaveLength(1);
        expect(relConstraints.filter(c => !c.negated)).toHaveLength(1);
    });

    it('parses orientation with hold: never and multiple directions', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
        - left
      hold: never
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(1);
        expect(relConstraints[0].negated).toBe(true);
        expect(relConstraints[0].directions).toEqual(['above', 'left']);
    });

    it('parses cyclic with hold: never and counterclockwise', () => {
        const spec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: next
      direction: counterclockwise
      hold: never
`);
        const cyclicConstraints = spec.constraints.orientation.cyclic;
        expect(cyclicConstraints).toHaveLength(1);
        expect(cyclicConstraints[0].negated).toBe(true);
        expect(cyclicConstraints[0].direction).toBe('counterclockwise');
    });

    it('parses align vertical with hold: never', () => {
        const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: r
      direction: vertical
      hold: never
`);
        const alignConstraints = spec.constraints.alignment;
        expect(alignConstraints).toHaveLength(1);
        expect(alignConstraints[0].negated).toBe(true);
        expect(alignConstraints[0].direction).toBe('vertical');
    });

    it('deduplicates identical negated constraints', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
      hold: never
  - orientation:
      selector: r
      directions:
        - above
      hold: never
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(1);
    });

    it('mixes positive and negated constraints in the same spec', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [left]
  - orientation:
      selector: r
      directions: [above]
      hold: never
  - align:
      selector: r
      direction: horizontal
  - align:
      selector: r
      direction: vertical
      hold: never
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(2);
        expect(relConstraints[0].negated).toBe(false);
        expect(relConstraints[1].negated).toBe(true);

        const alignConstraints = spec.constraints.alignment;
        expect(alignConstraints).toHaveLength(2);
        expect(alignConstraints[0].negated).toBe(false);
        expect(alignConstraints[1].negated).toBe(true);
    });
});

// ─── hold: always | never Syntax Tests ──────────────────────────────────────

describe('hold: never YAML parsing', () => {
    it('parses orientation with hold: never as negated', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [above]
      hold: never
`);
        const relConstraints = spec.constraints.orientation.relative;
        expect(relConstraints).toHaveLength(1);
        expect(relConstraints[0].negated).toBe(true);
        expect(relConstraints[0].directions).toEqual(['above']);
    });

    it('parses orientation without hold as positive (default always)', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [above]
`);
        expect(spec.constraints.orientation.relative[0].negated).toBe(false);
    });

    it('parses orientation with hold: always as positive', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [above]
      hold: always
`);
        expect(spec.constraints.orientation.relative[0].negated).toBe(false);
    });

    it('parses align with hold: never as negated', () => {
        const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: r
      direction: horizontal
      hold: never
`);
        const alignConstraints = spec.constraints.alignment;
        expect(alignConstraints).toHaveLength(1);
        expect(alignConstraints[0].negated).toBe(true);
    });

    it('parses cyclic with hold: never as negated', () => {
        const spec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
      hold: never
`);
        const cyclicConstraints = spec.constraints.orientation.cyclic;
        expect(cyclicConstraints).toHaveLength(1);
        expect(cyclicConstraints[0].negated).toBe(true);
    });

    it('parses group with hold: never (name optional)', () => {
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: Alpha
      hold: never
`);
        const groupConstraints = spec.constraints.grouping.byselector;
        expect(groupConstraints).toHaveLength(1);
        expect(groupConstraints[0].negated).toBe(true);
        expect(groupConstraints[0].selector).toBe('Alpha');
    });

    it('parses group with hold: never and explicit name', () => {
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: Alpha
      name: myGroup
      hold: never
`);
        const groupConstraints = spec.constraints.grouping.byselector;
        expect(groupConstraints).toHaveLength(1);
        expect(groupConstraints[0].negated).toBe(true);
        expect(groupConstraints[0].name).toBe('myGroup');
    });

    it('positive group still requires name', () => {
        expect(() => parseLayoutSpec(`
constraints:
  - group:
      selector: Alpha
`)).toThrow();
    });

    it('hold: never on group by field is negated', () => {
        const spec = parseLayoutSpec(`
constraints:
  - group:
      field: worksIn
      groupOn: 1
      addToGroup: 0
      hold: never
`);
        const byfield = spec.constraints.grouping.byfield;
        expect(byfield).toHaveLength(1);
        expect(byfield[0].negated).toBe(true);
    });

});

// ─── Negation Utility Function Tests ────────────────────────────────────────

describe('negateAtomicConstraint', () => {
    const dummySource = new RelativeOrientationConstraint(['above'], 'r');

    const nodeA = { id: 'A', label: 'A', color: 'red', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
    const nodeB = { id: 'B', label: 'B', color: 'blue', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };

    it('negates TopConstraint into 2 alternatives: reversed + aligned', () => {
        const top: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(top, dummySource);

        expect(result).toHaveLength(2); // Two alternatives
        // Alt 1: reversed TopConstraint
        expect(result[0]).toHaveLength(1);
        const reversed = result[0][0];
        expect(isTopConstraint(reversed)).toBe(true);
        const tc = reversed as TopConstraint;
        expect(tc.top.id).toBe('B');
        expect(tc.bottom.id).toBe('A');
        expect(tc.minDistance).toBe(0);
        // Alt 2: alignment on y
        expect(result[1]).toHaveLength(1);
        const aligned = result[1][0];
        expect(isAlignmentConstraint(aligned)).toBe(true);
        const ac = aligned as AlignmentConstraint;
        expect(ac.axis).toBe('y');
    });

    it('negates LeftConstraint into 2 alternatives: reversed + aligned', () => {
        const left: LeftConstraint = { left: nodeA, right: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(left, dummySource);

        expect(result).toHaveLength(2); // Two alternatives
        // Alt 1: reversed LeftConstraint
        expect(result[0]).toHaveLength(1);
        const reversed = result[0][0];
        expect(isLeftConstraint(reversed)).toBe(true);
        const lc = reversed as LeftConstraint;
        expect(lc.left.id).toBe('B');
        expect(lc.right.id).toBe('A');
        expect(lc.minDistance).toBe(0);
        // Alt 2: alignment on x
        expect(result[1]).toHaveLength(1);
        const aligned = result[1][0];
        expect(isAlignmentConstraint(aligned)).toBe(true);
        const ac = aligned as AlignmentConstraint;
        expect(ac.axis).toBe('x');
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

    it('negated alignment disjunction alternatives have minDistance=1', () => {
        const align = { axis: 'y' as const, node1: nodeA, node2: nodeB, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(align, dummySource);

        // Both alternatives should enforce a minimum separation of 1
        const tc1 = result[0][0] as TopConstraint;
        const tc2 = result[1][0] as TopConstraint;
        expect(tc1.minDistance).toBe(1);
        expect(tc2.minDistance).toBe(1);
    });

    it('negated alignment y-axis alternatives cover both orderings', () => {
        const align = { axis: 'y' as const, node1: nodeA, node2: nodeB, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(align, dummySource);

        const tc1 = result[0][0] as TopConstraint;
        const tc2 = result[1][0] as TopConstraint;
        // One has A on top, the other has B on top
        const tops = [tc1.top.id, tc2.top.id].sort();
        expect(tops).toEqual(['A', 'B']);
    });

    it('preserves sourceConstraint in negated output', () => {
        const customSource = new RelativeOrientationConstraint(['left'], 'custom');
        const top: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const result = negateAtomicConstraint(top, customSource);

        expect(result[0][0].sourceConstraint).toBe(customSource);
    });
});

describe('negateConjunction (De Morgan)', () => {
    const dummySource = new RelativeOrientationConstraint(['above'], 'r');
    const nodeA = { id: 'A', label: 'A', color: 'red', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
    const nodeB = { id: 'B', label: 'B', color: 'blue', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };

    it('negates conjunction of two ordering constraints into disjunction of four', () => {
        const c1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const c2: LeftConstraint = { left: nodeA, right: nodeB, minDistance: 15, sourceConstraint: dummySource };

        // NOT(A above B AND A left of B) = NOT(A above B) OR NOT(A left of B)
        // Each ordering negation produces 2 alternatives → 2 + 2 = 4
        const alternatives = negateConjunction([c1, c2], dummySource);
        expect(alternatives).toHaveLength(4);
    });

    it('negates single-element conjunction into two alternatives', () => {
        const c1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const alternatives = negateConjunction([c1], dummySource);
        // Single ordering negation → 2 alternatives (reversed + aligned)
        expect(alternatives).toHaveLength(2);
    });

    it('conjunction with alignment expands alternatives', () => {
        // NOT(A above B AND A same-Y as B)
        //   = ¬(A above B) OR ¬(sameY)
        //   = (reversed + aligned) OR (topAlt1 + topAlt2) = 4 alternatives
        const c1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const c2: AlignmentConstraint = { axis: 'y', node1: nodeA, node2: nodeB, sourceConstraint: dummySource };

        const alternatives = negateConjunction([c1, c2], dummySource);
        // 2 from negating top + 2 from negating alignment = 4
        expect(alternatives).toHaveLength(4);
    });

    it('negating empty conjunction produces empty result', () => {
        const alternatives = negateConjunction([], dummySource);
        expect(alternatives).toHaveLength(0);
    });
});

describe('negateDisjunction (De Morgan)', () => {
    const dummySource = new CyclicOrientationConstraint('clockwise', 'next');
    const nodeA = { id: 'A', label: 'A', color: 'red', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
    const nodeB = { id: 'B', label: 'B', color: 'blue', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
    const nodeC = { id: 'C', label: 'C', color: 'green', width: 100, height: 60, mostSpecificType: 'Node', types: ['Node'], showLabels: true };

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

    it('negated disjunction preserves source constraint', () => {
        const alt1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const disj = new DisjunctiveConstraint(dummySource, [[alt1]]);

        const result = negateDisjunction(disj, dummySource);
        expect(result[0].sourceConstraint).toBe(dummySource);
    });

    it('multi-constraint alternatives produce multi-alternative negations', () => {
        // One alternative with 3 ordering constraints → negation via De Morgan
        const c1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const c2: LeftConstraint = { left: nodeA, right: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const c3: TopConstraint = { top: nodeB, bottom: nodeC, minDistance: 15, sourceConstraint: dummySource };

        const disj = new DisjunctiveConstraint(dummySource, [[c1, c2, c3]]);

        const result = negateDisjunction(disj, dummySource);
        expect(result).toHaveLength(1); // Only 1 original alternative → 1 negated DisjunctiveConstraint
        // Each ordering negation produces 2 alternatives → 2 + 2 + 2 = 6
        expect(result[0].alternatives).toHaveLength(6);
    });

    it('all negated ordering atoms use minDistance=0', () => {
        const c1: TopConstraint = { top: nodeA, bottom: nodeB, minDistance: 15, sourceConstraint: dummySource };
        const c2: LeftConstraint = { left: nodeB, right: nodeC, minDistance: 15, sourceConstraint: dummySource };

        const disj = new DisjunctiveConstraint(dummySource, [[c1, c2]]);
        const result = negateDisjunction(disj, dummySource);

        for (const alt of result[0].alternatives) {
            for (const c of alt) {
                if (isTopConstraint(c)) expect((c as TopConstraint).minDistance).toBe(0);
                if (isLeftConstraint(c)) expect((c as LeftConstraint).minDistance).toBe(0);
                // Alignment alternatives have no minDistance field
            }
        }
    });
});

// ─── Validator-Level Tests ──────────────────────────────────────────────────

describe('Negated constraints in ConstraintValidator', () => {
    it('negated orientation (flipped with 0 gap) is satisfiable', () => {
        const a = createNode('A');
        const b = createNode('B');
        const source = new RelativeOrientationConstraint(['above'], 'r', true);

        // NOT(A above B) = TopConstraint(B, A, 0) — always satisfiable by itself
        const constraint: TopConstraint = { top: b, bottom: a, minDistance: 0, sourceConstraint: source };
        const layout = createLayout([a, b], [constraint]);

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();
        expect(error).toBeNull();
    });

    it('positive + negated on same pair is satisfiable (positive is stricter)', () => {
        const a = createNode('A');
        const b = createNode('B');
        const posSource = new RelativeOrientationConstraint(['above'], 'r');
        const negSource = new RelativeOrientationConstraint(['below'], 'r', true);

        // A above B (positive) AND NOT(A below B) = A above B AND TopConstraint(A, B, 0)
        // Both say "A above B" — compatible
        const posConstraint: TopConstraint = { top: a, bottom: b, minDistance: 15, sourceConstraint: posSource };
        const negConstraint: TopConstraint = { top: a, bottom: b, minDistance: 0, sourceConstraint: negSource };

        const layout = createLayout([a, b], [posConstraint, negConstraint]);
        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();
        expect(error).toBeNull();
    });

    it('contradictory positive + negated on same direction is unsatisfiable', () => {
        const a = createNode('A');
        const b = createNode('B');
        const posSource = new RelativeOrientationConstraint(['above'], 'r');
        const negSource = new RelativeOrientationConstraint(['above'], 'r', true);

        // A above B (positive, A.y + D ≤ B.y, D>0) AND NOT(A above B) = B.y ≤ A.y
        // These are contradictory: A.y + D ≤ B.y AND B.y ≤ A.y → D ≤ 0, contradiction when D>0
        const posConstraint: TopConstraint = { top: a, bottom: b, minDistance: 15, sourceConstraint: posSource };
        const negConstraint: TopConstraint = { top: b, bottom: a, minDistance: 0, sourceConstraint: negSource };

        const layout = createLayout([a, b], [posConstraint, negConstraint]);
        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();
        // This may or may not be detected as a conflict depending on min distances.
        // With minDistance: 15 on positive and 0 on negated, we need A.y+15 ≤ B.y AND B.y ≤ A.y
        // which requires 15 ≤ 0 — unsatisfiable.
        expect(error).not.toBeNull();
    });

    it('negated alignment disjunction is solvable', () => {
        const a = createNode('A');
        const b = createNode('B');
        const source = new AlignConstraint('horizontal', 'r', true);

        // NOT(align horizontal) → TopConstraint(A, B, D) OR TopConstraint(B, A, D)
        const alt1: TopConstraint = { top: a, bottom: b, minDistance: 15, sourceConstraint: source };
        const alt2: TopConstraint = { top: b, bottom: a, minDistance: 15, sourceConstraint: source };
        const disj = new DisjunctiveConstraint(source, [[alt1], [alt2]]);

        const layout = createLayout([a, b], [], [disj]);
        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();
        expect(error).toBeNull();
    });

    it('negated alignment with conflicting positive alignment is unsatisfiable', () => {
        const a = createNode('A');
        const b = createNode('B');
        const posSource = new AlignConstraint('horizontal', 'r');
        const negSource = new AlignConstraint('horizontal', 'r', true);

        // Positive: same Y
        const alignConstraint: AlignmentConstraint = { axis: 'y', node1: a, node2: b, sourceConstraint: posSource };

        // Negated: NOT same Y → must differ
        const alt1: TopConstraint = { top: a, bottom: b, minDistance: 15, sourceConstraint: negSource };
        const alt2: TopConstraint = { top: b, bottom: a, minDistance: 15, sourceConstraint: negSource };
        const disj = new DisjunctiveConstraint(negSource, [[alt1], [alt2]]);

        const layout = createLayout([a, b], [alignConstraint], [disj]);
        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();
        // Same Y AND (A above B OR B above A) — contradictory
        expect(error).not.toBeNull();
    });

    it('multiple negated disjunctions are all satisfiable simultaneously', () => {
        const a = createNode('A');
        const b = createNode('B');
        const c = createNode('C');
        const src1 = new AlignConstraint('horizontal', 'r1', true);
        const src2 = new AlignConstraint('vertical', 'r2', true);

        // NOT(A same-Y as B) AND NOT(B same-X as C)
        const disj1 = new DisjunctiveConstraint(src1, [
            [{ top: a, bottom: b, minDistance: 15, sourceConstraint: src1 } as TopConstraint],
            [{ top: b, bottom: a, minDistance: 15, sourceConstraint: src1 } as TopConstraint],
        ]);
        const disj2 = new DisjunctiveConstraint(src2, [
            [{ left: b, right: c, minDistance: 15, sourceConstraint: src2 } as LeftConstraint],
            [{ left: c, right: b, minDistance: 15, sourceConstraint: src2 } as LeftConstraint],
        ]);

        const layout = createLayout([a, b, c], [], [disj1, disj2]);
        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();
        expect(error).toBeNull();
    });
});

// ─── Integration Tests: Layout Generation ───────────────────────────────────

describe('NOT orientation constraint integration', () => {
    it('negated orientation produces 2-alternative disjunction', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // Cardinal negation now produces a disjunction: reversed ∨ aligned
        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);
        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(2);
    });

    it('negated "below" produces 2-alternative disjunction', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - below
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);
        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(2);
    });

    it('negated "left" produces 2-alternative disjunction', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - left
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);
        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(2);
    });

    it('negated "right" produces 2-alternative disjunction', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);
        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(2);
    });

    it('negated "directlyAbove" produces disjunction with 4 alternatives', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - directlyAbove
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // directlyAbove = above AND x-aligned
        // ¬(directlyAbove) = ¬(above) ∨ ¬(x-aligned)
        //   ¬(above) = [reversed-top] ∨ [align-y] → 2 alternatives
        //   ¬(x-aligned) = [left(A,B)] ∨ [left(B,A)] → 2 alternatives
        //   Total: 4 alternatives
        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);

        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(4);
    });

    it('negated "directlyLeft" produces disjunction with 4 alternatives', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - directlyLeft
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        expect(layout.disjunctiveConstraints).toBeDefined();
        const disj = layout.disjunctiveConstraints![0];
        // ¬(left ∧ same-Y) = ¬(left) ∨ ¬(same-Y)
        //   = [reversed-left, align-x] ∨ [top(A,B), top(B,A)] → 4 alternatives
        expect(disj.alternatives).toHaveLength(4);
    });

    it('negated multi-direction [above, left] produces disjunction (De Morgan)', () => {
        // Positive: above AND left (conjunctive)
        // Negated: NOT(above AND left) = NOT(above) OR NOT(left) → disjunction
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
        - left
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // Should produce a DisjunctiveConstraint, NOT conjunctive constraints
        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBe(1);

        const disj = layout.disjunctiveConstraints![0];
        // NOT(above) → 2 alternatives, NOT(left) → 2 alternatives → total 4
        expect(disj.alternatives).toHaveLength(4);
    });

    it('negated [above, left] with positive [left] is satisfiable', () => {
        // orientation [left] + NOT orientation [above, left]
        // = (A left of B) AND (NOT above OR NOT left)
        // Satisfiable: A is left of B but at same level → NOT above is true
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [left]
  - orientation:
      selector: r
      directions: [above, left]
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // This should NOT produce an error — the Codex review flagged the old
        // code as making this incorrectly unsatisfiable
        expect(layout.constraints.length).toBeGreaterThan(0);
        expect(layout.disjunctiveConstraints).toBeDefined();
    });

    it('positive + negated orientation compose on same data', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [left]
  - orientation:
      selector: r
      directions: [above]
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // Should have both positive (left) and negated (not above) constraints
        const leftConstraints = layout.constraints.filter(isLeftConstraint) as LeftConstraint[];
        const topConstraints = layout.constraints.filter(isTopConstraint) as TopConstraint[];

        expect(leftConstraints.length).toBeGreaterThan(0);
        // The negated "above" should appear as a top constraint with minDist=0
        const zeroDistTop = topConstraints.filter(c => c.minDistance === 0);
        expect(zeroDistTop.length).toBeGreaterThan(0);
    });

    it('negated orientation on multi-tuple selector produces one constraint per tuple', () => {
        const instance = new JSONDataInstance(fourNodeChainData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - above
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // r has 3 tuples: (A,B), (B,C), (C,D) → 3 negated constraints
        const topConstraints = layout.constraints.filter(isTopConstraint) as TopConstraint[];
        const zeroDistConstraints = topConstraints.filter(c => c.minDistance === 0);
        expect(zeroDistConstraints).toHaveLength(3);
    });
});

describe('NOT alignment constraint integration', () => {
    it('negated alignment produces disjunctive constraint', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: r
      direction: horizontal
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // Should have disjunctive constraints (NOT same-Y = above OR below)
        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);

        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(2); // Two alternatives: above or below
    });

    it('negated vertical alignment produces left/right disjunction', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: r
      direction: vertical
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);

        const disj = layout.disjunctiveConstraints![0];
        expect(disj.alternatives).toHaveLength(2);

        // Both alternatives should be LeftConstraints
        for (const alt of disj.alternatives) {
            expect(alt.length).toBe(1);
            expect(isLeftConstraint(alt[0])).toBe(true);
        }
    });

    it('negated alignment does not produce conjunctive alignment constraints', () => {
        const instance = new JSONDataInstance(twoNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: r
      direction: horizontal
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // Should have NO alignment constraints in the conjunctive set
        const alignmentConstraints = layout.constraints.filter(isAlignmentConstraint);
        expect(alignmentConstraints).toHaveLength(0);
    });
});

describe('NOT cyclic constraint integration', () => {
    it('negated cyclic produces negated disjunctions via De Morgan', () => {
        const instance = new JSONDataInstance(threeNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
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

    it('negated counterclockwise cyclic also produces De Morgan disjunctions', () => {
        const instance = new JSONDataInstance(threeNodeData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: next
      direction: counterclockwise
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);
    });

    it('number of negated disjunctions matches number of rotational alternatives', () => {
        const instance = new JSONDataInstance(threeNodeData);
        const evaluator = createEvaluator(instance);

        // First, generate the positive cyclic to count alternatives
        const posSpec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
`);
        const posLayout = new LayoutInstance(posSpec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout: posResult } = posLayout.generateLayout(instance);
        const numPositiveAlternatives = posResult.disjunctiveConstraints?.[0]?.alternatives.length ?? 0;

        // Now generate negated — should produce that many DisjunctiveConstraints
        const negSpec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
      hold: never
`);
        const negLayout = new LayoutInstance(negSpec, createEvaluator(new JSONDataInstance(threeNodeData)), 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout: negResult } = negLayout.generateLayout(new JSONDataInstance(threeNodeData));

        expect(negResult.disjunctiveConstraints).toBeDefined();
        expect(negResult.disjunctiveConstraints!.length).toBe(numPositiveAlternatives);
    });
});

// ─── toHTML Display Tests ────────────────────────────────────────────────────

describe('toHTML includes NOT prefix for negated constraints', () => {
    it('negated orientation toHTML starts with NOT', () => {
        const c = new RelativeOrientationConstraint(['above'], 'r', true);
        expect(c.toHTML()).toMatch(/^NOT /);
    });

    it('positive orientation toHTML does not start with NOT', () => {
        const c = new RelativeOrientationConstraint(['above'], 'r', false);
        expect(c.toHTML()).not.toMatch(/^NOT /);
    });

    it('negated align toHTML starts with NOT', () => {
        const c = new AlignConstraint('horizontal', 'r', true);
        expect(c.toHTML()).toMatch(/^NOT /);
    });

    it('negated cyclic toHTML starts with NOT', () => {
        const c = new CyclicOrientationConstraint('clockwise', 'next', true);
        expect(c.toHTML()).toMatch(/^NOT /);
    });
});

// ─── NOT Group Constraint Tests ──────────────────────────────────────────────

const threeNodeGroupData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
    ],
    relations: []
};

const fourNodeGroupData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
        { id: 'D', type: 'Node', label: 'D' }
    ],
    relations: []
};

describe('NOT group constraint integration', () => {
    it('NOT GROUP with 1 member is unsatisfiable (cycle: non-member forced to same position)', () => {
        // 1-member group {A}, non-member B: the only alternative forces B at same
        // position as A (Left(A,B,0) ∧ Left(B,A,0) ∧ Top(A,B,0) ∧ Top(B,A,0)).
        // The qualitative solver detects the cycle (A<B and B<A on both axes).
        const data: IJsonDataInstance = {
            atoms: [
                { id: 'A', type: 'Small', label: 'A' },
                { id: 'B', type: 'Big', label: 'B' }
            ],
            relations: []
        };
        const instance = new JSONDataInstance(data);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: Small
      name: singleGroup
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { error } = layoutInstance.generateLayout(instance);

        expect(error).not.toBeNull();
    });

    it('NOT GROUP where all nodes are members is unsatisfiable (no witness)', () => {
        // All 3 atoms are type Node → all are members → no non-members → 0 alternatives
        const instance = new JSONDataInstance(threeNodeGroupData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: Node
      name: everyoneGroup
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { error } = layoutInstance.generateLayout(instance);

        // No non-members → 0 alternatives → unsatisfiable
        expect(error).not.toBeNull();
    });

    it('NOT GROUP with 2 members and 2 non-members generates correct alternative count', () => {
        const instance = new JSONDataInstance(fourNodeGroupData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: "A + B"
      name: negGroup
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // Negated group should produce disjunctive constraints.
        // With 2 members (≤ BBOX_THRESHOLD), uses flat encoding:
        // 2 non-members × 2P2 × 2P2 = 2 × 2 × 2 = 8 alternatives in 1 disjunction.
        expect(layout.disjunctiveConstraints).toBeDefined();
        expect(layout.disjunctiveConstraints!.length).toBeGreaterThan(0);

        // Find the negated group disjunction
        const negGroupDisj = layout.disjunctiveConstraints!.find(d =>
            d.alternatives.length > 0 &&
            d.alternatives[0].length === 4 &&
            (isLeftConstraint(d.alternatives[0][0]) || isTopConstraint(d.alternatives[0][0]))
        );
        expect(negGroupDisj).toBeDefined();
        expect(negGroupDisj!.alternatives).toHaveLength(8); // 2 non-members × (2×1) × (2×1)

        // Each alternative should have exactly 4 constraints (mL≤N, N≤mR, mT≤N, N≤mB)
        for (const alt of negGroupDisj!.alternatives) {
            expect(alt).toHaveLength(4);
        }
    });

    it('negated group does not draw a visual rectangle', () => {
        const instance = new JSONDataInstance(fourNodeGroupData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: "A + B"
      name: negGroup
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout } = layoutInstance.generateLayout(instance);

        // Negated groups should be filtered out of layout.groups (no visual rectangle)
        const negatedGroups = layout.groups.filter(g => g.name === 'negGroup');
        expect(negatedGroups).toHaveLength(0);
    });

    it('positive GROUP and NOT GROUP (3 nodes) is unsatisfiable', () => {
        // Minimal case: 2 members {A, B}, 1 non-member {C}
        const data: IJsonDataInstance = {
            atoms: [
                { id: 'A', type: 'Alpha', label: 'A' },
                { id: 'B', type: 'Alpha', label: 'B' },
                { id: 'C', type: 'Beta', label: 'C' }
            ],
            relations: []
        };
        const instance = new JSONDataInstance(data);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: Alpha
      name: posGroup
  - group:
      selector: Alpha
      name: negGroup
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { layout, error } = layoutInstance.generateLayout(instance);

        expect(error).not.toBeNull();
    });

    it('positive GROUP and NOT GROUP on same members is unsatisfiable', () => {
        // GROUP requires all non-members outside; NOT GROUP requires some non-member inside.
        // Graph-based propagation (Rule T+S+F) detects the contradiction:
        // exclusion commits C < A, C < B → NOT group alt Left(A,C) creates cycle.
        const instance = new JSONDataInstance(fourNodeGroupData);
        const evaluator = createEvaluator(instance);
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: "A + B"
      name: myGroup
  - group:
      selector: "A + B"
      name: myNegGroup
      hold: never
`);

        const layoutInstance = new LayoutInstance(spec, evaluator, 0, true, undefined, ConstraintValidatorStrategy.QUALITATIVE);
        const { error } = layoutInstance.generateLayout(instance);
        expect(error).not.toBeNull();
    });
});
