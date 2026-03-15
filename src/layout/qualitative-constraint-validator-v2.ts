/**
 * QualitativeConstraintValidatorV2 — a geometry-aware constraint validator that
 * operates entirely on qualitative relations between **boxes** (axis-aligned
 * rectangles with known dimensions).
 *
 * ─── Key domain invariant ───
 *
 * The only first-class spatial entities are **boxes** (LayoutNodes). Group
 * rectangles are not independent regions — they are bounding envelopes derived
 * from their members:
 *
 *   L(group) = min { L(m) : m ∈ group }
 *   R(group) = max { R(m) : m ∈ group }
 *   T(group) = min { T(m) : m ∈ group }
 *   B(group) = max { B(m) : m ∈ group }
 *
 * Therefore "x is left of group G" is really a *conjunction* over members:
 *
 *   leftof(x, G)  ≡  ∀ m ∈ G : leftof(x, m)
 *
 * because R(x) + gap ≤ L(G) = min L(m) ≤ L(m) for each m.
 *
 * And "x is right of group G" means:
 *
 *   rightof(x, G)  ≡  ∀ m ∈ G : leftof(m, x)
 *
 * because R(m) ≤ R(G) = max R(m) ≤ L(x) - gap, so L(x) ≥ R(m) + gap.
 *
 * Non-member exclusion ("x must be outside group G") becomes:
 *
 *   (∀m: leftof(x,m))  ∨  (∀m: leftof(m,x))  ∨  (∀m: above(x,m))  ∨  (∀m: above(m,x))
 *
 * Each alternative is a conjunction of box-to-box constraints. The H and V
 * partial-order graphs contain ONLY box nodes — no virtual group nodes.
 *
 * This is more faithful to the geometry and naturally gives us "containment
 * propagation" for free: the edges ARE between boxes, so transitivity in the
 * partial-order graph already propagates through members.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Insight 1 — Box-only encoding of group constraints
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   By encoding group exclusion directly as box-to-box constraints, we get
 *   transitive propagation for free. If leftof(x, m₁) is chosen and later
 *   leftof(m₁, y) is added, then leftof(x, y) follows by transitivity —
 *   which may satisfy other disjunctions without any search.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Insight 2 — Dimension-aware feasibility bounds
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   We know box dimensions (width, height). A chain a₁ <_H a₂ <_H ... <_H aₖ
 *   requires at least Σᵢ W(aᵢ) + (k−1)·gap horizontal space. Similarly for V.
 *
 *   We set a generous canvas bound (MAX_SPAN = 100,000 px) and:
 *   - Reject infeasible chains early
 *   - Score branching alternatives by slack (room left on the canvas)
 *   - Prune alternatives that would exceed the bound
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Insight 3 — Pigeonhole on alignment classes
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   If K nodes are x-aligned (same x-coordinate) and must be vertically
 *   separated, they need at least  Σᵢ H(nᵢ) + (K−1)·gap  vertical space.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Insight 4 — Interval-graph non-overlap decomposition
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   For 4-way non-overlap disjunctions, try to commit pairs to one axis
 *   based on existing orderings, slack analysis, and aspect ratios before
 *   entering the CDCL search.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   QualitativeConstraintValidatorV2 (this file)
 *     → feasibility check + ordering selection via CDCL with geometry
 *     → produces a consistent InstanceLayout with resolved orderings
 *   Then:
 *     → Kiwi/WebCola assigns actual numeric coordinates (one LP solve, no backtracking)
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

// Re-export error types so callers can use any validator interchangeably
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

/** Max canvas span in pixels — any chain exceeding this is infeasible. */
const MAX_SPAN = 100_000;

// ═══════════════════════════════════════════════════════════════════════════════
// Weighted Partial-Order Graph (boxes only, dimension-aware)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DAG representing a strict partial order over boxes, augmented with per-node
 * dimensions (width for H, height for V) so we can compute minimum chain spans.
 *
 * Invariant: all nodes are boxes. No virtual/group nodes.
 */
class WeightedPartialOrderGraph {
    private adj: Map<string, Set<string>> = new Map();
    private radj: Map<string, Set<string>> = new Map();
    private nodes: Set<string> = new Set();
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

    setNodeSize(id: string, size: number): void {
        this.nodeSize.set(id, size);
    }

    getNodeSize(id: string): number {
        return this.nodeSize.get(id) ?? 0;
    }

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
            for (const s of succs) {
                inDeg.set(s, (inDeg.get(s) ?? 0) + 1);
            }
        }
        const queue: string[] = [];
        for (const [n, d] of inDeg) {
            if (d === 0) queue.push(n);
        }
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
     * Minimum canvas span = longest weighted chain.
     * dist[n] = size(n) + max over predecessors p of (dist[p] + gap)
     */
    longestChainSpan(): number {
        const order = this.topologicalSort();
        if (!order) return Infinity;

        const dist = new Map<string, number>();
        let maxSpan = 0;

        for (const n of order) {
            const mySize = this.nodeSize.get(n) ?? 0;
            let bestPred = 0;
            for (const p of this.radj.get(n) ?? []) {
                const pd = dist.get(p) ?? 0;
                bestPred = Math.max(bestPred, pd + this.gap);
            }
            const d = bestPred + mySize;
            dist.set(n, d);
            maxSpan = Math.max(maxSpan, d);
        }

        return maxSpan;
    }

    /**
     * Slack for adding edge (a → b): MAX_SPAN minus the longest chain that
     * would pass through the a→b edge. Negative = would exceed canvas.
     */
    slackForEdge(a: string, b: string, maxSpan: number): number {
        if (this.canReach(b, a)) return -Infinity;

        this.adj.get(a)!.add(b);
        this.radj.get(b)!.add(a);

        const pathFromA = this.longestPathFrom(a);
        const pathToA = this.longestPathTo(a);
        const span = pathToA + this.gap + pathFromA - (this.nodeSize.get(a) ?? 0);

        this.adj.get(a)!.delete(b);
        this.radj.get(b)!.delete(a);

        return maxSpan - span;
    }

    private longestPathFrom(start: string): number {
        const visited = new Map<string, number>();
        const dfs = (n: string): number => {
            if (visited.has(n)) return visited.get(n)!;
            const mySize = this.nodeSize.get(n) ?? 0;
            let best = mySize;
            for (const s of this.adj.get(n) ?? []) {
                best = Math.max(best, mySize + this.gap + dfs(s));
            }
            visited.set(n, best);
            return best;
        };
        return dfs(start);
    }

    private longestPathTo(end: string): number {
        const visited = new Map<string, number>();
        const dfs = (n: string): number => {
            if (visited.has(n)) return visited.get(n)!;
            const mySize = this.nodeSize.get(n) ?? 0;
            let best = mySize;
            for (const p of this.radj.get(n) ?? []) {
                best = Math.max(best, mySize + this.gap + dfs(p));
            }
            visited.set(n, best);
            return best;
        };
        return dfs(end);
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
// Union-Find for alignment equivalence classes
// ═══════════════════════════════════════════════════════════════════════════════

class UnionFind {
    private parent: Map<string, string> = new Map();
    private rank: Map<string, number> = new Map();
    private members: Map<string, Set<string>> = new Map();

    find(x: string): string {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.rank.set(x, 0);
            this.members.set(x, new Set([x]));
        }
        let root = x;
        while (this.parent.get(root) !== root) {
            root = this.parent.get(root)!;
        }
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
        let newRoot: string;
        let absorbed: string;
        if (rankA < rankB) {
            this.parent.set(ra, rb);
            newRoot = rb; absorbed = ra;
        } else if (rankA > rankB) {
            this.parent.set(rb, ra);
            newRoot = ra; absorbed = rb;
        } else {
            this.parent.set(rb, ra);
            this.rank.set(ra, rankA + 1);
            newRoot = ra; absorbed = rb;
        }

        const newMembers = this.members.get(newRoot) ?? new Set();
        for (const m of this.members.get(absorbed) ?? []) newMembers.add(m);
        this.members.set(newRoot, newMembers);
        this.members.delete(absorbed);
        return true;
    }

    connected(a: string, b: string): boolean {
        return this.find(a) === this.find(b);
    }

    classMembers(x: string): ReadonlySet<string> {
        const root = this.find(x);
        return this.members.get(root) ?? new Set();
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

    clone(): UnionFind {
        const uf = new UnionFind();
        uf.parent = new Map(this.parent);
        uf.rank = new Map(this.rank);
        for (const [k, v] of this.members) uf.members.set(k, new Set(v));
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
}

interface SolverCheckpoint {
    hGraph: WeightedPartialOrderGraph;
    vGraph: WeightedPartialOrderGraph;
    xAlignUF: UnionFind;
    yAlignUF: UnionFind;
    assignmentTrailLength: number;
    addedConstraintsLength: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group containment index
// ═══════════════════════════════════════════════════════════════════════════════

class GroupContainmentIndex {
    private nodeToGroups: Map<string, Set<string>> = new Map();
    private groupToMembers: Map<string, Set<string>> = new Map();
    private groupByName: Map<string, LayoutGroup> = new Map();

    constructor(nodes: LayoutNode[], groups: LayoutGroup[]) {
        for (const node of nodes) this.nodeToGroups.set(node.id, new Set());
        for (const group of groups) {
            this.groupByName.set(group.name, group);
            this.groupToMembers.set(group.name, new Set(group.nodeIds));
            for (const nodeId of group.nodeIds) {
                this.nodeToGroups.get(nodeId)?.add(group.name);
            }
        }
    }

    isMember(nodeId: string, groupName: string): boolean {
        return this.groupToMembers.get(groupName)?.has(nodeId) ?? false;
    }

    groupsOf(nodeId: string): ReadonlySet<string> {
        return this.nodeToGroups.get(nodeId) ?? new Set();
    }

    membersOf(groupName: string): ReadonlySet<string> {
        return this.groupToMembers.get(groupName) ?? new Set();
    }

    getGroup(name: string): LayoutGroup | undefined {
        return this.groupByName.get(name);
    }

    isSubGroup(groupA: string, groupB: string): boolean {
        const membersA = this.groupToMembers.get(groupA);
        const membersB = this.groupToMembers.get(groupB);
        if (!membersA || !membersB) return false;
        for (const m of membersA) {
            if (!membersB.has(m)) return false;
        }
        return true;
    }

    intersection(groupA: string, groupB: string): string[] {
        const membersA = this.groupToMembers.get(groupA);
        const membersB = this.groupToMembers.get(groupB);
        if (!membersA || !membersB) return [];
        const result: string[] = [];
        for (const m of membersA) {
            if (membersB.has(m)) result.push(m);
        }
        return result;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QualitativeConstraintValidatorV2
// ═══════════════════════════════════════════════════════════════════════════════

class QualitativeConstraintValidatorV2 {
    // ─── Input ───
    layout: InstanceLayout;
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    groups: LayoutGroup[];
    orientationConstraints: LayoutConstraint[];
    minPadding: number = 15;

    // ─── Qualitative state (boxes only, dimension-weighted) ───
    private hGraph: WeightedPartialOrderGraph;
    private vGraph: WeightedPartialOrderGraph;
    private xAlignUF: UnionFind = new UnionFind();
    private yAlignUF: UnionFind = new UnionFind();

    // ─── Group containment ───
    private containment: GroupContainmentIndex;

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
    private prunedByContainment: number = 0;
    private prunedByDimension: number = 0;
    private prunedByPigeonhole: number = 0;
    private prunedByIntervalDecomp: number = 0;

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
            this.hGraph.ensureNode(node.id, node.width);
            this.vGraph.ensureNode(node.id, node.height);
        }

        this.containment = new GroupContainmentIndex(this.nodes, this.groups);
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

        // Phase 1.5: Dimension feasibility check
        const dimError = this.checkDimensionFeasibility();
        if (dimError) return dimError;

        // Phase 1.6: Pigeonhole check on alignment classes (Insight 3)
        const pigeonholeError = this.checkPigeonhole();
        if (pigeonholeError) return pigeonholeError;

        const constraintsBeforeDisjunctions = this.addedConstraints.length;

        // Phase 2: Build group non-member disjunctions as box-to-box constraints
        const groupError = this.addGroupExclusionDisjunctions();
        if (groupError) return groupError;

        // Phase 3: Collect all disjunctions
        this.allDisjunctions = [...(this.layout.disjunctiveConstraints || [])];

        // Phase 4: Interval-graph decomposition (Insight 4)
        this.applyIntervalDecomposition();

        // Phase 5: Solve remaining disjunctions with CDCL
        if (this.allDisjunctions.length > 0) {
            const result = this.solveCDCL();
            if (!result.satisfiable) {
                return result.error || null;
            }

            const chosenConstraints = this.addedConstraints.slice(constraintsBeforeDisjunctions);
            this.layout.constraints = this.layout.constraints.concat(chosenConstraints);
        }

        // Phase 6: Compute alignment orders
        const implicitConstraints = this.computeAlignmentOrders();

        // Phase 7: Check for node overlaps
        const overlapError = this.detectNodeOverlaps();
        if (overlapError) return overlapError;

        this.layout.constraints = this.layout.constraints.concat(implicitConstraints);
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Insight 1: Box-only group exclusion (no virtual group nodes)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Build disjunctions for non-member exclusion using ONLY box-to-box
     * constraints. No virtual group nodes.
     *
     * For each non-member x of group G with members {m₁, m₂, …, mₖ}:
     *
     *   (leftof(x,m₁) ∧ leftof(x,m₂) ∧ … ∧ leftof(x,mₖ))     // x left of all
     *   ∨ (leftof(m₁,x) ∧ leftof(m₂,x) ∧ … ∧ leftof(mₖ,x))   // all left of x
     *   ∨ (above(x,m₁) ∧ above(x,m₂) ∧ … ∧ above(x,mₖ))      // x above all
     *   ∨ (above(m₁,x) ∧ above(m₂,x) ∧ … ∧ above(mₖ,x))      // all above x
     *
     * Key optimization: if x is already ordered w.r.t. ALL members on some
     * axis (by transitivity in the H/V graph), the disjunction is trivially
     * satisfied and we skip it entirely. This is "containment propagation
     * for free" — because the edges are between boxes, transitivity handles it.
     */
    private addGroupExclusionDisjunctions(): PositionalConstraintError | null {
        // Pre-compute node → groups for "free node" detection
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

            const memberIds = group.nodeIds;
            const memberSet = new Set(memberIds);
            const memberNodes = memberIds
                .map(id => this.nodeMap.get(id))
                .filter((n): n is LayoutNode => n !== undefined);

            if (memberNodes.length === 0) continue;

            for (const node of this.nodes) {
                if (memberSet.has(node.id)) continue;

                // Skip nodes in other groups
                const ng = nodeToGroups.get(node.id);
                if (ng && ng.size > 0) continue;

                // Check if x is already separated from ALL members on some axis.
                // If leftof(x, m) or leftof(m, x) holds for ALL m, done.
                if (this.isSeparatedFromAllMembers(node.id, memberIds)) {
                    this.prunedByContainment++;
                    continue;
                }

                const sourceConstraint = group.sourceConstraint;

                // Build 4 alternatives, each a conjunction over all members
                const leftOfAll: LayoutConstraint[] = memberNodes.map(m =>
                    ({ left: node, right: m, minDistance: this.minPadding, sourceConstraint } as LeftConstraint));

                const rightOfAll: LayoutConstraint[] = memberNodes.map(m =>
                    ({ left: m, right: node, minDistance: this.minPadding, sourceConstraint } as LeftConstraint));

                const aboveAll: LayoutConstraint[] = memberNodes.map(m =>
                    ({ top: node, bottom: m, minDistance: this.minPadding, sourceConstraint } as TopConstraint));

                const belowAll: LayoutConstraint[] = memberNodes.map(m =>
                    ({ top: m, bottom: node, minDistance: this.minPadding, sourceConstraint } as TopConstraint));

                // Pre-filter: only keep alternatives where no edge would cycle
                const alts: LayoutConstraint[][] = [];
                for (const alt of [leftOfAll, rightOfAll, aboveAll, belowAll]) {
                    if (this.isAlternativeFeasible(alt)) {
                        alts.push(alt);
                    }
                }

                if (alts.length === 0) {
                    // All alternatives pruned — add all 4 for CDCL error reporting
                    const disj = new DisjunctiveConstraint(sourceConstraint,
                        [leftOfAll, rightOfAll, aboveAll, belowAll]);
                    if (!this.layout.disjunctiveConstraints) this.layout.disjunctiveConstraints = [];
                    this.layout.disjunctiveConstraints.push(disj);
                } else if (alts.length === 1) {
                    // Unit — commit directly
                    for (const constraint of alts[0]) {
                        const error = this.addConjunctiveConstraint(constraint);
                        if (error) return error;
                    }
                } else {
                    const disj = new DisjunctiveConstraint(sourceConstraint, alts);
                    if (!this.layout.disjunctiveConstraints) this.layout.disjunctiveConstraints = [];
                    this.layout.disjunctiveConstraints.push(disj);
                }
            }
        }

        // Group-to-group separation: for disjoint groups that aren't subgroups,
        // ensure their member sets don't overlap spatially.
        // With box-only encoding: "group A left of group B" means
        // every member of A is left of every member of B.
        for (let i = 0; i < this.groups.length; i++) {
            for (let j = i + 1; j < this.groups.length; j++) {
                const gA = this.groups[i];
                const gB = this.groups[j];
                if (gA.nodeIds.length <= 1 || gB.nodeIds.length <= 1) continue;
                if (this.containment.isSubGroup(gA.name, gB.name) ||
                    this.containment.isSubGroup(gB.name, gA.name)) continue;
                if (this.containment.intersection(gA.name, gB.name).length > 0) continue;

                // Check if already separated
                if (this.areGroupsSeparated(gA, gB)) {
                    this.prunedByContainment++;
                    continue;
                }

                const membersA = gA.nodeIds.map(id => this.nodeMap.get(id)).filter((n): n is LayoutNode => !!n);
                const membersB = gB.nodeIds.map(id => this.nodeMap.get(id)).filter((n): n is LayoutNode => !!n);
                const src = gA.sourceConstraint || gB.sourceConstraint!;

                // A left of B: every a ∈ A is left of every b ∈ B
                const aLeftB: LayoutConstraint[] = [];
                const bLeftA: LayoutConstraint[] = [];
                const aAboveB: LayoutConstraint[] = [];
                const bAboveA: LayoutConstraint[] = [];
                for (const a of membersA) {
                    for (const b of membersB) {
                        aLeftB.push({ left: a, right: b, minDistance: this.minPadding, sourceConstraint: src } as LeftConstraint);
                        bLeftA.push({ left: b, right: a, minDistance: this.minPadding, sourceConstraint: src } as LeftConstraint);
                        aAboveB.push({ top: a, bottom: b, minDistance: this.minPadding, sourceConstraint: src } as TopConstraint);
                        bAboveA.push({ top: b, bottom: a, minDistance: this.minPadding, sourceConstraint: src } as TopConstraint);
                    }
                }

                const alts = [aLeftB, bLeftA, aAboveB, bAboveA].filter(alt =>
                    this.isAlternativeFeasible(alt)
                );

                if (alts.length > 0) {
                    const disj = new DisjunctiveConstraint(src, alts.length === 0
                        ? [aLeftB, bLeftA, aAboveB, bAboveA]
                        : alts);
                    if (!this.layout.disjunctiveConstraints) this.layout.disjunctiveConstraints = [];
                    this.layout.disjunctiveConstraints.push(disj);
                }
            }
        }

        return null;
    }

    /**
     * Check if node x is separated from ALL members of a group on some axis.
     * This means the group exclusion constraint is already satisfied.
     *
     * x is "left of all members" if leftof(x, m) for every m.
     * x is "right of all members" if leftof(m, x) for every m.
     * Similarly for V axis.
     */
    private isSeparatedFromAllMembers(nodeId: string, memberIds: string[]): boolean {
        // Check: x left of all?
        if (memberIds.every(m => this.hGraph.isOrdered(nodeId, m))) return true;
        // Check: all left of x?
        if (memberIds.every(m => this.hGraph.isOrdered(m, nodeId))) return true;
        // Check: x above all?
        if (memberIds.every(m => this.vGraph.isOrdered(nodeId, m))) return true;
        // Check: all above x?
        if (memberIds.every(m => this.vGraph.isOrdered(m, nodeId))) return true;

        return false;
    }

    /**
     * Check if two groups are already separated (all members of A separated
     * from all members of B on some axis).
     */
    private areGroupsSeparated(gA: LayoutGroup, gB: LayoutGroup): boolean {
        // A left of B: every a <_H every b
        const aLeftB = gA.nodeIds.every(a => gB.nodeIds.every(b => this.hGraph.isOrdered(a, b)));
        if (aLeftB) return true;
        const bLeftA = gB.nodeIds.every(b => gA.nodeIds.every(a => this.hGraph.isOrdered(b, a)));
        if (bLeftA) return true;
        const aAboveB = gA.nodeIds.every(a => gB.nodeIds.every(b => this.vGraph.isOrdered(a, b)));
        if (aAboveB) return true;
        const bAboveA = gB.nodeIds.every(b => gA.nodeIds.every(a => this.vGraph.isOrdered(b, a)));
        if (bAboveA) return true;
        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Insight 2: Dimension-aware feasibility
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
    // Insight 3: Pigeonhole on alignment classes
    // ═══════════════════════════════════════════════════════════════════════════

    private checkPigeonhole(): PositionalConstraintError | null {
        // x-aligned nodes must separate on y
        const xClasses = this.xAlignUF.classes();
        for (const [, members] of xClasses) {
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

        // y-aligned nodes must separate on x
        const yClasses = this.yAlignUF.classes();
        for (const [, members] of yClasses) {
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
    // Insight 4: Interval-graph non-overlap decomposition
    // ═══════════════════════════════════════════════════════════════════════════

    private applyIntervalDecomposition(): void {
        const remaining: DisjunctiveConstraint[] = [];

        for (const disj of this.allDisjunctions) {
            // Only try decomposition on multi-alternative disjunctions
            if (disj.alternatives.length <= 1) {
                remaining.push(disj);
                continue;
            }

            // Check if already satisfied by existing orderings
            if (this.isDisjunctionAlreadySatisfied(disj)) {
                this.prunedByIntervalDecomp++;
                continue;
            }

            // Try aspect-ratio / slack-based commit
            if (disj.alternatives.length >= 4) {
                const committed = this.trySlackBasedCommit(disj);
                if (committed) {
                    this.prunedByIntervalDecomp++;
                    continue;
                }
            }

            // Reduce by pruning infeasible alternatives
            const reduced = this.reduceDisjunction(disj);
            if (reduced === 'committed') {
                this.prunedByIntervalDecomp++;
            } else if (reduced !== null) {
                remaining.push(reduced);
            } else {
                remaining.push(disj);
            }
        }

        this.allDisjunctions = remaining;
    }

    /**
     * Check if a disjunction is already satisfied because at least one
     * alternative's edges are all consistent with existing orderings.
     */
    private isDisjunctionAlreadySatisfied(disj: DisjunctiveConstraint): boolean {
        for (const alt of disj.alternatives) {
            let allAlreadyOrdered = true;
            for (const constraint of alt) {
                const edge = this.constraintToBoxEdge(constraint);
                if (!edge) continue;
                const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                if (!graph.isOrdered(edge.from, edge.to)) {
                    allAlreadyOrdered = false;
                    break;
                }
            }
            if (allAlreadyOrdered) {
                // This alternative is already satisfied — record it
                for (const constraint of alt) {
                    this.addedConstraints.push(constraint);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Try to commit a disjunction to the axis with more slack.
     */
    private trySlackBasedCommit(disj: DisjunctiveConstraint): boolean {
        // Score each alternative by minimum slack
        const scored: { alt: LayoutConstraint[]; slack: number }[] = [];

        for (const alt of disj.alternatives) {
            if (!this.isAlternativeFeasible(alt)) continue;

            let minSlack = Infinity;
            for (const constraint of alt) {
                const edge = this.constraintToBoxEdge(constraint);
                if (!edge) continue;
                const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                const slack = graph.slackForEdge(edge.from, edge.to, MAX_SPAN);
                minSlack = Math.min(minSlack, slack);
            }
            scored.push({ alt, slack: minSlack });
        }

        if (scored.length === 0) return false;

        // Sort by slack descending
        scored.sort((a, b) => b.slack - a.slack);

        // If the best alternative has vastly more slack (3x) than the next,
        // or if only one alternative is feasible, commit to it
        if (scored.length === 1 ||
            (scored.length >= 2 && scored[0].slack > 3 * Math.max(scored[1].slack, 1))) {
            return this.tryCommitAlternative(scored[0].alt);
        }

        return false;
    }

    private tryCommitAlternative(alternative: LayoutConstraint[]): boolean {
        for (const constraint of alternative) {
            const edge = this.constraintToBoxEdge(constraint);
            if (!edge) continue;
            const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
            if (graph.isOrdered(edge.to, edge.from)) return false;
        }
        for (const constraint of alternative) {
            this.addQualitativeEdge(constraint);
            this.addedConstraints.push(constraint);
        }
        return true;
    }

    private reduceDisjunction(disj: DisjunctiveConstraint): DisjunctiveConstraint | 'committed' | null {
        const validAlternatives: LayoutConstraint[][] = [];
        for (const alt of disj.alternatives) {
            if (this.isAlternativeFeasible(alt)) {
                validAlternatives.push(alt);
            }
        }

        if (validAlternatives.length === 0) return null;

        if (validAlternatives.length === 1) {
            for (const constraint of validAlternatives[0]) {
                if (!this.addQualitativeEdge(constraint)) return null;
                this.addedConstraints.push(constraint);
            }
            return 'committed';
        }

        if (validAlternatives.length < disj.alternatives.length) {
            return new DisjunctiveConstraint(disj.sourceConstraint, validAlternatives);
        }

        return null; // No reduction possible
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Conjunctive constraint addition
    // ═══════════════════════════════════════════════════════════════════════════

    private addConjunctiveConstraint(constraint: LayoutConstraint): PositionalConstraintError | null {
        if (isLeftConstraint(constraint)) {
            const ok = this.hGraph.addEdge(constraint.left.id, constraint.right.id);
            if (!ok) return this.buildConjunctiveError(constraint);
            this.addedConstraints.push(constraint);
        } else if (isTopConstraint(constraint)) {
            const ok = this.vGraph.addEdge(constraint.top.id, constraint.bottom.id);
            if (!ok) return this.buildConjunctiveError(constraint);
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
        } else if (isBoundingBoxConstraint(constraint)) {
            // Legacy: decompose BoundingBoxConstraint into box-to-box edges
            const bc = constraint as BoundingBoxConstraint;
            const members = this.containment.membersOf(bc.group.name);
            for (const memberId of members) {
                if (memberId === bc.node.id) continue;
                const edge = this.bbcToBoxEdge(bc, memberId);
                if (edge) {
                    const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                    if (!graph.addEdge(edge.from, edge.to)) {
                        return this.buildConjunctiveError(constraint);
                    }
                }
            }
            this.addedConstraints.push(constraint);
        } else if (isGroupBoundaryConstraint(constraint)) {
            // Legacy: decompose GroupBoundaryConstraint into box-to-box edges
            const gc = constraint as GroupBoundaryConstraint;
            const membersA = this.containment.membersOf(gc.groupA.name);
            const membersB = this.containment.membersOf(gc.groupB.name);
            for (const a of membersA) {
                for (const b of membersB) {
                    const edge = this.gbcToBoxEdge(gc, a, b);
                    if (edge) {
                        const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                        if (!graph.addEdge(edge.from, edge.to)) {
                            return this.buildConjunctiveError(constraint);
                        }
                    }
                }
            }
            this.addedConstraints.push(constraint);
        }
        return null;
    }

    /** Decompose a BoundingBoxConstraint into a box-to-box edge for one member. */
    private bbcToBoxEdge(bc: BoundingBoxConstraint, memberId: string): { axis: 'h' | 'v'; from: string; to: string } | null {
        switch (bc.side) {
            case 'left':  return { axis: 'h', from: bc.node.id, to: memberId };   // node left of member
            case 'right': return { axis: 'h', from: memberId, to: bc.node.id };   // member left of node
            case 'top':   return { axis: 'v', from: bc.node.id, to: memberId };   // node above member
            case 'bottom': return { axis: 'v', from: memberId, to: bc.node.id };  // member above node
        }
    }

    /** Decompose a GroupBoundaryConstraint into a box-to-box edge for one (a,b) pair. */
    private gbcToBoxEdge(gc: GroupBoundaryConstraint, aId: string, bId: string): { axis: 'h' | 'v'; from: string; to: string } | null {
        switch (gc.side) {
            case 'left':  return { axis: 'h', from: aId, to: bId };  // A left of B
            case 'right': return { axis: 'h', from: bId, to: aId };  // B left of A
            case 'top':   return { axis: 'v', from: aId, to: bId };  // A above B
            case 'bottom': return { axis: 'v', from: bId, to: aId }; // B above A
        }
    }

    private checkAlignmentConsistency(ac: AlignmentConstraint): PositionalConstraintError | null {
        const id1 = ac.node1.id;
        const id2 = ac.node2.id;
        if (ac.axis === 'x') {
            if (this.hGraph.hasEdge(id1, id2) || this.hGraph.hasEdge(id2, id1)) {
                return this.buildConjunctiveError(ac);
            }
        } else {
            if (this.vGraph.hasEdge(id1, id2) || this.vGraph.hasEdge(id2, id1)) {
                return this.buildConjunctiveError(ac);
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

    private isAlternativeFeasible(alternative: LayoutConstraint[]): boolean {
        for (const constraint of alternative) {
            const edge = this.constraintToBoxEdge(constraint);
            if (!edge) continue;
            const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;

            // Would cycle?
            if (graph.isOrdered(edge.to, edge.from)) return false;

            // Alignment conflict?
            if (edge.axis === 'h' && this.xAlignUF.connected(edge.from, edge.to)) return false;
            if (edge.axis === 'v' && this.yAlignUF.connected(edge.from, edge.to)) return false;

            // Insight 2: dimension overflow?
            const slack = graph.slackForEdge(edge.from, edge.to, MAX_SPAN);
            if (slack < 0) {
                this.prunedByDimension++;
                return false;
            }
        }
        return true;
    }

    /**
     * Convert any constraint to a box-to-box edge. For BoundingBoxConstraint
     * and GroupBoundaryConstraint, returns the edge for the first member pair
     * (representative — used for heuristic scoring, not for completeness).
     */
    private constraintToBoxEdge(constraint: LayoutConstraint): { axis: 'h' | 'v'; from: string; to: string } | null {
        if (isLeftConstraint(constraint)) {
            return { axis: 'h', from: constraint.left.id, to: constraint.right.id };
        }
        if (isTopConstraint(constraint)) {
            return { axis: 'v', from: constraint.top.id, to: constraint.bottom.id };
        }
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            // Use first member as representative
            const firstMember = bc.group.nodeIds.find(id => id !== bc.node.id);
            if (!firstMember) return null;
            return this.bbcToBoxEdge(bc, firstMember);
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const aFirst = gc.groupA.nodeIds[0];
            const bFirst = gc.groupB.nodeIds[0];
            if (!aFirst || !bFirst) return null;
            return this.gbcToBoxEdge(gc, aFirst, bFirst);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CDCL solver
    // ═══════════════════════════════════════════════════════════════════════════

    private solveCDCL(): { satisfiable: boolean; error?: PositionalConstraintError } {
        if (this.allDisjunctions.length === 0) return { satisfiable: true };

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

    private cdclSearchLoop(assigned: Int32Array): {
        satisfiable: boolean;
        provedUnsat?: boolean;
    } {
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

                if (conflictsSinceRestart >= this.restartThreshold) {
                    return { satisfiable: false, provedUnsat: false };
                }
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

                if (conflictsSinceRestart >= this.restartThreshold) {
                    return { satisfiable: false, provedUnsat: false };
                }
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
                    }
                }

                if (numSat > 0) continue;
                if (unresolvedCount === 0) return 'conflict';

                if (unresolvedCount === 1 && lastUnresolved) {
                    const lit = lastUnresolved;
                    if (lit.sign) {
                        if (!this.tryAssign(lit.disjunctionIndex, lit.alternativeIndex, assigned, false)) return 'conflict';
                    } else {
                        const remaining = this.getRemainingAlternatives(lit.disjunctionIndex, assigned);
                        const filtered = remaining.filter(a => a !== lit.alternativeIndex);
                        if (filtered.length === 0) return 'conflict';
                        if (filtered.length === 1) {
                            if (!this.tryAssign(lit.disjunctionIndex, filtered[0], assigned, false)) return 'conflict';
                        }
                    }
                    changed = true;
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

        for (const constraint of alternative) {
            if (!this.addQualitativeEdge(constraint)) {
                this.undoAlternativeEdges(alternative, constraint);
                return false;
            }
        }

        assigned[dIdx] = aIdx;
        this.assignmentTrail.push({ disjunctionIndex: dIdx, alternativeIndex: aIdx, decisionLevel: this.decisionLevel, isDecision });
        for (const constraint of alternative) this.addedConstraints.push(constraint);
        return true;
    }

    /**
     * Add a constraint as edge(s) in the qualitative graph.
     * For LeftConstraint/TopConstraint: single box-to-box edge.
     * For BoundingBoxConstraint: edges to ALL members.
     * For GroupBoundaryConstraint: edges for ALL member pairs.
     */
    private addQualitativeEdge(constraint: LayoutConstraint): boolean {
        if (isLeftConstraint(constraint)) {
            return this.hGraph.addEdge(constraint.left.id, constraint.right.id);
        }
        if (isTopConstraint(constraint)) {
            return this.vGraph.addEdge(constraint.top.id, constraint.bottom.id);
        }
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const members = this.containment.membersOf(bc.group.name);
            for (const memberId of members) {
                if (memberId === bc.node.id) continue;
                const edge = this.bbcToBoxEdge(bc, memberId);
                if (edge) {
                    const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                    if (!graph.addEdge(edge.from, edge.to)) return false;
                }
            }
            return true;
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const membersA = this.containment.membersOf(gc.groupA.name);
            const membersB = this.containment.membersOf(gc.groupB.name);
            for (const a of membersA) {
                for (const b of membersB) {
                    const edge = this.gbcToBoxEdge(gc, a, b);
                    if (edge) {
                        const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                        if (!graph.addEdge(edge.from, edge.to)) return false;
                    }
                }
            }
            return true;
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
            const members = this.containment.membersOf(bc.group.name);
            for (const memberId of members) {
                if (memberId === bc.node.id) continue;
                const edge = this.bbcToBoxEdge(bc, memberId);
                if (edge) {
                    const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                    graph.removeEdge(edge.from, edge.to);
                }
            }
        } else if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const membersA = this.containment.membersOf(gc.groupA.name);
            const membersB = this.containment.membersOf(gc.groupB.name);
            for (const a of membersA) {
                for (const b of membersB) {
                    const edge = this.gbcToBoxEdge(gc, a, b);
                    if (edge) {
                        const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                        graph.removeEdge(edge.from, edge.to);
                    }
                }
            }
        }
    }

    // ─── Conflict analysis ───────────────────────────────────────────────────

    private analyzeConflict(assigned: Int32Array): { learnedClause: LearnedClause | null; backtrackLevel: number } {
        const clause: LearnedClause = [];
        let maxLevel = 0;
        let secondMaxLevel = 0;

        for (const assignment of this.assignmentTrail) {
            if (assignment.isDecision) {
                clause.push({ disjunctionIndex: assignment.disjunctionIndex, alternativeIndex: assignment.alternativeIndex, sign: false });
                if (assignment.decisionLevel > maxLevel) {
                    secondMaxLevel = maxLevel;
                    maxLevel = assignment.decisionLevel;
                } else if (assignment.decisionLevel > secondMaxLevel && assignment.decisionLevel < maxLevel) {
                    secondMaxLevel = assignment.decisionLevel;
                }
            }
        }

        if (clause.length === 0) return { learnedClause: null, backtrackLevel: 0 };
        return { learnedClause: clause, backtrackLevel: Math.max(0, secondMaxLevel) };
    }

    private analyzeConflictForDecision(dIdx: number, aIdx: number, assigned: Int32Array): { learnedClause: LearnedClause | null; backtrackLevel: number } {
        const clause: LearnedClause = [{ disjunctionIndex: dIdx, alternativeIndex: aIdx, sign: false }];
        let maxLevel = 0;
        let secondMaxLevel = 0;

        for (const assignment of this.assignmentTrail) {
            clause.push({ disjunctionIndex: assignment.disjunctionIndex, alternativeIndex: assignment.alternativeIndex, sign: false });
            if (assignment.decisionLevel > maxLevel) {
                secondMaxLevel = maxLevel;
                maxLevel = assignment.decisionLevel;
            } else if (assignment.decisionLevel > secondMaxLevel && assignment.decisionLevel < maxLevel) {
                secondMaxLevel = assignment.decisionLevel;
            }
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
            this.addedConstraints.length -= alternative.length;
            assigned[last.disjunctionIndex] = -1;
            this.assignmentTrail.pop();
        }
        this.decisionLevel = level;
    }

    // ─── Decision heuristic (VSIDS + slack) ──────────────────────────────────

    private pickBranch(assigned: Int32Array): { dIdx: number; aIdx: number } {
        let bestDIdx = -1;
        let bestAIdx = -1;
        let bestScore = -Infinity;

        for (let d = 0; d < this.allDisjunctions.length; d++) {
            if (assigned[d] !== -1) continue;
            const disj = this.allDisjunctions[d];

            for (let a = 0; a < disj.alternatives.length; a++) {
                const vsids = this.activity.get(`d${d}a${a}`) ?? 0;
                const simplicityBonus = 1.0 / (1 + disj.alternatives[a].length);

                let slackBonus = 0;
                for (const constraint of disj.alternatives[a]) {
                    const edge = this.constraintToBoxEdge(constraint);
                    if (edge) {
                        const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                        const slack = graph.slackForEdge(edge.from, edge.to, MAX_SPAN);
                        slackBonus += Math.max(0, Math.min(1, slack / MAX_SPAN));
                    }
                }

                const totalScore = vsids + simplicityBonus + slackBonus * 0.5;
                if (totalScore > bestScore) {
                    bestScore = totalScore;
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
        for (const [key, val] of this.activity) {
            this.activity.set(key, val * this.activityDecay);
        }
    }

    // ─── Restart management ──────────────────────────────────────────────────

    private updateRestartThreshold(): void {
        this.lubyIndex++;
        this.restartThreshold = 32 * this.luby(this.lubyIndex);
    }

    private luby(i: number): number {
        let size = 1;
        let seq = 1;
        while (size < i + 1) { size = 2 * size + 1; seq *= 2; }
        while (size - 1 !== i) { size = (size - 1) / 2; seq = seq / 2; if (i >= size) i -= size; }
        return seq;
    }

    // ─── Disjunction pruning ─────────────────────────────────────────────────

    private pruneDisjunctions(): void {
        const pruned: DisjunctiveConstraint[] = [];

        for (const disj of this.allDisjunctions) {
            // Check if already satisfied
            if (this.isDisjunctionAlreadySatisfied(disj)) continue;

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
            xAlignUF: this.xAlignUF.clone(),
            yAlignUF: this.yAlignUF.clone(),
            assignmentTrailLength: this.assignmentTrail.length,
            addedConstraintsLength: this.addedConstraints.length,
        };
    }

    private restoreCheckpoint(cp: SolverCheckpoint): void {
        this.hGraph = cp.hGraph.clone();
        this.vGraph = cp.vGraph.clone();
        this.xAlignUF = cp.xAlignUF.clone();
        this.yAlignUF = cp.yAlignUF.clone();
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

        for (const constraint of this.orientationConstraints) {
            if (isLeftConstraint(constraint)) freshH.addEdge(constraint.left.id, constraint.right.id);
            else if (isTopConstraint(constraint)) freshV.addEdge(constraint.top.id, constraint.bottom.id);
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
        // For bounding box / group boundary constraints, decompose to box edges
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const members = this.containment.membersOf(bc.group.name);
            for (const memberId of members) {
                if (memberId === bc.node.id) continue;
                const edge = this.bbcToBoxEdge(bc, memberId);
                if (edge) {
                    const graph = edge.axis === 'h' ? hGraph : vGraph;
                    if (!graph.addEdge(edge.from, edge.to)) return false;
                }
            }
            return true;
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const membersA = this.containment.membersOf(gc.groupA.name);
            const membersB = this.containment.membersOf(gc.groupB.name);
            for (const a of membersA) {
                for (const b of membersB) {
                    const edge = this.gbcToBoxEdge(gc, a, b);
                    if (edge) {
                        const graph = edge.axis === 'h' ? hGraph : vGraph;
                        if (!graph.addEdge(edge.from, edge.to)) return false;
                    }
                }
            }
            return true;
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

        const firstConstraintString = orientationConstraintToString(representativeConstraint);
        const sourceConstraintHTMLToLayoutConstraintsHTML = new Map<string, string[]>();
        for (const [source, constraints] of minimalConflictingSet.entries()) {
            const sourceHTML = source.toHTML();
            if (!sourceConstraintHTMLToLayoutConstraintsHTML.has(sourceHTML)) sourceConstraintHTMLToLayoutConstraintsHTML.set(sourceHTML, []);
            constraints.forEach(c => sourceConstraintHTMLToLayoutConstraintsHTML.get(sourceHTML)!.push(orientationConstraintToString(c)));
        }

        const conflictSource = infeasibleDisjunctions.length > 0
            ? infeasibleDisjunctions[0].sourceConstraint
            : representativeConstraint.sourceConstraint;

        return {
            satisfiable: false,
            error: {
                name: 'PositionalConstraintError',
                type: 'positional-conflict',
                message: `Constraint "${firstConstraintString}" conflicts with existing constraints`,
                conflictingConstraint: representativeConstraint,
                conflictingSourceConstraint: conflictSource,
                minimalConflictingSet,
                maximalFeasibleSubset: feasibleConstraints,
                errorMessages: {
                    conflictingConstraint: firstConstraintString,
                    conflictingSourceConstraint: conflictSource.toHTML(),
                    minimalConflictingConstraints: sourceConstraintHTMLToLayoutConstraintsHTML,
                },
            },
        };
    }

    private buildConjunctiveError(constraint: LayoutConstraint): PositionalConstraintError {
        const minimalSet = this.findMinimalConflictSet(constraint);
        const sourceConstraintToLayoutConstraints = new Map<SourceConstraint, LayoutConstraint[]>();
        const sourceConstraintHTMLToLayoutConstraintsHTML = new Map<string, string[]>();

        for (const c of minimalSet) {
            const source = c.sourceConstraint;
            if (!sourceConstraintToLayoutConstraints.has(source)) sourceConstraintToLayoutConstraints.set(source, []);
            if (!sourceConstraintHTMLToLayoutConstraintsHTML.has(source.toHTML())) sourceConstraintHTMLToLayoutConstraintsHTML.set(source.toHTML(), []);
            sourceConstraintToLayoutConstraints.get(source)!.push(c);
            sourceConstraintHTMLToLayoutConstraintsHTML.get(source.toHTML())!.push(orientationConstraintToString(c));
        }

        return {
            name: 'PositionalConstraintError',
            type: 'positional-conflict',
            message: `Constraint "${orientationConstraintToString(constraint)}" conflicts with existing constraints`,
            conflictingConstraint: constraint,
            conflictingSourceConstraint: constraint.sourceConstraint,
            minimalConflictingSet: sourceConstraintToLayoutConstraints,
            errorMessages: {
                conflictingConstraint: orientationConstraintToString(constraint),
                conflictingSourceConstraint: constraint.sourceConstraint.toHTML(),
                minimalConflictingConstraints: sourceConstraintHTMLToLayoutConstraintsHTML,
            },
        };
    }

    private findMinimalConflictSet(failedConstraint: LayoutConstraint): LayoutConstraint[] {
        const edge = this.constraintToBoxEdge(failedConstraint);
        if (!edge) return [];

        const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
        const path = this.findPath(graph, edge.to, edge.from);
        if (!path) return [];

        const result: LayoutConstraint[] = [];
        for (const [a, b] of path) {
            const constraint = this.findConstraintForEdge(edge.axis, a, b);
            if (constraint) result.push(constraint);
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

    private findConstraintForEdge(axis: 'h' | 'v', from: string, to: string): LayoutConstraint | undefined {
        return this.addedConstraints.find(c => {
            const edge = this.constraintToBoxEdge(c);
            return edge && edge.axis === axis && edge.from === from && edge.to === to;
        });
    }

    // ─── Group overlap validation ────────────────────────────────────────────

    public validateGroupConstraints(): GroupOverlapError | null {
        for (let i = 0; i < this.groups.length; i++) {
            const group = this.groups[i];
            for (let j = i + 1; j < this.groups.length; j++) {
                const otherGroup = this.groups[j];
                if (this.containment.isSubGroup(group.name, otherGroup.name) ||
                    this.containment.isSubGroup(otherGroup.name, group.name)) continue;

                const intersection = this.containment.intersection(group.name, otherGroup.name);
                if (intersection.length > 0) {
                    const overlappingNodes = intersection
                        .map(nodeId => this.nodes.find(n => n.id === nodeId))
                        .filter((node): node is LayoutNode => node !== undefined);
                    return {
                        name: 'GroupOverlapError',
                        type: 'group-overlap',
                        message: `Groups "${group.name}" and "${otherGroup.name}" overlap with nodes: ${intersection.join(', ')}`,
                        group1: group,
                        group2: otherGroup,
                        overlappingNodes,
                    };
                }
            }
        }
        return null;
    }

    // ─── Alignment order computation ─────────────────────────────────────────

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

    // ─── Node overlap detection ──────────────────────────────────────────────

    private detectNodeOverlaps(): PositionalConstraintError | null {
        for (const hGroup of this.horizontallyAligned) {
            const hSet = new Set(hGroup.map(n => n.id));
            for (const vGroup of this.verticallyAligned) {
                const overlapping = vGroup.filter(n => hSet.has(n.id));
                if (overlapping.length >= 2) {
                    const n1 = overlapping[0];
                    const n2 = overlapping[1];
                    const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
                    for (const c of this.addedConstraints) {
                        if (isAlignmentConstraint(c)) {
                            const ac = c as AlignmentConstraint;
                            if ([n1.id, n2.id].includes(ac.node1.id) || [n1.id, n2.id].includes(ac.node2.id)) {
                                const source = ac.sourceConstraint;
                                if (!minimalConflictingSet.has(source)) minimalConflictingSet.set(source, []);
                                minimalConflictingSet.get(source)!.push(c);
                            }
                        }
                    }
                    const firstConstraint = this.addedConstraints.find(c => isAlignmentConstraint(c)) || this.addedConstraints[0];
                    return {
                        name: 'PositionalConstraintError',
                        type: 'positional-conflict',
                        message: `Alignment constraints force ${n1.id} and ${n2.id} to occupy the same position`,
                        conflictingConstraint: firstConstraint,
                        conflictingSourceConstraint: firstConstraint.sourceConstraint,
                        minimalConflictingSet,
                        errorMessages: {
                            conflictingConstraint: orientationConstraintToString(firstConstraint),
                            conflictingSourceConstraint: firstConstraint.sourceConstraint.toHTML(),
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
        prunedByContainment: number; prunedByDimension: number;
        prunedByPigeonhole: number; prunedByIntervalDecomp: number;
    } {
        return {
            hEdges: this.hGraph.edgeCount(),
            vEdges: this.vGraph.edgeCount(),
            learnedClauses: this.learnedClauses.length,
            conflicts: this.conflictCount,
            addedConstraints: this.addedConstraints.length,
            prunedByContainment: this.prunedByContainment,
            prunedByDimension: this.prunedByDimension,
            prunedByPigeonhole: this.prunedByPigeonhole,
            prunedByIntervalDecomp: this.prunedByIntervalDecomp,
        };
    }
}

export { QualitativeConstraintValidatorV2 };
