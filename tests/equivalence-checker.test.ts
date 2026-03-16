import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import {
    checkEquivalence,
    checkLayoutEquivalence,
    abstractKey,
    toAbstract,
    abstractConstraintSet,
    diffAbstractSets,
    negateConstraint,
    solveForPositions,
    Realization,
} from '../src/layout/equivalence-checker';
import {
    LayoutNode,
    InstanceLayout,
    LayoutConstraint,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint } from '../src/layout/layoutspec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, width = 100, height = 60): LayoutNode {
    return {
        id,
        label: id,
        color: '#ccc',
        width,
        height,
        mostSpecificType: 'Type1',
        types: ['Type1'],
        showLabels: true,
    };
}

/** Dummy source constraint used for all test constraints. */
const dummySource = new RelativeOrientationConstraint(['right'], 'dummy');

function makeLeft(leftNode: LayoutNode, rightNode: LayoutNode, minDistance = 15): LeftConstraint {
    return { left: leftNode, right: rightNode, minDistance, sourceConstraint: dummySource };
}

function makeTop(topNode: LayoutNode, bottomNode: LayoutNode, minDistance = 15): TopConstraint {
    return { top: topNode, bottom: bottomNode, minDistance, sourceConstraint: dummySource };
}

function makeAlign(node1: LayoutNode, node2: LayoutNode, axis: 'x' | 'y'): AlignmentConstraint {
    return { axis, node1, node2, sourceConstraint: dummySource };
}

function makeLayout(nodes: LayoutNode[], constraints: LayoutConstraint[]): InstanceLayout {
    return { nodes, edges: [], constraints, groups: [] };
}

// ---------------------------------------------------------------------------
// Shared data instance for LayoutInstance-level tests
// ---------------------------------------------------------------------------

const jsonData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
    ],
    relations: [
        {
            id: 'r',
            name: 'r',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            ],
        },
    ],
};

function createEvaluator(instance: JSONDataInstance) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

// ===================================================================
// Tests
// ===================================================================

describe('abstractKey / toAbstract', () => {
    const A = makeNode('A');
    const B = makeNode('B');

    it('produces the same abstract key for left constraints regardless of minDistance', () => {
        const c1 = makeLeft(A, B, 10);
        const c2 = makeLeft(A, B, 99);
        const a1 = toAbstract(c1)!;
        const a2 = toAbstract(c2)!;
        expect(abstractKey(a1)).toBe(abstractKey(a2));
    });

    it('produces different keys for opposite left constraints', () => {
        const c1 = makeLeft(A, B);
        const c2 = makeLeft(B, A);
        const a1 = toAbstract(c1)!;
        const a2 = toAbstract(c2)!;
        expect(abstractKey(a1)).not.toBe(abstractKey(a2));
    });

    it('normalises alignment key order', () => {
        const c1 = makeAlign(A, B, 'x');
        const c2 = makeAlign(B, A, 'x');
        const a1 = toAbstract(c1)!;
        const a2 = toAbstract(c2)!;
        expect(abstractKey(a1)).toBe(abstractKey(a2));
    });

    it('maps left constraint to left-of type', () => {
        const ac = toAbstract(makeLeft(A, B))!;
        expect(ac.type).toBe('left-of');
        expect(ac.nodeA).toBe('A');
        expect(ac.nodeB).toBe('B');
    });

    it('maps top constraint to above type', () => {
        const ac = toAbstract(makeTop(A, B))!;
        expect(ac.type).toBe('above');
    });

    it('maps alignment x to align-x type', () => {
        const ac = toAbstract(makeAlign(A, B, 'x'))!;
        expect(ac.type).toBe('align-x');
    });
});

describe('diffAbstractSets', () => {
    const A = makeNode('A');
    const B = makeNode('B');

    it('returns empty diff for identical constraint sets', () => {
        const constraints = [makeLeft(A, B)];
        const setA = abstractConstraintSet(constraints);
        const setB = abstractConstraintSet(constraints);
        const diff = diffAbstractSets(setA, setB);
        expect(diff.onlyInA.size).toBe(0);
        expect(diff.onlyInB.size).toBe(0);
        expect(diff.shared.size).toBe(1);
    });

    it('finds constraints only in A', () => {
        const ca = [makeLeft(A, B), makeTop(A, B)];
        const cb = [makeLeft(A, B)];
        const diff = diffAbstractSets(abstractConstraintSet(ca), abstractConstraintSet(cb));
        expect(diff.onlyInA.size).toBe(1);
        expect(diff.onlyInB.size).toBe(0);
    });

    it('treats same nodes with different minDistance as identical', () => {
        const ca = [makeLeft(A, B, 10)];
        const cb = [makeLeft(A, B, 99)];
        const diff = diffAbstractSets(abstractConstraintSet(ca), abstractConstraintSet(cb));
        expect(diff.onlyInA.size).toBe(0);
        expect(diff.onlyInB.size).toBe(0);
        expect(diff.shared.size).toBe(1);
    });
});

describe('checkLayoutEquivalence', () => {
    const A = makeNode('A');
    const B = makeNode('B');
    const C = makeNode('C');
    const nodes = [A, B, C];

    it('reports equivalent for identical constraint sets', () => {
        const constraints = [makeLeft(A, B), makeTop(B, C)];
        const layoutA = makeLayout(nodes, constraints);
        const layoutB = makeLayout(nodes, [...constraints]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(true);
    });

    it('reports equivalent for empty constraint sets', () => {
        const layoutA = makeLayout(nodes, []);
        const layoutB = makeLayout(nodes, []);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(true);
    });

    it('reports equivalent when constraints differ only in minDistance', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B, 10)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B, 99)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(true);
    });

    it('detects contradictory left constraints (A left-of B vs B left-of A)', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B)]);
        const layoutB = makeLayout(nodes, [makeLeft(B, A)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('incompatible');
            expect(result.conflicts.length).toBeGreaterThan(0);
        }
    });

    it('detects contradictory ordering constraints (A above B vs B above A)', () => {
        const layoutA = makeLayout(nodes, [makeTop(A, B)]);
        const layoutB = makeLayout(nodes, [makeTop(B, A)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('incompatible');
            expect(result.conflicts.length).toBeGreaterThan(0);
        }
    });

    it('detects first-strictly-contains-second when A has extra compatible constraints', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B), makeTop(B, C)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('first-strictly-contains-second');
            expect(result.genuineExtrasInFirst).toHaveLength(1);
            expect(result.genuineExtrasInSecond).toHaveLength(0);
            expect(result.conflicts).toHaveLength(0);
        }
    });

    it('detects second-strictly-contains-first when B has extra compatible constraints', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B), makeTop(A, C)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('second-strictly-contains-first');
            expect(result.genuineExtrasInFirst).toHaveLength(0);
            expect(result.genuineExtrasInSecond).toHaveLength(1);
            expect(result.conflicts).toHaveLength(0);
        }
    });

    it('detects overlapping when both have extra compatible constraints', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B), makeTop(A, C)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B), makeTop(B, C)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('overlapping');
            expect(result.genuineExtrasInFirst).toHaveLength(1);
            expect(result.genuineExtrasInSecond).toHaveLength(1);
        }
    });

    it('detects semantic equivalence for redundant transitive constraint', () => {
        // A left-of B, B left-of C implies A left-of C.
        // The extra constraint is redundant, so the systems are equivalent.
        const layoutA = makeLayout(nodes, [makeLeft(A, B), makeLeft(B, C), makeLeft(A, C)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B), makeLeft(B, C)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(true);
    });

    it('detects conflict between alignment and ordering', () => {
        // A.x = B.x AND A.x + A.width ≤ B.x is impossible for width > 0.
        const layoutA = makeLayout(nodes, [makeAlign(A, B, 'x')]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.conflicts.length).toBeGreaterThan(0);
        }
    });

    it('conflict detail tags constraints with correct source', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B)]);
        const layoutB = makeLayout(nodes, [makeLeft(B, A)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent && result.conflicts.length > 0) {
            const detail = result.conflicts[0];
            // The triggering constraint should be from 'second' (B's constraint added after A's)
            expect(detail.triggeringConstraint.source).toBe('second');
            // The IIS should contain a constraint from 'first'
            expect(detail.minimalConflictingSet.some(tc => tc.source === 'first')).toBe(true);
        }
    });

    it('conflict detail includes abstract constraint info', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B)]);
        const layoutB = makeLayout(nodes, [makeLeft(B, A)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent && result.conflicts.length > 0) {
            const detail = result.conflicts[0];
            expect(detail.triggeringConstraint.abstract.type).toBe('left-of');
        }
    });
});

describe('checkEquivalence (LayoutInstance level)', () => {
    it('reports equivalent when both use the same spec', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator1 = createEvaluator(instance);
        const evaluator2 = createEvaluator(instance);

        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
`);

        const li1 = new LayoutInstance(spec, evaluator1);
        const li2 = new LayoutInstance(spec, evaluator2);

        const result = checkEquivalence(li1, li2, instance);
        expect(result.equivalent).toBe(true);
    });

    it('detects non-equivalence when specs differ', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator1 = createEvaluator(instance);
        const evaluator2 = createEvaluator(instance);

        const spec1 = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
`);
        const spec2 = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - below
`);

        const li1 = new LayoutInstance(spec1, evaluator1);
        const li2 = new LayoutInstance(spec2, evaluator2);

        const result = checkEquivalence(li1, li2, instance);
        expect(result.equivalent).toBe(false);
    });

    it('detects incompatibility when specs contradict (right vs left)', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator1 = createEvaluator(instance);
        const evaluator2 = createEvaluator(instance);

        const spec1 = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
`);
        const spec2 = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - left
`);

        const li1 = new LayoutInstance(spec1, evaluator1);
        const li2 = new LayoutInstance(spec2, evaluator2);

        const result = checkEquivalence(li1, li2, instance);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.conflicts.length).toBeGreaterThan(0);
        }
    });
});

// ===================================================================
// Realization tests
// ===================================================================

/**
 * Check that a realization satisfies a left constraint: left.x + left.width <= right.x
 */
function satisfiesLeft(r: Realization, c: LeftConstraint): boolean {
    const lp = r.get(c.left.id)!;
    const rp = r.get(c.right.id)!;
    return lp.x + c.left.width <= rp.x + 0.001; // small epsilon for floating point
}

/**
 * Check that a realization satisfies a top constraint: top.y + top.height <= bottom.y
 */
function satisfiesTop(r: Realization, c: TopConstraint): boolean {
    const tp = r.get(c.top.id)!;
    const bp = r.get(c.bottom.id)!;
    return tp.y + c.top.height <= bp.y + 0.001;
}

/**
 * Check that a realization satisfies an alignment constraint: node1[axis] == node2[axis]
 */
function satisfiesAlign(r: Realization, c: AlignmentConstraint): boolean {
    const p1 = r.get(c.node1.id)!;
    const p2 = r.get(c.node2.id)!;
    return Math.abs(p1[c.axis] - p2[c.axis]) < 0.001;
}

function satisfiesAll(r: Realization, constraints: LayoutConstraint[]): boolean {
    for (const c of constraints) {
        if ('left' in c && 'right' in c) {
            if (!satisfiesLeft(r, c as LeftConstraint)) return false;
        } else if ('top' in c && 'bottom' in c) {
            if (!satisfiesTop(r, c as TopConstraint)) return false;
        } else if ('axis' in c && 'node1' in c) {
            if (!satisfiesAlign(r, c as AlignmentConstraint)) return false;
        }
    }
    return true;
}

describe('solveForPositions', () => {
    const A = makeNode('A');
    const B = makeNode('B');
    const C = makeNode('C');
    const nodes = [A, B, C];

    it('returns positions for a feasible system', () => {
        const constraints = [makeLeft(A, B), makeTop(B, C)];
        const r = solveForPositions(nodes, constraints);
        expect(r).not.toBeNull();
        expect(r!.size).toBe(3);
        expect(satisfiesAll(r!, constraints)).toBe(true);
    });

    it('returns null for an infeasible system', () => {
        const constraints = [makeLeft(A, B), makeLeft(B, A)];
        const r = solveForPositions(nodes, constraints);
        expect(r).toBeNull();
    });

    it('satisfies alignment constraints', () => {
        const constraints = [makeAlign(A, B, 'x'), makeTop(A, B)];
        const r = solveForPositions(nodes, constraints);
        expect(r).not.toBeNull();
        expect(satisfiesAll(r!, constraints)).toBe(true);
    });
});

describe('separating realizations', () => {
    const A = makeNode('A');
    const B = makeNode('B');
    const C = makeNode('C');
    const nodes = [A, B, C];

    it('provides a realization for incompatible systems', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B)]);
        const layoutB = makeLayout(nodes, [makeLeft(B, A)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.separatingRealization).toBeDefined();
            expect(result.realizationSatisfies).toBe('first');
            expect(satisfiesAll(result.separatingRealization!, layoutA.constraints)).toBe(true);
            expect(satisfiesAll(result.separatingRealization!, layoutB.constraints)).toBe(false);
        }
    });

    it('provides a realization for first-strictly-contains-second', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B), makeTop(B, C)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('first-strictly-contains-second');
            expect(result.separatingRealization).toBeDefined();
            expect(result.realizationSatisfies).toBe('second');
            expect(satisfiesAll(result.separatingRealization!, layoutB.constraints)).toBe(true);
            expect(satisfiesAll(result.separatingRealization!, layoutA.constraints)).toBe(false);
        }
    });

    it('provides a realization for second-strictly-contains-first', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B), makeTop(A, C)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('second-strictly-contains-first');
            expect(result.separatingRealization).toBeDefined();
            expect(result.realizationSatisfies).toBe('first');
            expect(satisfiesAll(result.separatingRealization!, layoutA.constraints)).toBe(true);
            expect(satisfiesAll(result.separatingRealization!, layoutB.constraints)).toBe(false);
        }
    });

    it('provides a realization for overlapping systems', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B), makeTop(A, C)]);
        const layoutB = makeLayout(nodes, [makeLeft(A, B), makeTop(B, C)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent) {
            expect(result.relationship).toBe('overlapping');
            expect(result.separatingRealization).toBeDefined();
            const r = result.separatingRealization!;
            const sat = result.realizationSatisfies!;
            if (sat === 'first') {
                expect(satisfiesAll(r, layoutA.constraints)).toBe(true);
                expect(satisfiesAll(r, layoutB.constraints)).toBe(false);
            } else {
                expect(satisfiesAll(r, layoutB.constraints)).toBe(true);
                expect(satisfiesAll(r, layoutA.constraints)).toBe(false);
            }
        }
    });

    it('no realization for equivalent systems', () => {
        const constraints = [makeLeft(A, B), makeTop(B, C)];
        const layoutA = makeLayout(nodes, constraints);
        const layoutB = makeLayout(nodes, [...constraints]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(true);
    });

    it('realization has entries for all nodes', () => {
        const layoutA = makeLayout(nodes, [makeLeft(A, B)]);
        const layoutB = makeLayout(nodes, [makeLeft(B, A)]);
        const result = checkLayoutEquivalence(layoutA, layoutB);
        expect(result.equivalent).toBe(false);
        if (!result.equivalent && result.separatingRealization) {
            expect(result.separatingRealization.size).toBe(nodes.length);
            for (const n of nodes) {
                expect(result.separatingRealization.has(n.id)).toBe(true);
                const pos = result.separatingRealization.get(n.id)!;
                expect(typeof pos.x).toBe('number');
                expect(typeof pos.y).toBe('number');
            }
        }
    });
});
