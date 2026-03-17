/**
 * Head-to-head benchmark: Kiwi (backtracking) vs Qualitative (CDCL) validator.
 *
 * Each scenario builds an identical InstanceLayout and runs both validators,
 * reporting wall-clock time plus the qualitative validator's internal stats.
 *
 * Run with:  npx vitest run tests/validator-benchmark.test.ts
 */
import { describe, it, expect } from 'vitest';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    BoundingBoxConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../src/layout/layoutspec';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNode(id: string, opts?: { width?: number; height?: number }): LayoutNode {
    return {
        id,
        label: id,
        color: 'black',
        groups: [],
        attributes: {},
        width: opts?.width ?? 100,
        height: opts?.height ?? 60,
        mostSpecificType: 'Node',
        types: ['Node'],
        showLabels: true,
    };
}

function leftOf(
    left: LayoutNode,
    right: LayoutNode,
    src?: RelativeOrientationConstraint
): LeftConstraint {
    return {
        left, right, minDistance: 15,
        sourceConstraint: src ?? new RelativeOrientationConstraint(['left'], `${left.id}->${right.id}`),
    };
}

function above(
    top: LayoutNode,
    bottom: LayoutNode,
    src?: RelativeOrientationConstraint
): TopConstraint {
    return {
        top, bottom, minDistance: 15,
        sourceConstraint: src ?? new RelativeOrientationConstraint(['above'], `${top.id}->${bottom.id}`),
    };
}

function align(
    n1: LayoutNode,
    n2: LayoutNode,
    axis: 'x' | 'y',
    src?: RelativeOrientationConstraint
): AlignmentConstraint {
    return {
        axis, node1: n1, node2: n2,
        sourceConstraint: src ?? new RelativeOrientationConstraint(
            [axis === 'x' ? 'directlyAbove' : 'directlyLeft'],
            `align-${n1.id}-${n2.id}`
        ),
    };
}

function makeLayout(
    nodes: LayoutNode[],
    constraints: any[] = [],
    disjunctiveConstraints?: DisjunctiveConstraint[],
    groups: LayoutGroup[] = []
): InstanceLayout {
    return { nodes, edges: [], constraints, groups, disjunctiveConstraints };
}

/** Deep-clone a layout so the two validators get independent copies. */
function cloneLayout(layout: InstanceLayout): InstanceLayout {
    // Constraints/disjunctions reference LayoutNode objects by identity.
    // Both validators only read node.id / node.width / node.height, so sharing
    // node objects is fine.  We clone the arrays and groups so mutations in one
    // validator don't leak into the other.
    return {
        nodes: [...layout.nodes],
        edges: [...layout.edges],
        constraints: [...layout.constraints],
        groups: layout.groups.map(g => ({ ...g, nodeIds: [...g.nodeIds] })),
        disjunctiveConstraints: layout.disjunctiveConstraints
            ? [...layout.disjunctiveConstraints]
            : undefined,
    };
}

type BenchResult = {
    kiwiMs: number;
    qualMs: number;
    kiwiError: boolean;
    qualError: boolean;
    qualStats: ReturnType<QualitativeConstraintValidator['getStats']>;
};

function bench(layout: InstanceLayout, warmup = 1): BenchResult {
    // Warm-up runs (discard)
    for (let i = 0; i < warmup; i++) {
        new ConstraintValidator(cloneLayout(layout)).validateConstraints();
        new QualitativeConstraintValidator(cloneLayout(layout)).validateConstraints();
    }

    // Kiwi
    const kiwiLayout = cloneLayout(layout);
    const t0 = performance.now();
    const kiwiValidator = new ConstraintValidator(kiwiLayout);
    const kiwiResult = kiwiValidator.validateConstraints();
    const t1 = performance.now();

    // Qualitative
    const qualLayout = cloneLayout(layout);
    const t2 = performance.now();
    const qualValidator = new QualitativeConstraintValidator(qualLayout);
    const qualResult = qualValidator.validateConstraints();
    const t3 = performance.now();

    return {
        kiwiMs: t1 - t0,
        qualMs: t3 - t2,
        kiwiError: kiwiResult !== null,
        qualError: qualResult !== null,
        qualStats: qualValidator.getStats(),
    };
}

function report(name: string, r: BenchResult) {
    const speedup = r.kiwiMs / Math.max(r.qualMs, 0.001);
    console.log(
        `\n  [${name}]\n` +
        `    Kiwi:        ${r.kiwiMs.toFixed(2)} ms  (error=${r.kiwiError})\n` +
        `    Qualitative: ${r.qualMs.toFixed(2)} ms  (error=${r.qualError})\n` +
        `    Speedup:     ${speedup.toFixed(1)}×\n` +
        `    Qual stats:  ` + JSON.stringify(r.qualStats)
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

describe('Validator benchmark: Kiwi vs Qualitative', () => {

    // ─── 1. Pure conjunctive chain ────────────────────────────────────────

    it('conjunctive chain (N=50)', () => {
        const N = 50;
        const nodes = Array.from({ length: N }, (_, i) => createNode(`n${i}`));
        const constraints = nodes.slice(0, -1).map((n, i) => leftOf(n, nodes[i + 1]));
        const layout = makeLayout(nodes, constraints);

        const r = bench(layout);
        report('Conjunctive chain N=50', r);

        expect(r.kiwiError).toBe(false);
        expect(r.qualError).toBe(false);
    });

    it('conjunctive chain (N=200)', () => {
        const N = 200;
        const nodes = Array.from({ length: N }, (_, i) => createNode(`n${i}`));
        const constraints = nodes.slice(0, -1).map((n, i) => leftOf(n, nodes[i + 1]));
        const layout = makeLayout(nodes, constraints);

        const r = bench(layout);
        report('Conjunctive chain N=200', r);

        expect(r.kiwiError).toBe(false);
        expect(r.qualError).toBe(false);
    });

    // ─── 2. Disjunctive: independent 4-way separations ───────────────────
    //     Each pair of nodes must be separated but direction is free.
    //     Presolver should resolve most without CDCL.

    it('independent 4-way disjunctions (10 pairs)', () => {
        const K = 10;
        const nodes: LayoutNode[] = [];
        const disj: DisjunctiveConstraint[] = [];
        for (let i = 0; i < K; i++) {
            const a = createNode(`a${i}`);
            const b = createNode(`b${i}`);
            nodes.push(a, b);
            const src = new RelativeOrientationConstraint(['left'], `sep-${i}`);
            disj.push(new DisjunctiveConstraint(src, [
                [leftOf(a, b, src)],
                [leftOf(b, a, src)],
                [above(a, b, src)],
                [above(b, a, src)],
            ]));
        }
        const layout = makeLayout(nodes, [], disj);

        const r = bench(layout);
        report('Independent 4-way ×10', r);

        expect(r.kiwiError).toBe(false);
        expect(r.qualError).toBe(false);
    });

    it('independent 4-way disjunctions (50 pairs)', () => {
        const K = 50;
        const nodes: LayoutNode[] = [];
        const disj: DisjunctiveConstraint[] = [];
        for (let i = 0; i < K; i++) {
            const a = createNode(`a${i}`);
            const b = createNode(`b${i}`);
            nodes.push(a, b);
            const src = new RelativeOrientationConstraint(['left'], `sep-${i}`);
            disj.push(new DisjunctiveConstraint(src, [
                [leftOf(a, b, src)],
                [leftOf(b, a, src)],
                [above(a, b, src)],
                [above(b, a, src)],
            ]));
        }
        const layout = makeLayout(nodes, [], disj);

        const r = bench(layout);
        report('Independent 4-way ×50', r);

        expect(r.kiwiError).toBe(false);
        expect(r.qualError).toBe(false);
    });

    // ─── 3. Groups: bounding-box disjunctions from group encoding ────────
    //     This is the real-world hot path: groups generate bounding-box
    //     disjunctions internally, creating the combinatorial explosion.

    it('groups: 5 groups × 5 members, 25 free nodes', () => {
        const nodesPerGroup = 5;
        const numGroups = 5;
        const numFree = 25;
        const allNodes: LayoutNode[] = [];
        const groups: LayoutGroup[] = [];

        for (let g = 0; g < numGroups; g++) {
            const memberIds: string[] = [];
            for (let m = 0; m < nodesPerGroup; m++) {
                const id = `g${g}m${m}`;
                allNodes.push(createNode(id));
                memberIds.push(id);
            }
            groups.push({
                name: `group${g}`,
                nodeIds: memberIds,
                sourceConstraint: new GroupByField(`field${g}`, 0, 1),
            });
        }
        for (let f = 0; f < numFree; f++) {
            allNodes.push(createNode(`free${f}`));
        }

        const layout = makeLayout(allNodes, [], undefined, groups);

        const r = bench(layout);
        report(`Groups: ${numGroups}×${nodesPerGroup} + ${numFree} free`, r);

        // Both should agree on satisfiability
        expect(r.kiwiError).toBe(r.qualError);
    });

    it('groups: 10 groups × 5 members, 50 free nodes', { timeout: 60000 }, () => {
        const nodesPerGroup = 5;
        const numGroups = 10;
        const numFree = 50;
        const allNodes: LayoutNode[] = [];
        const groups: LayoutGroup[] = [];

        for (let g = 0; g < numGroups; g++) {
            const memberIds: string[] = [];
            for (let m = 0; m < nodesPerGroup; m++) {
                const id = `g${g}m${m}`;
                allNodes.push(createNode(id));
                memberIds.push(id);
            }
            groups.push({
                name: `group${g}`,
                nodeIds: memberIds,
                sourceConstraint: new GroupByField(`field${g}`, 0, 1),
            });
        }
        for (let f = 0; f < numFree; f++) {
            allNodes.push(createNode(`free${f}`));
        }

        const layout = makeLayout(allNodes, [], undefined, groups);

        const r = bench(layout);
        report(`Groups: ${numGroups}×${nodesPerGroup} + ${numFree} free`, r);

        expect(r.kiwiError).toBe(r.qualError);
    });

    // ─── 4. Constrained chain + disjunctions (interleaved) ───────────────
    //     Conjunctive chain sets the "backbone", disjunctions add lateral
    //     separation. The qualitative presolver should resolve most via
    //     transitivity.

    it('chain + lateral disjunctions (N=30)', () => {
        const N = 30;
        const nodes = Array.from({ length: N }, (_, i) => createNode(`n${i}`));
        const conjunctive = nodes.slice(0, -1).map((n, i) => leftOf(n, nodes[i + 1]));

        // For every other pair, add a 2-way vertical separation disjunction
        const disj: DisjunctiveConstraint[] = [];
        for (let i = 0; i < N - 1; i += 2) {
            const src = new RelativeOrientationConstraint(['above'], `vert-${i}`);
            disj.push(new DisjunctiveConstraint(src, [
                [above(nodes[i], nodes[i + 1], src)],
                [above(nodes[i + 1], nodes[i], src)],
            ]));
        }

        const layout = makeLayout(nodes, conjunctive, disj);

        const r = bench(layout);
        report('Chain + lateral disj N=30', r);

        expect(r.kiwiError).toBe(false);
        expect(r.qualError).toBe(false);
    });

    // ─── 5. UNSAT: conflicting conjunctive cycle ─────────────────────────

    it('UNSAT: conjunctive 3-cycle', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
        const layout = makeLayout([a, b, c], [leftOf(a, b), leftOf(b, c), leftOf(c, a)]);

        const r = bench(layout);
        report('UNSAT conjunctive 3-cycle', r);

        expect(r.kiwiError).toBe(true);
        expect(r.qualError).toBe(true);
    });

    // ─── 6. UNSAT: disjunctive (two independent infeasible cores) ────────

    it('UNSAT: two independent infeasible disjunctive cores', () => {
        const a = createNode('A'), b = createNode('B');
        const c = createNode('C'), d = createNode('D');

        const src1 = new RelativeOrientationConstraint(['left'], 'AB');
        const src2 = new RelativeOrientationConstraint(['left'], 'BA');
        const src3 = new RelativeOrientationConstraint(['above'], 'CD');
        const src4 = new RelativeOrientationConstraint(['above'], 'DC');

        const layout = makeLayout(
            [a, b, c, d],
            [leftOf(a, b, src1), above(c, d, src3)],
            [
                new DisjunctiveConstraint(src2, [[leftOf(b, a, src2)]]),
                new DisjunctiveConstraint(src4, [[above(d, c, src4)]]),
            ]
        );

        const r = bench(layout);
        report('UNSAT two independent cores', r);

        expect(r.kiwiError).toBe(true);
        expect(r.qualError).toBe(true);
    });

    // ─── 7. UNSAT: large conjunctive cycle ─────────────────────────────
    //     Cycle of N left-of constraints: n0 < n1 < … < n(N-1) < n0.
    //     Tests how quickly each validator detects a large cycle.

    it('UNSAT: conjunctive 20-cycle', () => {
        const N = 20;
        const nodes = Array.from({ length: N }, (_, i) => createNode(`n${i}`));
        const constraints = nodes.map((n, i) => leftOf(n, nodes[(i + 1) % N]));
        const layout = makeLayout(nodes, constraints);

        const r = bench(layout);
        report(`UNSAT conjunctive ${N}-cycle`, r);

        expect(r.kiwiError).toBe(true);
        expect(r.qualError).toBe(true);
    });

    // ─── 8. Cyclic disjunctive: clockwise/counterclockwise rotations ────
    //     N triplets, each with a CyclicOrientationConstraint offering
    //     3 rotation alternatives. Exercises clause learning on cyclic
    //     constraints, which are absent from the other benchmarks.

    it('cyclic disjunctive rotations (10 triplets)', () => {
        const K = 10;
        const nodes: LayoutNode[] = [];
        const disj: DisjunctiveConstraint[] = [];

        for (let i = 0; i < K; i++) {
            const a = createNode(`t${i}a`);
            const b = createNode(`t${i}b`);
            const c = createNode(`t${i}c`);
            nodes.push(a, b, c);

            const src = new RelativeOrientationConstraint(['left'], `cyclic-${i}`);
            // 3 rotations of a clockwise ordering
            disj.push(new DisjunctiveConstraint(src, [
                [leftOf(a, b, src), above(b, c, src)],  // A left-of B, B above C
                [leftOf(b, c, src), above(c, a, src)],  // B left-of C, C above A
                [leftOf(c, a, src), above(a, b, src)],  // C left-of A, A above B
            ]));
        }

        const layout = makeLayout(nodes, [], disj);
        const r = bench(layout);
        report(`Cyclic disjunctive rotations ×${K}`, r);

        expect(r.kiwiError).toBe(false);
        expect(r.qualError).toBe(false);
    });

    // ─── 9. UNSAT: cyclic + conjunctive backbone (forced conflict) ──────
    //     Conjunctive chain A<B<C plus a disjunction where every
    //     alternative creates a cycle. This tests UNSAT detection
    //     when cyclic constraints interact with a fixed backbone.

    it('UNSAT: cyclic alternatives all conflict with backbone', () => {
        const a = createNode('A');
        const b = createNode('B');
        const c = createNode('C');

        // Backbone: A < B < C
        const backbone = [leftOf(a, b), leftOf(b, c)];

        // Every alternative creates a cycle:
        const src = new RelativeOrientationConstraint(['left'], 'forced-cycle');
        const disj = new DisjunctiveConstraint(src, [
            [leftOf(c, a, src)],  // C < A → cycle A<B<C<A
            [leftOf(c, b, src), leftOf(b, a, src)],  // C<B and B<A → cycle
        ]);

        const layout = makeLayout([a, b, c], backbone, [disj]);
        const r = bench(layout);
        report('UNSAT cyclic vs backbone', r);

        expect(r.kiwiError).toBe(true);
        expect(r.qualError).toBe(true);
    });

    // ─── 10. Alignment + ordering (alignment order computation) ──────────

    it('alignment clusters with ordering (5 clusters × 4)', () => {
        const clusters = 5;
        const perCluster = 4;
        const nodes: LayoutNode[] = [];
        const constraints: any[] = [];

        for (let c = 0; c < clusters; c++) {
            const clusterNodes: LayoutNode[] = [];
            for (let i = 0; i < perCluster; i++) {
                const n = createNode(`c${c}n${i}`);
                nodes.push(n);
                clusterNodes.push(n);
            }
            // Align all nodes in cluster vertically (same x)
            for (let i = 1; i < clusterNodes.length; i++) {
                constraints.push(align(clusterNodes[0], clusterNodes[i], 'x'));
            }
            // Order them top-to-bottom within cluster
            for (let i = 0; i < clusterNodes.length - 1; i++) {
                constraints.push(above(clusterNodes[i], clusterNodes[i + 1]));
            }
        }
        // Order clusters left-to-right (first node of each)
        for (let c = 0; c < clusters - 1; c++) {
            constraints.push(leftOf(
                nodes[c * perCluster],
                nodes[(c + 1) * perCluster]
            ));
        }

        const layout = makeLayout(nodes, constraints);

        const r = bench(layout);
        report(`Aligned clusters: ${clusters}×${perCluster}`, r);

        expect(r.kiwiError).toBe(false);
        expect(r.qualError).toBe(false);
    });

    // ─── 8. Heavy backtracking: grid separation (stress test) ────────────
    //     N×N grid where every pair of adjacent cells needs 4-way separation.
    //     This is the worst case for backtracking solvers.

    it('grid separation 4×4 (stress)', () => {
        const G = 4;
        const nodes: LayoutNode[][] = [];
        for (let r = 0; r < G; r++) {
            nodes.push([]);
            for (let c = 0; c < G; c++) {
                nodes[r].push(createNode(`r${r}c${c}`));
            }
        }
        const allNodes = nodes.flat();

        // Row ordering: within each row, left-to-right
        const conjunctive: any[] = [];
        for (let r = 0; r < G; r++) {
            for (let c = 0; c < G - 1; c++) {
                conjunctive.push(leftOf(nodes[r][c], nodes[r][c + 1]));
            }
        }
        // Column ordering: within each column, top-to-bottom
        for (let c = 0; c < G; c++) {
            for (let r = 0; r < G - 1; r++) {
                conjunctive.push(above(nodes[r][c], nodes[r + 1][c]));
            }
        }

        // Cross-row/cross-column: 4-way separation for non-adjacent pairs
        const disj: DisjunctiveConstraint[] = [];
        for (let r1 = 0; r1 < G; r1++) {
            for (let c1 = 0; c1 < G; c1++) {
                for (let r2 = r1; r2 < G; r2++) {
                    for (let c2 = (r2 === r1 ? c1 + 1 : 0); c2 < G; c2++) {
                        // Skip adjacent pairs (already conjunctively constrained)
                        if (Math.abs(r1 - r2) + Math.abs(c1 - c2) <= 1) continue;
                        const a = nodes[r1][c1], b = nodes[r2][c2];
                        const src = new RelativeOrientationConstraint(['left'], `sep-${a.id}-${b.id}`);
                        disj.push(new DisjunctiveConstraint(src, [
                            [leftOf(a, b, src)],
                            [leftOf(b, a, src)],
                            [above(a, b, src)],
                            [above(b, a, src)],
                        ]));
                    }
                }
            }
        }

        const layout = makeLayout(allNodes, conjunctive, disj);

        const r = bench(layout, 0);  // no warmup — heavy
        report(`Grid separation ${G}×${G} (${disj.length} disjunctions)`, r);

        // Both should agree
        expect(r.kiwiError).toBe(r.qualError);
    });
});
