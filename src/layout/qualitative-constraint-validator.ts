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
 *   • DifferenceConstraintGraph with weighted edges, edge provenance,
 *     and zero-weight alignment edges (replaces UnionFind).
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
    type SourceConstraint,
    type IConstraintValidator,
    orientationConstraintToString,
} from './constraint-types';

export {
    type ConstraintError,
    type ErrorMessages,
    orientationConstraintToString,
} from './constraint-types';

// Re-export error types and type guards from constraint-types
export {
    type PositionalConstraintError,
    type GroupOverlapError,
    isPositionalConstraintError,
    isGroupOverlapError,
} from './constraint-types';

import type { PositionalConstraintError, GroupOverlapError } from './constraint-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Generous canvas bound. Chains exceeding this are infeasible. */
const MAX_SPAN = 100_000;

// ═══════════════════════════════════════════════════════════════════════════════
// Difference Constraint Graph
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Weighted DAG representing difference constraints between spatial elements.
 *
 * Each edge (a → b, weight w) encodes the constraint "b must be at least w
 * units after a" (where "after" means rightward for H-graph, downward for V-graph).
 * The weight is the minDistance from the LayoutConstraint that created the edge.
 *
 * Each node carries a dimension (width for H-graph, height for V-graph) so we
 * can compute minimum chain spans. Includes both box nodes and virtual group nodes.
 *
 * Key additions over the old unweighted graph:
 *   - Edge weights: actual minDistance values instead of uniform gap
 *   - Edge provenance: maps each edge back to the LayoutConstraint that created it,
 *     enabling direct conflict explanation without linear scans
 *   - findCyclePath: returns the edges forming a path (for IIS extraction)
 */
class DifferenceConstraintGraph {
    /** Forward adjacency: node → Map<successor, weight> */
    private adj: Map<string, Map<string, number>> = new Map();
    /** Reverse adjacency: node → Map<predecessor, weight> */
    private radj: Map<string, Map<string, number>> = new Map();
    private nodes: Set<string> = new Set();
    /** Per-node size on this axis. Boxes have their width/height; group nodes have 0. */
    private nodeSize: Map<string, number> = new Map();
    /** Maps "from→to" to the LayoutConstraint that created the edge. */
    private edgeProvenance: Map<string, LayoutConstraint> = new Map();
    /** Reference count for alignment edge pairs (key: "a\x00b" with a < b lexicographically). */
    private alignmentRefCount: Map<string, number> = new Map();
    private gap: number;

    constructor(gap: number = 15) {
        this.gap = gap;
    }

    clone(): DifferenceConstraintGraph {
        const g = new DifferenceConstraintGraph(this.gap);
        for (const n of this.nodes) g.nodes.add(n);
        for (const [k, vs] of this.adj) g.adj.set(k, new Map(vs));
        for (const [k, vs] of this.radj) g.radj.set(k, new Map(vs));
        g.nodeSize = new Map(this.nodeSize);
        g.edgeProvenance = new Map(this.edgeProvenance);
        g.alignmentRefCount = new Map(this.alignmentRefCount);
        return g;
    }

    ensureNode(id: string, size: number = 0): void {
        if (!this.nodes.has(id)) {
            this.nodes.add(id);
            this.adj.set(id, new Map());
            this.radj.set(id, new Map());
            this.nodeSize.set(id, size);
        }
    }

    private static provenanceKey(a: string, b: string): string {
        return `${a}\x00${b}`;
    }

    /**
     * Add edge (a → b) with given weight, meaning "b is at least `weight` units
     * after a". Returns false if it would create a cycle.
     *
     * If an edge a→b already exists, keeps the larger weight (tighter constraint).
     * Optionally records the LayoutConstraint that created this edge for provenance.
     */
    addEdge(a: string, b: string, weight?: number, constraint?: LayoutConstraint): boolean {
        // Include the source node's physical size (width for horizontal graph,
        // height for vertical) so that ordering edges encode the full constraint:
        //   LeftConstraint(a, b, d) ⇒ x_b ≥ x_a + a.width + d  ⇒ weight = a.width + d
        // Alignment edges bypass addEdge (addAlignmentEdges writes adj directly)
        // so they remain zero-weight. Group virtual nodes have size 0.
        const w = (weight ?? this.gap) + (this.nodeSize.get(a) ?? 0);
        this.ensureNode(a);
        this.ensureNode(b);
        if (a === b) return false;
        const existing = this.adj.get(a)!.get(b);
        if (existing !== undefined && w <= existing) {
            // Edge exists with equal or tighter weight — redundant, no change needed
            return true;
        }
        // For new edges or tightening: check if a return path b→...→a exists.
        // A cycle with positive total weight is infeasible (x_a - x_a ≥ w > 0).
        // With non-negative edge weights, w > 0 + any return path ≥ 0 → infeasible.
        // Zero-weight addEdge calls are only used internally via addAlignmentEdges
        // which has its own reachability checks, so reject all canReach here.
        if (this.canReach(b, a)) return false;
        this.adj.get(a)!.set(b, w);
        this.radj.get(b)!.set(a, w);
        if (constraint) this.edgeProvenance.set(DifferenceConstraintGraph.provenanceKey(a, b), constraint);
        return true;
    }

    removeEdge(a: string, b: string): void {
        this.adj.get(a)?.delete(b);
        this.radj.get(b)?.delete(a);
        this.edgeProvenance.delete(DifferenceConstraintGraph.provenanceKey(a, b));
    }

    hasEdge(a: string, b: string): boolean {
        return this.adj.get(a)?.has(b) ?? false;
    }

    getEdgeWeight(a: string, b: string): number | undefined {
        return this.adj.get(a)?.get(b);
    }

    /** Get the constraint that created edge a→b, if provenance was recorded. */
    getEdgeProvenance(a: string, b: string): LayoutConstraint | undefined {
        return this.edgeProvenance.get(DifferenceConstraintGraph.provenanceKey(a, b));
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
            for (const s of succs.keys()) {
                if (s === to) return true;
                if (!visited.has(s)) {
                    visited.add(s);
                    queue.push(s);
                }
            }
        }
        return false;
    }

    /**
     * Returns true if a is strictly ordered before b: there exists a path
     * from a to b with at least one positive-weight edge. Aligned nodes
     * (connected only through zero-weight edges) are NOT considered ordered.
     */
    isOrdered(a: string, b: string): boolean {
        return this.isStrictlyOrdered(a, b);
    }

    successors(id: string): ReadonlySet<string> {
        const succs = this.adj.get(id);
        return succs ? new Set(succs.keys()) : new Set();
    }

    predecessors(id: string): ReadonlySet<string> {
        const preds = this.radj.get(id);
        return preds ? new Set(preds.keys()) : new Set();
    }

    /**
     * Topological sort that handles zero-weight alignment cycles.
     * Contracts alignment SCCs into super-nodes, sorts those, then expands.
     * Returns null only if there's a positive-weight cycle (true infeasibility).
     */
    topologicalSort(): string[] | null {
        // First try standard topo sort (fast path for graphs without alignment cycles)
        const standardResult = this.standardTopoSort();
        if (standardResult) return standardResult;

        // Graph has cycles — contract alignment SCCs into super-nodes
        const classes = this.getAlignmentClasses();
        const nodeToRep = new Map<string, string>();
        for (const [rep, members] of classes) {
            for (const m of members) nodeToRep.set(m, rep);
        }
        for (const n of this.nodes) {
            if (!nodeToRep.has(n)) nodeToRep.set(n, n);
        }

        // Build contracted graph (super-nodes only)
        const superNodes = new Set<string>();
        for (const n of this.nodes) superNodes.add(nodeToRep.get(n)!);
        const superAdj = new Map<string, Set<string>>();
        for (const sn of superNodes) superAdj.set(sn, new Set());
        for (const [src, succs] of this.adj) {
            const srcRep = nodeToRep.get(src)!;
            for (const [tgt] of succs) {
                const tgtRep = nodeToRep.get(tgt)!;
                if (srcRep !== tgtRep) superAdj.get(srcRep)!.add(tgtRep);
            }
        }

        // Topo sort the contracted graph
        const inDeg = new Map<string, number>();
        for (const sn of superNodes) inDeg.set(sn, 0);
        for (const [, succs] of superAdj) {
            for (const s of succs) inDeg.set(s, (inDeg.get(s) ?? 0) + 1);
        }
        const queue: string[] = [];
        for (const [n, d] of inDeg) { if (d === 0) queue.push(n); }
        const superOrder: string[] = [];
        while (queue.length > 0) {
            const n = queue.shift()!;
            superOrder.push(n);
            for (const s of superAdj.get(n) ?? []) {
                const nd = (inDeg.get(s) ?? 1) - 1;
                inDeg.set(s, nd);
                if (nd === 0) queue.push(s);
            }
        }

        if (superOrder.length !== superNodes.size) return null; // Positive-weight cycle

        // Expand super-nodes back to individual nodes
        const order: string[] = [];
        for (const rep of superOrder) {
            const members = classes.get(rep);
            if (members) {
                order.push(...members);
            } else {
                order.push(rep);
            }
        }
        return order;
    }

    private standardTopoSort(): string[] | null {
        const inDeg = new Map<string, number>();
        for (const n of this.nodes) inDeg.set(n, 0);
        for (const [, succs] of this.adj) {
            for (const s of succs.keys()) inDeg.set(s, (inDeg.get(s) ?? 0) + 1);
        }
        const queue: string[] = [];
        for (const [n, d] of inDeg) { if (d === 0) queue.push(n); }
        const order: string[] = [];
        while (queue.length > 0) {
            const n = queue.shift()!;
            order.push(n);
            for (const s of this.adj.get(n)?.keys() ?? []) {
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
     *   dist[n] = size(n) + max over predecessors p of (dist[p] + edgeWeight(p, n))
     *
     * Uses actual edge weights (minDistance values) instead of a uniform gap.
     * Group virtual nodes have size 0, so they contribute only the edge weight.
     */
    longestChainSpan(): number {
        const order = this.topologicalSort();
        if (!order) return Infinity; // Cycle

        // Build alignment class lookup: node → representative
        const classes = this.getAlignmentClasses();
        const nodeToRep = new Map<string, string>();
        for (const [rep, members] of classes) {
            for (const m of members) nodeToRep.set(m, rep);
        }

        // For aligned nodes, their effective size on the aligned axis is the
        // max of the class (they occupy the same coordinate, not separate ones).
        const classMaxSize = new Map<string, number>();
        for (const [rep, members] of classes) {
            let maxSize = 0;
            for (const m of members) maxSize = Math.max(maxSize, this.nodeSize.get(m) ?? 0);
            classMaxSize.set(rep, maxSize);
        }

        const dist = new Map<string, number>();
        let maxSpan = 0;
        const counted = new Set<string>(); // Track which alignment classes contributed size

        for (const n of order) {
            const rep = nodeToRep.get(n);

            if (rep !== undefined && !counted.has(rep)) {
                // First member of an alignment class — process the entire class
                // as a single unit to avoid the ordering-dependent bug where the
                // class size is assigned to a member without the best incoming dist.
                counted.add(rep);
                const members = classes.get(rep)!;
                let bestIncoming = 0;
                for (const m of members) {
                    const preds = this.radj.get(m);
                    if (!preds) continue;
                    for (const [p, w] of preds) {
                        if (nodeToRep.get(p) === rep) continue; // Skip intra-class edges
                        // Edge weight w includes source nodeSize (addEdge folds it
                        // in for cycle detection). Subtract it to avoid double-
                        // counting, since dist[p] already includes p's own size.
                        // Clamp to 0 for alignment edges (w=0, set directly).
                        const minDist = Math.max(0, w - (this.nodeSize.get(p) ?? 0));
                        bestIncoming = Math.max(bestIncoming, (dist.get(p) ?? 0) + minDist);
                    }
                }
                const classDist = bestIncoming + classMaxSize.get(rep)!;
                for (const m of members) dist.set(m, classDist);
                maxSpan = Math.max(maxSpan, classDist);
            } else if (rep === undefined) {
                // Non-aligned node
                const mySize = this.nodeSize.get(n) ?? 0;
                let bestPred = 0;
                const preds = this.radj.get(n);
                if (preds) {
                    for (const [p, w] of preds) {
                        const minDist = Math.max(0, w - (this.nodeSize.get(p) ?? 0));
                        bestPred = Math.max(bestPred, (dist.get(p) ?? 0) + minDist);
                    }
                }
                const d = bestPred + mySize;
                dist.set(n, d);
                maxSpan = Math.max(maxSpan, d);
            }
            // else: alignment class member already processed, skip
        }

        return maxSpan;
    }

    // ─── Alignment (zero-weight edge) support ─────────────────────────────

    /**
     * Add bidirectional zero-weight edges for alignment: a=b.
     * Returns false if alignment conflicts with existing strict ordering
     * (a positive-weight path exists between a and b in either direction).
     */
    addAlignmentEdges(a: string, b: string, constraint?: LayoutConstraint): boolean {
        this.ensureNode(a);
        this.ensureNode(b);
        if (a === b) return true;

        const aToB = this.canReach(a, b);
        const bToA = this.canReach(b, a);

        if (aToB && bToA) {
            // Both directions reachable — already in same component.
            // This is OK only if all paths are zero-weight (already aligned).
            // If any direction has a positive-weight path, there's already a conflict,
            // but the system was consistent before so this shouldn't happen.
            // Add redundant edges for provenance tracking.
        } else if (aToB || bToA) {
            // Asymmetric reachability — strict ordering exists between a and b.
            // Aligning them would create x_a = x_b AND x_a < x_b (or vice versa).
            return false;
        }

        // Add zero-weight edges (don't overwrite existing positive-weight edges)
        if (!this.adj.get(a)!.has(b)) {
            this.adj.get(a)!.set(b, 0);
            this.radj.get(b)!.set(a, 0);
            if (constraint) this.edgeProvenance.set(DifferenceConstraintGraph.provenanceKey(a, b), constraint);
        }
        if (!this.adj.get(b)!.has(a)) {
            this.adj.get(b)!.set(a, 0);
            this.radj.get(a)!.set(b, 0);
            if (constraint) this.edgeProvenance.set(DifferenceConstraintGraph.provenanceKey(b, a), constraint);
        }

        // Increment reference count for this alignment pair
        const pairKey = a < b ? `${a}\x00${b}` : `${b}\x00${a}`;
        this.alignmentRefCount.set(pairKey, (this.alignmentRefCount.get(pairKey) ?? 0) + 1);
        return true;
    }

    /**
     * Remove alignment edges (both directions), but only if no other constraint
     * still requires them (reference count drops to zero).
     */
    removeAlignmentEdges(a: string, b: string): void {
        const pairKey = a < b ? `${a}\x00${b}` : `${b}\x00${a}`;
        const count = (this.alignmentRefCount.get(pairKey) ?? 0) - 1;
        if (count > 0) {
            this.alignmentRefCount.set(pairKey, count);
            return; // Another constraint still needs these edges
        }
        this.alignmentRefCount.delete(pairKey);

        // Only remove if zero-weight (don't remove ordering edges)
        if (this.adj.get(a)?.get(b) === 0) {
            this.adj.get(a)!.delete(b);
            this.radj.get(b)!.delete(a);
            this.edgeProvenance.delete(DifferenceConstraintGraph.provenanceKey(a, b));
        }
        if (this.adj.get(b)?.get(a) === 0) {
            this.adj.get(b)!.delete(a);
            this.radj.get(a)!.delete(b);
            this.edgeProvenance.delete(DifferenceConstraintGraph.provenanceKey(b, a));
        }
    }

    /**
     * Check if two nodes are aligned: mutually reachable (in same strongly
     * connected component). In a consistent graph, mutual reachability through
     * zero-weight paths means the nodes must have the same coordinate.
     */
    areAligned(a: string, b: string): boolean {
        if (a === b) return true;
        return this.canReach(a, b) && this.canReach(b, a);
    }

    /**
     * Check if a is strictly ordered before b: there exists a path from a to b
     * that includes at least one positive-weight edge.
     *
     * This distinguishes "a < b" (strict ordering) from "a = b" (alignment).
     */
    isStrictlyOrdered(a: string, b: string): boolean {
        if (a === b) return false;
        // BFS tracking whether we've traversed any positive-weight edge
        const visited = new Map<string, boolean>(); // node → best "hasPositive" seen
        const queue: { node: string; hasPositive: boolean }[] = [{ node: a, hasPositive: false }];
        visited.set(a, false);
        while (queue.length > 0) {
            const { node, hasPositive } = queue.shift()!;
            const succs = this.adj.get(node);
            if (!succs) continue;
            for (const [s, w] of succs) {
                const newHasPositive = hasPositive || w > 0;
                if (s === b && newHasPositive) return true;
                const prevPositive = visited.get(s);
                if (prevPositive === undefined || (!prevPositive && newHasPositive)) {
                    visited.set(s, newHasPositive);
                    queue.push({ node: s, hasPositive: newHasPositive });
                }
            }
        }
        return false;
    }

    /**
     * Get alignment classes: groups of nodes connected by mutual zero-weight paths.
     * Returns a map from canonical representative to list of class members.
     * Classes with only one member are omitted.
     */
    getAlignmentClasses(): Map<string, string[]> {
        // Find SCCs using Tarjan's or simpler approach: for each node, find its
        // SCC by checking mutual reachability. For small graphs, nested BFS is fine.
        const classes = new Map<string, string[]>();
        const assigned = new Set<string>();

        for (const node of this.nodes) {
            if (assigned.has(node)) continue;

            // Find all nodes mutually reachable from this node (same SCC)
            const forwardReachable = this.reachableSet(node);
            const classMembers: string[] = [];

            for (const candidate of forwardReachable) {
                if (this.canReach(candidate, node)) {
                    classMembers.push(candidate);
                }
            }

            if (classMembers.length > 1) {
                classMembers.sort(); // deterministic
                const representative = classMembers[0];
                classes.set(representative, classMembers);
                for (const m of classMembers) assigned.add(m);
            } else {
                assigned.add(node);
            }
        }

        return classes;
    }

    /** Get all nodes reachable from `start` via any edges. */
    private reachableSet(start: string): Set<string> {
        const visited = new Set<string>();
        const queue: string[] = [start];
        visited.add(start);
        while (queue.length > 0) {
            const cur = queue.shift()!;
            const succs = this.adj.get(cur);
            if (!succs) continue;
            for (const s of succs.keys()) {
                if (!visited.has(s)) {
                    visited.add(s);
                    queue.push(s);
                }
            }
        }
        return visited;
    }

    /**
     * Would adding edge (a → b) with given weight cause the longest chain to
     * exceed maxSpan? Temporarily adds the edge, computes span, removes it.
     * Returns true if the chain would overflow.
     */
    wouldOverflow(a: string, b: string, maxSpan: number, weight?: number): boolean {
        // Match addEdge's weight encoding: include source node's physical size
        const w = (weight ?? this.gap) + (this.nodeSize.get(a) ?? 0);
        if (!this.adj.has(a) || !this.adj.has(b)) return false;
        if (this.canReach(b, a)) return true; // Cycle

        // Save existing edge state before probing
        const existingFwd = this.adj.get(a)!.get(b);
        const existingRev = this.radj.get(b)!.get(a);

        this.adj.get(a)!.set(b, w);
        this.radj.get(b)!.set(a, w);
        const span = this.longestChainSpan();

        // Restore original edge state
        if (existingFwd !== undefined) {
            this.adj.get(a)!.set(b, existingFwd);
            this.radj.get(b)!.set(a, existingRev!);
        } else {
            this.adj.get(a)!.delete(b);
            this.radj.get(b)!.delete(a);
        }

        return span > maxSpan;
    }

    /**
     * Find a path from `from` to `to` in the graph, returning edges as [src, tgt] pairs.
     * Uses BFS with lexicographic successor ordering for determinism.
     * Returns null if no path exists.
     */
    findPath(from: string, to: string): [string, string][] | null {
        if (from === to) return [];
        const visited = new Set<string>();
        const queue: { node: string; path: [string, string][] }[] = [{ node: from, path: [] }];
        visited.add(from);
        while (queue.length > 0) {
            const { node, path } = queue.shift()!;
            const succs = this.adj.get(node);
            if (!succs) continue;
            const sortedSuccs = [...succs.keys()].sort();
            for (const succ of sortedSuccs) {
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
     * Get the constraints (via provenance) for all edges along a path.
     * Returns constraints in path order. Skips edges with no recorded provenance.
     */
    getPathConstraints(path: [string, string][]): LayoutConstraint[] {
        const result: LayoutConstraint[] = [];
        for (const [a, b] of path) {
            const c = this.edgeProvenance.get(DifferenceConstraintGraph.provenanceKey(a, b));
            if (c) result.push(c);
        }
        return result;
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
            for (const tgt of succs.keys()) edges.push([src, tgt]);
        }
        return edges;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UnionFind has been replaced by zero-weight alignment edges in DifferenceConstraintGraph.
// Alignment equivalence classes are now computed via SCC detection (getAlignmentClasses).

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
    hGraph: DifferenceConstraintGraph;
    vGraph: DifferenceConstraintGraph;
    assignmentTrailLength: number;
    addedConstraintsLength: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QualitativeConstraintValidator
// ═══════════════════════════════════════════════════════════════════════════════

class QualitativeConstraintValidator implements IConstraintValidator {
    // ─── Input ───
    layout: InstanceLayout;
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    groups: LayoutGroup[];
    orientationConstraints: LayoutConstraint[];
    minPadding: number = 15;

    // ─── Qualitative state ───
    private hGraph: DifferenceConstraintGraph;
    private vGraph: DifferenceConstraintGraph;
    // Alignment is now tracked via zero-weight edges in hGraph/vGraph.
    // See DifferenceConstraintGraph.addAlignmentEdges / areAligned / getAlignmentClasses.

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
    private emptyDisjunctionError: PositionalConstraintError | null = null;
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

        this.hGraph = new DifferenceConstraintGraph(this.minPadding);
        this.vGraph = new DifferenceConstraintGraph(this.minPadding);

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
            if (error) return this.enforceMaximalFeasibleSubset(error);
        }

        // Phase 2: Dimension feasibility on conjunctive constraints alone
        const dimError = this.checkDimensionFeasibility();
        if (dimError) return this.enforceMaximalFeasibleSubset(dimError);

        // Phase 3: Pigeonhole on alignment classes
        const pigeonholeError = this.checkPigeonhole();
        if (pigeonholeError) return this.enforceMaximalFeasibleSubset(pigeonholeError);

        const constraintsBeforeDisjunctions = this.addedConstraints.length;

        // Phase 4: Group bounding box disjunctions (virtual group nodes, from V1)
        const groupError = this.addGroupBoundingBoxDisjunctions();
        if (groupError) return this.enforceMaximalFeasibleSubset(groupError);

        // Phase 5: Collect all disjunctions
        this.allDisjunctions = [...(this.layout.disjunctiveConstraints || [])];

        // Phase 6: Interval decomposition — resolve what we can before CDCL
        this.presolveDisjunctions();

        // Phase 6b: Handle truly empty disjunctions (no alternatives at all)
        if (this.emptyDisjunctionError) {
            return this.enforceMaximalFeasibleSubset(this.emptyDisjunctionError);
        }

        // Phase 7: CDCL search on remaining disjunctions
        if (this.allDisjunctions.length > 0) {
            const result = this.solveCDCL();
            if (!result.satisfiable) {
                const error = result.error;
                if (error) return this.enforceMaximalFeasibleSubset(error);
                return null;
            }
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
        if (overlapError) return this.enforceMaximalFeasibleSubset(overlapError);

        this.layout.constraints = this.layout.constraints.concat(implicitConstraints);
        return null;
    }

    /**
     * Enforce the maximal feasible subset on the layout before returning an error.
     *
     * When a conflict is detected, we still want the layout to use the largest
     * satisfiable subset of constraints so that the "counterfactual" diagram is
     * as close to the user's intent as possible. Each error builder populates
     * `maximalFeasibleSubset`; this method applies it to `layout.constraints`.
     */
    private enforceMaximalFeasibleSubset(error: PositionalConstraintError): PositionalConstraintError {
        if (error.maximalFeasibleSubset) {
            this.layout.constraints = error.maximalFeasibleSubset;
        }
        return error;
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
            maximalFeasibleSubset: [...this.addedConstraints],
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
        // x-aligned nodes (same x-axis via hGraph) must separate vertically
        for (const [, members] of this.hGraph.getAlignmentClasses()) {
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

        // y-aligned nodes (same y-axis via vGraph) must separate horizontally
        for (const [, members] of this.vGraph.getAlignmentClasses()) {
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
            maximalFeasibleSubset: [...this.addedConstraints],
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
                if (disj.alternatives.length === 0) {
                    // Truly empty disjunction (e.g. NOT GROUP with all nodes as members).
                    // No alternatives exist at all — CDCL can't handle this, so mark as failed.
                    remaining.push(disj);
                    this.emptyDisjunctionError = this.buildDisjunctiveError(disj);
                } else {
                    // All alternatives pruned — pass to CDCL for proper conflict analysis.
                    remaining.push(disj);
                }
            } else if (validAlternatives.length === 1) {
                // Unit — commit directly
                let committed = true;
                for (const constraint of validAlternatives[0]) {
                    const error = this.addConjunctiveConstraint(constraint);
                    if (error) {
                        // The only valid alternative failed to commit.
                        // Pass the original disjunction to CDCL for proper error reporting.
                        committed = false;
                        remaining.push(disj);
                        break;
                    }
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

    /**
     * Builds a PositionalConstraintError for a disjunction that has no satisfiable alternatives.
     */
    private buildDisjunctiveError(disj: DisjunctiveConstraint): PositionalConstraintError {
        const constraint = disj.alternatives[0]?.[0]
            ?? this.addedConstraints[this.addedConstraints.length - 1]
            ?? this.orientationConstraints[0];
        const minimalConflictingSet = new Map();
        minimalConflictingSet.set(disj.sourceConstraint, disj.alternatives[0] ?? []);
        // Include existing constraints that may contribute to the conflict
        for (const c of this.addedConstraints) {
            if (!minimalConflictingSet.has(c.sourceConstraint)) {
                minimalConflictingSet.set(c.sourceConstraint, []);
            }
            minimalConflictingSet.get(c.sourceConstraint)!.push(c);
        }

        return {
            name: 'PositionalConstraintError',
            type: 'positional-conflict',
            message: `No satisfiable alternative for disjunction from ${disj.sourceConstraint?.toHTML?.() ?? 'unknown'}`,
            conflictingConstraint: constraint,
            conflictingSourceConstraint: disj.sourceConstraint,
            minimalConflictingSet,
            maximalFeasibleSubset: [...this.addedConstraints],
        } as PositionalConstraintError;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Conjunctive constraint addition (from V1, with virtual group nodes)
    // ═══════════════════════════════════════════════════════════════════════════

    private addConjunctiveConstraint(constraint: LayoutConstraint): PositionalConstraintError | null {
        if (isLeftConstraint(constraint)) {
            // addEdge checks: cycle (including alignment-ordering conflict via zero-weight paths)
            if (!this.hGraph.addEdge(constraint.left.id, constraint.right.id, constraint.minDistance, constraint)) {
                return this.buildConjunctiveError(constraint);
            }
            this.addedConstraints.push(constraint);
        } else if (isTopConstraint(constraint)) {
            if (!this.vGraph.addEdge(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint)) {
                return this.buildConjunctiveError(constraint);
            }
            this.addedConstraints.push(constraint);
        } else if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            const graph = ac.axis === 'x' ? this.hGraph : this.vGraph;
            if (!graph.addAlignmentEdges(ac.node1.id, ac.node2.id, constraint)) {
                return this.buildAlignmentConflictError(constraint, ac.axis);
            }
            // Dual-axis alignment forces two nonzero-size nodes to the same
            // position, guaranteeing overlap. Reject the second alignment.
            // Skip for self-alignment (same node) — that's trivially SAT.
            if (ac.node1.id !== ac.node2.id) {
                const otherGraph = ac.axis === 'x' ? this.vGraph : this.hGraph;
                if (otherGraph.areAligned(ac.node1.id, ac.node2.id)) {
                    graph.removeAlignmentEdges(ac.node1.id, ac.node2.id);
                    return this.buildAlignmentConflictError(constraint, ac.axis);
                }
            }
            if (ac.axis === 'x') {
                this.verticallyAligned.push([ac.node1, ac.node2]);
            } else {
                this.horizontallyAligned.push([ac.node1, ac.node2]);
            }
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
                case 'left':   ok = this.hGraph.addEdge(bc.node.id, groupId, bc.minDistance, constraint); break;
                case 'right':  ok = this.hGraph.addEdge(groupId, bc.node.id, bc.minDistance, constraint); break;
                case 'top':    ok = this.vGraph.addEdge(bc.node.id, groupId, bc.minDistance, constraint); break;
                case 'bottom': ok = this.vGraph.addEdge(groupId, bc.node.id, bc.minDistance, constraint); break;
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
                case 'left':   ok = this.hGraph.addEdge(gAId, gBId, gc.minDistance, constraint); break;
                case 'right':  ok = this.hGraph.addEdge(gBId, gAId, gc.minDistance, constraint); break;
                case 'top':    ok = this.vGraph.addEdge(gAId, gBId, gc.minDistance, constraint); break;
                case 'bottom': ok = this.vGraph.addEdge(gBId, gAId, gc.minDistance, constraint); break;
                default: ok = true;
            }
            if (!ok) return this.buildConjunctiveError(constraint);
        }
        return null;
    }

    // Alignment consistency, alignment-ordering conflicts, and alignment-class cycles
    // are now all caught automatically by DifferenceConstraintGraph via zero-weight
    // edges and canReach cycle detection. No separate UF-based checks needed.

    // ═══════════════════════════════════════════════════════════════════════════
    // Group bounding box disjunctions (from V1 — virtual group nodes)
    // ═══════════════════════════════════════════════════════════════════════════

    private addGroupBoundingBoxDisjunctions(): PositionalConstraintError | null {
        const nodeToGroups = new Map<string, Set<LayoutGroup>>();
        for (const node of this.nodes) nodeToGroups.set(node.id, new Set());

        const nodeById = new Map<string, LayoutNode>();
        for (const node of this.nodes) nodeById.set(node.id, node);

        for (const group of this.groups) {
            if (group.nodeIds.length > 1 && group.sourceConstraint) {
                for (const nodeId of group.nodeIds) {
                    nodeToGroups.get(nodeId)?.add(group);
                }
            }
        }

        for (const group of this.groups) {
            if (group.nodeIds.length <= 1 || !group.sourceConstraint) continue;
            if (group.negated) continue; // Negated groups handled below

            const memberIds = new Set(group.nodeIds);
            const groupId = `_group_${group.name}`;
            this.hGraph.ensureNode(groupId);
            this.vGraph.ensureNode(groupId);

            for (const node of this.nodes) {
                if (memberIds.has(node.id)) continue;

                // Skip nodes in other non-singleton groups. When no overlap exists this is
                // always safe. For overlapping groups, check hierarchical relationships.
                const nodeGroups = nodeToGroups.get(node.id);
                if (nodeGroups && nodeGroups.size > 0) {
                    if (!group.overlapping) continue;
                    const allHierarchical = [...nodeGroups].every(ng =>
                        ng === group ||
                        this.isSubGroup(ng, group) ||
                        this.isSubGroup(group, ng)
                    );
                    if (allHierarchical) continue;
                }

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

        // ── Negated groups ──────────────────────────────────────────────────
        // Pure ¬: all negated groups from the same sourceConstraint are merged
        // into a SINGLE DisjunctiveConstraint. At least one key's group must fail
        // (disjunction across keys), matching the Lean mechanization's
        // modelsNegC R c = ¬ modelsC R c.
        //
        // NOT GROUP(members) per key = "any rectangle containing all members
        // also contains a non-member"
        // Encoding per key: ∃ non-member N, ∃ members mL,mR,mT,mB such that
        //   mL ≤_x N ≤_x mR  AND  mT ≤_y N ≤_y mB
        const negatedBySource = new Map<ConstraintSource, LayoutGroup[]>();
        for (const group of this.groups) {
            if (!group.negated || !group.sourceConstraint) continue;
            const key = group.sourceConstraint;
            if (!negatedBySource.has(key)) negatedBySource.set(key, []);
            negatedBySource.get(key)!.push(group);
        }

        for (const [source, groups] of negatedBySource) {
            const allAlternatives: LayoutConstraint[][] = [];

            for (const group of groups) {
                const memberIds = new Set(group.nodeIds);
                const members = group.nodeIds
                    .map(id => nodeById.get(id))
                    .filter((n): n is LayoutNode => n !== undefined);
                const nonMembers = this.nodes.filter(n => !memberIds.has(n.id));

                for (const n of nonMembers) {
                    for (const mL of members) {
                        for (const mR of members) {
                            if (mL.id === mR.id) continue;
                            for (const mT of members) {
                                for (const mB of members) {
                                    if (mT.id === mB.id) continue;
                                    allAlternatives.push([
                                        { left: mL, right: n, minDistance: 0, sourceConstraint: source } as LeftConstraint,
                                        { left: n, right: mR, minDistance: 0, sourceConstraint: source } as LeftConstraint,
                                        { top: mT, bottom: n, minDistance: 0, sourceConstraint: source } as TopConstraint,
                                        { top: n, bottom: mB, minDistance: 0, sourceConstraint: source } as TopConstraint,
                                    ]);
                                }
                            }
                        }
                    }
                }
            }

            const disj = new DisjunctiveConstraint(source, allAlternatives);
            if (!this.layout.disjunctiveConstraints) this.layout.disjunctiveConstraints = [];
            this.layout.disjunctiveConstraints.push(disj);
        }

        // NOTE: GROUP + NOT GROUP on identical member sets is a direct contradiction,
        // but we rely on the solver to detect it via ordering cycles rather than
        // a static check. See #378 for CDCL completeness improvements needed.

        // Group-to-group separation (only between positive groups with visual boundaries)
        for (let i = 0; i < this.groups.length; i++) {
            if (this.groups[i].negated) continue;
            for (let j = i + 1; j < this.groups.length; j++) {
                if (this.groups[j].negated) continue;
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
                const graph = isHorizontalSide ? this.hGraph : this.vGraph;
                for (const memberId of bc.group.nodeIds) {
                    if (graph.areAligned(bc.node.id, memberId)) return false;
                }
                if (!this.isBoundingBoxFeasible(bc)) return false;
            }

            // AlignmentConstraint: aligning two nodes is infeasible if there's
            // a strict ordering between them (asymmetric reachability).
            if (isAlignmentConstraint(constraint)) {
                const ac = constraint as AlignmentConstraint;
                const graph = ac.axis === 'x' ? this.hGraph : this.vGraph;
                const aToB = graph.canReach(ac.node1.id, ac.node2.id);
                const bToA = graph.canReach(ac.node2.id, ac.node1.id);
                // Asymmetric reachability = strict ordering = can't align
                if (aToB !== bToA) return false;
                // Dual-axis alignment forces nodes to same position (guaranteed overlap)
                // Skip for self-alignment (same node) — that's trivially SAT.
                if (ac.node1.id !== ac.node2.id) {
                    const otherGraph = ac.axis === 'x' ? this.vGraph : this.hGraph;
                    if (otherGraph.areAligned(ac.node1.id, ac.node2.id)) return false;
                }
                continue;
            }

            const edge = this.constraintToEdge(constraint);
            if (!edge) continue;
            const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;

            // Would cycle? (canReach catches both ordering cycles and
            // alignment-ordering conflicts via zero-weight edges)
            if (graph.canReach(edge.to, edge.from)) return false;

            // Dimension overflow? (Insight 4) — use actual constraint weight
            const weight = this.constraintToWeight(constraint);
            if (graph.wouldOverflow(edge.from, edge.to, MAX_SPAN, weight)) {
                this.prunedByDimension++;
                return false;
            }
        }
        return true;
    }

    /**
     * Check if a BoundingBox constraint is feasible given current orderings.
     * "node on side X of group" implies the node is on that side of ALL members.
     *   - left:   node left of all members → infeasible if any member→node in hGraph
     *   - right:  node right of all members → infeasible if node→member in hGraph
     *   - top:    node above all members → infeasible if any member→node in vGraph
     *   - bottom: node below all members → infeasible if node→member in vGraph
     */
    private isBoundingBoxFeasible(bc: BoundingBoxConstraint): boolean {
        const nodeId = bc.node.id;
        const members = bc.group.nodeIds;
        switch (bc.side) {
            case 'left':
                // node is left of group → node must be left of every member
                // infeasible if any member is already ordered left of node
                for (const m of members) {
                    if (this.hGraph.isOrdered(m, nodeId)) return false;
                }
                return true;
            case 'right':
                // node is right of group → node must be right of every member
                // infeasible if node is already ordered left of any member
                for (const m of members) {
                    if (this.hGraph.isOrdered(nodeId, m)) return false;
                }
                return true;
            case 'top':
                // node is above group → node must be above every member
                // infeasible if any member is already ordered above node
                for (const m of members) {
                    if (this.vGraph.isOrdered(m, nodeId)) return false;
                }
                return true;
            case 'bottom':
                // node is below group → node must be below every member
                // infeasible if node is already ordered above any member
                for (const m of members) {
                    if (this.vGraph.isOrdered(nodeId, m)) return false;
                }
                return true;
        }
    }

    // wouldCreateAlignmentOrderingConflict and getClassMembers are no longer needed —
    // alignment conflicts are caught automatically by DifferenceConstraintGraph.addEdge
    // (which checks canReach for cycles through zero-weight alignment edges).

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
        // already holds).
        for (let i = 0; i < disj.alternatives.length; i++) {
            let allImplied = true;
            for (const constraint of disj.alternatives[i]) {
                if (isAlignmentConstraint(constraint)) {
                    const ac = constraint as AlignmentConstraint;
                    const graph = ac.axis === 'x' ? this.hGraph : this.vGraph;
                    if (!graph.areAligned(ac.node1.id, ac.node2.id)) { allImplied = false; break; }
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
        // not contradicted. Must also check alignment conflicts — an ordering
        // between aligned nodes is contradicted even if no reverse edge exists.
        // With zero-weight alignment edges, isStrictlyOrdered catches this:
        // ordering aligned nodes would create a negative cycle through the
        // zero-weight alignment path.
        for (let i = 0; i < disj.alternatives.length; i++) {
            let feasible = true;
            for (const constraint of disj.alternatives[i]) {
                if (isAlignmentConstraint(constraint)) {
                    const ac = constraint as AlignmentConstraint;
                    const graph = ac.axis === 'x' ? this.hGraph : this.vGraph;
                    // Alignment is contradicted if the nodes are strictly ordered
                    if (graph.isStrictlyOrdered(ac.node1.id, ac.node2.id) || graph.isStrictlyOrdered(ac.node2.id, ac.node1.id)) {
                        feasible = false; break;
                    }
                    continue;
                }
                const edge = this.constraintToEdge(constraint);
                if (!edge) continue;
                const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;
                // Contradicted by reverse ordering (including through alignment paths)?
                if (graph.canReach(edge.to, edge.from)) { feasible = false; break; }
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

            // Graph-based propagation: re-check ordering-only disjunctions
            // for feasibility after each assignment. Skips alignment disjunctions
            // to avoid stale UF state.
            const graphPropResult = this.graphPropagate(assigned);
            if (graphPropResult !== 'ok') {
                if (this.decisionLevel === 0) return { satisfiable: false, provedUnsat: true };

                // Theory conflict: use provenance-based analysis for targeted learned clauses
                const { learnedClause, backtrackLevel } = this.analyzeTheoryConflict(
                    graphPropResult.disjunctionIndex, assigned
                );
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

    /**
     * Graph-based propagation: re-check unassigned disjunctions against the
     * current ordering graphs (hGraph/vGraph). For each unassigned disjunction,
     * prune alternatives that are infeasible given committed edges. If a
     * disjunction is pruned to 0 alternatives → conflict. If pruned to 1 →
     * force-assign (with cascade). Runs to fixpoint.
     *
     * This implements Rules T (transitivity), S (candidate pruning), and F
     * (forced choice) from the reference solver.
     *
     * IMPORTANT: Only processes disjunctions whose alternatives are pure ordering
     * constraints (Left/Top). Disjunctions containing alignment constraints are
     * skipped — those need the CDCL's proper UF-undo backtracking to avoid stale
     * alignment state (see alignment backtracking regression).
     */
    private graphPropagate(assigned: Int32Array): 'ok' | { conflict: true; disjunctionIndex: number } {
        // Only run when groups are present — this propagation is specifically
        // needed for GROUP + NOT GROUP contradiction detection, where BBox
        // exclusion disjunctions interact with NOT group bracketing disjunctions.
        // Without groups, skip entirely to avoid interfering with the CDCL's
        // alignment backtracking.
        if (this.groups.length === 0) return 'ok';

        let changed = true;
        while (changed) {
            changed = false;
            for (let d = 0; d < this.allDisjunctions.length; d++) {
                if (assigned[d] !== -1) continue;

                const disj = this.allDisjunctions[d];

                let feasibleCount = 0;
                let lastFeasibleIdx = -1;

                for (let a = 0; a < disj.alternatives.length; a++) {
                    if (this.isAlternativeFeasible(disj.alternatives[a])) {
                        feasibleCount++;
                        lastFeasibleIdx = a;
                    }
                }

                if (feasibleCount === 0) {
                    return { conflict: true, disjunctionIndex: d };
                }

                if (feasibleCount === 1) {
                    if (!this.tryAssign(d, lastFeasibleIdx, assigned, false)) {
                        return { conflict: true, disjunctionIndex: d };
                    }
                    changed = true;
                }
            }
        }
        return 'ok';
    }

    // disjunctionHasAlignment is no longer needed — all disjunctions (including
    // alignment) are handled uniformly via zero-weight graph edges.

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
        this.assignmentTrail.push({
            disjunctionIndex: dIdx, alternativeIndex: aIdx,
            decisionLevel: this.decisionLevel, isDecision,
        });
        for (const constraint of alternative) this.addedConstraints.push(constraint);
        return true;
    }

    private addQualitativeEdge(constraint: LayoutConstraint): boolean {
        if (isLeftConstraint(constraint)) {
            // addEdge checks cycle (including alignment via zero-weight edges)
            return this.hGraph.addEdge(constraint.left.id, constraint.right.id, constraint.minDistance, constraint);
        }
        if (isTopConstraint(constraint)) {
            return this.vGraph.addEdge(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint);
        }
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            // Check alignment: if node is aligned with any member, can't place outside group
            const isHSide = bc.side === 'left' || bc.side === 'right';
            const graph = isHSide ? this.hGraph : this.vGraph;
            for (const memberId of bc.group.nodeIds) {
                if (graph.areAligned(bc.node.id, memberId)) return false;
            }
            // Containment: node on this side must not contradict ordering with members
            if (!this.isBoundingBoxFeasible(bc)) return false;
            const groupId = `_group_${bc.group.name}`;
            this.hGraph.ensureNode(groupId); this.vGraph.ensureNode(groupId);
            // Rule C (Containment propagation): BBox "node on side of group" implies
            // ordering between node and ALL group members. Add edges directly to
            // members so NOT group's member-by-member constraints can see them.
            switch (bc.side) {
                case 'left':
                    if (!this.hGraph.addEdge(bc.node.id, groupId, bc.minDistance, constraint)) return false;
                    for (const mId of bc.group.nodeIds) {
                        this.hGraph.ensureNode(mId);
                        this.hGraph.addEdge(bc.node.id, mId, bc.minDistance, constraint);
                    }
                    return true;
                case 'right':
                    if (!this.hGraph.addEdge(groupId, bc.node.id, bc.minDistance, constraint)) return false;
                    for (const mId of bc.group.nodeIds) {
                        this.hGraph.ensureNode(mId);
                        this.hGraph.addEdge(mId, bc.node.id, bc.minDistance, constraint);
                    }
                    return true;
                case 'top':
                    if (!this.vGraph.addEdge(bc.node.id, groupId, bc.minDistance, constraint)) return false;
                    for (const mId of bc.group.nodeIds) {
                        this.vGraph.ensureNode(mId);
                        this.vGraph.addEdge(bc.node.id, mId, bc.minDistance, constraint);
                    }
                    return true;
                case 'bottom':
                    if (!this.vGraph.addEdge(groupId, bc.node.id, bc.minDistance, constraint)) return false;
                    for (const mId of bc.group.nodeIds) {
                        this.vGraph.ensureNode(mId);
                        this.vGraph.addEdge(mId, bc.node.id, bc.minDistance, constraint);
                    }
                    return true;
            }
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            this.hGraph.ensureNode(gAId); this.hGraph.ensureNode(gBId);
            this.vGraph.ensureNode(gAId); this.vGraph.ensureNode(gBId);
            switch (gc.side) {
                case 'left':   return this.hGraph.addEdge(gAId, gBId, gc.minDistance, constraint);
                case 'right':  return this.hGraph.addEdge(gBId, gAId, gc.minDistance, constraint);
                case 'top':    return this.vGraph.addEdge(gAId, gBId, gc.minDistance, constraint);
                case 'bottom': return this.vGraph.addEdge(gBId, gAId, gc.minDistance, constraint);
            }
        }
        if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            const graph = ac.axis === 'x' ? this.hGraph : this.vGraph;
            return graph.addAlignmentEdges(ac.node1.id, ac.node2.id, constraint);
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
        } else if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            const graph = ac.axis === 'x' ? this.hGraph : this.vGraph;
            graph.removeAlignmentEdges(ac.node1.id, ac.node2.id);
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

    /**
     * Analyze a conflict from a failed tryAssign(dIdx, aIdx). Instead of
     * negating ALL trail assignments (maximally blunt), trace which graph
     * edges blocked the assignment and map them to specific trail entries.
     */
    private analyzeConflictForDecision(dIdx: number, aIdx: number, assigned: Int32Array): { learnedClause: LearnedClause | null; backtrackLevel: number } {
        const alternative = this.allDisjunctions[dIdx].alternatives[aIdx];
        const involvedTrailIndices = new Set<number>();

        // The alternative failed because one of its constraints couldn't be
        // added. Check each constraint to find blocking edges via provenance.
        for (const constraint of alternative) {
            const edge = this.constraintToEdge(constraint);
            if (!edge) continue;
            const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;

            // The edge failed because of a cycle: path from edge.to → edge.from exists
            // (using canReach, not isOrdered, because the blocking path may go
            // through zero-weight alignment edges)
            if (graph.canReach(edge.to, edge.from)) {
                const cyclePath = graph.findPath(edge.to, edge.from);
                if (cyclePath) {
                    for (const [pa, pb] of cyclePath) {
                        const provenance = graph.getEdgeProvenance(pa, pb);
                        if (provenance) {
                            const trailIdx = this.findTrailEntryForConstraint(provenance);
                            if (trailIdx !== -1) involvedTrailIndices.add(trailIdx);
                        }
                    }
                }
            }

            // Alignment conflicts are now caught by the same cycle path check above,
            // since alignment is represented as zero-weight edges in the graph.
            // No separate UF check needed.
        }

        // Build targeted clause if we found specific involved assignments
        if (involvedTrailIndices.size > 0) {
            const clause: LearnedClause = [
                { disjunctionIndex: dIdx, alternativeIndex: aIdx, sign: false },
            ];
            let maxLevel = 0, secondMaxLevel = 0;

            for (const idx of involvedTrailIndices) {
                const a = this.assignmentTrail[idx];
                clause.push({
                    disjunctionIndex: a.disjunctionIndex,
                    alternativeIndex: a.alternativeIndex,
                    sign: false,
                });
                if (a.decisionLevel > maxLevel) {
                    secondMaxLevel = maxLevel;
                    maxLevel = a.decisionLevel;
                } else if (a.decisionLevel > secondMaxLevel && a.decisionLevel < maxLevel) {
                    secondMaxLevel = a.decisionLevel;
                }
            }

            // Also account for the failed decision's level
            if (this.decisionLevel > maxLevel) {
                secondMaxLevel = maxLevel;
                maxLevel = this.decisionLevel;
            } else if (this.decisionLevel > secondMaxLevel && this.decisionLevel < maxLevel) {
                secondMaxLevel = this.decisionLevel;
            }

            return { learnedClause: clause, backtrackLevel: Math.max(0, secondMaxLevel) };
        }

        // Fall back to blunt analysis: negate all trail assignments + the failed decision
        const clause: LearnedClause = [{ disjunctionIndex: dIdx, alternativeIndex: aIdx, sign: false }];
        let maxLevel = 0, secondMaxLevel = 0;

        for (const a of this.assignmentTrail) {
            clause.push({ disjunctionIndex: a.disjunctionIndex, alternativeIndex: a.alternativeIndex, sign: false });
            if (a.decisionLevel > maxLevel) { secondMaxLevel = maxLevel; maxLevel = a.decisionLevel; }
            else if (a.decisionLevel > secondMaxLevel && a.decisionLevel < maxLevel) { secondMaxLevel = a.decisionLevel; }
        }
        return { learnedClause: clause, backtrackLevel: Math.max(0, secondMaxLevel) };
    }

    /**
     * Analyze a theory conflict from graphPropagate. Instead of negating ALL
     * decisions (the blunt approach), we identify which trail assignments
     * actually contributed to the conflict by checking graph provenance.
     *
     * When graphPropagate finds a disjunction with 0 feasible alternatives,
     * each infeasible alternative failed because some set of committed edges
     * (from previous assignments) blocked it. We trace those edges back to
     * their trail assignments and build a targeted learned clause.
     */
    private analyzeTheoryConflict(
        conflictDisjunctionIdx: number,
        assigned: Int32Array
    ): { learnedClause: LearnedClause | null; backtrackLevel: number } {
        const conflictDisj = this.allDisjunctions[conflictDisjunctionIdx];

        // Collect all trail assignments that caused infeasibility of ANY alternative.
        // Each infeasible alternative was blocked by edges in the graph. We find
        // those edges via provenance, then map them to trail entries.
        const involvedAssignments = new Set<number>(); // trail indices

        for (let a = 0; a < conflictDisj.alternatives.length; a++) {
            const alt = conflictDisj.alternatives[a];
            for (const constraint of alt) {
                const edge = this.constraintToEdge(constraint);
                if (!edge) continue;
                const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;

                // Check what blocks this edge: a return path from edge.to → edge.from
                // (using canReach to include zero-weight alignment edges)
                if (graph.canReach(edge.to, edge.from)) {
                    const cyclePath = graph.findPath(edge.to, edge.from);
                    if (cyclePath) {
                        for (const [pa, pb] of cyclePath) {
                            const provenance = graph.getEdgeProvenance(pa, pb);
                            if (provenance) {
                                // Find which trail entry introduced this constraint
                                const trailIdx = this.findTrailEntryForConstraint(provenance);
                                if (trailIdx !== -1) involvedAssignments.add(trailIdx);
                            }
                        }
                    }
                }

                // Alignment conflicts are now caught by the same cycle path check above,
                // since alignment is represented as zero-weight edges in the graph.
            }
        }

        // If we found specific involved assignments, build a targeted clause
        if (involvedAssignments.size > 0) {
            const clause: LearnedClause = [];
            let maxLevel = 0, secondMaxLevel = 0;

            for (const idx of involvedAssignments) {
                const a = this.assignmentTrail[idx];
                clause.push({
                    disjunctionIndex: a.disjunctionIndex,
                    alternativeIndex: a.alternativeIndex,
                    sign: false,
                });
                if (a.decisionLevel > maxLevel) {
                    secondMaxLevel = maxLevel;
                    maxLevel = a.decisionLevel;
                } else if (a.decisionLevel > secondMaxLevel && a.decisionLevel < maxLevel) {
                    secondMaxLevel = a.decisionLevel;
                }
            }

            if (clause.length > 0) {
                return { learnedClause: clause, backtrackLevel: Math.max(0, secondMaxLevel) };
            }
        }

        // Fall back to blunt analysis if provenance didn't yield results
        return this.analyzeConflict(assigned);
    }

    /**
     * Find which trail entry introduced a given constraint (by reference equality).
     * Returns the trail index, or -1 if not found.
     */
    private findTrailEntryForConstraint(constraint: LayoutConstraint): number {
        for (let i = 0; i < this.assignmentTrail.length; i++) {
            const entry = this.assignmentTrail[i];
            const alt = this.allDisjunctions[entry.disjunctionIndex].alternatives[entry.alternativeIndex];
            if (alt.includes(constraint)) return i;
        }
        return -1;
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
            assignmentTrailLength: this.assignmentTrail.length,
            addedConstraintsLength: this.addedConstraints.length,
        };
    }

    private restoreCheckpoint(cp: SolverCheckpoint): void {
        this.hGraph = cp.hGraph.clone();
        this.vGraph = cp.vGraph.clone();
    }

    /** Extract the minDistance (edge weight) from a constraint. Returns the default gap if not applicable. */
    private constraintToWeight(constraint: LayoutConstraint): number {
        if (isLeftConstraint(constraint)) return constraint.minDistance;
        if (isTopConstraint(constraint)) return constraint.minDistance;
        if (isBoundingBoxConstraint(constraint)) return (constraint as BoundingBoxConstraint).minDistance;
        if (isGroupBoundaryConstraint(constraint)) return (constraint as GroupBoundaryConstraint).minDistance;
        return this.minPadding;
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
        const freshH = new DifferenceConstraintGraph(this.minPadding);
        const freshV = new DifferenceConstraintGraph(this.minPadding);

        for (const node of this.nodes) {
            freshH.ensureNode(node.id, node.width);
            freshV.ensureNode(node.id, node.height);
        }
        for (const group of this.groups) {
            const gid = `_group_${group.name}`;
            freshH.ensureNode(gid);
            freshV.ensureNode(gid);
        }

        const feasibleConstraints: LayoutConstraint[] = [];
        for (const constraint of this.orientationConstraints) {
            let ok = true;
            if (isLeftConstraint(constraint)) ok = freshH.addEdge(constraint.left.id, constraint.right.id, constraint.minDistance, constraint);
            else if (isTopConstraint(constraint)) ok = freshV.addEdge(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint);
            else if (isAlignmentConstraint(constraint)) {
                const ac = constraint as AlignmentConstraint;
                const graph = ac.axis === 'x' ? freshH : freshV;
                ok = graph.addAlignmentEdges(ac.node1.id, ac.node2.id, constraint);
                // Dual-axis alignment forces two nonzero-size nodes to the same
                // position, guaranteeing overlap. Reject the second alignment.
                // Skip for self-alignment (same node) — that's trivially SAT.
                if (ok && ac.node1.id !== ac.node2.id) {
                    const otherGraph = ac.axis === 'x' ? freshV : freshH;
                    if (otherGraph.areAligned(ac.node1.id, ac.node2.id)) {
                        graph.removeAlignmentEdges(ac.node1.id, ac.node2.id);
                        ok = false;
                    }
                }
            }
            if (ok) feasibleConstraints.push(constraint);
        }
        const infeasibleDisjunctions: DisjunctiveConstraint[] = [];

        const sortedDisjunctions = [...this.allDisjunctions].sort((a, b) => {
            const aIdx = this.allDisjunctions.indexOf(a);
            const bIdx = this.allDisjunctions.indexOf(b);
            const aMax = Math.max(...a.alternatives.map((_, ai) => this.activity.get(`d${aIdx}a${ai}`) ?? 0));
            const bMax = Math.max(...b.alternatives.map((_, bi) => this.activity.get(`d${bIdx}a${bi}`) ?? 0));
            // Stable tiebreaker: use original index when activity scores are equal
            return aMax - bMax || aIdx - bIdx;
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

    private addEdgeToGraphs(constraint: LayoutConstraint, hGraph: DifferenceConstraintGraph, vGraph: DifferenceConstraintGraph): boolean {
        if (isLeftConstraint(constraint)) return hGraph.addEdge(constraint.left.id, constraint.right.id, constraint.minDistance, constraint);
        if (isTopConstraint(constraint)) return vGraph.addEdge(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint);
        if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            const graph = ac.axis === 'x' ? hGraph : vGraph;
            if (!graph.addAlignmentEdges(ac.node1.id, ac.node2.id, constraint)) return false;
            // Dual-axis alignment forces overlap between nonzero-size nodes
            // Skip for self-alignment (same node) — that's trivially SAT.
            if (ac.node1.id !== ac.node2.id) {
                const otherGraph = ac.axis === 'x' ? vGraph : hGraph;
                if (otherGraph.areAligned(ac.node1.id, ac.node2.id)) {
                    graph.removeAlignmentEdges(ac.node1.id, ac.node2.id);
                    return false;
                }
            }
            return true;
        }
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const groupId = `_group_${bc.group.name}`;
            hGraph.ensureNode(groupId); vGraph.ensureNode(groupId);
            switch (bc.side) {
                case 'left':   return hGraph.addEdge(bc.node.id, groupId, bc.minDistance, constraint);
                case 'right':  return hGraph.addEdge(groupId, bc.node.id, bc.minDistance, constraint);
                case 'top':    return vGraph.addEdge(bc.node.id, groupId, bc.minDistance, constraint);
                case 'bottom': return vGraph.addEdge(groupId, bc.node.id, bc.minDistance, constraint);
            }
        }
        if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            hGraph.ensureNode(gAId); hGraph.ensureNode(gBId);
            vGraph.ensureNode(gAId); vGraph.ensureNode(gBId);
            switch (gc.side) {
                case 'left':   return hGraph.addEdge(gAId, gBId, gc.minDistance, constraint);
                case 'right':  return hGraph.addEdge(gBId, gAId, gc.minDistance, constraint);
                case 'top':    return vGraph.addEdge(gAId, gBId, gc.minDistance, constraint);
                case 'bottom': return vGraph.addEdge(gBId, gAId, gc.minDistance, constraint);
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
            maximalFeasibleSubset: [...this.addedConstraints],
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
        const path = graph.findPath(edge.to, edge.from);
        if (!path) return [];
        // Use provenance for direct lookup, fall back to linear scan
        const result: LayoutConstraint[] = [];
        for (const [a, b] of path) {
            const provenance = graph.getEdgeProvenance(a, b);
            if (provenance) {
                result.push(provenance);
            } else {
                // Fall back: edge may have been added without provenance (e.g. conjunctive phase)
                const c = this.addedConstraints.find(c => {
                    const e = this.constraintToEdge(c);
                    return e && e.axis === edge.axis && e.from === a && e.to === b;
                });
                if (c) result.push(c);
            }
        }
        return result;
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
        // Temporarily include the trigger in addedConstraints so
        // findAlignmentConflictSet can map its graph edge back to a constraint.
        this.addedConstraints.push(triggerConstraint);
        const conflictSet = this.findAlignmentConflictSet(axis);
        this.addedConstraints.pop();

        // Always include the trigger
        if (!conflictSet.includes(triggerConstraint)) {
            conflictSet.push(triggerConstraint);
        }

        // When the alignment was rejected before edges were added (asymmetric
        // reachability), findAlignmentConflictSet won't find alignment classes.
        // Directly trace the ordering path that blocked the alignment.
        if (isAlignmentConstraint(triggerConstraint)) {
            const ac = triggerConstraint as AlignmentConstraint;
            const graph = axis === 'x' ? this.hGraph : this.vGraph;
            const a = ac.node1.id, b = ac.node2.id;
            // Find the ordering path (asymmetric reachability)
            for (const [from, to] of [[a, b], [b, a]]) {
                if (graph.canReach(from, to)) {
                    const path = graph.findPath(from, to);
                    if (path) {
                        for (const [pa, pb] of path) {
                            const provenance = graph.getEdgeProvenance(pa, pb);
                            if (provenance && !conflictSet.includes(provenance)) {
                                conflictSet.push(provenance);
                            }
                        }
                    }
                }
            }
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
        const graph = axis === 'x' ? this.hGraph : this.vGraph;
        const axisEdge = axis === 'x' ? 'h' : 'v';
        const result: LayoutConstraint[] = [];

        // Collect multi-member alignment classes from the graph's SCCs
        const classMembers = graph.getAlignmentClasses();

        // Build a reverse index: node → representative of its alignment class
        const nodeToRep = new Map<string, string>();
        for (const [rep, members] of classMembers) {
            for (const m of members) nodeToRep.set(m, rep);
        }

        // --- Check 1: Within-class strict ordering conflict ---
        // With zero-weight alignment edges, two aligned nodes that are also
        // strictly ordered have a positive-weight path between them, detectable
        // via isStrictlyOrdered.
        for (const [rep, members] of classMembers) {
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    const a = members[i], b = members[j];
                    const strictlyOrdered = graph.isStrictlyOrdered(a, b) || graph.isStrictlyOrdered(b, a);
                    if (!strictlyOrdered) continue;

                    const [from, to] = graph.isStrictlyOrdered(a, b) ? [a, b] : [b, a];

                    // Alignment constraints in this class — use provenance from alignment edges
                    for (const c of this.addedConstraints) {
                        if (!isAlignmentConstraint(c)) continue;
                        const ac = c as AlignmentConstraint;
                        if (ac.axis !== axis) continue;
                        const r1 = nodeToRep.get(ac.node1.id), r2 = nodeToRep.get(ac.node2.id);
                        if (r1 === rep || r2 === rep) {
                            if (!result.includes(c)) result.push(c);
                        }
                    }

                    // Ordering path — use graph's built-in findPath + provenance
                    const path = graph.findPath(from, to);
                    if (path) {
                        for (const [pa, pb] of path) {
                            const provenance = graph.getEdgeProvenance(pa, pb);
                            if (provenance && !result.includes(provenance)) {
                                result.push(provenance);
                            } else if (!provenance) {
                                const c = this.addedConstraints.find(c => {
                                    const e = this.constraintToEdge(c);
                                    return e && e.axis === axisEdge && e.from === pa && e.to === pb;
                                });
                                if (c && !result.includes(c)) result.push(c);
                            }
                        }
                    }
                    return result;
                }
            }
        }

        // --- Check 2: Cross-class cycle ---
        // Sort representatives lexicographically for deterministic conflict selection
        const roots = [...classMembers.keys()].sort();
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
                    const r1 = nodeToRep.get(ac.node1.id), r2 = nodeToRep.get(ac.node2.id);
                    if (r1 === roots[i] || r1 === roots[j] || r2 === roots[i] || r2 === roots[j]) {
                        if (!result.includes(c)) result.push(c);
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
        graph: DifferenceConstraintGraph, axisEdge: string,
        result: LayoutConstraint[],
    ): void {
        for (const fm of fromMembers) {
            for (const tm of toMembers) {
                if (!graph.isOrdered(fm, tm)) continue;
                const path = graph.findPath(fm, tm);
                if (path) {
                    for (const [a, b] of path) {
                        const provenance = graph.getEdgeProvenance(a, b);
                        if (provenance && !result.includes(provenance)) {
                            result.push(provenance);
                        } else if (!provenance) {
                            const c = this.addedConstraints.find(c => {
                                const e = this.constraintToEdge(c);
                                return e && e.axis === axisEdge && e.from === a && e.to === b;
                            });
                            if (c && !result.includes(c)) result.push(c);
                        }
                    }
                }
                return;
            }
        }
    }

    // ─── Group overlap validation ────────────────────────────────────────────

    public validateGroupConstraints(): GroupOverlapError | null {
        // Detect overlapping group pairs and mark them.
        // Overlapping groups (shared nodes, neither subsumes the other) are allowed
        // but excluded from WebCola's native tree hierarchy and handled via Kiwi constraints.
        for (let i = 0; i < this.groups.length; i++) {
            if (this.groups[i].negated) continue;
            for (let j = i + 1; j < this.groups.length; j++) {
                if (this.groups[j].negated) continue;
                const g = this.groups[i], o = this.groups[j];
                if (this.isSubGroup(g, o) || this.isSubGroup(o, g)) continue;
                const intersection = this.groupIntersection(g, o);
                if (intersection.length > 0) {
                    g.overlapping = true;
                    o.overlapping = true;
                }
            }
        }
        return null;
    }

    // ─── Alignment orders ────────────────────────────────────────────────────

    private computeAlignmentOrders(): LayoutConstraint[] {
        // Derive alignment groups from graph SCCs (includes alignment from CDCL search,
        // not just conjunctive constraints). Filter to real nodes only (skip virtual group nodes).
        const realNodeIds = new Set(this.nodes.map(n => n.id));

        // hGraph x-axis alignment classes → verticallyAligned (same column)
        this.verticallyAligned = [];
        for (const [, members] of this.hGraph.getAlignmentClasses()) {
            const realMembers = members.filter(id => realNodeIds.has(id));
            if (realMembers.length >= 2) {
                this.verticallyAligned.push(realMembers.map(id => this.nodeMap.get(id)!));
            }
        }

        // vGraph y-axis alignment classes → horizontallyAligned (same row)
        this.horizontallyAligned = [];
        for (const [, members] of this.vGraph.getAlignmentClasses()) {
            const realMembers = members.filter(id => realNodeIds.has(id));
            if (realMembers.length >= 2) {
                this.horizontallyAligned.push(realMembers.map(id => this.nodeMap.get(id)!));
            }
        }

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
        this.hGraph = new DifferenceConstraintGraph(this.minPadding);
        this.vGraph = new DifferenceConstraintGraph(this.minPadding);
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
