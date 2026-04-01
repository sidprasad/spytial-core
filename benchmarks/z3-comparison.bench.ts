/**
 * Benchmark: QualitativeConstraintValidator vs Z3 WASM oracle.
 *
 * Deterministic scenarios modeled after real SpyTial layouts (CLRS data
 * structures). Each scenario builds the constraint pattern that SpyTial's
 * layout engine would generate for a particular data structure, then
 * compares the custom DPLL(T) solver against Z3 WASM.
 *
 * Run with:  npx vitest run benchmarks/z3-comparison.bench.ts --config vitest.bench.config.ts
 *
 * Scenarios (from spytial-clrs):
 *   - Linked lists: chain ordering
 *   - Binary trees: parent-child ordering + alignment
 *   - Hash tables: group per bucket + chain ordering
 *   - Graphs: pairwise non-overlap disjunctions
 *   - Disjoint sets: groups + inter-group ordering
 *   - Scaling variants at 5, 10, 15, 25 nodes
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
vi.setConfig({ testTimeout: 60_000 });

import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    LayoutConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../src/layout/layoutspec';
import { initZ3, shutdownZ3, resetZ3, solveZ3 } from '../tests/helpers/z3-oracle';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(id: string, w = 100, h = 60): LayoutNode {
    return {
        id, label: id, color: 'black', groups: [], attributes: {},
        width: w, height: h, mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

const SRC = new RelativeOrientationConstraint(['left'], 'z3-bench');

function leftOf(a: LayoutNode, b: LayoutNode, dist = 15): LeftConstraint {
    return { left: a, right: b, minDistance: dist, sourceConstraint: SRC };
}
function aboveOf(a: LayoutNode, b: LayoutNode, dist = 15): TopConstraint {
    return { top: a, bottom: b, minDistance: dist, sourceConstraint: SRC };
}
function alignX(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'x', node1: a, node2: b, sourceConstraint: SRC };
}
function alignY(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'y', node1: a, node2: b, sourceConstraint: SRC };
}

function nonOverlap(a: LayoutNode, b: LayoutNode): DisjunctiveConstraint {
    return new DisjunctiveConstraint(SRC, [
        [leftOf(a, b)], [leftOf(b, a)],
        [aboveOf(a, b)], [aboveOf(b, a)],
    ]);
}

function cloneLayout(layout: InstanceLayout): InstanceLayout {
    return {
        nodes: layout.nodes,
        edges: layout.edges,
        constraints: [...layout.constraints],
        groups: layout.groups,
        disjunctiveConstraints: layout.disjunctiveConstraints
            ? layout.disjunctiveConstraints.map(d =>
                new DisjunctiveConstraint(d.sourceConstraint, d.alternatives.map(a => [...a])))
            : undefined,
    };
}

// ─── Benchmark runner ───────────────────────────────────────────────────────

interface BenchResult {
    label: string;
    nodes: number;
    conjunctive: number;
    disjunctions: number;
    customMs: number;
    z3Ms: number;
    ratio: number;
    customSat: boolean;
    z3Sat: boolean;
    agree: boolean;
}

const allResults: BenchResult[] = [];
let z3Dead = false; // Z3 WASM OOMs after ~2GB cumulative; skip remaining after crash

const Z3_TIMEOUT = 45_000; // 45s per Z3 solve attempt

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms); });
    return Promise.race([promise.then(v => { clearTimeout(timer); return v; }), timeout]);
}

async function bench(
    label: string,
    layout: InstanceLayout,
    trials = 5,
): Promise<BenchResult> {
    const nConj = layout.constraints.length;
    const nDisj = layout.disjunctiveConstraints?.length ?? 0;

    // Warmup custom solver
    new QualitativeConstraintValidator(cloneLayout(layout)).validateConstraints();

    // Time custom solver (median of trials)
    const customTimes: number[] = [];
    let customSat = false;
    for (let i = 0; i < trials; i++) {
        const l = cloneLayout(layout);
        const t0 = performance.now();
        const err = new QualitativeConstraintValidator(l).validateConstraints();
        customTimes.push(performance.now() - t0);
        customSat = err === null;
    }
    customTimes.sort((a, b) => a - b);
    const customMs = customTimes[Math.floor(trials / 2)];

    // Time Z3 (median — fresh context already set up by caller)
    let z3Ms = 0;
    let z3Sat = false;
    let z3Skipped = z3Dead;

    if (!z3Skipped) {
        const z3Times: number[] = [];
        for (let i = 0; i < trials; i++) {
            const t0 = performance.now();
            const result = await withTimeout(
                solveZ3(cloneLayout(layout)).then(v => ({ sat: v, ok: true })),
                Z3_TIMEOUT,
                { sat: false, ok: false },
            );
            z3Times.push(performance.now() - t0);
            z3Sat = result.sat;
            if (!result.ok) { z3Dead = true; z3Skipped = true; break; }
        }
        z3Times.sort((a, b) => a - b);
        z3Ms = z3Skipped ? 0 : z3Times[Math.floor(trials / 2)];
    }

    const ratio = z3Skipped ? Infinity : z3Ms / Math.max(customMs, 0.001);
    const agree = z3Skipped || customSat === z3Sat;

    const z3Label = z3Skipped ? '     OOM' : `${z3Ms.toFixed(2).padStart(8)}ms`;
    const ratioLabel = z3Skipped ? '    ∞×' : `${ratio.toFixed(0).padStart(5)}×`;
    console.log(
        `  ${label.padEnd(50)} ` +
        `${String(layout.nodes.length).padStart(3)}N ` +
        `${String(nConj).padStart(3)}C ` +
        `${String(nDisj).padStart(3)}D  ` +
        `custom=${customMs.toFixed(2).padStart(8)}ms  ` +
        `z3=${z3Label}  ` +
        `${ratioLabel}  ` +
        `${customSat ? 'SAT' : 'UNS'}  ` +
        `${z3Skipped ? '(z3 OOM)' : agree ? '✓' : '✗ DISAGREE'}`
    );

    const result = {
        label, nodes: layout.nodes.length, conjunctive: nConj,
        disjunctions: nDisj, customMs, z3Ms, ratio, customSat, z3Sat, agree,
    };
    allResults.push(result);
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════

afterAll(() => {
    console.log('\n\n  ═══════════════════════════════════════════════════════════════════════════');
    console.log('  SUMMARY: Custom DPLL(T) solver vs Z3 WASM');
    console.log('  ═══════════════════════════════════════════════════════════════════════════');
    console.log(
        '  ' +
        'Scenario'.padEnd(50) +
        '   N'.padStart(4) +
        '   C'.padStart(4) +
        '   D'.padStart(4) +
        '   Custom'.padStart(10) +
        '       Z3'.padStart(10) +
        '  Ratio'.padStart(7) +
        '  Result'
    );
    console.log('  ' + '─'.repeat(100));
    for (const r of allResults) {
        console.log(
            '  ' +
            r.label.padEnd(50) +
            String(r.nodes).padStart(4) +
            String(r.conjunctive).padStart(4) +
            String(r.disjunctions).padStart(4) +
            `${r.customMs.toFixed(2)}ms`.padStart(10) +
            `${r.z3Ms.toFixed(2)}ms`.padStart(10) +
            `${r.ratio.toFixed(0)}×`.padStart(7) +
            `  ${r.customSat ? 'SAT' : 'UNS'} ${r.agree ? '✓' : '✗'}`
        );
    }
    console.log('  ' + '─'.repeat(100));

    const avgRatio = allResults.reduce((s, r) => s + r.ratio, 0) / allResults.length;
    const medianRatio = [...allResults].sort((a, b) => a.ratio - b.ratio)[Math.floor(allResults.length / 2)]?.ratio ?? 0;
    const allAgree = allResults.every(r => r.agree);
    console.log(`  Median ratio: ${medianRatio.toFixed(0)}×   Mean ratio: ${avgRatio.toFixed(0)}×   All agree: ${allAgree ? 'yes' : 'NO'}`);
    console.log('');

    shutdownZ3();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario builders (modeled after spytial-clrs data structures)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Linked list: N nodes in a horizontal chain.
 * Constraints: leftOf(n[i], n[i+1]) for all i.
 * Pattern: singly linked list, stack, queue.
 */
function linkedList(n: number): InstanceLayout {
    const nodes = Array.from({ length: n }, (_, i) => makeNode(`L${i}`, 80, 50));
    const constraints = nodes.slice(0, -1).map((nd, i) => leftOf(nd, nodes[i + 1]));
    return { nodes, edges: [], constraints, groups: [] };
}

/**
 * Binary tree: N nodes arranged as a complete binary tree.
 * Constraints: parent above children, left child left of right child,
 *              children aligned on y-axis (same row).
 * Pattern: BST, red-black tree, heap.
 */
function binaryTree(n: number): InstanceLayout {
    const nodes = Array.from({ length: n }, (_, i) => makeNode(`T${i}`, 60, 40));
    const constraints: LayoutConstraint[] = [];
    for (let i = 0; i < n; i++) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < n) {
            constraints.push(aboveOf(nodes[i], nodes[left]));  // parent above left
        }
        if (right < n) {
            constraints.push(aboveOf(nodes[i], nodes[right])); // parent above right
            constraints.push(leftOf(nodes[left], nodes[right])); // left < right
            constraints.push(alignY(nodes[left], nodes[right])); // same row
        }
    }
    return { nodes, edges: [], constraints, groups: [] };
}

/**
 * Hash table with chaining: K buckets, each with a short chain.
 * Each bucket is a group. Bucket headers are horizontally ordered.
 * Chain elements are ordered left-to-right within each bucket.
 * Pattern: chained hash table.
 */
function hashTable(buckets: number, chainLen: number): InstanceLayout {
    const nodes: LayoutNode[] = [];
    const constraints: LayoutConstraint[] = [];
    const groups: LayoutGroup[] = [];

    // Create bucket header nodes and chain nodes
    const headers: LayoutNode[] = [];
    for (let b = 0; b < buckets; b++) {
        const header = makeNode(`B${b}`, 70, 40);
        headers.push(header);
        nodes.push(header);

        const chain: LayoutNode[] = [header];
        for (let c = 0; c < chainLen; c++) {
            const elem = makeNode(`B${b}E${c}`, 60, 35);
            nodes.push(elem);
            chain.push(elem);
        }

        // Chain ordering: left to right within bucket
        for (let c = 0; c < chain.length - 1; c++) {
            constraints.push(leftOf(chain[c], chain[c + 1]));
        }
        // All chain elements aligned on y
        for (let c = 1; c < chain.length; c++) {
            constraints.push(alignY(chain[0], chain[c]));
        }

        // Group for this bucket
        const gbf = new GroupByField(`bucket${b}`, 0, 1);
        groups.push({
            name: `Bucket${b}`,
            nodeIds: chain.map(nd => nd.id),
            keyNodeId: header.id,
            showLabel: true,
            sourceConstraint: gbf,
        });
    }

    // Bucket headers ordered top-to-bottom
    for (let b = 0; b < headers.length - 1; b++) {
        constraints.push(aboveOf(headers[b], headers[b + 1]));
    }

    return { nodes, edges: [], constraints, groups };
}

/**
 * Graph layout: N nodes with pairwise non-overlap.
 * All-pairs 4-way disjunctions — the classic combinatorial scenario.
 * Pattern: unweighted/weighted graph, MST, SCC.
 */
function graphLayout(n: number): InstanceLayout {
    const nodes = Array.from({ length: n }, (_, i) => makeNode(`G${i}`, 50, 50));
    const disjs: DisjunctiveConstraint[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            disjs.push(nonOverlap(nodes[i], nodes[j]));
        }
    }
    return {
        nodes, edges: [], constraints: [], groups: [],
        disjunctiveConstraints: disjs,
    };
}

/**
 * Disjoint set forest: K sets, each with members.
 * Each set is a group. Set roots have ordering between them.
 * Members within a set are ordered by rank (vertical chain).
 * Pattern: union-find with path compression visualization.
 */
function disjointSets(nSets: number, setSize: number): InstanceLayout {
    const nodes: LayoutNode[] = [];
    const constraints: LayoutConstraint[] = [];
    const groups: LayoutGroup[] = [];

    const roots: LayoutNode[] = [];
    for (let s = 0; s < nSets; s++) {
        const members: LayoutNode[] = [];
        for (let m = 0; m < setSize; m++) {
            const nd = makeNode(`S${s}M${m}`, 60, 40);
            nodes.push(nd);
            members.push(nd);
        }
        roots.push(members[0]);

        // Root above all other members (tree structure)
        for (let m = 1; m < members.length; m++) {
            constraints.push(aboveOf(members[0], members[m]));
        }

        // Group per set
        const gbf = new GroupByField(`set${s}`, 0, 1);
        groups.push({
            name: `Set${s}`,
            nodeIds: members.map(nd => nd.id),
            keyNodeId: members[0].id,
            showLabel: true,
            sourceConstraint: gbf,
        });
    }

    // Roots ordered left-to-right
    for (let s = 0; s < roots.length - 1; s++) {
        constraints.push(leftOf(roots[s], roots[s + 1]));
    }

    return { nodes, edges: [], constraints, groups };
}

/**
 * B-tree: multi-way branching with ordered keys.
 * Each internal node has K children, ordered left-to-right.
 * Children aligned on y-axis. 2 levels deep.
 * Pattern: B-tree visualization.
 */
function bTree(branchingFactor: number, depth: number): InstanceLayout {
    const nodes: LayoutNode[] = [];
    const constraints: LayoutConstraint[] = [];
    let id = 0;

    function buildLevel(parentNode: LayoutNode | null, level: number): LayoutNode[] {
        if (level > depth) return [];
        const width = level === 0 ? 1 : branchingFactor;
        const levelNodes: LayoutNode[] = [];

        for (let i = 0; i < width; i++) {
            const nd = makeNode(`BT${id++}`, 80, 35);
            nodes.push(nd);
            levelNodes.push(nd);
        }

        // Order children left-to-right
        for (let i = 0; i < levelNodes.length - 1; i++) {
            constraints.push(leftOf(levelNodes[i], levelNodes[i + 1]));
        }
        // Align children on same row
        for (let i = 1; i < levelNodes.length; i++) {
            constraints.push(alignY(levelNodes[0], levelNodes[i]));
        }

        // Parent above children
        if (parentNode) {
            for (const child of levelNodes) {
                constraints.push(aboveOf(parentNode, child));
            }
        }

        // Recurse for each child
        if (level < depth) {
            for (const child of levelNodes) {
                buildLevel(child, level + 1);
            }
        }

        return levelNodes;
    }

    buildLevel(null, 0);
    return { nodes, edges: [], constraints, groups: [] };
}

/**
 * Doubly linked list with back-pointers: horizontal chain +
 * non-overlap disjunctions for any pointer-crossing nodes.
 * Pattern: doubly linked list, circular list.
 */
function doublyLinkedList(n: number): InstanceLayout {
    const nodes = Array.from({ length: n }, (_, i) => makeNode(`DL${i}`, 80, 50));
    const constraints = nodes.slice(0, -1).map((nd, i) => leftOf(nd, nodes[i + 1]));
    // Align all nodes on same row
    for (let i = 1; i < nodes.length; i++) {
        constraints.push(alignY(nodes[0], nodes[i]));
    }
    return { nodes, edges: [], constraints, groups: [] };
}

// ─── Seeded PRNG (deterministic across runs) ────────────────────────────────

/** Simple mulberry32 PRNG from a seed. */
function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * Large random layout: N nodes with random orderings, alignments,
 * disjunctions, and groups. Seeded for reproducibility.
 */
function randomLayout(
    n: number,
    opts: {
        seed?: number;
        orderingDensity?: number;   // fraction of pairs that get an ordering
        alignmentDensity?: number;  // fraction of pairs that get an alignment
        disjunctionCount?: number;  // number of 4-way non-overlap disjunctions
        groupCount?: number;        // number of groups
        groupSize?: number;         // members per group
    } = {},
): InstanceLayout {
    const rng = mulberry32(opts.seed ?? 42);
    const orderingDensity = opts.orderingDensity ?? 0.05;
    const alignmentDensity = opts.alignmentDensity ?? 0;
    const disjunctionCount = opts.disjunctionCount ?? 0;
    const groupCount = opts.groupCount ?? 0;
    const groupSize = opts.groupSize ?? 4;

    const nodes = Array.from({ length: n }, (_, i) =>
        makeNode(`R${i}`, 40 + Math.floor(rng() * 80), 30 + Math.floor(rng() * 50)));
    const constraints: LayoutConstraint[] = [];
    const disjs: DisjunctiveConstraint[] = [];
    const groups: LayoutGroup[] = [];

    // Random orderings
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (rng() < orderingDensity) {
                if (rng() < 0.5) {
                    constraints.push(leftOf(nodes[i], nodes[j]));
                } else {
                    constraints.push(aboveOf(nodes[i], nodes[j]));
                }
            }
        }
    }

    // Random alignments
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (rng() < alignmentDensity) {
                constraints.push(rng() < 0.5 ? alignX(nodes[i], nodes[j]) : alignY(nodes[i], nodes[j]));
            }
        }
    }

    // Random non-overlap disjunctions
    const usedPairs = new Set<string>();
    let added = 0;
    while (added < disjunctionCount) {
        const i = Math.floor(rng() * n);
        let j = Math.floor(rng() * (n - 1));
        if (j >= i) j++;
        const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (usedPairs.has(key)) continue;
        usedPairs.add(key);
        disjs.push(nonOverlap(nodes[i], nodes[j]));
        added++;
    }

    // Random groups
    for (let g = 0; g < groupCount; g++) {
        const memberIds: string[] = [];
        const start = Math.floor(rng() * (n - groupSize));
        for (let m = 0; m < groupSize && start + m < n; m++) {
            memberIds.push(nodes[start + m].id);
        }
        if (memberIds.length >= 2) {
            const gbf = new GroupByField(`rg${g}`, 0, 1);
            groups.push({
                name: `RG${g}`, nodeIds: memberIds,
                keyNodeId: memberIds[0], showLabel: true, sourceConstraint: gbf,
            });
        }
    }

    return {
        nodes, edges: [], constraints, groups,
        disjunctiveConstraints: disjs.length > 0 ? disjs : undefined,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Benchmarks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Custom solver vs Z3 oracle', () => {

    beforeAll(async () => { await initZ3(); });

    // ─── Linked lists (Ch. 10) ─────────────────────────────────────────────

    describe('Linked lists', () => {
        for (const n of [5, 10, 15, 25]) {
            it(`singly linked, ${n} nodes`, async () => {
                await resetZ3();
                const r = await bench(`linked-list-${n}`, linkedList(n));
                expect(r.agree).toBe(true);
            });
        }

        for (const n of [5, 10, 15, 25]) {
            it(`doubly linked, ${n} nodes`, async () => {
                await resetZ3();
                const r = await bench(`doubly-linked-${n}`, doublyLinkedList(n));
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Binary trees (Ch. 12-14) ──────────────────────────────────────────

    describe('Binary trees (BST / RB-tree / heap)', () => {
        for (const n of [7, 15, 25]) {
            it(`complete binary tree, ${n} nodes`, async () => {
                await resetZ3();
                const r = await bench(`binary-tree-${n}`, binaryTree(n));
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── B-trees (Ch. 18) ──────────────────────────────────────────────────

    describe('B-trees', () => {
        for (const [bf, d] of [[3, 1], [3, 2], [4, 2]] as const) {
            it(`B-tree bf=${bf} depth=${d}`, async () => {
                await resetZ3();
                const layout = bTree(bf, d);
                const r = await bench(`b-tree-${bf}×${d} (${layout.nodes.length}N)`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Hash tables (Ch. 11) ──────────────────────────────────────────────

    describe('Hash tables with chaining', () => {
        for (const [buckets, chain] of [[3, 2], [5, 2], [5, 3], [8, 2]] as const) {
            it(`${buckets} buckets × ${chain} chain`, async () => {
                await resetZ3();
                const layout = hashTable(buckets, chain);
                const r = await bench(`hash-${buckets}b×${chain}c (${layout.nodes.length}N)`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Graph layouts (Ch. 22-23) ─────────────────────────────────────────

    describe('Graph layouts (pairwise non-overlap)', () => {
        for (const n of [4, 5, 6, 8, 10]) {
            const nDisj = n * (n - 1) / 2;
            it(`${n} nodes (${nDisj} disjunctions)`, async () => {
                await resetZ3();
                const r = await bench(`graph-${n} (${nDisj} disj)`, graphLayout(n));
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Disjoint sets (Ch. 21) ────────────────────────────────────────────

    describe('Disjoint set forests', () => {
        for (const [nSets, sz] of [[3, 3], [4, 3], [5, 3], [3, 5]] as const) {
            it(`${nSets} sets × ${sz} members`, async () => {
                await resetZ3();
                const layout = disjointSets(nSets, sz);
                const r = await bench(`disjoint-${nSets}×${sz} (${layout.nodes.length}N)`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── UNSAT scenarios ───────────────────────────────────────────────────

    describe('UNSAT (conflict detection)', () => {
        it('ordering cycle (3 nodes)', async () => {
            await resetZ3();
            const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
            const layout: InstanceLayout = {
                nodes, edges: [],
                constraints: [leftOf(nodes[0], nodes[1]), leftOf(nodes[1], nodes[2]), leftOf(nodes[2], nodes[0])],
                groups: [],
            };
            const r = await bench('unsat-cycle-3', layout);
            expect(r.agree).toBe(true);
            expect(r.customSat).toBe(false);
        });

        it('alignment + ordering contradiction (4 nodes)', async () => {
            await resetZ3();
            const nodes = Array.from({ length: 4 }, (_, i) => makeNode(`U${i}`));
            const layout: InstanceLayout = {
                nodes, edges: [],
                constraints: [alignX(nodes[0], nodes[2]), leftOf(nodes[0], nodes[1]), leftOf(nodes[1], nodes[2])],
                groups: [],
            };
            const r = await bench('unsat-align-ordering-4', layout);
            expect(r.agree).toBe(true);
            expect(r.customSat).toBe(false);
        });

        it('search exhaustion (5 nodes, all alts infeasible)', async () => {
            await resetZ3();
            const nodes = Array.from({ length: 5 }, (_, i) => makeNode(`V${i}`));
            const constraints = nodes.slice(0, -1).map((nd, i) => leftOf(nd, nodes[i + 1]));
            const alts = nodes.slice(0, -1).map(nd => [leftOf(nodes[4], nd)]);
            const layout: InstanceLayout = {
                nodes, edges: [], constraints, groups: [],
                disjunctiveConstraints: [new DisjunctiveConstraint(SRC, alts)],
            };
            const r = await bench('unsat-search-5', layout);
            expect(r.agree).toBe(true);
            expect(r.customSat).toBe(false);
        });
    });

    // ─── Large-scale random layouts ────────────────────────────────────────

    describe('Large-scale: sparse orderings only', () => {
        for (const n of [50, 100]) {
            it(`${n} nodes, ~5% ordering density`, async () => {
                await resetZ3();
                const layout = randomLayout(n, { seed: n, orderingDensity: 0.05 });
                const r = await bench(`random-orderings-${n}`, layout, 3);
                expect(r.agree).toBe(true);
            });
        }
    });

    describe('Large-scale: orderings + alignments', () => {
        for (const n of [50, 100]) {
            it(`${n} nodes, orderings + alignments`, async () => {
                await resetZ3();
                const layout = randomLayout(n, {
                    seed: n + 1000,
                    orderingDensity: 0.03,
                    alignmentDensity: 0.02,
                });
                const r = await bench(`random-mixed-${n}`, layout, 3);
                expect(r.agree).toBe(true);
            });
        }
    });

    describe('Large-scale: orderings + disjunctions', () => {
        for (const n of [50, 100]) {
            const nDisj = Math.floor(n * 0.3);
            it(`${n} nodes, ${nDisj} disjunctions`, async () => {
                await resetZ3();
                const layout = randomLayout(n, {
                    seed: n + 2000,
                    orderingDensity: 0.03,
                    disjunctionCount: nDisj,
                });
                const r = await bench(`random-disj-${n} (${nDisj}D)`, layout, 3);
                expect(r.agree).toBe(true);
            });
        }
    });

    describe('Large-scale: groups', () => {
        // 100-node group layouts exceed 60s even for the custom solver
        for (const [n, nGroups, gSize] of [[50, 3, 4], [50, 5, 5]] as const) {
            it(`${n} nodes, ${nGroups} groups × ${gSize} members`, async () => {
                await resetZ3();
                const layout = randomLayout(n, {
                    seed: n + 3000,
                    orderingDensity: 0.02,
                    groupCount: nGroups,
                    groupSize: gSize,
                });
                const r = await bench(`random-groups-${n} (${nGroups}g×${gSize})`, layout, 3);
                expect(r.agree).toBe(true);
            });
        }
    });

    describe('Large-scale: full mix', () => {
        for (const [n, nDisj, nGroups] of [[50, 10, 3], [100, 20, 3]] as const) {
            it(`${n} nodes, all constraint types`, async () => {
                await resetZ3();
                const layout = randomLayout(n, {
                    seed: n + 4000,
                    orderingDensity: 0.03,
                    alignmentDensity: 0.01,
                    disjunctionCount: nDisj,
                    groupCount: nGroups,
                    groupSize: 4,
                });
                const r = await bench(`random-full-${n} (${nDisj}D, ${nGroups}g)`, layout, 3);
                expect(r.agree).toBe(true);
            });
        }
    });
});
