/**
 * QualitativeConstraintValidator — merged best-of-both constraint validator.
 *
 * Takes V1's fast architecture (virtual group nodes, lightweight snapshot/restore,
 * single-edge group encoding) and adds geometry-aware reasoning:
 *
 * ─── From V1 (speed) ───
 *
 *   • Virtual group nodes in H/V graphs: one node `_group_G` per group,
 *     one edge per non-member per side. This is O(non-members) per group,
 *     not O(non-members × members).
 *
 *   • UnionFind with snapshot/restore for cheap checkpointing.
 *
 *   • CDCL search with clause learning, VSIDS branching, Luby restarts.
 *
 * ─── Added geometry insights ───
 *
 *   1. **Dimension-aware partial orders**: Each node in the H/V graph carries
 *      its box dimension (width for H, height for V). We compute the longest
 *      weighted chain (= minimum canvas span needed) via topological DP.
 *      If any chain exceeds MAX_SPAN, we reject early.
 *
 *   2. **Pigeonhole on alignment classes**: If K nodes share the same
 *      x-coordinate, they need Σ heights + (K-1)·gap vertical space.
 *      Checked immediately after conjunctive constraints, before any search.
 *
 *   3. **Interval decomposition pre-solver**: For 4-way non-overlap
 *      disjunctions, we try to resolve them before entering CDCL by checking
 *      if the pair is already separated, or if all but one alternative is
 *      infeasible (including dimension overflow).
 *
 *   4. **Dimension-aware alternative pruning**: When checking if an alternative
 *      is feasible, we also verify the resulting chain wouldn't exceed
 *      MAX_SPAN. This prunes alternatives that are acyclic but geometrically
 *      impossible.
 *
 * Architecture:
 *   This validator → feasibility check + ordering selection
 *   Then → Kiwi/WebCola assigns actual numeric coordinates (no backtracking)
 */

import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutEdge,
    LayoutGroup,
    LayoutConstraint,
    isLeftConstraint,
    isTopConstraint,
    isAlignmentConstraint,
    isBoundingBoxConstraint,
    isGroupBoundaryConstraint,
    TopConstraint,
    LeftConstraint,
    AlignmentConstraint,
    BoundingBoxConstraint,
    GroupBoundaryConstraint,
    ImplicitConstraint,
} from './interfaces';

import {
    RelativeOrientationConstraint,
    CyclicOrientationConstraint,
    AlignConstraint,
    GroupByField,
    GroupBySelector,
} from './layoutspec';

import {
    type ConstraintError,
    type ErrorMessages,
    orientationConstraintToString,
} from './constraint-validator';

export {
    type ConstraintError,
    type ErrorMessages,
    orientationConstraintToString,
} from './constraint-validator';

// ─── Source constraint type alias ────────────────────────────────────────────

type SourceConstraint =
    | RelativeOrientationConstraint
    | CyclicOrientationConstraint
    | AlignConstraint
    | ImplicitConstraint
    | GroupByField
    | GroupBySelector;

// ─── Error interfaces ────────────────────────────────────────────────────────

interface PositionalConstraintError extends ConstraintError {
    type: 'positional-conflict';
    conflictingConstraint: LayoutConstraint;
    conflictingSourceConstraint: SourceConstraint;
    minimalConflictingSet: Map<SourceConstraint, LayoutConstraint[]>;
    maximalFeasibleSubset?: LayoutConstraint[];
    errorMessages?: ErrorMessages;
}

interface GroupOverlapError extends ConstraintError {
    type: 'group-overlap';
    group1: LayoutGroup;
    group2: LayoutGroup;
    overlappingNodes: LayoutNode[];
}

export function isPositionalConstraintError(error: unknown): error is PositionalConstraintError {
    return (error as PositionalConstraintError)?.type === 'positional-conflict';
}

export function isGroupOverlapError(error: unknown): error is GroupOverlapError {
    return (error as GroupOverlapError)?.type === 'group-overlap';
}

export { type PositionalConstraintError, type GroupOverlapError };

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Generous canvas bound. Chains exceeding this are infeasible. */
const MAX_SPAN = 100_000;

// ═══════════════════════════════════════════════════════════════════════════════
// Weighted Partial-Order Graph
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DAG representing a strict partial order. Each node carries a dimension
 * (width for H-graph, height for V-graph) so we can compute minimum chain
 * spans without a numeric solver.
 *
 * Includes both box nodes AND virtual group nodes (from V1's encoding).
 */
class WeightedPartialOrderGraph {
    private adj: Map<string, Set<string>> = new Map();
    private radj: Map<string, Set<string>> = new Map();
    private nodes: Set<string> = new Set();
    /** Per-node size on this axis. Boxes have their width/height; group nodes have 0. */
    private nodeSize: Map<string, number> = new Map();
    private gap: number;

    constructor(gap: number = 15) {
        this.gap = gap;
    }

    clone(): WeightedPartialOrderGraph {
        const g = new WeightedPartialOrderGraph(this.gap);
        for (const n of this.nodes) g.nodes.add(n);
        for (const [k, vs] of this.adj) g.adj.set(k, new Set(vs));
        for (const [k, vs] of this.radj) g.radj.set(k, new Set(vs));
        g.nodeSize = new Map(this.nodeSize);
        return g;
    }

    ensureNode(id: string, size: number = 0): void {
        if (!this.nodes.has(id)) {
            this.nodes.add(id);
            this.adj.set(id, new Set());
            this.radj.set(id, new Set());
            this.nodeSize.set(id, size);
        }
    }

    /**
     * Add edge (a → b) meaning a < b. Returns false if it would create a cycle.
     */
    addEdge(a: string, b: string): boolean {
        this.ensureNode(a);
        this.ensureNode(b);
        if (a === b) return false;
        if (this.adj.get(a)!.has(b)) return true;
        if (this.canReach(b, a)) return false;
        this.adj.get(a)!.add(b);
        this.radj.get(b)!.add(a);
        return true;
    }

    removeEdge(a: string, b: string): void {
        this.adj.get(a)?.delete(b);
        this.radj.get(b)?.delete(a);
    }

    hasEdge(a: string, b: string): boolean {
        return this.adj.get(a)?.has(b) ?? false;
    }

    canReach(from: string, to: string): boolean {
        if (from === to) return true;
        const visited = new Set<string>();
        const queue: string[] = [from];
        visited.add(from);
        while (queue.length > 0) {
            const cur = queue.shift()!;
            const succs = this.adj.get(cur);
            if (!succs) continue;
            for (const s of succs) {
                if (s === to) return true;
                if (!visited.has(s)) {
                    visited.add(s);
                    queue.push(s);
                }
            }
        }
        return false;
    }

    isOrdered(a: string, b: string): boolean {
        if (a === b) return false;
        return this.canReach(a, b);
    }

    successors(id: string): ReadonlySet<string> {
        return this.adj.get(id) ?? new Set();
    }

    predecessors(id: string): ReadonlySet<string> {
        return this.radj.get(id) ?? new Set();
    }

    topologicalSort(): string[] | null {
        const inDeg = new Map<string, number>();
        for (const n of this.nodes) inDeg.set(n, 0);
        for (const [, succs] of this.adj) {
            for (const s of succs) inDeg.set(s, (inDeg.get(s) ?? 0) + 1);
        }
        const queue: string[] = [];
        for (const [n, d] of inDeg) { if (d === 0) queue.push(n); }
        const order: string[] = [];
        while (queue.length > 0) {
            const n = queue.shift()!;
            order.push(n);
            for (const s of this.adj.get(n) ?? []) {
                const nd = (inDeg.get(s) ?? 1) - 1;
                inDeg.set(s, nd);
                if (nd === 0) queue.push(s);
            }
        }
        return order.length === this.nodes.size ? order : null;
    }

    /**
     * Minimum canvas span = longest weighted chain through the graph.
     *
     *   dist[n] = size(n) + max over predecessors p of (dist[p] + gap)
     *
     * Group virtual nodes have size 0, so they contribute only gap.
     */
    longestChainSpan(): number {
        const order = this.topologicalSort();
        if (!order) return Infinity; // Cycle

        const dist = new Map<string, number>();
        let maxSpan = 0;

        for (const n of order) {
            const mySize = this.nodeSize.get(n) ?? 0;
            let bestPred = 0;
            for (const p of this.radj.get(n) ?? []) {
                bestPred = Math.max(bestPred, (dist.get(p) ?? 0) + this.gap);
            }
            const d = bestPred + mySize;
            dist.set(n, d);
            maxSpan = Math.max(maxSpan, d);
        }

        return maxSpan;
    }

    /**
     * Would adding edge (a → b) cause the longest chain to exceed maxSpan?
     * Temporarily adds the edge, computes span, removes it.
     * Returns true if the chain would overflow.
     */
    wouldOverflow(a: string, b: string, maxSpan: number): boolean {
        if (this.canReach(b, a)) return true; // Cycle

        this.adj.get(a)!.add(b);
        this.radj.get(b)!.add(a);
        const span = this.longestChainSpan();
        this.adj.get(a)!.delete(b);
        this.radj.get(b)!.delete(a);

        return span > maxSpan;
    }

    edgeCount(): number {
        let count = 0;
        for (const [, succs] of this.adj) count += succs.size;
        return count;
    }

    allNodes(): ReadonlySet<string> {
        return this.nodes;
    }

    allEdges(): [string, string][] {
        const edges: [string, string][] = [];
        for (const [src, succs] of this.adj) {
            for (const tgt of succs) edges.push([src, tgt]);
        }
        return edges;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Union-Find with snapshot/restore (from V1)
// ═══════════════════════════════════════════════════════════════════════════════

class UnionFind {
    private parent: Map<string, string> = new Map();
    private rank: Map<string, number> = new Map();

    find(x: string): string {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.rank.set(x, 0);
        }
        let root = x;
        while (this.parent.get(root) !== root) root = this.parent.get(root)!;
        let cur = x;
        while (cur !== root) {
            const next = this.parent.get(cur)!;
            this.parent.set(cur, root);
            cur = next;
        }
        return root;
    }

    union(a: string, b: string): boolean {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra === rb) return false;
        const rankA = this.rank.get(ra)!;
        const rankB = this.rank.get(rb)!;
        if (rankA < rankB) { this.parent.set(ra, rb); }
        else if (rankA > rankB) { this.parent.set(rb, ra); }
        else { this.parent.set(rb, ra); this.rank.set(ra, rankA + 1); }
        return true;
    }

    connected(a: string, b: string): boolean {
        return this.find(a) === this.find(b);
    }

    classes(): Map<string, string[]> {
        const cls = new Map<string, string[]>();
        for (const [x] of this.parent) {
            const r = this.find(x);
            if (!cls.has(r)) cls.set(r, []);
            cls.get(r)!.push(x);
        }
        return cls;
    }

    snapshot(): { parent: [string, string][]; rank: [string, number][] } {
        return {
            parent: Array.from(this.parent.entries()),
            rank: Array.from(this.rank.entries()),
        };
    }

    restore(snap: { parent: [string, string][]; rank: [string, number][] }): void {
        this.parent = new Map(snap.parent);
        this.rank = new Map(snap.rank);
    }

    clone(): UnionFind {
        const uf = new UnionFind();
        uf.parent = new Map(this.parent);
        uf.rank = new Map(this.rank);
        return uf;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CDCL types
// ═══════════════════════════════════════════════════════════════════════════════

interface Literal {
    disjunctionIndex: number;
    alternativeIndex: number;
    sign: boolean;
}

type LearnedClause = Literal[];

interface Assignment {
    disjunctionIndex: number;
    alternativeIndex: number;
    decisionLevel: number;
    isDecision: boolean;
    /** UF snapshots saved before alignment mutations, for undo on backtrack. */
    xAlignSnapshot?: { parent: [string, string][]; rank: [string, number][] };
    yAlignSnapshot?: { parent: [string, string][]; rank: [string, number][] };
}

interface SolverCheckpoint {
    hGraph: WeightedPartialOrderGraph;
    vGraph: WeightedPartialOrderGraph;
    hAlignUF: UnionFind;
    vAlignUF: UnionFind;
    assignmentTrailLength: number;
    addedConstraintsLength: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QualitativeConstraintValidator
// ═══════════════════════════════════════════════════════════════════════════════

class QualitativeConstraintValidator {
    // ─── Input ───
    layout: InstanceLayout;
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    groups: LayoutGroup[];
    orientationConstraints: LayoutConstraint[];
    minPadding: number = 15;

    // ─── Qualitative state ───
    private hGraph: WeightedPartialOrderGraph;
    private vGraph: WeightedPartialOrderGraph;
    private xAlignUF: UnionFind = new UnionFind();
    private yAlignUF: UnionFind = new UnionFind();

    // ─── Output alignment groups ───
    public horizontallyAligned: LayoutNode[][] = [];
    public verticallyAligned: LayoutNode[][] = [];

    // ─── Search state ───
    private addedConstraints: LayoutConstraint[] = [];
    private allDisjunctions: DisjunctiveConstraint[] = [];

    // ─── CDCL state ───
    private assignmentTrail: Assignment[] = [];
    private decisionLevel: number = 0;
    private learnedClauses: LearnedClause[] = [];
    private activity: Map<string, number> = new Map();
    private activityDecay: number = 0.95;
    private conflictCount: number = 0;
    private restartThreshold: number = 32;
    private lubyIndex: number = 0;

    // ─── Node lookup ───
    private nodeMap: Map<string, LayoutNode> = new Map();

    // ─── Statistics ───
    private prunedByTransitivity: number = 0;
    private prunedByDimension: number = 0;
    private prunedByPigeonhole: number = 0;
    private prunedByDecomposition: number = 0;

    constructor(layout: InstanceLayout) {
        this.layout = layout;
        this.nodes = layout.nodes;
        this.edges = layout.edges;
        this.orientationConstraints = layout.constraints;
        this.groups = layout.groups;

        this.hGraph = new WeightedPartialOrderGraph(this.minPadding);
        this.vGraph = new WeightedPartialOrderGraph(this.minPadding);

        for (const node of this.nodes) {
            this.nodeMap.set(node.id, node);
            // Register box dimensions
            this.hGraph.ensureNode(node.id, node.width);
            this.vGraph.ensureNode(node.id, node.height);
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    public validateConstraints(): ConstraintError | null {
        return this.validateGroupConstraints() || this.validatePositionalConstraints();
    }

    public validatePositionalConstraints(): PositionalConstraintError | null {
        // Phase 1: Add all conjunctive constraints
        for (const constraint of this.orientationConstraints) {
            const error = this.addConjunctiveConstraint(constraint);
            if (error) return error;
        }

        // Phase 2: Dimension feasibility on conjunctive constraints alone
        const dimError = this.checkDimensionFeasibility();
        if (dimError) return dimError;

        // Phase 3: Pigeonhole on alignment classes
        const pigeonholeError = this.checkPigeonhole();
        if (pigeonholeError) return pigeonholeError;

        const constraintsBeforeDisjunctions = this.addedConstraints.length;

        // Phase 4: Group bounding box disjunctions (virtual group nodes, from V1)
        const groupError = this.addGroupBoundingBoxDisjunctions();
        if (groupError) return groupError;

        // Phase 5: Collect all disjunctions
        this.allDisjunctions = [...(this.layout.disjunctiveConstraints || [])];

        // Phase 6: Interval decomposition — resolve what we can before CDCL
        this.presolveDisjunctions();

        // Phase 7: CDCL search on remaining disjunctions
        if (this.allDisjunctions.length > 0) {
            const result = this.solveCDCL();
            if (!result.satisfiable) return result.error || null;
        }

        // Persist all constraints added during presolve + CDCL to the layout.
        // Previously this was inside the CDCL block, so presolve-committed
        // constraints were dropped when presolve resolved everything.
        const chosenConstraints = this.addedConstraints.slice(constraintsBeforeDisjunctions);
        if (chosenConstraints.length > 0) {
            this.layout.constraints = this.layout.constraints.concat(chosenConstraints);
        }

        // Phase 8: Alignment orders
        const implicitConstraints = this.computeAlignmentOrders();

        // Phase 9: Node overlap detection
        const overlapError = this.detectNodeOverlaps();
        if (overlapError) return overlapError;

        this.layout.constraints = this.layout.constraints.concat(implicitConstraints);
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Dimension feasibility (Insight 1)
    // ═══════════════════════════════════════════════════════════════════════════

    private checkDimensionFeasibility(): PositionalConstraintError | null {
        const hSpan = this.hGraph.longestChainSpan();
        if (hSpan > MAX_SPAN) return this.buildDimensionError('horizontal', hSpan);
        const vSpan = this.vGraph.longestChainSpan();
        if (vSpan > MAX_SPAN) return this.buildDimensionError('vertical', vSpan);
        return null;
    }

    private buildDimensionError(axis: string, span: number): PositionalConstraintError {
        const constraint = this.addedConstraints[this.addedConstraints.length - 1]
            || this.orientationConstraints[0];
        return {
            name: 'PositionalConstraintError',
            type: 'positional-conflict',
            message: `Chain on ${axis} axis requires ${span}px (max ${MAX_SPAN}px)`,
            conflictingConstraint: constraint,
            conflictingSourceConstraint: constraint.sourceConstraint,
            minimalConflictingSet: new Map([[constraint.sourceConstraint, [constraint]]]),
            errorMessages: {
                conflictingConstraint: orientationConstraintToString(constraint),
                conflictingSourceConstraint: constraint.sourceConstraint.toHTML(),
                minimalConflictingConstraints: new Map([
                    [constraint.sourceConstraint.toHTML(), [orientationConstraintToString(constraint)]]
                ]),
            },
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Pigeonhole on alignment classes (Insight 2)
    // ═══════════════════════════════════════════════════════════════════════════

    private checkPigeonhole(): PositionalConstraintError | null {
        // x-aligned nodes must separate vertically
        for (const [, members] of this.xAlignUF.classes()) {
            if (members.length < 2) continue;
            let totalHeight = 0;
            for (const id of members) {
                const node = this.nodeMap.get(id);
                if (node) totalHeight += node.height;
            }
            const minSpan = totalHeight + (members.length - 1) * this.minPadding;
            if (minSpan > MAX_SPAN) {
                this.prunedByPigeonhole++;
                return this.buildPigeonholeError(members, 'x', minSpan);
            }
        }

        // y-aligned nodes must separate horizontally
        for (const [, members] of this.yAlignUF.classes()) {
            if (members.length < 2) continue;
            let totalWidth = 0;
            for (const id of members) {
                const node = this.nodeMap.get(id);
                if (node) totalWidth += node.width;
            }
            const minSpan = totalWidth + (members.length - 1) * this.minPadding;
            if (minSpan > MAX_SPAN) {
                this.prunedByPigeonhole++;
                return this.buildPigeonholeError(members, 'y', minSpan);
            }
        }

        return null;
    }

    private buildPigeonholeError(members: string[], axis: 'x' | 'y', minSpan: number): PositionalConstraintError {
        const perpAxis = axis === 'x' ? 'vertical' : 'horizontal';
        const constraint = this.addedConstraints.find(c => isAlignmentConstraint(c))
            || this.addedConstraints[0] || this.orientationConstraints[0];
        return {
            name: 'PositionalConstraintError',
            type: 'positional-conflict',
            message: `${members.length} nodes aligned on ${axis}-axis need ${minSpan}px ${perpAxis} space (max ${MAX_SPAN}px)`,
            conflictingConstraint: constraint,
            conflictingSourceConstraint: constraint.sourceConstraint,
            minimalConflictingSet: new Map([[constraint.sourceConstraint, [constraint]]]),
            errorMessages: {
                conflictingConstraint: orientationConstraintToString(constraint),
                conflictingSourceConstraint: constraint.sourceConstraint.toHTML(),
                minimalConflictingConstraints: new Map(),
            },
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Pre-solver disjunction resolution (Insight 3)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Before entering CDCL, try to resolve disjunctions using:
     * 1. Already separated → skip entirely
     * 2. Prune infeasible alternatives (cycle, alignment, dimension overflow)
     * 3. If only one alternative remains → commit as conjunctive
     */
    private presolveDisjunctions(): void {
        const remaining: DisjunctiveConstraint[] = [];

        for (const disj of this.allDisjunctions) {
            const regionPair = this.getDisjunctionRegionPair(disj);

            // Already separated?
            if (regionPair && this.areSeparated(regionPair[0], regionPair[1])) {
                const satisfyingAlt = this.findSatisfyingAlternative(disj, regionPair);
                if (satisfyingAlt !== null) {
                    for (const constraint of disj.alternatives[satisfyingAlt]) {
                        this.addedConstraints.push(constraint);
                    }
                    this.prunedByTransitivity++;
                    continue;
                }
            }

            // Prune infeasible alternatives
            const validAlternatives: LayoutConstraint[][] = [];
            for (const alt of disj.alternatives) {
                if (this.isAlternativeFeasible(alt)) {
                    validAlternatives.push(alt);
                }
            }

            if (validAlternatives.length === 0) {
                remaining.push(disj);
            } else if (validAlternatives.length === 1) {
                // Unit — commit directly
                let committed = true;
                for (const constraint of validAlternatives[0]) {
                    const error = this.addConjunctiveConstraint(constraint);
                    if (error) { committed = false; remaining.push(disj); break; }
                }
                if (committed) this.prunedByDecomposition++;
            } else {
                if (validAlternatives.length < disj.alternatives.length) {
                    remaining.push(new DisjunctiveConstraint(disj.sourceConstraint, validAlternatives));
                } else {
                    remaining.push(disj);
                }
            }
        }

        this.allDisjunctions = remaining;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Conjunctive constraint addition (from V1, with virtual group nodes)
    // ═══════════════════════════════════════════════════════════════════════════

    private addConjunctiveConstraint(constraint: LayoutConstraint): PositionalConstraintError | null {
        if (isLeftConstraint(constraint)) {
            // Check if nodes are x-aligned (same x) — can't be left/right of each other
            if (this.xAlignUF.connected(constraint.left.id, constraint.right.id)) {
                return this.buildConjunctiveError(constraint);
            }
            if (!this.hGraph.addEdge(constraint.left.id, constraint.right.id)) {
                return this.buildConjunctiveError(constraint);
            }
            // Check if this new edge creates ordering between any x-aligned pair
            if (this.hasAlignmentOrderingConflict(constraint.left.id, constraint.right.id, 'x')) {
                this.hGraph.removeEdge(constraint.left.id, constraint.right.id);
                return this.buildAlignmentConflictError(constraint, 'x');
            }
            this.addedConstraints.push(constraint);
        } else if (isTopConstraint(constraint)) {
            // Check if nodes are y-aligned (same y) — can't be above/below each other
            if (this.yAlignUF.connected(constraint.top.id, constraint.bottom.id)) {
                return this.buildConjunctiveError(constraint);
            }
            if (!this.vGraph.addEdge(constraint.top.id, constraint.bottom.id)) {
                return this.buildConjunctiveError(constraint);
            }
            // Check if this new edge creates ordering between any y-aligned pair
            if (this.hasAlignmentOrderingConflict(constraint.top.id, constraint.bottom.id, 'y')) {
                this.vGraph.removeEdge(constraint.top.id, constraint.bottom.id);
                return this.buildAlignmentConflictError(constraint, 'y');
            }
            this.addedConstraints.push(constraint);
        } else if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            if (ac.axis === 'x') {
                this.xAlignUF.union(ac.node1.id, ac.node2.id);
                this.verticallyAligned.push([ac.node1, ac.node2]);
            } else {
                this.yAlignUF.union(ac.node1.id, ac.node2.id);
                this.horizontallyAligned.push([ac.node1, ac.node2]);
            }
            const alignError = this.checkAlignmentConsistency(ac);
            if (alignError) return alignError;
            this.addedConstraints.push(constraint);
        } else if (isBoundingBoxConstraint(constraint) || isGroupBoundaryConstraint(constraint)) {
            const error = this.addSpatialConstraint(constraint);
            if (error) return error;
            this.addedConstraints.push(constraint);
        }
        return null;
    }

    /**
     * Add BoundingBoxConstraint or GroupBoundaryConstraint as edges to/from
     * virtual group nodes (V1's encoding — single edge, not per-member).
     */
    private addSpatialConstraint(constraint: LayoutConstraint): PositionalConstraintError | null {
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const groupId = `_group_${bc.group.name}`;
            this.hGraph.ensureNode(groupId);
            this.vGraph.ensureNode(groupId);
            let ok: boolean;
            switch (bc.side) {
                case 'left':   ok = this.hGraph.addEdge(bc.node.id, groupId); break;
                case 'right':  ok = this.hGraph.addEdge(groupId, bc.node.id); break;
                case 'top':    ok = this.vGraph.addEdge(bc.node.id, groupId); break;
                case 'bottom': ok = this.vGraph.addEdge(groupId, bc.node.id); break;
                default: ok = true;
            }
            if (!ok) return this.buildConjunctiveError(constraint);
        } else if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            this.hGraph.ensureNode(gAId);
            this.hGraph.ensureNode(gBId);
            this.vGraph.ensureNode(gAId);
            this.vGraph.ensureNode(gBId);
            let ok: boolean;
            switch (gc.side) {
                case 'left':   ok = this.hGraph.addEdge(gAId, gBId); break;
                case 'right':  ok = this.hGraph.addEdge(gBId, gAId); break;
                case 'top':    ok = this.vGraph.addEdge(gAId, gBId); break;
                case 'bottom': ok = this.vGraph.addEdge(gBId, gAId); break;
                default: ok = true;
            }
            if (!ok) return this.buildConjunctiveError(constraint);
        }
        return null;
    }

    private checkAlignmentConsistency(ac: AlignmentConstraint): PositionalConstraintError | null {
        // After union, any two members of the merged equivalence class that are
        // ordered on the same axis is a contradiction. We must check all cross-class
        // pairs because the union may have just merged two previously separate classes.
        const uf = ac.axis === 'x' ? this.xAlignUF : this.yAlignUF;
        const graph = ac.axis === 'x' ? this.hGraph : this.vGraph;
        const root = uf.find(ac.node1.id);

        // Collect all members of the merged class
        const members: string[] = [];
        for (const [, cls] of uf.classes()) {
            if (cls.length > 0 && uf.find(cls[0]) === root) {
                members.push(...cls);
                break;
            }
        }

        // Check all pairs for ordering conflicts
        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                if (graph.isOrdered(members[i], members[j]) || graph.isOrdered(members[j], members[i])) {
                    return this.buildAlignmentConflictError(ac, ac.axis === 'x' ? 'x' : 'y');
                }
            }
        }

        // Cross-class alignment cycle: if two distinct alignment classes are
        // ordered in both directions (transitively), that's unsatisfiable.
        const cycleAxis = ac.axis === 'x' ? 'x' as const : 'y' as const;
        if (this.hasAlignmentClassCycle(cycleAxis)) {
            return this.buildAlignmentConflictError(ac, cycleAxis);
        }

        return null;
    }

    /**
     * After adding an ordering edge A→B on a given axis, check if this creates
     * a transitive ordering between any pair of nodes that are aligned on that axis.
     * E.g., if X is x-aligned with Y, and after adding A→B there's a path X→...→Y,
     * that's a contradiction.
     */
    private hasAlignmentOrderingConflict(a: string, b: string, axis: 'x' | 'y'): boolean {
        const uf = axis === 'x' ? this.xAlignUF : this.yAlignUF;
        const graph = axis === 'x' ? this.hGraph : this.vGraph;

        // Collect the alignment classes that contain a or b
        const classA = uf.find(a);
        const classB = uf.find(b);

        // Get members of each relevant class
        const classes = uf.classes();
        const checkClasses: string[][] = [];
        for (const [, members] of classes) {
            if (members.length < 2) continue;
            const root = uf.find(members[0]);
            if (root === classA || root === classB) {
                checkClasses.push(members);
            }
        }

        // Check all pairs within each affected class for ordering
        for (const members of checkClasses) {
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    if (graph.isOrdered(members[i], members[j]) || graph.isOrdered(members[j], members[i])) {
                        return true;
                    }
                }
            }
        }

        // Cross-class alignment cycle check
        if (this.hasAlignmentClassCycle(axis)) return true;

        return false;
    }

    /**
     * Detect cycles in the alignment-class-contracted ordering graph.
     *
     * Contract the ordering graph by replacing each multi-member alignment class
     * with a single super-node. If class A has a member that is ordered before a
     * member of class B (transitively), that's an edge A→B in the contracted graph.
     * A cycle in this contracted graph (e.g. A→B and B→A) means aligned nodes
     * would need to be both before and after each other — unsatisfiable.
     */
    private hasAlignmentClassCycle(axis: 'x' | 'y'): boolean {
        const uf = axis === 'x' ? this.xAlignUF : this.yAlignUF;
        const graph = axis === 'x' ? this.hGraph : this.vGraph;

        // Collect multi-member alignment classes
        const classMembers = new Map<string, string[]>();
        for (const [, members] of uf.classes()) {
            if (members.length < 2) continue;
            const root = uf.find(members[0]);
            classMembers.set(root, members);
        }

        if (classMembers.size < 2) return false;

        // Build contracted graph edges using transitive reachability
        const roots = [...classMembers.keys()];
        const contractedAdj = new Map<string, Set<string>>();
        for (const r of roots) contractedAdj.set(r, new Set());

        for (const fromRoot of roots) {
            const fromMembers = classMembers.get(fromRoot)!;
            for (const toRoot of roots) {
                if (fromRoot === toRoot) continue;
                const toMembers = classMembers.get(toRoot)!;
                let found = false;
                for (const fm of fromMembers) {
                    for (const tm of toMembers) {
                        if (graph.isOrdered(fm, tm)) {
                            contractedAdj.get(fromRoot)!.add(toRoot);
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
            }
        }

        // DFS cycle detection (white/gray/black coloring)
        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = new Map<string, number>();
        for (const r of roots) color.set(r, WHITE);

        for (const startRoot of roots) {
            if (color.get(startRoot) !== WHITE) continue;
            const stack: { node: string; iter: IterableIterator<string> }[] = [];
            color.set(startRoot, GRAY);
            stack.push({ node: startRoot, iter: contractedAdj.get(startRoot)!.values() });

            while (stack.length > 0) {
                const top = stack[stack.length - 1];
                const next = top.iter.next();
                if (next.done) {
                    color.set(top.node, BLACK);
                    stack.pop();
                } else {
                    const neighbor = next.value;
                    if (color.get(neighbor) === GRAY) return true;
                    if (color.get(neighbor) === WHITE) {
                        color.set(neighbor, GRAY);
                        stack.push({ node: neighbor, iter: contractedAdj.get(neighbor)!.values() });
                    }
                }
            }
        }

        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Group bounding box disjunctions (from V1 — virtual group nodes)
    // ═══════════════════════════════════════════════════════════════════════════

    private addGroupBoundingBoxDisjunctions(): PositionalConstraintError | null {
        const nodeToGroups = new Map<string, Set<LayoutGroup>>();
        for (const node of this.nodes) nodeToGroups.set(node.id, new Set());

        for (const group of this.groups) {
            if (group.nodeIds.length > 1 && group.sourceConstraint) {
                for (const nodeId of group.nodeIds) {
                    nodeToGroups.get(nodeId)?.add(group);
                }
            }
        }

        for (const group of this.groups) {
            if (group.nodeIds.length <= 1 || !group.sourceConstraint) continue;

            const memberIds = new Set(group.nodeIds);
            const groupId = `_group_${group.name}`;
            this.hGraph.ensureNode(groupId);
            this.vGraph.ensureNode(groupId);

            for (const node of this.nodes) {
                if (memberIds.has(node.id)) continue;
                const nodeGroups = nodeToGroups.get(node.id);
                if (nodeGroups && nodeGroups.size > 0) continue;

                const sourceConstraint = group.sourceConstraint;
                const alts: LayoutConstraint[][] = [
                    [{ group, node, side: 'left' as const, minDistance: this.minPadding, sourceConstraint } as BoundingBoxConstraint],
                    [{ group, node, side: 'right' as const, minDistance: this.minPadding, sourceConstraint } as BoundingBoxConstraint],
                    [{ group, node, side: 'top' as const, minDistance: this.minPadding, sourceConstraint } as BoundingBoxConstraint],
                    [{ group, node, side: 'bottom' as const, minDistance: this.minPadding, sourceConstraint } as BoundingBoxConstraint],
                ];
                const disj = new DisjunctiveConstraint(sourceConstraint, alts);
                if (!this.layout.disjunctiveConstraints) this.layout.disjunctiveConstraints = [];
                this.layout.disjunctiveConstraints.push(disj);
            }
        }

        // Group-to-group separation
        for (let i = 0; i < this.groups.length; i++) {
            for (let j = i + 1; j < this.groups.length; j++) {
                const gA = this.groups[i];
                const gB = this.groups[j];
                if (gA.nodeIds.length <= 1 || gB.nodeIds.length <= 1) continue;
                if (this.isSubGroup(gA, gB) || this.isSubGroup(gB, gA)) continue;
                if (this.groupIntersection(gA, gB).length > 0) continue;

                const src = gA.sourceConstraint || gB.sourceConstraint!;
                const alts: LayoutConstraint[][] = [
                    [{ groupA: gA, groupB: gB, side: 'left' as const, minDistance: this.minPadding, sourceConstraint: src } as GroupBoundaryConstraint],
                    [{ groupA: gA, groupB: gB, side: 'right' as const, minDistance: this.minPadding, sourceConstraint: src } as GroupBoundaryConstraint],
                    [{ groupA: gA, groupB: gB, side: 'top' as const, minDistance: this.minPadding, sourceConstraint: src } as GroupBoundaryConstraint],
                    [{ groupA: gA, groupB: gB, side: 'bottom' as const, minDistance: this.minPadding, sourceConstraint: src } as GroupBoundaryConstraint],
                ];
                const disj = new DisjunctiveConstraint(src, alts);
                if (!this.layout.disjunctiveConstraints) this.layout.disjunctiveConstraints = [];
                this.layout.disjunctiveConstraints.push(disj);
            }
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Geometric pruning helpers
    // ═══════════════════════════════════════════════════════════════════════════

    private areSeparated(idA: string, idB: string): boolean {
        return (
            this.hGraph.isOrdered(idA, idB) || this.hGraph.isOrdered(idB, idA) ||
            this.vGraph.isOrdered(idA, idB) || this.vGraph.isOrdered(idB, idA)
        );
    }

    /**
     * Check if an alternative is feasible:
     * 1. No cycle (transitivity check)
     * 2. No alignment conflict
     * 3. No dimension overflow (Insight 4)
     */
    private isAlternativeFeasible(alternative: LayoutConstraint[]): boolean {
        for (const constraint of alternative) {
            // BoundingBoxConstraint: check if node is aligned with a group member
            // on the constraint's axis. If so, the node can't be on that side.
            if (isBoundingBoxConstraint(constraint)) {
                const bc = constraint as BoundingBoxConstraint;
                const isHorizontalSide = bc.side === 'left' || bc.side === 'right';
                const uf = isHorizontalSide ? this.xAlignUF : this.yAlignUF;
                const memberIds = bc.group.nodeIds;
                for (const memberId of memberIds) {
                    if (uf.connected(bc.node.id, memberId)) return false;
                }
            }

            const edge = this.constraintToEdge(constraint);
            if (!edge) continue;
            const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
            const uf = edge.axis === 'h' ? this.xAlignUF : this.yAlignUF;

            // Would cycle?
            if (graph.isOrdered(edge.to, edge.from)) return false;

            // Alignment conflict (direct)?
            if (uf.connected(edge.from, edge.to)) return false;

            // Alignment conflict (transitive): adding edge from→to would create
            // ordering between aligned nodes. Check if 'to' can reach any member
            // of 'from's alignment class (making from→...→member ordered),
            // or if any member of 'to's class can reach 'from' (making member→...→from→to ordered).
            if (this.wouldCreateAlignmentOrderingConflict(edge.from, edge.to, uf, graph)) return false;

            // Dimension overflow? (Insight 4)
            if (graph.wouldOverflow(edge.from, edge.to, MAX_SPAN)) {
                this.prunedByDimension++;
                return false;
            }
        }
        return true;
    }

    /**
     * Would adding edge from→to create a transitive ordering between two aligned nodes?
     * Check without actually adding the edge.
     */
    private wouldCreateAlignmentOrderingConflict(
        from: string, to: string, uf: UnionFind, graph: WeightedPartialOrderGraph
    ): boolean {
        // Collect alignment class members for 'from' and 'to'
        const fromClass = this.getClassMembers(from, uf);
        const toClass = this.getClassMembers(to, uf);

        // Check: any member of from's class reachable from 'to'?
        // That would mean: from → to → ... → member (from and member are aligned)
        for (const m of fromClass) {
            if (m !== from && graph.canReach(to, m)) return true;
        }

        // Check: any member of to's class can reach 'from'?
        // That would mean: member → ... → from → to (to and member are aligned)
        for (const m of toClass) {
            if (m !== to && graph.canReach(m, from)) return true;
        }

        return false;
    }

    private getClassMembers(id: string, uf: UnionFind): string[] {
        const root = uf.find(id);
        for (const [, members] of uf.classes()) {
            if (members.length > 0 && uf.find(members[0]) === root) {
                return members;
            }
        }
        return [id];
    }

    private getDisjunctionRegionPair(disj: DisjunctiveConstraint): [string, string] | null {
        if (disj.alternatives.length === 0) return null;
        const first = disj.alternatives[0][0];
        if (isBoundingBoxConstraint(first)) return [first.node.id, `_group_${first.group.name}`];
        if (isGroupBoundaryConstraint(first)) return [`_group_${first.groupA.name}`, `_group_${first.groupB.name}`];
        if (isLeftConstraint(first)) return [first.left.id, first.right.id];
        if (isTopConstraint(first)) return [first.top.id, first.bottom.id];
        return null;
    }

    private findSatisfyingAlternative(disj: DisjunctiveConstraint, pair: [string, string]): number | null {
        // Find an alternative whose constraints are all actually implied by
        // the current ordering graphs (forward direction is ordered or alignment
        // already holds). Previously this only checked "not contradicted" which
        // could pick an alternative that wasn't actually satisfied, injecting
        // wrong constraints into the output.
        for (let i = 0; i < disj.alternatives.length; i++) {
            let allImplied = true;
            for (const constraint of disj.alternatives[i]) {
                if (isAlignmentConstraint(constraint)) {
                    const ac = constraint as AlignmentConstraint;
                    const uf = ac.axis === 'x' ? this.xAlignUF : this.yAlignUF;
                    if (!uf.connected(ac.node1.id, ac.node2.id)) { allImplied = false; break; }
                    continue;
                }
                const edge = this.constraintToEdge(constraint);
                if (!edge) continue;
                const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                // Must be actually ordered in the forward direction
                if (!graph.isOrdered(edge.from, edge.to)) { allImplied = false; break; }
            }
            if (allImplied) return i;
        }
        // Fallback: if no alternative is fully implied, find one that's at least
        // not contradicted (original behavior). This can happen when the pair is
        // separated but through edges not captured in any single alternative.
        for (let i = 0; i < disj.alternatives.length; i++) {
            let feasible = true;
            for (const constraint of disj.alternatives[i]) {
                const edge = this.constraintToEdge(constraint);
                if (!edge) continue;
                const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                if (graph.isOrdered(edge.to, edge.from)) { feasible = false; break; }
            }
            if (feasible) return i;
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CDCL solver (from V1, unchanged core)
    // ═══════════════════════════════════════════════════════════════════════════

    private solveCDCL(): { satisfiable: boolean; error?: PositionalConstraintError } {
        if (this.allDisjunctions.length === 0) return { satisfiable: true };

        // Geometric pruning pass
        this.pruneDisjunctions();
        if (this.allDisjunctions.length === 0) return { satisfiable: true };

        let assigned = new Int32Array(this.allDisjunctions.length).fill(-1);

        for (let d = 0; d < this.allDisjunctions.length; d++) {
            for (let a = 0; a < this.allDisjunctions[d].alternatives.length; a++) {
                this.activity.set(`d${d}a${a}`, 0);
            }
        }

        const initialCheckpoint = this.checkpoint();
        const initialAddedLength = this.addedConstraints.length;

        let totalRestarts = 0;
        const MAX_RESTARTS = 50;

        while (totalRestarts <= MAX_RESTARTS) {
            this.restoreCheckpoint(initialCheckpoint);
            this.addedConstraints.length = initialAddedLength;
            this.assignmentTrail = [];
            this.decisionLevel = 0;
            assigned.fill(-1);

            if (totalRestarts > 0) {
                this.pruneDisjunctions();
                if (this.allDisjunctions.length === 0) return { satisfiable: true };
                assigned = new Int32Array(this.allDisjunctions.length).fill(-1);
            }

            const result = this.cdclSearchLoop(assigned);
            if (result.satisfiable) return { satisfiable: true };
            if (result.provedUnsat) return this.buildUnsatResult(assigned);

            totalRestarts++;
            this.updateRestartThreshold();
        }

        return this.buildUnsatResult(new Int32Array(this.allDisjunctions.length).fill(-1));
    }

    private cdclSearchLoop(assigned: Int32Array): { satisfiable: boolean; provedUnsat?: boolean } {
        const numDisjunctions = this.allDisjunctions.length;
        let conflictsSinceRestart = 0;

        while (true) {
            const propResult = this.unitPropagate(assigned);
            if (propResult === 'conflict') {
                if (this.decisionLevel === 0) return { satisfiable: false, provedUnsat: true };

                const { learnedClause, backtrackLevel } = this.analyzeConflict(assigned);
                if (learnedClause) {
                    this.learnedClauses.push(learnedClause);
                    this.bumpActivity(learnedClause);
                    this.decayActivity();
                }
                this.conflictCount++;
                conflictsSinceRestart++;
                this.backtrackTo(backtrackLevel, assigned);

                if (conflictsSinceRestart >= this.restartThreshold) return { satisfiable: false, provedUnsat: false };
                continue;
            }

            if (this.allAssigned(assigned, numDisjunctions)) return { satisfiable: true };

            const { dIdx, aIdx } = this.pickBranch(assigned);
            if (dIdx === -1) return { satisfiable: true };

            this.decisionLevel++;
            const ok = this.tryAssign(dIdx, aIdx, assigned, true);
            if (!ok) {
                assigned[dIdx] = -1;
                if (this.decisionLevel === 0) return { satisfiable: false, provedUnsat: true };

                const { learnedClause, backtrackLevel } = this.analyzeConflictForDecision(dIdx, aIdx, assigned);
                if (learnedClause) {
                    this.learnedClauses.push(learnedClause);
                    this.bumpActivity(learnedClause);
                    this.decayActivity();
                }
                this.conflictCount++;
                conflictsSinceRestart++;
                this.backtrackTo(backtrackLevel, assigned);

                if (conflictsSinceRestart >= this.restartThreshold) return { satisfiable: false, provedUnsat: false };
            }
        }
    }

    // ─── Unit propagation ────────────────────────────────────────────────────

    private unitPropagate(assigned: Int32Array): 'ok' | 'conflict' {
        let changed = true;
        while (changed) {
            changed = false;
            for (const clause of this.learnedClauses) {
                let numSat = 0;
                let numUnsat = 0;
                let lastUnresolved: Literal | null = null;
                let unresolvedCount = 0;

                for (const lit of clause) {
                    const curAssign = assigned[lit.disjunctionIndex];
                    if (curAssign === -1) {
                        unresolvedCount++;
                        lastUnresolved = lit;
                    } else if (lit.sign && curAssign === lit.alternativeIndex) {
                        numSat++;
                    } else if (!lit.sign && curAssign !== lit.alternativeIndex) {
                        numSat++;
                    } else {
                        numUnsat++;
                    }
                }

                if (numSat > 0) continue;
                if (unresolvedCount === 0) return 'conflict';

                if (unresolvedCount === 1 && lastUnresolved) {
                    const lit = lastUnresolved;
                    if (lit.sign) {
                        if (!this.tryAssign(lit.disjunctionIndex, lit.alternativeIndex, assigned, false))
                            return 'conflict';
                        changed = true; // Assignment made
                    } else {
                        const remaining = this.getRemainingAlternatives(lit.disjunctionIndex, assigned);
                        const filtered = remaining.filter(a => a !== lit.alternativeIndex);
                        if (filtered.length === 0) return 'conflict';
                        if (filtered.length === 1) {
                            if (!this.tryAssign(lit.disjunctionIndex, filtered[0], assigned, false))
                                return 'conflict';
                            changed = true; // Assignment made
                        }
                        // If filtered.length > 1, no propagation — don't set changed
                    }
                }
            }
        }
        return 'ok';
    }

    private getRemainingAlternatives(dIdx: number, assigned: Int32Array): number[] {
        const disj = this.allDisjunctions[dIdx];
        if (assigned[dIdx] !== -1) return [assigned[dIdx]];
        const eliminated = new Set<number>();
        for (const clause of this.learnedClauses) {
            for (const lit of clause) {
                if (lit.disjunctionIndex === dIdx && !lit.sign) {
                    const allOthersFalse = clause.every(l => {
                        if (l === lit) return true;
                        const a = assigned[l.disjunctionIndex];
                        if (a === -1) return false;
                        if (l.sign) return a !== l.alternativeIndex;
                        return a === l.alternativeIndex;
                    });
                    if (allOthersFalse) eliminated.add(lit.alternativeIndex);
                }
            }
        }
        const result: number[] = [];
        for (let a = 0; a < disj.alternatives.length; a++) {
            if (!eliminated.has(a)) result.push(a);
        }
        return result;
    }

    // ─── Assignment ──────────────────────────────────────────────────────────

    private tryAssign(dIdx: number, aIdx: number, assigned: Int32Array, isDecision: boolean): boolean {
        const alternative = this.allDisjunctions[dIdx].alternatives[aIdx];

        // Snapshot UF state before alignment mutations so backtrack can undo them
        const hasAlignment = alternative.some(c => isAlignmentConstraint(c));
        const xSnap = hasAlignment ? this.xAlignUF.snapshot() : undefined;
        const ySnap = hasAlignment ? this.yAlignUF.snapshot() : undefined;

        for (const constraint of alternative) {
            if (!this.addQualitativeEdge(constraint)) {
                this.undoAlternativeEdges(alternative, constraint);
                // Also restore UF if we snapshotted
                if (xSnap) this.xAlignUF.restore(xSnap);
                if (ySnap) this.yAlignUF.restore(ySnap);
                return false;
            }
        }
        assigned[dIdx] = aIdx;
        this.assignmentTrail.push({
            disjunctionIndex: dIdx, alternativeIndex: aIdx,
            decisionLevel: this.decisionLevel, isDecision,
            xAlignSnapshot: xSnap, yAlignSnapshot: ySnap,
        });
        for (const constraint of alternative) this.addedConstraints.push(constraint);
        return true;
    }

    private addQualitativeEdge(constraint: LayoutConstraint): boolean {
        if (isLeftConstraint(constraint)) {
            if (this.xAlignUF.connected(constraint.left.id, constraint.right.id)) return false;
            if (!this.hGraph.addEdge(constraint.left.id, constraint.right.id)) return false;
            if (this.hasAlignmentOrderingConflict(constraint.left.id, constraint.right.id, 'x')) {
                this.hGraph.removeEdge(constraint.left.id, constraint.right.id);
                return false;
            }
            return true;
        }
        if (isTopConstraint(constraint)) {
            if (this.yAlignUF.connected(constraint.top.id, constraint.bottom.id)) return false;
            if (!this.vGraph.addEdge(constraint.top.id, constraint.bottom.id)) return false;
            if (this.hasAlignmentOrderingConflict(constraint.top.id, constraint.bottom.id, 'y')) {
                this.vGraph.removeEdge(constraint.top.id, constraint.bottom.id);
                return false;
            }
            return true;
        }
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            // Check if node is aligned with any group member on this axis
            const isHSide = bc.side === 'left' || bc.side === 'right';
            const uf = isHSide ? this.xAlignUF : this.yAlignUF;
            for (const memberId of bc.group.nodeIds) {
                if (uf.connected(bc.node.id, memberId)) return false;
            }
            const groupId = `_group_${bc.group.name}`;
            this.hGraph.ensureNode(groupId); this.vGraph.ensureNode(groupId);
            switch (bc.side) {
                case 'left':   return this.hGraph.addEdge(bc.node.id, groupId);
                case 'right':  return this.hGraph.addEdge(groupId, bc.node.id);
                case 'top':    return this.vGraph.addEdge(bc.node.id, groupId);
                case 'bottom': return this.vGraph.addEdge(groupId, bc.node.id);
            }
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            this.hGraph.ensureNode(gAId); this.hGraph.ensureNode(gBId);
            this.vGraph.ensureNode(gAId); this.vGraph.ensureNode(gBId);
            switch (gc.side) {
                case 'left':   return this.hGraph.addEdge(gAId, gBId);
                case 'right':  return this.hGraph.addEdge(gBId, gAId);
                case 'top':    return this.vGraph.addEdge(gAId, gBId);
                case 'bottom': return this.vGraph.addEdge(gBId, gAId);
            }
        }
        if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            if (ac.axis === 'x') this.xAlignUF.union(ac.node1.id, ac.node2.id);
            else this.yAlignUF.union(ac.node1.id, ac.node2.id);
            return this.checkAlignmentConsistency(ac) === null;
        }
        return true;
    }

    private undoAlternativeEdges(alternative: LayoutConstraint[], failedConstraint: LayoutConstraint): void {
        for (const constraint of alternative) {
            if (constraint === failedConstraint) break;
            this.removeQualitativeEdge(constraint);
        }
    }

    private removeQualitativeEdge(constraint: LayoutConstraint): void {
        if (isLeftConstraint(constraint)) {
            this.hGraph.removeEdge(constraint.left.id, constraint.right.id);
        } else if (isTopConstraint(constraint)) {
            this.vGraph.removeEdge(constraint.top.id, constraint.bottom.id);
        } else if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const groupId = `_group_${bc.group.name}`;
            switch (bc.side) {
                case 'left':   this.hGraph.removeEdge(bc.node.id, groupId); break;
                case 'right':  this.hGraph.removeEdge(groupId, bc.node.id); break;
                case 'top':    this.vGraph.removeEdge(bc.node.id, groupId); break;
                case 'bottom': this.vGraph.removeEdge(groupId, bc.node.id); break;
            }
        } else if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            switch (gc.side) {
                case 'left':   this.hGraph.removeEdge(gAId, gBId); break;
                case 'right':  this.hGraph.removeEdge(gBId, gAId); break;
                case 'top':    this.vGraph.removeEdge(gAId, gBId); break;
                case 'bottom': this.vGraph.removeEdge(gBId, gAId); break;
            }
        }
    }

    // ─── Conflict analysis ───────────────────────────────────────────────────

    private analyzeConflict(assigned: Int32Array): { learnedClause: LearnedClause | null; backtrackLevel: number } {
        const clause: LearnedClause = [];
        let maxLevel = 0, secondMaxLevel = 0;

        for (const a of this.assignmentTrail) {
            if (a.isDecision) {
                clause.push({ disjunctionIndex: a.disjunctionIndex, alternativeIndex: a.alternativeIndex, sign: false });
                if (a.decisionLevel > maxLevel) { secondMaxLevel = maxLevel; maxLevel = a.decisionLevel; }
                else if (a.decisionLevel > secondMaxLevel && a.decisionLevel < maxLevel) { secondMaxLevel = a.decisionLevel; }
            }
        }
        if (clause.length === 0) return { learnedClause: null, backtrackLevel: 0 };
        return { learnedClause: clause, backtrackLevel: Math.max(0, secondMaxLevel) };
    }

    private analyzeConflictForDecision(dIdx: number, aIdx: number, assigned: Int32Array): { learnedClause: LearnedClause | null; backtrackLevel: number } {
        const clause: LearnedClause = [{ disjunctionIndex: dIdx, alternativeIndex: aIdx, sign: false }];
        let maxLevel = 0, secondMaxLevel = 0;

        for (const a of this.assignmentTrail) {
            clause.push({ disjunctionIndex: a.disjunctionIndex, alternativeIndex: a.alternativeIndex, sign: false });
            if (a.decisionLevel > maxLevel) { secondMaxLevel = maxLevel; maxLevel = a.decisionLevel; }
            else if (a.decisionLevel > secondMaxLevel && a.decisionLevel < maxLevel) { secondMaxLevel = a.decisionLevel; }
        }
        return { learnedClause: clause, backtrackLevel: Math.max(0, secondMaxLevel) };
    }

    // ─── Backtracking ────────────────────────────────────────────────────────

    private backtrackTo(level: number, assigned: Int32Array): void {
        while (this.assignmentTrail.length > 0) {
            const last = this.assignmentTrail[this.assignmentTrail.length - 1];
            if (last.decisionLevel <= level) break;
            const alternative = this.allDisjunctions[last.disjunctionIndex].alternatives[last.alternativeIndex];
            for (const constraint of alternative) this.removeQualitativeEdge(constraint);
            // Restore UF state if this assignment mutated alignment classes
            if (last.xAlignSnapshot) this.xAlignUF.restore(last.xAlignSnapshot);
            if (last.yAlignSnapshot) this.yAlignUF.restore(last.yAlignSnapshot);
            this.addedConstraints.length -= alternative.length;
            assigned[last.disjunctionIndex] = -1;
            this.assignmentTrail.pop();
        }
        this.decisionLevel = level;
    }

    // ─── Decision heuristic (VSIDS + simplicity, from V1) ───────────────────

    private pickBranch(assigned: Int32Array): { dIdx: number; aIdx: number } {
        let bestDIdx = -1, bestAIdx = -1, bestScore = -1;

        for (let d = 0; d < this.allDisjunctions.length; d++) {
            if (assigned[d] !== -1) continue;
            // Only consider alternatives not eliminated by learned clauses
            const remaining = this.getRemainingAlternatives(d, assigned);
            const disj = this.allDisjunctions[d];
            for (const a of remaining) {
                const score = (this.activity.get(`d${d}a${a}`) ?? 0)
                    + 1.0 / (1 + disj.alternatives[a].length);
                if (score > bestScore) {
                    bestScore = score;
                    bestDIdx = d;
                    bestAIdx = a;
                }
            }
        }
        return { dIdx: bestDIdx, aIdx: bestAIdx };
    }

    // ─── VSIDS ───────────────────────────────────────────────────────────────

    private bumpActivity(clause: LearnedClause): void {
        for (const lit of clause) {
            const key = `d${lit.disjunctionIndex}a${lit.alternativeIndex}`;
            this.activity.set(key, (this.activity.get(key) ?? 0) + 1);
        }
    }

    private decayActivity(): void {
        for (const [key, val] of this.activity) this.activity.set(key, val * this.activityDecay);
    }

    // ─── Restart management ──────────────────────────────────────────────────

    private updateRestartThreshold(): void {
        this.lubyIndex++;
        this.restartThreshold = 32 * this.luby(this.lubyIndex);
    }

    private luby(i: number): number {
        let size = 1, seq = 1;
        while (size < i + 1) { size = 2 * size + 1; seq *= 2; }
        while (size - 1 !== i) { size = (size - 1) / 2; seq = seq / 2; if (i >= size) i -= size; }
        return seq;
    }

    // ─── Disjunction pruning (during CDCL restarts) ─────────────────────────

    private pruneDisjunctions(): void {
        const pruned: DisjunctiveConstraint[] = [];

        for (const disj of this.allDisjunctions) {
            const regionPair = this.getDisjunctionRegionPair(disj);
            if (regionPair && this.areSeparated(regionPair[0], regionPair[1])) {
                const satisfyingAlt = this.findSatisfyingAlternative(disj, regionPair);
                if (satisfyingAlt !== null) {
                    for (const c of disj.alternatives[satisfyingAlt]) this.addedConstraints.push(c);
                    continue;
                }
            }

            const validAlternatives: LayoutConstraint[][] = [];
            for (const alt of disj.alternatives) {
                if (this.isAlternativeFeasible(alt)) validAlternatives.push(alt);
            }

            if (validAlternatives.length === 0) {
                pruned.push(disj);
            } else if (validAlternatives.length === 1) {
                for (const constraint of validAlternatives[0]) {
                    const error = this.addConjunctiveConstraint(constraint);
                    if (error) { pruned.push(disj); break; }
                }
            } else {
                pruned.push(new DisjunctiveConstraint(disj.sourceConstraint, validAlternatives));
            }
        }

        this.allDisjunctions = pruned;
    }

    // ─── Utility ─────────────────────────────────────────────────────────────

    private allAssigned(assigned: Int32Array, n: number): boolean {
        for (let i = 0; i < n; i++) { if (assigned[i] === -1) return false; }
        return true;
    }

    private checkpoint(): SolverCheckpoint {
        return {
            hGraph: this.hGraph.clone(),
            vGraph: this.vGraph.clone(),
            hAlignUF: this.xAlignUF.clone(),
            vAlignUF: this.yAlignUF.clone(),
            assignmentTrailLength: this.assignmentTrail.length,
            addedConstraintsLength: this.addedConstraints.length,
        };
    }

    private restoreCheckpoint(cp: SolverCheckpoint): void {
        this.hGraph = cp.hGraph.clone();
        this.vGraph = cp.vGraph.clone();
        this.xAlignUF = cp.hAlignUF.clone();
        this.yAlignUF = cp.vAlignUF.clone();
    }

    private constraintToEdge(constraint: LayoutConstraint): { axis: 'h' | 'v'; from: string; to: string } | null {
        if (isLeftConstraint(constraint))
            return { axis: 'h', from: constraint.left.id, to: constraint.right.id };
        if (isTopConstraint(constraint))
            return { axis: 'v', from: constraint.top.id, to: constraint.bottom.id };
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const groupId = `_group_${bc.group.name}`;
            switch (bc.side) {
                case 'left':   return { axis: 'h', from: bc.node.id, to: groupId };
                case 'right':  return { axis: 'h', from: groupId, to: bc.node.id };
                case 'top':    return { axis: 'v', from: bc.node.id, to: groupId };
                case 'bottom': return { axis: 'v', from: groupId, to: bc.node.id };
            }
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            switch (gc.side) {
                case 'left':   return { axis: 'h', from: gAId, to: gBId };
                case 'right':  return { axis: 'h', from: gBId, to: gAId };
                case 'top':    return { axis: 'v', from: gAId, to: gBId };
                case 'bottom': return { axis: 'v', from: gBId, to: gAId };
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Maximal feasible subset
    // ═══════════════════════════════════════════════════════════════════════════

    private computeMaximalFeasibleSubset(): {
        feasibleConstraints: LayoutConstraint[];
        infeasibleDisjunctions: DisjunctiveConstraint[];
    } {
        const freshH = new WeightedPartialOrderGraph(this.minPadding);
        const freshV = new WeightedPartialOrderGraph(this.minPadding);

        for (const node of this.nodes) {
            freshH.ensureNode(node.id, node.width);
            freshV.ensureNode(node.id, node.height);
        }
        for (const group of this.groups) {
            const gid = `_group_${group.name}`;
            freshH.ensureNode(gid);
            freshV.ensureNode(gid);
        }

        for (const constraint of this.orientationConstraints) {
            if (isLeftConstraint(constraint)) freshH.addEdge(constraint.left.id, constraint.right.id);
            else if (isTopConstraint(constraint)) freshV.addEdge(constraint.top.id, constraint.bottom.id);
            else if (isAlignmentConstraint(constraint)) { /* skip for MFS graph */ }
        }

        const feasibleConstraints: LayoutConstraint[] = [...this.orientationConstraints];
        const infeasibleDisjunctions: DisjunctiveConstraint[] = [];

        const sortedDisjunctions = [...this.allDisjunctions].sort((a, b) => {
            const aIdx = this.allDisjunctions.indexOf(a);
            const bIdx = this.allDisjunctions.indexOf(b);
            const aMax = Math.max(...a.alternatives.map((_, ai) => this.activity.get(`d${aIdx}a${ai}`) ?? 0));
            const bMax = Math.max(...b.alternatives.map((_, bi) => this.activity.get(`d${bIdx}a${bi}`) ?? 0));
            return aMax - bMax;
        });

        for (const disj of sortedDisjunctions) {
            let added = false;
            for (const alternative of disj.alternatives) {
                const hClone = freshH.clone();
                const vClone = freshV.clone();
                let ok = true;
                for (const constraint of alternative) {
                    if (!this.addEdgeToGraphs(constraint, hClone, vClone)) { ok = false; break; }
                }
                if (ok) {
                    for (const constraint of alternative) {
                        this.addEdgeToGraphs(constraint, freshH, freshV);
                        feasibleConstraints.push(constraint);
                    }
                    added = true;
                    break;
                }
            }
            if (!added) infeasibleDisjunctions.push(disj);
        }

        return { feasibleConstraints, infeasibleDisjunctions };
    }

    private addEdgeToGraphs(constraint: LayoutConstraint, hGraph: WeightedPartialOrderGraph, vGraph: WeightedPartialOrderGraph): boolean {
        if (isLeftConstraint(constraint)) return hGraph.addEdge(constraint.left.id, constraint.right.id);
        if (isTopConstraint(constraint)) return vGraph.addEdge(constraint.top.id, constraint.bottom.id);
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const groupId = `_group_${bc.group.name}`;
            hGraph.ensureNode(groupId); vGraph.ensureNode(groupId);
            switch (bc.side) {
                case 'left':   return hGraph.addEdge(bc.node.id, groupId);
                case 'right':  return hGraph.addEdge(groupId, bc.node.id);
                case 'top':    return vGraph.addEdge(bc.node.id, groupId);
                case 'bottom': return vGraph.addEdge(groupId, bc.node.id);
            }
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            hGraph.ensureNode(gAId); hGraph.ensureNode(gBId);
            vGraph.ensureNode(gAId); vGraph.ensureNode(gBId);
            switch (gc.side) {
                case 'left':   return hGraph.addEdge(gAId, gBId);
                case 'right':  return hGraph.addEdge(gBId, gAId);
                case 'top':    return vGraph.addEdge(gAId, gBId);
                case 'bottom': return vGraph.addEdge(gBId, gAId);
            }
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Error building
    // ═══════════════════════════════════════════════════════════════════════════

    private buildUnsatResult(assigned: Int32Array): { satisfiable: boolean; error: PositionalConstraintError } {
        const { feasibleConstraints, infeasibleDisjunctions } = this.computeMaximalFeasibleSubset();

        const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
        for (const disj of infeasibleDisjunctions) {
            const source = disj.sourceConstraint;
            if (!minimalConflictingSet.has(source)) minimalConflictingSet.set(source, []);
            if (disj.alternatives.length > 0 && disj.alternatives[0].length > 0) {
                minimalConflictingSet.get(source)!.push(disj.alternatives[0][0]);
            }
        }

        let representativeConstraint: LayoutConstraint | undefined;
        if (infeasibleDisjunctions.length > 0 && infeasibleDisjunctions[0].alternatives.length > 0) {
            representativeConstraint = infeasibleDisjunctions[0].alternatives[0][0];
        } else if (this.orientationConstraints.length > 0) {
            representativeConstraint = this.orientationConstraints[0];
        }
        if (!representativeConstraint) {
            representativeConstraint = this.orientationConstraints[0] || this.allDisjunctions[0]?.alternatives[0]?.[0];
        }

        const firstString = orientationConstraintToString(representativeConstraint);
        const htmlMap = new Map<string, string[]>();
        for (const [source, constraints] of minimalConflictingSet.entries()) {
            const html = source.toHTML();
            if (!htmlMap.has(html)) htmlMap.set(html, []);
            constraints.forEach(c => htmlMap.get(html)!.push(orientationConstraintToString(c)));
        }

        const conflictSource = infeasibleDisjunctions.length > 0
            ? infeasibleDisjunctions[0].sourceConstraint
            : representativeConstraint.sourceConstraint;

        return {
            satisfiable: false,
            error: {
                name: 'PositionalConstraintError', type: 'positional-conflict',
                message: `Constraint "${firstString}" conflicts with existing constraints`,
                conflictingConstraint: representativeConstraint,
                conflictingSourceConstraint: conflictSource,
                minimalConflictingSet,
                maximalFeasibleSubset: feasibleConstraints,
                errorMessages: {
                    conflictingConstraint: firstString,
                    conflictingSourceConstraint: conflictSource.toHTML(),
                    minimalConflictingConstraints: htmlMap,
                },
            },
        };
    }

    private buildConjunctiveError(constraint: LayoutConstraint): PositionalConstraintError {
        const minimalSet = this.findMinimalConflictSet(constraint);
        const srcToLayout = new Map<SourceConstraint, LayoutConstraint[]>();
        const htmlMap = new Map<string, string[]>();

        for (const c of minimalSet) {
            const src = c.sourceConstraint;
            if (!srcToLayout.has(src)) srcToLayout.set(src, []);
            if (!htmlMap.has(src.toHTML())) htmlMap.set(src.toHTML(), []);
            srcToLayout.get(src)!.push(c);
            htmlMap.get(src.toHTML())!.push(orientationConstraintToString(c));
        }

        return {
            name: 'PositionalConstraintError', type: 'positional-conflict',
            message: `Constraint "${orientationConstraintToString(constraint)}" conflicts with existing constraints`,
            conflictingConstraint: constraint,
            conflictingSourceConstraint: constraint.sourceConstraint,
            minimalConflictingSet: srcToLayout,
            errorMessages: {
                conflictingConstraint: orientationConstraintToString(constraint),
                conflictingSourceConstraint: constraint.sourceConstraint.toHTML(),
                minimalConflictingConstraints: htmlMap,
            },
        };
    }

    private findMinimalConflictSet(failedConstraint: LayoutConstraint): LayoutConstraint[] {
        const edge = this.constraintToEdge(failedConstraint);
        if (!edge) return [];
        const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
        const path = this.findPath(graph, edge.to, edge.from);
        if (!path) return [];
        const result: LayoutConstraint[] = [];
        for (const [a, b] of path) {
            const c = this.addedConstraints.find(c => {
                const e = this.constraintToEdge(c);
                return e && e.axis === edge.axis && e.from === a && e.to === b;
            });
            if (c) result.push(c);
        }
        return result;
    }

    private findPath(graph: WeightedPartialOrderGraph, from: string, to: string): [string, string][] | null {
        if (from === to) return [];
        const visited = new Set<string>();
        const queue: { node: string; path: [string, string][] }[] = [{ node: from, path: [] }];
        visited.add(from);
        while (queue.length > 0) {
            const { node, path } = queue.shift()!;
            for (const succ of graph.successors(node)) {
                if (succ === to) return [...path, [node, succ]];
                if (!visited.has(succ)) {
                    visited.add(succ);
                    queue.push({ node: succ, path: [...path, [node, succ]] });
                }
            }
        }
        return null;
    }

    /**
     * Build an error for alignment-related conflicts:
     *   - Within-class: two nodes in the same alignment class are ordered
     *   - Cross-class: two alignment classes are mutually ordered (cycle)
     *
     * The IIS contains alignment constraints forming the relevant classes +
     * ordering constraints along the conflict paths. The MFS is all
     * addedConstraints minus the IIS.
     */
    private buildAlignmentConflictError(
        triggerConstraint: LayoutConstraint,
        axis: 'x' | 'y',
    ): PositionalConstraintError {
        const conflictSet = this.findAlignmentConflictSet(axis);

        // Always include the trigger
        if (!conflictSet.includes(triggerConstraint)) {
            conflictSet.push(triggerConstraint);
        }

        const srcToLayout = new Map<SourceConstraint, LayoutConstraint[]>();
        const htmlMap = new Map<string, string[]>();
        for (const c of conflictSet) {
            const src = c.sourceConstraint;
            if (!srcToLayout.has(src)) srcToLayout.set(src, []);
            if (!htmlMap.has(src.toHTML())) htmlMap.set(src.toHTML(), []);
            srcToLayout.get(src)!.push(c);
            htmlMap.get(src.toHTML())!.push(orientationConstraintToString(c));
        }

        // MFS: all committed constraints that aren't in the conflict set
        const conflictSetIds = new Set(conflictSet);
        const maxFeasible = this.addedConstraints.filter(c => !conflictSetIds.has(c));

        return {
            name: 'PositionalConstraintError', type: 'positional-conflict',
            message: `Constraint "${orientationConstraintToString(triggerConstraint)}" conflicts with alignment constraints`,
            conflictingConstraint: triggerConstraint,
            conflictingSourceConstraint: triggerConstraint.sourceConstraint,
            minimalConflictingSet: srcToLayout,
            maximalFeasibleSubset: maxFeasible,
            errorMessages: {
                conflictingConstraint: orientationConstraintToString(triggerConstraint),
                conflictingSourceConstraint: triggerConstraint.sourceConstraint.toHTML(),
                minimalConflictingConstraints: htmlMap,
            },
        };
    }

    /**
     * Find the minimal set of constraints causing an alignment conflict.
     * Handles both within-class (aligned nodes ordered) and cross-class
     * (mutual ordering between alignment classes) conflicts.
     */
    private findAlignmentConflictSet(axis: 'x' | 'y'): LayoutConstraint[] {
        const uf = axis === 'x' ? this.xAlignUF : this.yAlignUF;
        const graph = axis === 'x' ? this.hGraph : this.vGraph;
        const axisEdge = axis === 'x' ? 'h' : 'v';
        const result: LayoutConstraint[] = [];

        // Collect multi-member classes
        const classMembers = new Map<string, string[]>();
        for (const [, members] of uf.classes()) {
            if (members.length < 2) continue;
            classMembers.set(uf.find(members[0]), members);
        }

        // --- Check 1: Within-class ordering conflict ---
        for (const [root, members] of classMembers) {
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    const a = members[i], b = members[j];
                    const ordered = graph.isOrdered(a, b) || graph.isOrdered(b, a);
                    if (!ordered) continue;

                    const [from, to] = graph.isOrdered(a, b) ? [a, b] : [b, a];

                    // Alignment constraints in this class
                    for (const c of this.addedConstraints) {
                        if (!isAlignmentConstraint(c)) continue;
                        const ac = c as AlignmentConstraint;
                        if (ac.axis !== axis) continue;
                        if (uf.find(ac.node1.id) === root || uf.find(ac.node2.id) === root) {
                            result.push(c);
                        }
                    }

                    // Ordering path
                    const path = this.findPath(graph, from, to);
                    if (path) {
                        for (const [pa, pb] of path) {
                            const c = this.addedConstraints.find(c => {
                                const e = this.constraintToEdge(c);
                                return e && e.axis === axisEdge && e.from === pa && e.to === pb;
                            });
                            if (c && !result.includes(c)) result.push(c);
                        }
                    }
                    return result;
                }
            }
        }

        // --- Check 2: Cross-class cycle ---
        const roots = [...classMembers.keys()];
        for (let i = 0; i < roots.length; i++) {
            for (let j = i + 1; j < roots.length; j++) {
                const aMembers = classMembers.get(roots[i])!;
                const bMembers = classMembers.get(roots[j])!;
                let aToB = false, bToA = false;
                for (const am of aMembers) {
                    for (const bm of bMembers) {
                        if (graph.isOrdered(am, bm)) aToB = true;
                        if (graph.isOrdered(bm, am)) bToA = true;
                    }
                }
                if (!aToB || !bToA) continue;

                // Alignment constraints forming each class
                for (const c of this.addedConstraints) {
                    if (!isAlignmentConstraint(c)) continue;
                    const ac = c as AlignmentConstraint;
                    if (ac.axis !== axis) continue;
                    const r1 = uf.find(ac.node1.id), r2 = uf.find(ac.node2.id);
                    if (r1 === roots[i] || r1 === roots[j] || r2 === roots[i] || r2 === roots[j]) {
                        result.push(c);
                    }
                }

                // Ordering paths in both directions
                this.collectOrderingPath(aMembers, bMembers, graph, axisEdge, result);
                this.collectOrderingPath(bMembers, aMembers, graph, axisEdge, result);
                return result;
            }
        }

        return result;
    }

    /** Find one ordering path from any member of fromMembers to any member of toMembers and add its constraints to result. */
    private collectOrderingPath(
        fromMembers: string[], toMembers: string[],
        graph: WeightedPartialOrderGraph, axisEdge: string,
        result: LayoutConstraint[],
    ): void {
        for (const fm of fromMembers) {
            for (const tm of toMembers) {
                if (!graph.isOrdered(fm, tm)) continue;
                const path = this.findPath(graph, fm, tm);
                if (path) {
                    for (const [a, b] of path) {
                        const c = this.addedConstraints.find(c => {
                            const e = this.constraintToEdge(c);
                            return e && e.axis === axisEdge && e.from === a && e.to === b;
                        });
                        if (c && !result.includes(c)) result.push(c);
                    }
                }
                return;
            }
        }
    }

    // ─── Group overlap validation ────────────────────────────────────────────

    public validateGroupConstraints(): GroupOverlapError | null {
        for (let i = 0; i < this.groups.length; i++) {
            for (let j = i + 1; j < this.groups.length; j++) {
                const g = this.groups[i], o = this.groups[j];
                if (this.isSubGroup(g, o) || this.isSubGroup(o, g)) continue;
                const intersection = this.groupIntersection(g, o);
                if (intersection.length > 0) {
                    const overlappingNodes = intersection
                        .map(id => this.nodes.find(n => n.id === id))
                        .filter((n): n is LayoutNode => n !== undefined);
                    return {
                        name: 'GroupOverlapError', type: 'group-overlap',
                        message: `Groups "${g.name}" and "${o.name}" overlap with nodes: ${intersection.join(', ')}`,
                        group1: g, group2: o, overlappingNodes,
                    };
                }
            }
        }
        return null;
    }

    // ─── Alignment orders ────────────────────────────────────────────────────

    private computeAlignmentOrders(): LayoutConstraint[] {
        this.horizontallyAligned = this.normalizeAlignment(this.horizontallyAligned);
        this.verticallyAligned = this.normalizeAlignment(this.verticallyAligned);

        const implicitConstraints: LayoutConstraint[] = [];

        const hOrder = this.hGraph.topologicalSort() || [];
        const hRank = new Map<string, number>();
        hOrder.forEach((id, idx) => hRank.set(id, idx));

        for (const group of this.horizontallyAligned) {
            group.sort((a, b) => (hRank.get(a.id) ?? 0) - (hRank.get(b.id) ?? 0));
            for (let i = 0; i < group.length - 1; i++) {
                const roc = new RelativeOrientationConstraint(['directlyLeft'], `${group[i].id}->${group[i + 1].id}`);
                const source = new ImplicitConstraint(roc, 'Preventing Overlap');
                implicitConstraints.push({ left: group[i], right: group[i + 1], minDistance: this.minPadding, sourceConstraint: source } as LeftConstraint);
            }
        }

        const vOrder = this.vGraph.topologicalSort() || [];
        const vRank = new Map<string, number>();
        vOrder.forEach((id, idx) => vRank.set(id, idx));

        for (const group of this.verticallyAligned) {
            group.sort((a, b) => (vRank.get(a.id) ?? 0) - (vRank.get(b.id) ?? 0));
            for (let i = 0; i < group.length - 1; i++) {
                const roc = new RelativeOrientationConstraint(['directlyAbove'], `${group[i].id}->${group[i + 1].id}`);
                const source = new ImplicitConstraint(roc, 'Preventing Overlap');
                implicitConstraints.push({ top: group[i], bottom: group[i + 1], minDistance: this.minPadding, sourceConstraint: source } as TopConstraint);
            }
        }

        return implicitConstraints;
    }

    private detectNodeOverlaps(): PositionalConstraintError | null {
        for (const hGroup of this.horizontallyAligned) {
            const hSet = new Set(hGroup.map(n => n.id));
            for (const vGroup of this.verticallyAligned) {
                const overlapping = vGroup.filter(n => hSet.has(n.id));
                if (overlapping.length >= 2) {
                    const n1 = overlapping[0], n2 = overlapping[1];
                    const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
                    for (const c of this.addedConstraints) {
                        if (isAlignmentConstraint(c)) {
                            const ac = c as AlignmentConstraint;
                            if ([n1.id, n2.id].includes(ac.node1.id) || [n1.id, n2.id].includes(ac.node2.id)) {
                                const src = ac.sourceConstraint;
                                if (!minimalConflictingSet.has(src)) minimalConflictingSet.set(src, []);
                                minimalConflictingSet.get(src)!.push(c);
                            }
                        }
                    }
                    const first = this.addedConstraints.find(c => isAlignmentConstraint(c)) || this.addedConstraints[0];
                    return {
                        name: 'PositionalConstraintError', type: 'positional-conflict',
                        message: `Alignment constraints force ${n1.id} and ${n2.id} to occupy the same position`,
                        conflictingConstraint: first, conflictingSourceConstraint: first.sourceConstraint,
                        minimalConflictingSet,
                        errorMessages: {
                            conflictingConstraint: orientationConstraintToString(first),
                            conflictingSourceConstraint: first.sourceConstraint.toHTML(),
                            minimalConflictingConstraints: new Map(),
                        },
                    };
                }
            }
        }
        return null;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private normalizeAlignment(aligned: LayoutNode[][]): LayoutNode[][] {
        const merged: LayoutNode[][] = [];
        for (const group of aligned) {
            let mergedWithExisting = false;
            for (const existing of merged) {
                if (group.some(item => existing.some(e => e.id === item.id))) {
                    for (const item of group) {
                        if (!existing.some(e => e.id === item.id)) existing.push(item);
                    }
                    mergedWithExisting = true;
                    break;
                }
            }
            if (!mergedWithExisting) merged.push([...group]);
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < merged.length; i++) {
                for (let j = i + 1; j < merged.length; j++) {
                    if (merged[i].some(a => merged[j].some(b => a.id === b.id))) {
                        for (const item of merged[j]) {
                            if (!merged[i].some(e => e.id === item.id)) merged[i].push(item);
                        }
                        merged.splice(j, 1);
                        changed = true;
                        break;
                    }
                }
                if (changed) break;
            }
        }
        return merged;
    }

    private isSubGroup(sub: LayoutGroup, group: LayoutGroup): boolean {
        return sub.nodeIds.every(id => group.nodeIds.includes(id));
    }

    private groupIntersection(g1: LayoutGroup, g2: LayoutGroup): string[] {
        return g1.nodeIds.filter(id => g2.nodeIds.includes(id));
    }

    public dispose(): void {
        this.hGraph = new WeightedPartialOrderGraph(this.minPadding);
        this.vGraph = new WeightedPartialOrderGraph(this.minPadding);
        this.learnedClauses = [];
        this.activity.clear();
        this.assignmentTrail = [];
    }

    public getStats(): {
        hEdges: number; vEdges: number;
        learnedClauses: number; conflicts: number; addedConstraints: number;
        prunedByTransitivity: number; prunedByDimension: number;
        prunedByPigeonhole: number; prunedByDecomposition: number;
    } {
        return {
            hEdges: this.hGraph.edgeCount(),
            vEdges: this.vGraph.edgeCount(),
            learnedClauses: this.learnedClauses.length,
            conflicts: this.conflictCount,
            addedConstraints: this.addedConstraints.length,
            prunedByTransitivity: this.prunedByTransitivity,
            prunedByDimension: this.prunedByDimension,
            prunedByPigeonhole: this.prunedByPigeonhole,
            prunedByDecomposition: this.prunedByDecomposition,
        };
    }
}

export { QualitativeConstraintValidator };
