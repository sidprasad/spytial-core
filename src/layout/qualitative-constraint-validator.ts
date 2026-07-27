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
 *   1. **Interval decomposition pre-solver**: For 4-way non-overlap
 *      disjunctions, we try to resolve them before entering CDCL by checking
 *      if the pair is already separated, or if all but one alternative is
 *      infeasible.
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

// ═══════════════════════════════════════════════════════════════════════════════
// Difference Constraint Graph
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Global mutation-stamp counter shared by all DifferenceConstraintGraph
 * instances. Every stamp ever handed out is unique, so "stamp unchanged"
 * always means "no structural mutation on that graph object since" — even
 * across checkpoint/restore, which installs fresh graph objects with fresh
 * stamps (never reusing values that older cached verdicts were keyed on).
 */
let nextGraphStamp = 1;

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
    /**
     * Active claims per directed edge (key: "a\x00b"), each the weight an
     * addEdge asked for plus the constraint that asked. Every successful
     * addEdge registers one — including the redundant path (an equal-or-tighter
     * edge already exists) and the tightening path (which displaces a smaller
     * weight). The stored edge weight is always the max of its claims, and
     * edgeProvenance always names the strongest claim's constraint.
     * removeEdgeClaim releases one claim and restores both (or deletes the
     * edge when none remain). Without this, undoing an assignment whose
     * constraint duplicated an existing pair blindly deleted the shared edge —
     * dropping a base constraint or another assigned alternative's edge.
     */
    private edgeClaims: Map<string, { w: number; c?: LayoutConstraint }[]> = new Map();
    private gap: number;

    /**
     * Mutation stamps. addVersion changes when an edge is inserted (or a
     * zero-weight edge becomes positive); removeVersion changes when an edge
     * is deleted. Positive-weight tightenings change neither reachability nor
     * strict-orderedness, so they deliberately do NOT bump (keeps caches warm).
     */
    addVersion: number = nextGraphStamp++;
    removeVersion: number = nextGraphStamp++;
    /**
     * Set if any non-alignment edge was ever inserted with weight ≤ 0. Such
     * edges break the invariant "zero-weight edges occur only in symmetric
     * alignment pairs", which the validator's cross-version feasibility-verdict
     * reuse relies on (see graphPropagate). When set, callers must fall back
     * to exact-stamp cache validity.
     */
    hasZeroWeightOrderingEdge = false;

    /** Per-source reachability memo: src → (target → some path has a positive edge). */
    private reachMemo: Map<string, Map<string, boolean>> = new Map();
    /** Per-source longest-path memo: src → (target → max total edge weight). */
    private maxWeightMemo: Map<string, Map<string, number>> = new Map();
    /** Source-independent contraction backing maxWeightMemo (see contractedDag). */
    private contractedMemo: {
        rep: Map<string, string>;
        adj: Map<string, Map<string, number>>;
        order: string[];
        members: Map<string, string[]>;
    } | null = null;
    /** Memoized Tarjan SCC components. */
    private sccMemo: string[][] | null = null;
    private memoAddV = -1;
    private memoRemV = -1;

    /**
     * Reachability deltas accumulated since the last consumeReachDeltas():
     * (from, to) pairs whose reach-status changed (became reachable, or a
     * positive-weight path appeared where only zero-weight paths existed).
     * Deltas are exact when produced by the incremental-closure path in
     * addEdge; any mutation that goes the clear-the-memo route (alignment
     * edges, removals, cold memo, zero-weight hazard) sets this to null =
     * "unknown, assume anything changed". Starts null so workloads that never
     * consume record nothing; the first consume (which precedes any cached
     * verdict) arms tracking. Capped as a memory backstop.
     */
    private pendingDeltas: { from: string; to: string }[] | null = null;
    /**
     * Overflow degrades gracefully (consumer sees null = unknown), so this cap
     * only needs to bound memory for workloads that never consume. Consuming
     * workloads reset per propagation pass and stay far below it.
     */
    private static readonly MAX_PENDING_DELTAS = 65536;

    /**
     * Hand back the reachability deltas since the last call (and reset the
     * accumulator). Returns null if the deltas are unknown — the caller must
     * assume any pair's reachability may have changed.
     */
    consumeReachDeltas(): { from: string; to: string }[] | null {
        const d = this.pendingDeltas;
        this.pendingDeltas = [];
        return d;
    }

    private markDeltasUnknown(): void {
        this.pendingDeltas = null;
    }

    private recordDelta(from: string, to: string): void {
        if (this.pendingDeltas === null) return;
        if (this.pendingDeltas.length >= DifferenceConstraintGraph.MAX_PENDING_DELTAS) {
            this.pendingDeltas = null;
            return;
        }
        this.pendingDeltas.push({ from, to });
    }

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
        // Claim records are never mutated in place (only pushed/spliced), so
        // copying the arrays is enough — the entries can be shared.
        for (const [k, claims] of this.edgeClaims) g.edgeClaims.set(k, [...claims]);
        g.hasZeroWeightOrderingEdge = this.hasZeroWeightOrderingEdge;
        // Fresh stamps (from the constructor) — the clone is a new object with
        // an empty memo and no cached verdicts keyed on it, so it must not
        // inherit stamps that other caches associate with the original.
        return g;
    }

    /** Drop memoized reachability/SCC state if the graph mutated since it was built. */
    private validateMemo(): void {
        if (this.memoAddV !== this.addVersion || this.memoRemV !== this.removeVersion) {
            this.reachMemo.clear();
            this.maxWeightMemo.clear();
            this.contractedMemo = null;
            this.sccMemo = null;
            this.memoAddV = this.addVersion;
            this.memoRemV = this.removeVersion;
        }
    }

    // Note: adding an isolated node deliberately does NOT bump the mutation
    // stamps — it creates no paths, so cached reachability stays valid, and
    // SCC consumers treat nodes absent from the memo as singletons.
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
            // Edge exists with equal or tighter weight — no graph change, but
            // the claim must be registered so a later removeEdgeClaim releases
            // THIS add instead of deleting the edge someone else still needs.
            this.registerClaim(a, b, w, constraint);
            return true;
        }
        // For new edges or tightening: check if a return path b→...→a exists.
        // A cycle with positive total weight is infeasible (x_a - x_a ≥ w > 0).
        // With non-negative edge weights, w > 0 + any return path ≥ 0 → infeasible.
        // Zero-weight addEdge calls are only used internally via addAlignmentEdges
        // which has its own reachability checks, so reject all canReach here.
        if (this.canReach(b, a)) return false;
        if (w <= 0) this.hasZeroWeightOrderingEdge = true;
        // New edge, or a zero-weight edge becoming positive: reachability or
        // strict-orderedness changed. (Positive→positive tightening changes
        // neither, so it neither bumps nor invalidates.)
        if (existing === undefined || existing === 0) {
            // Incremental closure: a plain acyclic insert (the canReach check
            // above guarantees b cannot reach a) only creates paths of the form
            // s →* a → b →* t, so the memoized closure can be patched in place
            // — and the patched (s, t) pairs are exactly the reachability
            // deltas. Requires a current memo and no zero-weight hazard.
            const incremental = existing === undefined
                && !this.hasZeroWeightOrderingEdge
                && this.memoAddV === this.addVersion
                && this.memoRemV === this.removeVersion;
            this.adj.get(a)!.set(b, w);
            this.radj.get(b)!.set(a, w);
            if (incremental) {
                // Patch BEFORE bumping the stamp: reachFrom inside the patch
                // must see matching stamps, or validateMemo would wipe the
                // memo it is meant to update.
                this.applyIncrementalClosure(a, b, w > 0);
                // Memo (and SCC memo — an acyclic insert cannot merge SCCs)
                // maintained in place; keep the stamps synced so validateMemo
                // doesn't discard them.
                this.addVersion = nextGraphStamp++;
                this.memoAddV = this.addVersion;
            } else {
                this.addVersion = nextGraphStamp++;
                this.markDeltasUnknown();
            }
        } else {
            this.adj.get(a)!.set(b, w);
            this.radj.get(b)!.set(a, w);
        }
        this.registerClaim(a, b, w, constraint);
        return true;
    }

    private registerClaim(a: string, b: string, w: number, constraint?: LayoutConstraint): void {
        const key = DifferenceConstraintGraph.provenanceKey(a, b);
        const claims = this.edgeClaims.get(key);
        if (claims) claims.push({ w, c: constraint });
        else this.edgeClaims.set(key, [{ w, c: constraint }]);
        this.refreshProvenance(key);
    }

    /**
     * Point edgeProvenance at the strongest remaining claim that carries a
     * constraint, or drop it when no claim does. Provenance has to follow the
     * claims because conflict analysis maps path edges back to trail entries
     * through it (analyzeConflictForDecision / analyzeTheoryConflict): naming a
     * constraint whose claim was already released finds no trail entry, which
     * silently OMITS a literal and yields a learned clause stronger than the
     * conflict justifies. Before claims existed this could not arise — an undo
     * deleted the edge and its provenance together.
     *
     * Ties keep the earliest claim, and a claim without a constraint never
     * displaces one that has it, so the add-side outcomes are exactly what the
     * previous `if (constraint) set(...)` produced: a fresh edge takes its
     * constraint, a redundant add leaves the stronger claim's constraint in
     * place, and a tightening add takes over.
     */
    private refreshProvenance(key: string): void {
        const claims = this.edgeClaims.get(key);
        if (!claims || claims.length === 0) {
            this.edgeProvenance.delete(key);
            return;
        }
        let best: LayoutConstraint | undefined;
        let bestW = -Infinity;
        for (const claim of claims) {
            if (claim.c !== undefined && claim.w > bestW) {
                bestW = claim.w;
                best = claim.c;
            }
        }
        if (best !== undefined) this.edgeProvenance.set(key, best);
        else this.edgeProvenance.delete(key);
    }

    /**
     * Release one claim on edge a → b, mirroring an earlier addEdge with the
     * same raw weight (the stored claim is `(weight ?? gap) + size(a)`, the
     * same formula addEdge applies). The edge survives at the strongest
     * remaining claim's weight; it is physically deleted only when the last
     * claim is released. A missing claim is a no-op — that add never took
     * effect (e.g. a cycle-rejected member edge of a BoundingBox alternative).
     *
     * This replaces the old blind removeEdge, which deleted unconditionally
     * and thereby destroyed edges still required by a base constraint or
     * another assigned alternative whenever an undone constraint duplicated
     * their pair (validator reported SAT with a cyclic committed set —
     * caught by the Z3 committed-set cross-check).
     */
    removeEdgeClaim(a: string, b: string, weight?: number, constraint?: LayoutConstraint): void {
        const w = (weight ?? this.gap) + (this.nodeSize.get(a) ?? 0);
        const key = DifferenceConstraintGraph.provenanceKey(a, b);
        const claims = this.edgeClaims.get(key);
        if (!claims) return;
        // Match the RELEASING constraint's own claim, not just any claim of the
        // same weight: two distinct constraints can claim one edge at the same
        // weight (equal minDistance on the same pair), and dropping the wrong
        // record leaves the released constraint's claim alive — so provenance
        // then names a constraint that is off the trail while the still-active
        // one goes unnamed, which is exactly the omitted-literal case that
        // makes a learned clause stronger than its conflict.
        //
        // Identity matching also makes a missed claim a true no-op: a member
        // edge whose add was cycle-rejected registers nothing, and weight-only
        // matching could have released some other constraint's claim instead.
        const idx = constraint !== undefined
            ? claims.findIndex(claim => claim.w === w && claim.c === constraint)
            : claims.findIndex(claim => claim.w === w);
        if (idx === -1) return;
        claims.splice(idx, 1);

        if (claims.length === 0) {
            this.edgeClaims.delete(key);
            if (this.adj.get(a)?.delete(b)) {
                this.radj.get(b)?.delete(a);
                this.removeVersion = nextGraphStamp++;
                this.markDeltasUnknown();
            }
            this.edgeProvenance.delete(key);
            return;
        }

        let newW = -Infinity;
        for (const claim of claims) { if (claim.w > newW) newW = claim.w; }
        const cur = this.adj.get(a)?.get(b);
        if (cur !== undefined && newW < cur) {
            this.adj.get(a)!.set(b, newW);
            this.radj.get(b)!.set(a, newW);
            if (cur > 0 && newW <= 0) {
                // Strict-orderedness may have shrunk — removal-like event for
                // the reachability caches. (Positive→positive decreases change
                // neither reachability nor strictness: no bump needed.)
                this.removeVersion = nextGraphStamp++;
                this.markDeltasUnknown();
            }
        }
        // The released claim may have been the one naming this edge.
        this.refreshProvenance(key);
    }

    /**
     * Patch the memoized closure after inserting acyclic edge u → v, recording
     * every (source, target) pair whose reach-status changed as a delta.
     *
     * New paths are exactly s →* u → v →* t, so for every cached source s that
     * reaches u (or s === u), merge v's closure (plus v itself) into s's set,
     * OR-ing path positivity. Sources not in the memo recompute from the
     * updated adjacency on demand. Coverage note: consumers' cached verdicts
     * only ever probe sources they queried when computing — queries warm the
     * memo, and the memo is only ever cleared wholesale by mutations that also
     * mark deltas unknown — so every probe source of a live verdict is cached
     * here and gets its deltas recorded.
     */
    private applyIncrementalClosure(u: string, v: string, edgePositive: boolean): void {
        const vSet = this.reachFrom(v); // v's closure is unaffected by u → v (no cycle)
        for (const [s, sSet] of this.reachMemo) {
            let posToU: boolean;
            if (s === u) {
                posToU = false;
            } else {
                const e = sSet.get(u);
                if (e === undefined) continue; // s does not reach u — unaffected
                posToU = e;
            }
            const posToV = posToU || edgePositive;
            const curV = sSet.get(v);
            if (curV === undefined || (!curV && posToV)) {
                sSet.set(v, posToV);
                if (s !== v) this.recordDelta(s, v);
            }
            for (const [t, posVT] of vSet) {
                const p = posToV || posVT;
                const cur = sSet.get(t);
                if (cur === undefined || (!cur && p)) {
                    sSet.set(t, p);
                    if (s !== t) this.recordDelta(s, t);
                }
            }
        }
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
        return this.reachFrom(from).has(to);
    }

    /**
     * Memoized per-source reachability. One two-state BFS computes, for every
     * node reachable from `src`, whether some path there contains a positive-
     * weight edge — answering all canReach AND isStrictlyOrdered queries from
     * `src` until the graph next mutates. Amortizes the ~600k single-pair BFS
     * calls graphPropagate used to issue (each pass re-queries the same
     * sources: bbox members, alignment endpoints, disjunction edge endpoints).
     *
     * Entry semantics: key present = reachable; value true = some path has a
     * positive edge (strict ordering). `src` itself gets an entry with value
     * false initially and may upgrade to true via a cycle through `src`,
     * mirroring the original BFS exactly.
     */
    private reachFrom(src: string): Map<string, boolean> {
        this.validateMemo();
        const cached = this.reachMemo.get(src);
        if (cached) return cached;

        const m = new Map<string, boolean>(); // node → best "hasPositive" seen
        const queue: string[] = [src];
        const queuePositive: boolean[] = [false];
        m.set(src, false);
        let head = 0;
        while (head < queue.length) {
            const node = queue[head];
            const hasPositive = queuePositive[head];
            head++;
            const succs = this.adj.get(node);
            if (!succs) continue;
            for (const [s, w] of succs) {
                const newHasPositive = hasPositive || w > 0;
                const prev = m.get(s);
                if (prev === undefined || (!prev && newHasPositive)) {
                    m.set(s, newHasPositive);
                    queue.push(s);
                    queuePositive.push(newHasPositive);
                }
            }
        }
        // src is trivially "reachable" from itself; drop the seed entry unless
        // a real cycle re-reached it (upgraded to true), so `has(src)` reflects
        // actual edge-reachability for canReach's non-early-exit path.
        if (m.get(src) === false) m.delete(src);
        this.reachMemo.set(src, m);
        return m;
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

    // ─── Alignment (zero-weight edge) support ─────────────────────────────

    /**
     * Add bidirectional zero-weight edges for alignment: a=b.
     * Returns false if alignment conflicts with existing strict ordering
     * (a positive-weight path exists between a and b in either direction).
     *
     * Uses isStrictlyOrdered (not canReach) so that zero-weight reachability
     * (through existing alignment chains) does not block new alignments.
     * Zero-weight paths mean the nodes are already (partially) aligned,
     * which is compatible with explicit alignment.
     */
    addAlignmentEdges(a: string, b: string, constraint?: LayoutConstraint): boolean {
        this.ensureNode(a);
        this.ensureNode(b);
        if (a === b) return true;

        // Reject only when a *strict* ordering exists (positive-weight path).
        // Zero-weight reachability (alignment chains) is compatible with alignment.
        if (this.isStrictlyOrdered(a, b) || this.isStrictlyOrdered(b, a)) {
            return false;
        }

        // Add zero-weight edges (don't overwrite existing positive-weight edges)
        // Alignment pairs create deliberate 2-cycles — no incremental closure
        // patch for those; take the clear-and-recompute route.
        if (!this.adj.get(a)!.has(b)) {
            this.adj.get(a)!.set(b, 0);
            this.radj.get(b)!.set(a, 0);
            if (constraint) this.edgeProvenance.set(DifferenceConstraintGraph.provenanceKey(a, b), constraint);
            this.addVersion = nextGraphStamp++;
            this.markDeltasUnknown();
        }
        if (!this.adj.get(b)!.has(a)) {
            this.adj.get(b)!.set(a, 0);
            this.radj.get(a)!.set(b, 0);
            if (constraint) this.edgeProvenance.set(DifferenceConstraintGraph.provenanceKey(b, a), constraint);
            this.addVersion = nextGraphStamp++;
            this.markDeltasUnknown();
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
            this.removeVersion = nextGraphStamp++;
            this.markDeltasUnknown();
        }
        if (this.adj.get(b)?.get(a) === 0) {
            this.adj.get(b)!.delete(a);
            this.radj.get(a)!.delete(b);
            this.edgeProvenance.delete(DifferenceConstraintGraph.provenanceKey(b, a));
            this.removeVersion = nextGraphStamp++;
            this.markDeltasUnknown();
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
        return this.reachFrom(a).get(b) === true;
    }

    /**
     * Check if a sits entirely before b on this axis: coord_a + size_a < coord_b.
     *
     * This is the spatial relation the query language means by "left of" /
     * "above" — a is clear of b, not merely starting earlier. isStrictlyOrdered
     * is the weaker "coord_a < coord_b"; use that one for questions about
     * ordering or alignment feasibility, and this one for questions about where
     * a box actually sits relative to another.
     *
     * The two coincide when every box has the same size on this axis, because
     * any forced separation is then at least one box plus its padding. They
     * come apart as soon as sizes differ: with A aligned to a narrow N and
     * N before B, the forced separation is N's width, which says nothing about
     * whether the much wider A clears B.
     *
     * Sound but not complete: maxWeightFrom is the separation this graph
     * entails, and non-overlap and unresolved disjunctions can force more.
     * Claiming less than is true is the safe direction for a must-fact.
     */
    isProperlyBefore(a: string, b: string): boolean {
        if (a === b) return false;
        const w = this.maxWeightFrom(a).get(b);
        return w !== undefined && w > (this.nodeSize.get(a) ?? 0);
    }

    /**
     * Memoized per-source longest-path weight. reachFrom answers "is there a
     * path with any separation at all", which entails only coord_a < coord_b.
     * Deciding whether a box CLEARS another needs the total separation the
     * constraints force — coord_target ≥ coord_src + maxWeightFrom(src, target)
     * — and that is the maximum over paths, not the existence of one.
     *
     * Alignment classes are contracted first: their members share a coordinate,
     * so every edge inside a class weighs 0 and contributes nothing to a path.
     * What remains is a DAG (positive-weight cycles are rejected at insertion),
     * so the longest path is a single topological relaxation pass.
     */
    private maxWeightFrom(src: string): Map<string, number> {
        this.validateMemo();
        const cached = this.maxWeightMemo.get(src);
        if (cached) return cached;

        const { rep, adj, order, members } = this.contractedDag();
        const srcRep = rep.get(src) ?? src;

        const dist = new Map<string, number>();
        dist.set(srcRep, 0);
        for (const n of order) {
            const base = dist.get(n);
            if (base === undefined) continue; // not downstream of src
            for (const [s, w] of adj.get(n)!) {
                const cand = base + w;
                const cur = dist.get(s);
                if (cur === undefined || cand > cur) dist.set(s, cand);
            }
        }

        // Expand super-nodes back to members. Walking `dist` rather than every
        // node keeps this proportional to what src actually reaches, matching
        // reachFrom — expanding over all nodes instead made each source O(V)
        // even when it reaches nothing.
        const result = new Map<string, number>();
        for (const [r, d] of dist) {
            const ms = members.get(r);
            if (ms === undefined) { result.set(r, d); continue; }
            for (const m of ms) result.set(m, d);
        }
        this.maxWeightMemo.set(src, result);
        return result;
    }

    /**
     * The alignment-contracted DAG plus a topological order, shared by every
     * maxWeightFrom source. Building it is O(V + E) and it does not depend on
     * the source, so it is computed once per graph version — rebuilding it per
     * source made the lazy modal build ~3-5x slower on chains.
     *
     * Members of an alignment class share a coordinate, so intra-class edges
     * (necessarily zero-weight) are dropped and the class collapses to one
     * super-node. Between super-nodes only the heaviest edge matters, since a
     * longest-path relaxation would pick it anyway.
     */
    private contractedDag(): {
        rep: Map<string, string>;
        adj: Map<string, Map<string, number>>;
        order: string[];
        members: Map<string, string[]>;
    } {
        if (this.contractedMemo) return this.contractedMemo;

        const rep = new Map<string, string>();
        const members = this.getAlignmentClasses();
        for (const [r, ms] of members) {
            for (const m of ms) rep.set(m, r);
        }
        const repOf = (id: string): string => rep.get(id) ?? id;

        const adj = new Map<string, Map<string, number>>();
        const indeg = new Map<string, number>();
        for (const n of this.nodes) {
            const r = repOf(n);
            if (!adj.has(r)) { adj.set(r, new Map()); indeg.set(r, 0); }
        }
        for (const [u, succs] of this.adj) {
            const ru = repOf(u);
            const out = adj.get(ru);
            if (!out) continue;
            for (const [v, w] of succs) {
                const rv = repOf(v);
                if (ru === rv) continue;
                const cur = out.get(rv);
                if (cur === undefined) {
                    out.set(rv, w);
                    indeg.set(rv, (indeg.get(rv) ?? 0) + 1);
                } else if (w > cur) {
                    out.set(rv, w);
                }
            }
        }

        // Kahn order. Anything left unordered would sit on a surviving cycle,
        // which after contraction means a positive-weight cycle — rejected at
        // insertion, so unreachable in practice. Such nodes simply never get a
        // distance, which reads as "no entailed separation": conservative.
        const order: string[] = [];
        const queue: string[] = [];
        for (const [n, d] of indeg) if (d === 0) queue.push(n);
        for (let head = 0; head < queue.length; head++) {
            const n = queue[head];
            order.push(n);
            for (const [s] of adj.get(n)!) {
                const d = (indeg.get(s) ?? 1) - 1;
                indeg.set(s, d);
                if (d === 0) queue.push(s);
            }
        }

        this.contractedMemo = { rep, adj, order, members };
        return this.contractedMemo;
    }

    /**
     * All strongly connected components of the graph (any-weight edges).
     * In a consistent graph, mutual reachability is only possible through
     * zero-weight alignment cycles (positive-weight cycles are rejected at
     * insertion), so SCCs are exactly the alignment classes.
     *
     * Iterative Tarjan, O(V + E) — replaces the old per-node nested-BFS
     * approach, which was O(V·(V+E)) and dominated computeAlignmentOrders
     * (87ms of a 200-node chain's validation, with zero alignments present).
     */
    private tarjanSCCs(): string[][] {
        this.validateMemo();
        if (this.sccMemo) return this.sccMemo;
        const index = new Map<string, number>();
        const lowlink = new Map<string, number>();
        const onStack = new Set<string>();
        const stack: string[] = [];
        const components: string[][] = [];
        let next = 0;

        interface Frame { node: string; succs: string[]; i: number }

        for (const root of this.nodes) {
            if (index.has(root)) continue;
            const frames: Frame[] = [];
            const open = (n: string): void => {
                index.set(n, next);
                lowlink.set(n, next);
                next++;
                stack.push(n);
                onStack.add(n);
                frames.push({ node: n, succs: [...(this.adj.get(n)?.keys() ?? [])], i: 0 });
            };
            open(root);
            while (frames.length > 0) {
                const f = frames[frames.length - 1];
                if (f.i < f.succs.length) {
                    const s = f.succs[f.i++];
                    if (!index.has(s)) {
                        open(s);
                    } else if (onStack.has(s)) {
                        lowlink.set(f.node, Math.min(lowlink.get(f.node)!, index.get(s)!));
                    }
                } else {
                    frames.pop();
                    if (lowlink.get(f.node) === index.get(f.node)) {
                        const comp: string[] = [];
                        let m: string;
                        do {
                            m = stack.pop()!;
                            onStack.delete(m);
                            comp.push(m);
                        } while (m !== f.node);
                        components.push(comp);
                    }
                    const parent = frames[frames.length - 1];
                    if (parent) {
                        lowlink.set(parent.node, Math.min(lowlink.get(parent.node)!, lowlink.get(f.node)!));
                    }
                }
            }
        }
        this.sccMemo = components;
        return components;
    }

    /**
     * Get alignment classes: groups of nodes connected by mutual zero-weight paths.
     * Returns a map from canonical representative to list of class members.
     * Classes with only one member are omitted.
     */
    getAlignmentClasses(): Map<string, string[]> {
        const classes = new Map<string, string[]>();
        for (const comp of this.tarjanSCCs()) {
            if (comp.length > 1) {
                comp.sort(); // deterministic
                classes.set(comp[0], comp);
            }
        }
        return classes;
    }

    /** Get the alignment class (SCC) containing the given node. */
    getAlignmentClassOf(nodeId: string): string[] {
        for (const comp of this.tarjanSCCs()) {
            if (comp.includes(nodeId)) return comp;
        }
        return [nodeId];
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

/** Cached feasibility verdicts for one disjunction — see altVerdictCache. */
interface AltVerdictEntry {
    /** Per-alternative: 0 = unknown, 1 = feasible, 2 = infeasible. */
    verdict: Int8Array;
    /** Per-alternative: additionEpoch (probe-tracked) or add-stamp sum (alignment-bearing) at compute time. */
    addStamp: Float64Array;
    /** Per-alternative: remove-stamp sum at compute time. */
    remStamp: Float64Array;
    /** Per-alternative: 1 if the alternative contains an AlignmentConstraint. */
    hasAlignment: Uint8Array;
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
    /** Snapshot of allDisjunctions before presolve modifies it. Used by
     *  computeMaximalFeasibleSubset to work with the full constraint set. */
    private originalDisjunctions: DisjunctiveConstraint[] = [];

    // ─── CDCL state ───
    private assignmentTrail: Assignment[] = [];
    private decisionLevel: number = 0;
    private learnedClauses: LearnedClause[] = [];
    /**
     * VSIDS activity, indexed by `disjunctionIndex * branchStride +
     * alternativeIndex` (replaces a `d${d}a${a}`-keyed Map: pickBranch built
     * one string per alternative per call — ~1.2M allocations on the 10-group
     * benchmark). The stride never shrinks, so an entry keeps its (d, a)
     * identity across restarts exactly as the string keys did.
     */
    private activityFlat: Float64Array = new Float64Array(0);
    /** Branching tiebreaker 1/(1 + altLength), same indexing as activityFlat. */
    private simplicityFlat: Float64Array = new Float64Array(0);
    /** Reusable scratch for pickBranch's learned-clause elimination bitmap. */
    private elimScratch: Uint8Array = new Uint8Array(0);
    private branchStride = 0;
    private activityDecay: number = 0.95;
    private conflictCount: number = 0;
    private restartThreshold: number = 32;
    private emptyDisjunctionError: PositionalConstraintError | null = null;
    private lubyIndex: number = 0;

    // ─── Node lookup ───
    private nodeMap: Map<string, LayoutNode> = new Map();

    // ─── Statistics ───
    private prunedByTransitivity: number = 0;
    private prunedByDecomposition: number = 0;

    // ─── graphPropagate feasibility-verdict cache ───
    /**
     * Per-(disjunction, alternative) cached isAlternativeFeasible verdicts,
     * keyed by disjunction object identity (pruneDisjunctions builds new
     * objects, which naturally start cold). Validity rests on the monotonicity
     * of feasibility in the edge set:
     *   - edge ADDITIONS only shrink feasibility → an INFEASIBLE verdict stays
     *     valid while no edge has been removed (remStamp unchanged);
     *   - edge REMOVALS only grow feasibility → a FEASIBLE verdict stays valid
     *     across removals unconditionally.
     * For additions, feasible verdicts are invalidated PRECISELY rather than
     * wholesale: each non-alignment alternative's feasibility depends on a
     * fixed set of (axis, from, to) reachability probes, registered in
     * probeIndex; when the graphs report exact reachability deltas
     * (consumeReachDeltas), only verdicts whose probes match a delta are
     * dirtied. When deltas are unknown (alignment-pair edges, removals, cold
     * memo), additionEpoch bumps, invalidating all probe-tracked feasible
     * verdicts at once. Alternatives containing an AlignmentConstraint query
     * alignment classes (a dynamic probe set), so their feasible verdicts fall
     * back to exact add-stamp validity.
     * The monotone rules additionally need "zero-weight edges occur only in
     * symmetric alignment pairs"; if either graph ever sees a zero-weight
     * ordering edge (hasZeroWeightOrderingEdge), the cache is bypassed
     * entirely.
     * Sums of per-graph stamps are safe keys: stamps are globally unique and
     * monotonically increasing, so an unchanged sum implies both unchanged.
     * addStamp stores additionEpoch for probe-tracked alternatives and the
     * add-stamp sum for alignment-bearing ones — fixed per alternative, so the
     * two value domains never mix.
     */
    private altVerdictCache: Map<DisjunctiveConstraint, AltVerdictEntry> = new Map();
    /**
     * Positional memo of altVerdictCache for the graphPropagate scan, which
     * revisits every unassigned disjunction each pass (~300k Map probes on the
     * 10-group benchmark). verdictEntryDisj holds the disjunction the slot was
     * filled from, and the scan only trusts a slot when that object is still
     * identical — so a reshaped allDisjunctions can never alias the wrong
     * entry, independent of the explicit clears.
     */
    private verdictEntryByIndex: (AltVerdictEntry | null)[] = [];
    private verdictEntryDisj: (DisjunctiveConstraint | null)[] = [];
    /** (axis, from, to) probe → verdicts whose feasibility it supports. */
    private probeIndex: Map<string, { entry: AltVerdictEntry; aIdx: number }[]> = new Map();
    /** Bumped whenever a graph reports unknown reachability deltas. */
    private additionEpoch = 0;
    /** Combined stamp of the last graphPropagate that reached 'ok' fixpoint; bail early if unchanged. */
    private lastPropagateOkStamp = -1;

    // ─── Modal query state (populated after successful validation) ───
    /** Conjunctive-only graph snapshots (before CDCL disjunction resolution). */
    private mustHGraph: DifferenceConstraintGraph | null = null;
    private mustVGraph: DifferenceConstraintGraph | null = null;
    /** Set only when validatePositionalConstraints completes without error. */
    private validationSucceeded = false;
    /** Precomputed must-ordering pairs: "A\x00B" means A is strictly before B. */
    private mustHPairs: Set<string> | null = null;
    private mustVPairs: Set<string> | null = null;
    /** Precomputed must-alignment classes (conjunctive + disjunction intersection). */
    private mustHAlignmentClasses: Map<string, Set<string>> | null = null;
    private mustVAlignmentClasses: Map<string, Set<string>> | null = null;

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
        // Any modal state belongs to a previous run over a possibly different
        // constraint set — drop it before this one can be observed. Without
        // this, a re-validation serves the earlier run's facts: modalStateBuilt
        // short-circuits the rebuild on success, and the derived pair sets
        // outlive the graphs on failure.
        this.resetModalQueryState();

        // Phase 1: Add conjunctive constraints — stop on first error but don't return yet
        let phase1Failed = false;
        for (const constraint of this.orientationConstraints) {
            const error = this.addConjunctiveConstraint(constraint);
            if (error) { phase1Failed = true; break; }
        }

        // Phase 2: Always collect group bounding box disjunctions
        // (safe — only creates DisjunctiveConstraints + ensureNode, no addEdge)
        this.addGroupBoundingBoxDisjunctions();

        // Phase 3: Always collect all disjunctions
        this.allDisjunctions = [...(this.layout.disjunctiveConstraints || [])];
        // Save before presolve modifies allDisjunctions (removes resolved, prunes alternatives)
        this.originalDisjunctions = [...this.allDisjunctions];

        // If Phase 1 failed, compute global MFS across all constraints and return
        if (phase1Failed) {
            return this.enforceMaximalFeasibleSubset(this.buildGlobalMFSError());
        }

        const constraintsBeforeDisjunctions = this.addedConstraints.length;

        // Phase 4: Interval decomposition — resolve what we can before CDCL
        this.presolveDisjunctions();

        // Phase 4b: Handle truly empty disjunctions (no alternatives at all)
        if (this.emptyDisjunctionError) {
            return this.enforceMaximalFeasibleSubset(this.emptyDisjunctionError);
        }

        // Snapshot graphs after conjunctive + presolve (before CDCL commits disjunctive choices).
        // This is the "conjunctive base" for modal queries. Presolve already committed
        // unit disjunctions (single feasible alternative), so these are included.
        this.mustHGraph = this.hGraph.clone();
        this.mustVGraph = this.vGraph.clone();

        // Phase 5: CDCL search on remaining disjunctions
        if (this.allDisjunctions.length > 0) {
            const result = this.solveCDCL();
            if (!result.satisfiable) {
                // buildGlobalMFSError traces conflict paths in the MFS graph,
                // including the conjunctive constraints that block infeasible
                // disjunctions — so both positive and negated sources appear in the IIS.
                return this.enforceMaximalFeasibleSubset(this.buildGlobalMFSError());
            }
        }

        // Persist all constraints added during presolve + CDCL to the layout.
        // Previously this was inside the CDCL block, so presolve-committed
        // constraints were dropped when presolve resolved everything.
        const chosenConstraints = this.addedConstraints.slice(constraintsBeforeDisjunctions);
        if (chosenConstraints.length > 0) {
            this.layout.constraints = this.layout.constraints.concat(chosenConstraints);
        }

        // Phase 5b: Modal query state (must/can/cannot) is built LAZILY on the
        // first modal query (ensureModalQueryState). It is pure post-solve
        // analysis over the must-graph snapshots and this.allDisjunctions —
        // both frozen from here on — and profiling showed it dominating
        // validation wall time (e.g. 78% on a 200-node conjunctive chain)
        // while its only consumers (layout-evaluator, spytial-explorer) query
        // interactively after render, and often never.

        // Phase 6: Alignment orders
        const implicitConstraints = this.computeAlignmentOrders();

        // Phase 7: Node overlap detection
        const overlapError = this.detectNodeOverlaps();
        if (overlapError) return this.enforceMaximalFeasibleSubset(overlapError);

        this.layout.constraints = this.layout.constraints.concat(implicitConstraints);
        // Only now may modal queries build their state: every error path above
        // routes through enforceMaximalFeasibleSubset, which REPLACES
        // layout.constraints with the feasible subset — so the must-graph
        // snapshots taken at Phase 4b would describe a constraint system the
        // layout no longer has. See ensureModalQueryState.
        this.validationSucceeded = true;
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
        // Every error return in validatePositionalConstraints funnels through
        // here, so this is the one place that has to drop modal state. The
        // must-graphs are snapshotted at Phase 4b (before CDCL), so a later
        // failure would otherwise leave them describing a constraint system
        // this method just replaced on the layout. Note the readers disagree on
        // what they consult — getCannot/getCannotAligned read the must-graphs
        // DIRECTLY, getMust/getMustAligned read the derived pair and class
        // sets — so nulling the graphs alone is not enough; reset all of it.
        this.resetModalQueryState();
        return error;
    }

    /**
     * Build an error by computing a global greedy MFS across ALL constraints
     * (conjunctive + disjunctive), then tracing conflict paths in the MFS
     * graph to produce a proper IIS for each excluded constraint.
     *
     * The IIS always contains >= 2 constraints: the excluded constraint(s)
     * plus the MFS constraints they conflict with.
     *
     * Uses `computeMaximalFeasibleSubset()` which builds fresh graphs from
     * scratch, so it is independent of the main validation state.
     */
    private buildGlobalMFSError(): PositionalConstraintError {
        const { feasibleConstraints, infeasibleDisjunctions, hGraph: mfsH, vGraph: mfsV } = this.computeMaximalFeasibleSubset();

        // Excluded conjunctive = all orientation constraints not in the MFS
        const feasibleSet = new Set<LayoutConstraint>(feasibleConstraints);
        const excludedConjunctive = this.orientationConstraints.filter(c => !feasibleSet.has(c));

        // Build IIS: for each excluded constraint, trace the conflict path
        // in the MFS graph (the path that creates a cycle with the constraint).
        // IIS = excluded constraints + their conflict paths from the MFS.
        const iisSet = new Set<LayoutConstraint>();
        const seen = new Set<LayoutConstraint>();

        // Helper: trace a conflict path in an MFS graph and add provenances to IIS
        const traceConflictPath = (graph: DifferenceConstraintGraph, from: string, to: string) => {
            const path = graph.findPath(from, to);
            if (path) {
                for (const [a, b] of path) {
                    const provenance = graph.getEdgeProvenance(a, b);
                    if (provenance && !seen.has(provenance)) {
                        seen.add(provenance);
                        iisSet.add(provenance);
                    }
                }
            }
        };

        for (const c of excludedConjunctive) {
            if (seen.has(c)) continue;
            seen.add(c);
            iisSet.add(c);

            if (isAlignmentConstraint(c)) {
                // Alignment constraint align(A,B) was excluded because A and B are
                // strictly ordered in the MFS graph. Trace the ordering path(s).
                const ac = c as AlignmentConstraint;
                const graph = ac.axis === 'x' ? mfsH : mfsV;
                const a = ac.node1.id, b = ac.node2.id;
                // Check both directions — the ordering path that blocks alignment
                if (graph.canReach(a, b)) traceConflictPath(graph, a, b);
                if (graph.canReach(b, a)) traceConflictPath(graph, b, a);
            } else {
                const edge = this.constraintToEdge(c);
                if (!edge) continue;
                const graph = edge.axis === 'h' ? mfsH : mfsV;
                traceConflictPath(graph, edge.to, edge.from);
            }
        }

        // Also include infeasible disjunctions (with representative constraints)
        for (const disj of infeasibleDisjunctions) {
            if (disj.alternatives.length > 0 && disj.alternatives[0].length > 0) {
                const rep = disj.alternatives[0][0];
                if (!seen.has(rep)) {
                    seen.add(rep);
                    iisSet.add(rep);
                }
                // Trace conflict path for the representative
                const edge = this.constraintToEdge(rep);
                if (edge) {
                    const graph = edge.axis === 'h' ? mfsH : mfsV;
                    const path = graph.findPath(edge.to, edge.from);
                    if (path) {
                        for (const [a, b] of path) {
                            const provenance = graph.getEdgeProvenance(a, b);
                            if (provenance && !seen.has(provenance)) {
                                seen.add(provenance);
                                iisSet.add(provenance);
                            }
                        }
                    }
                }
            } else {
                // Empty disjunction — add source to maps below
            }
        }

        // Group IIS by source constraint
        const srcToLayout = new Map<SourceConstraint, LayoutConstraint[]>();
        const htmlMap = new Map<string, string[]>();
        for (const c of iisSet) {
            const src = c.sourceConstraint;
            if (!srcToLayout.has(src)) srcToLayout.set(src, []);
            if (!htmlMap.has(src.toHTML())) htmlMap.set(src.toHTML(), []);
            srcToLayout.get(src)!.push(c);
            htmlMap.get(src.toHTML())!.push(orientationConstraintToString(c));
        }

        // Empty disjunctions with no alternatives
        for (const disj of infeasibleDisjunctions) {
            if (disj.alternatives.length === 0) {
                const src = disj.sourceConstraint;
                if (!srcToLayout.has(src)) srcToLayout.set(src, []);
                if (!htmlMap.has(src.toHTML())) htmlMap.set(src.toHTML(), []);
                htmlMap.get(src.toHTML())!.push(`unsatisfiable: ${src.toHTML()}`);
            }
        }

        // Pick a representative for backward-compat singular fields
        const iisArray = [...iisSet];
        const representative = iisArray[0] ?? this.orientationConstraints[0];

        const repString = representative ? orientationConstraintToString(representative) : '';
        const repSource = representative?.sourceConstraint
            ?? infeasibleDisjunctions[0]?.sourceConstraint
            ?? this.orientationConstraints[0]?.sourceConstraint;

        return {
            name: 'PositionalConstraintError', type: 'positional-conflict',
            message: `Constraint "${repString}" conflicts with existing constraints`,
            conflictingConstraint: representative ?? (undefined as any),
            conflictingSourceConstraint: repSource ?? (undefined as any),
            minimalConflictingSet: srcToLayout,
            maximalFeasibleSubset: feasibleConstraints,
            errorMessages: {
                conflictingConstraint: repString,
                conflictingSourceConstraint: repSource?.toHTML() ?? '',
                minimalConflictingConstraints: htmlMap,
            },
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Pre-solver disjunction resolution
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Before entering CDCL, try to resolve disjunctions using:
     * 1. Already separated → skip entirely
     * 2. Prune infeasible alternatives (cycle, alignment conflict)
     * 3. If only one alternative remains → commit as conjunctive
     */
    private presolveDisjunctions(): void {
        const remaining: DisjunctiveConstraint[] = [];

        for (const disj of this.allDisjunctions) {
            // Already satisfied? An alternative fully implied by the current
            // graphs can be committed without adding edges (already entailed).
            const impliedAlt = this.findImpliedAlternative(disj);
            if (impliedAlt !== null) {
                for (const constraint of disj.alternatives[impliedAlt]) {
                    this.addedConstraints.push(constraint);
                }
                this.prunedByTransitivity++;
                continue;
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
            // position, guaranteeing overlap. Reject the alignment.
            // Check the ENTIRE merged alignment class, not just the two
            // constraint nodes, to catch transitive dual-axis overlaps.
            if (ac.node1.id !== ac.node2.id) {
                const otherGraph = ac.axis === 'x' ? this.vGraph : this.hGraph;
                if (QualitativeConstraintValidator.classHasDualAxisOverlap(
                    graph, otherGraph, ac.node1.id, ac.node2.id, true,
                )) {
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
        //
        // Two encodings, selected per-group by member count:
        //
        // FLAT encoding (M ≤ BBOX_THRESHOLD): enumerate all (mL,mR,mT,mB,N) tuples
        //   into a single disjunction.  O(K × M²(M-1)²) alternatives, but only 1
        //   disjunction per group → shallower CDCL search tree.
        //
        // BBOX encoding (M > BBOX_THRESHOLD): 4 virtual proxy nodes per group act
        //   as intermediaries; 4 member-selection disjunctions (M alts each) + 1
        //   merged inclusion disjunction. O(M + K) alternatives total but 5 extra
        //   disjunctions → deeper search tree, worthwhile only when M⁴ is large.
        const BBOX_THRESHOLD = 5; // use bbox encoding when M > 5
        const negatedBySource = new Map<NonNullable<LayoutGroup['sourceConstraint']>, LayoutGroup[]>();
        for (const group of this.groups) {
            if (!group.negated || !group.sourceConstraint) continue;
            const key = group.sourceConstraint;
            if (!negatedBySource.has(key)) negatedBySource.set(key, []);
            negatedBySource.get(key)!.push(group);
        }

        for (const [source, groups] of negatedBySource) {
            const inclusionAlternatives: LayoutConstraint[][] = [];

            for (const group of groups) {
                const memberIds = new Set(group.nodeIds);
                const members = group.nodeIds
                    .map(id => nodeById.get(id))
                    .filter((n): n is LayoutNode => n !== undefined);
                const nonMembers = this.nodes.filter(n => !memberIds.has(n.id));

                if (members.length < 2 || nonMembers.length === 0) continue;

                if (members.length > BBOX_THRESHOLD) {
                    // ── BBOX encoding for large groups ──────────────────────
                    // Virtual bbox proxy nodes (zero-size, unique per group)
                    const mkProxy = (suffix: string): LayoutNode => ({
                        id: `_ng_${group.name}_${suffix}`,
                        label: '', color: '', groups: [], attributes: {},
                        width: 0, height: 0,
                        mostSpecificType: '', types: [], showLabels: false,
                    });
                    const ngl = mkProxy('l'), ngr = mkProxy('r');
                    const ngt = mkProxy('t'), ngb = mkProxy('b');

                    const pushDisj = (alts: LayoutConstraint[][]) => {
                        const d = new DisjunctiveConstraint(source, alts);
                        if (!this.layout.disjunctiveConstraints) this.layout.disjunctiveConstraints = [];
                        this.layout.disjunctiveConstraints.push(d);
                    };

                    // Member-selection disjunctions: which member defines each bbox edge.
                    pushDisj(members.map(m => [
                        { left: m, right: ngl, minDistance: 0, sourceConstraint: source } as LeftConstraint,
                    ]));
                    pushDisj(members.map(m => [
                        { left: ngr, right: m, minDistance: 0, sourceConstraint: source } as LeftConstraint,
                    ]));
                    pushDisj(members.map(m => [
                        { top: m, bottom: ngt, minDistance: 0, sourceConstraint: source } as TopConstraint,
                    ]));
                    pushDisj(members.map(m => [
                        { top: ngb, bottom: m, minDistance: 0, sourceConstraint: source } as TopConstraint,
                    ]));

                    // Non-member inclusion via proxy nodes
                    for (const n of nonMembers) {
                        inclusionAlternatives.push([
                            { left: ngl, right: n, minDistance: 0, sourceConstraint: source } as LeftConstraint,
                            { left: n, right: ngr, minDistance: 0, sourceConstraint: source } as LeftConstraint,
                            { top: ngt, bottom: n, minDistance: 0, sourceConstraint: source } as TopConstraint,
                            { top: n, bottom: ngb, minDistance: 0, sourceConstraint: source } as TopConstraint,
                        ]);
                    }
                } else {
                    // ── FLAT encoding for small groups ──────────────────────
                    // Enumerate all (mL,mR,mT,mB,N) tuples into a single disjunction.
                    // O(K × M²(M-1)²) alternatives but only 1 disjunction → shallow search.
                    for (const n of nonMembers) {
                        for (const mL of members) {
                            for (const mR of members) {
                                if (mL.id === mR.id) continue;
                                for (const mT of members) {
                                    for (const mB of members) {
                                        if (mT.id === mB.id) continue;
                                        inclusionAlternatives.push([
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
            }

            // Merged inclusion disjunction (may be empty → UNSAT, matching original semantics
            // for degenerate cases like 0 non-members or <2 members)
            const disj = new DisjunctiveConstraint(source, inclusionAlternatives);
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

    /**
     * Check if an alternative is feasible:
     * 1. No cycle (transitivity check)
     * 2. No alignment conflict
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
                    if (QualitativeConstraintValidator.classHasDualAxisOverlap(
                        graph, otherGraph, ac.node1.id, ac.node2.id, false,
                    )) return false;
                }
                continue;
            }

            const edge = this.constraintToEdge(constraint);
            if (!edge) continue;
            const graph = edge.axis === 'h' ? this.hGraph : this.vGraph;

            // Would cycle? (canReach catches both ordering cycles and
            // alignment-ordering conflicts via zero-weight edges)
            if (graph.canReach(edge.to, edge.from)) return false;
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
        return QualitativeConstraintValidator.isBboxFeasibleInGraphs(bc, this.hGraph, this.vGraph);
    }

    /**
     * Check if a BoundingBox alternative is feasible by testing the node's
     * ordering against ALL group members in the given graphs.
     * The virtual group node encoding uses a single edge, but member-to-group
     * edges aren't present — so we must check member orderings directly.
     */
    static isBboxFeasibleInGraphs(
        bc: BoundingBoxConstraint,
        hGraph: DifferenceConstraintGraph,
        vGraph: DifferenceConstraintGraph,
    ): boolean {
        const nodeId = bc.node.id;
        const members = bc.group.nodeIds;
        switch (bc.side) {
            case 'left':
                for (const m of members) {
                    if (hGraph.isOrdered(m, nodeId)) return false;
                }
                return true;
            case 'right':
                for (const m of members) {
                    if (hGraph.isOrdered(nodeId, m)) return false;
                }
                return true;
            case 'top':
                for (const m of members) {
                    if (vGraph.isOrdered(m, nodeId)) return false;
                }
                return true;
            case 'bottom':
                for (const m of members) {
                    if (vGraph.isOrdered(nodeId, m)) return false;
                }
                return true;
        }
    }

    // wouldCreateAlignmentOrderingConflict and getClassMembers are no longer needed —
    // alignment conflicts are caught automatically by DifferenceConstraintGraph.addEdge
    // (which checks canReach for cycles through zero-weight alignment edges).

    /**
     * Find an alternative whose constraints are ALL already implied by the
     * current ordering graphs (forward direction is ordered or the alignment
     * already holds). Only such an alternative may be committed WITHOUT adding
     * its edges to the graphs — the facts are already entailed, so nothing can
     * later contradict them undetected.
     *
     * There is deliberately NO "merely not contradicted" fallback here. The
     * old fallback checked each constraint of an alternative against the
     * graphs individually and committed the alternative without edges; the
     * constraints could then contradict each other JOINTLY with the base
     * (e.g. a negated-group tuple N1 <x N2 <x N0 against base N0 <x N1),
     * producing a SAT verdict with an unsatisfiable committed constraint set.
     * Caught by the Z3 committed-model cross-check in z3-equivalence.test.ts.
     * Non-implied alternatives must go through the normal path, where commits
     * add graph edges (addConjunctiveConstraint / tryAssign).
     */
    private findImpliedAlternative(disj: DisjunctiveConstraint): number | null {
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

        this.rebuildBranchIndex(true);

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
                // Pruning reshapes allDisjunctions; refresh the simplicity terms
                // for the new shape but keep accumulated activity (the old
                // index-keyed Map behaved the same way).
                this.rebuildBranchIndex(false);
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

        // Fast bail: if the graphs haven't structurally changed since the last
        // 'ok' fixpoint, every feasibility verdict is unchanged, so the fixpoint
        // still holds. (Any assignment or backtrack that matters bumps a stamp;
        // an assignment whose edges were all already present changes nothing
        // the feasibility checks can observe.)
        if (this.combinedGraphStamp() === this.lastPropagateOkStamp) return 'ok';

        let changed = true;
        while (changed) {
            changed = false;
            // Apply reachability deltas accumulated since the last pass (from
            // decisions, unit propagation, backtracking, or tryAssigns made by
            // the previous pass) to the verdict cache. Mid-pass mutations leave
            // deltas pending until the next pass — sound, because a mid-pass
            // mutation means a tryAssign succeeded, which forces another pass
            // (and stale-FEASIBLE verdicts can only over-count, never force a
            // wrong alternative or fabricate a conflict).
            this.consumeGraphDeltas();

            for (let d = 0; d < this.allDisjunctions.length; d++) {
                if (assigned[d] !== -1) continue;

                const disj = this.allDisjunctions[d];
                // Re-read per disjunction, not per pass: a tryAssign below can
                // both add and REMOVE edges (a partially-applied alternative is
                // rolled back), and a stale remove-stamp would keep an
                // INFEASIBLE verdict alive across a removal — under-counting
                // feasible alternatives, which could fabricate a conflict.
                // Alternatives of one disjunction are only read, never mutated
                // between, so this granularity is exactly right.
                //
                // Zero-weight ordering edges break the monotonicity invariants
                // the cache relies on — bypass it entirely then (the memoized
                // reachability inside isAlternativeFeasible is still
                // exact-version-safe, so results stay correct, just slower).
                const bypassCache = this.hGraph.hasZeroWeightOrderingEdge
                    || this.vGraph.hasZeroWeightOrderingEdge;
                const curAdd = this.hGraph.addVersion + this.vGraph.addVersion;
                const curRem = this.hGraph.removeVersion + this.vGraph.removeVersion;
                let entry: AltVerdictEntry | null = null;
                if (!bypassCache) {
                    if (this.verdictEntryDisj[d] === disj) {
                        entry = this.verdictEntryByIndex[d];
                    } else {
                        entry = this.verdictEntryFor(disj);
                        this.verdictEntryDisj[d] = disj;
                        this.verdictEntryByIndex[d] = entry;
                    }
                }

                let feasibleCount = 0;
                let lastFeasibleIdx = -1;

                for (let a = 0; a < disj.alternatives.length; a++) {
                    const feasible = entry === null
                        ? this.isAlternativeFeasible(disj.alternatives[a])
                        : this.altFeasibleCached(disj, entry, a, curAdd, curRem);
                    if (feasible) {
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
        this.lastPropagateOkStamp = this.combinedGraphStamp();
        return 'ok';
    }

    private combinedGraphStamp(): number {
        // Stamps are globally unique and monotone, so this sum changes iff any
        // structural mutation happened on either graph (including checkpoint
        // restores, which install fresh graph objects with fresh stamps).
        return this.hGraph.addVersion + this.hGraph.removeVersion
            + this.vGraph.addVersion + this.vGraph.removeVersion;
    }

    /**
     * Pull reachability deltas from both graphs and dirty exactly the cached
     * feasible verdicts whose probes they hit. Unknown deltas (null) bump
     * additionEpoch, invalidating every probe-tracked feasible verdict.
     */
    private consumeGraphDeltas(): void {
        const hd = this.hGraph.consumeReachDeltas();
        const vd = this.vGraph.consumeReachDeltas();
        if (hd === null || vd === null) {
            this.additionEpoch++;
            return;
        }
        for (const d of hd) this.dirtyProbe('h', d.from, d.to);
        for (const d of vd) this.dirtyProbe('v', d.from, d.to);
    }

    private dirtyProbe(axis: 'h' | 'v', from: string, to: string): void {
        const hits = this.probeIndex.get(`${axis}\x00${from}\x00${to}`);
        if (!hits) return;
        for (const { entry, aIdx } of hits) {
            // Only feasible verdicts can be flipped by an addition; infeasible
            // ones are stable under additions (guarded by remStamp instead).
            if (entry.verdict[aIdx] === 1) entry.verdict[aIdx] = 0;
        }
    }

    /**
     * Register the fixed reachability probes that alternative aIdx's
     * feasibility depends on — mirrors isAlternativeFeasible's queries exactly:
     *   - Left/Top/BBox/GroupBoundary edge: canReach(edge.to, edge.from);
     *   - BBox additionally, per member m on the side's axis:
     *     areAligned(node, m) (both directions) and the isBboxFeasibleInGraphs
     *     isOrdered check (one of those directions).
     * Returns true if the alternative contains an AlignmentConstraint (dynamic
     * alignment-class probes — not trackable; falls back to add-stamp validity).
     */
    private registerProbes(entry: AltVerdictEntry, aIdx: number, alternative: LayoutConstraint[]): boolean {
        let hasAlignment = false;
        const add = (axis: 'h' | 'v', from: string, to: string): void => {
            const key = `${axis}\x00${from}\x00${to}`;
            let arr = this.probeIndex.get(key);
            if (!arr) { arr = []; this.probeIndex.set(key, arr); }
            arr.push({ entry, aIdx });
        };
        for (const constraint of alternative) {
            if (isAlignmentConstraint(constraint)) {
                hasAlignment = true;
                continue;
            }
            if (isBoundingBoxConstraint(constraint)) {
                const bc = constraint as BoundingBoxConstraint;
                const axis = (bc.side === 'left' || bc.side === 'right') ? 'h' : 'v';
                for (const m of bc.group.nodeIds) {
                    add(axis, bc.node.id, m);
                    add(axis, m, bc.node.id);
                }
            }
            const edge = this.constraintToEdge(constraint);
            if (edge) add(edge.axis, edge.to, edge.from);
        }
        return hasAlignment;
    }

    /** Fetch the verdict-cache entry for a disjunction, creating and registering its probes on first use. */
    private verdictEntryFor(disj: DisjunctiveConstraint): AltVerdictEntry {
        let entry = this.altVerdictCache.get(disj);
        if (!entry) {
            const n = disj.alternatives.length;
            entry = {
                verdict: new Int8Array(n),
                addStamp: new Float64Array(n),
                remStamp: new Float64Array(n),
                hasAlignment: new Uint8Array(n),
            };
            for (let a = 0; a < n; a++) {
                if (this.registerProbes(entry, a, disj.alternatives[a])) entry.hasAlignment[a] = 1;
            }
            this.altVerdictCache.set(disj, entry);
        }
        return entry;
    }

    /**
     * Cached isAlternativeFeasible for one alternative of an already-fetched
     * entry — validity rules documented at altVerdictCache. Split from the
     * entry lookup so the scan in graphPropagate pays one Map probe per
     * disjunction instead of one per alternative.
     */
    private altFeasibleCached(
        disj: DisjunctiveConstraint,
        entry: AltVerdictEntry,
        aIdx: number,
        curAdd: number,
        curRem: number,
    ): boolean {
        const addKey = entry.hasAlignment[aIdx] ? curAdd : this.additionEpoch;

        const v = entry.verdict[aIdx];
        // Feasible: stable under removals; add-side staleness is handled by
        // probe dirtying (verdict zeroed) or epoch/add-stamp mismatch.
        if (v === 1 && entry.addStamp[aIdx] === addKey) return true;
        // Infeasible: stable under additions; only removals can flip it.
        if (v === 2 && entry.remStamp[aIdx] === curRem) return false;

        const feasible = this.isAlternativeFeasible(disj.alternatives[aIdx]);
        entry.verdict[aIdx] = feasible ? 1 : 2;
        entry.addStamp[aIdx] = addKey;
        entry.remStamp[aIdx] = curRem;
        return feasible;
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

    /**
     * Undo of addQualitativeEdge, releasing exactly the claims that add took
     * (claim-based so shared edges survive — see removeEdgeClaim). The
     * BoundingBox case mirrors the add's Rule C loop: the add creates the
     * node↔group edge AND per-member edges, so the undo must release the
     * member claims too — the old code removed only the group edge, leaving
     * the member edges behind after backtracking (over-constrained graph).
     */
    private removeQualitativeEdge(constraint: LayoutConstraint): void {
        if (isLeftConstraint(constraint)) {
            this.hGraph.removeEdgeClaim(constraint.left.id, constraint.right.id, constraint.minDistance, constraint);
        } else if (isTopConstraint(constraint)) {
            this.vGraph.removeEdgeClaim(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint);
        } else if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const groupId = `_group_${bc.group.name}`;
            switch (bc.side) {
                case 'left':
                    this.hGraph.removeEdgeClaim(bc.node.id, groupId, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) this.hGraph.removeEdgeClaim(bc.node.id, mId, bc.minDistance, constraint);
                    break;
                case 'right':
                    this.hGraph.removeEdgeClaim(groupId, bc.node.id, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) this.hGraph.removeEdgeClaim(mId, bc.node.id, bc.minDistance, constraint);
                    break;
                case 'top':
                    this.vGraph.removeEdgeClaim(bc.node.id, groupId, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) this.vGraph.removeEdgeClaim(bc.node.id, mId, bc.minDistance, constraint);
                    break;
                case 'bottom':
                    this.vGraph.removeEdgeClaim(groupId, bc.node.id, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) this.vGraph.removeEdgeClaim(mId, bc.node.id, bc.minDistance, constraint);
                    break;
            }
        } else if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const gAId = `_group_${gc.groupA.name}`;
            const gBId = `_group_${gc.groupB.name}`;
            switch (gc.side) {
                case 'left':   this.hGraph.removeEdgeClaim(gAId, gBId, gc.minDistance, constraint); break;
                case 'right':  this.hGraph.removeEdgeClaim(gBId, gAId, gc.minDistance, constraint); break;
                case 'top':    this.vGraph.removeEdgeClaim(gAId, gBId, gc.minDistance, constraint); break;
                case 'bottom': this.vGraph.removeEdgeClaim(gBId, gAId, gc.minDistance, constraint); break;
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

    /**
     * (Re)build the flat branching arrays for the current allDisjunctions.
     * `reset` zeroes activity (start of a solve); restarts keep it.
     * The stride only ever grows, so an alternative's slot keeps its (d, a)
     * identity — matching the old index-keyed activity Map.
     */
    private rebuildBranchIndex(reset: boolean): void {
        const numD = this.allDisjunctions.length;
        let maxAlts = 1;
        for (const disj of this.allDisjunctions) {
            if (disj.alternatives.length > maxAlts) maxAlts = disj.alternatives.length;
        }

        if (maxAlts > this.branchStride) {
            const oldStride = this.branchStride;
            const oldAct = this.activityFlat;
            this.branchStride = maxAlts;
            this.activityFlat = new Float64Array(Math.max(numD, 1) * maxAlts);
            if (oldStride > 0 && !reset) {
                const oldD = Math.floor(oldAct.length / oldStride);
                for (let d = 0; d < oldD && d < numD; d++) {
                    for (let a = 0; a < oldStride; a++) {
                        this.activityFlat[d * maxAlts + a] = oldAct[d * oldStride + a];
                    }
                }
            }
        } else if (numD * this.branchStride > this.activityFlat.length) {
            const grown = new Float64Array(numD * this.branchStride);
            if (!reset) grown.set(this.activityFlat);
            this.activityFlat = grown;
        } else if (reset) {
            this.activityFlat.fill(0);
        }

        const size = Math.max(numD, 1) * this.branchStride;
        if (this.simplicityFlat.length < size) {
            this.simplicityFlat = new Float64Array(size);
            this.elimScratch = new Uint8Array(size);
        }
        this.simplicityFlat.fill(0);
        for (let d = 0; d < numD; d++) {
            const alts = this.allDisjunctions[d].alternatives;
            const base = d * this.branchStride;
            for (let a = 0; a < alts.length; a++) {
                this.simplicityFlat[base + a] = 1.0 / (1 + alts[a].length);
            }
        }
    }

    /** Activity for (d, a), 0 when out of range — mirrors the old `?? 0`. */
    private activityAt(d: number, a: number): number {
        const i = d * this.branchStride + a;
        return i >= 0 && i < this.activityFlat.length ? this.activityFlat[i] : 0;
    }

    /**
     * Mark alternatives eliminated by learned clauses, for ALL disjunctions in
     * one pass over the clause list. getRemainingAlternatives did this per
     * disjunction — O(D · C · L) per pickBranch call, allocating a Set and an
     * array each time; this is O(C · L) into a reused bitmap. Returns null
     * when there are no learned clauses (nothing can be eliminated).
     */
    private computeEliminatedFlags(assigned: Int32Array): Uint8Array | null {
        if (this.learnedClauses.length === 0) return null;
        const elim = this.elimScratch;
        elim.fill(0);
        const stride = this.branchStride;
        for (const clause of this.learnedClauses) {
            for (const lit of clause) {
                if (lit.sign) continue;
                const idx = lit.disjunctionIndex * stride + lit.alternativeIndex;
                // Stale index from a pre-restart clause, or already eliminated.
                if (idx < 0 || idx >= elim.length || elim[idx] === 1) continue;
                let allOthersFalse = true;
                for (const l of clause) {
                    if (l === lit) continue;
                    const cur = assigned[l.disjunctionIndex];
                    if (cur === -1
                        || (l.sign ? cur === l.alternativeIndex : cur !== l.alternativeIndex)) {
                        allOthersFalse = false;
                        break;
                    }
                }
                if (allOthersFalse) elim[idx] = 1;
            }
        }
        return elim;
    }

    private pickBranch(assigned: Int32Array): { dIdx: number; aIdx: number } {
        let bestDIdx = -1, bestAIdx = -1, bestScore = -1;
        const elim = this.computeEliminatedFlags(assigned);
        const stride = this.branchStride;

        for (let d = 0; d < this.allDisjunctions.length; d++) {
            if (assigned[d] !== -1) continue;
            const alts = this.allDisjunctions[d].alternatives;
            const base = d * stride;
            for (let a = 0; a < alts.length; a++) {
                // Only consider alternatives not eliminated by learned clauses
                if (elim !== null && elim[base + a] === 1) continue;
                const score = this.activityFlat[base + a] + this.simplicityFlat[base + a];
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
            const i = lit.disjunctionIndex * this.branchStride + lit.alternativeIndex;
            if (i >= 0 && i < this.activityFlat.length) this.activityFlat[i] += 1;
        }
    }

    private decayActivity(): void {
        // Multiply-all, same as the old Map sweep (zero slots are unaffected),
        // so branching order is bit-for-bit what it was.
        const act = this.activityFlat;
        const decay = this.activityDecay;
        for (let i = 0; i < act.length; i++) act[i] *= decay;
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
            const impliedAlt = this.findImpliedAlternative(disj);
            if (impliedAlt !== null) {
                for (const c of disj.alternatives[impliedAlt]) this.addedConstraints.push(c);
                continue;
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
        // The restored graphs are fresh objects with fresh stamps and empty
        // delta accumulators; drop all cached verdicts and probes (restarts
        // are rare, and pruneDisjunctions rebuilds the disjunction objects
        // anyway). Also covers the corner where a restore re-introduces an
        // edge that an undo path had over-eagerly removed.
        this.altVerdictCache.clear();
        this.probeIndex.clear();
        this.verdictEntryByIndex.length = 0;
        this.verdictEntryDisj.length = 0;
        this.additionEpoch++;
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

    /**
     * Like addEdgeToGraphs but expands BoundingBox constraints to per-member
     * edges instead of using virtual group nodes. This gives correct cycle
     * detection for cross-group conflicts (e.g., Cell4 in both groups).
     *
     * - BoundingBox 'left':   node → each member (node left of each member)
     * - BoundingBox 'right':  each member → node (node right of each member)
     * - BoundingBox 'top':    node → each member on V axis
     * - BoundingBox 'bottom': each member → node on V axis
     */
    private static addEdgeToGraphsExpanded(
        constraint: LayoutConstraint,
        hGraph: DifferenceConstraintGraph,
        vGraph: DifferenceConstraintGraph,
    ): boolean {
        if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const nodeId = bc.node.id;
            for (const memberId of bc.group.nodeIds) {
                switch (bc.side) {
                    case 'left':
                        if (!hGraph.addEdge(nodeId, memberId, bc.minDistance, constraint)) return false;
                        break;
                    case 'right':
                        if (!hGraph.addEdge(memberId, nodeId, bc.minDistance, constraint)) return false;
                        break;
                    case 'top':
                        if (!vGraph.addEdge(nodeId, memberId, bc.minDistance, constraint)) return false;
                        break;
                    case 'bottom':
                        if (!vGraph.addEdge(memberId, nodeId, bc.minDistance, constraint)) return false;
                        break;
                }
            }
            return true;
        }
        if (isGroupBoundaryConstraint(constraint)) {
            // Expand GroupBoundary to pairwise edges between group members
            const gc = constraint as GroupBoundaryConstraint;
            for (const aId of gc.groupA.nodeIds) {
                for (const bId of gc.groupB.nodeIds) {
                    switch (gc.side) {
                        case 'left':
                            if (!hGraph.addEdge(aId, bId, gc.minDistance, constraint)) return false;
                            break;
                        case 'right':
                            if (!hGraph.addEdge(bId, aId, gc.minDistance, constraint)) return false;
                            break;
                        case 'top':
                            if (!vGraph.addEdge(aId, bId, gc.minDistance, constraint)) return false;
                            break;
                        case 'bottom':
                            if (!vGraph.addEdge(bId, aId, gc.minDistance, constraint)) return false;
                            break;
                    }
                }
            }
            return true;
        }
        // Left, Top, Alignment — delegate to instance method's static logic
        if (isLeftConstraint(constraint)) return hGraph.addEdge(constraint.left.id, constraint.right.id, constraint.minDistance, constraint);
        if (isTopConstraint(constraint)) return vGraph.addEdge(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint);
        if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            const graph = ac.axis === 'x' ? hGraph : vGraph;
            if (!graph.addAlignmentEdges(ac.node1.id, ac.node2.id, constraint)) return false;
            if (ac.node1.id !== ac.node2.id) {
                const otherGraph = ac.axis === 'x' ? vGraph : hGraph;
                if (QualitativeConstraintValidator.classHasDualAxisOverlap(
                    graph, otherGraph, ac.node1.id, ac.node2.id, true,
                )) {
                    graph.removeAlignmentEdges(ac.node1.id, ac.node2.id);
                    return false;
                }
            }
            return true;
        }
        return true;
    }

    /**
     * Rank how strongly an alternative is already entailed by the current graphs:
     *   0 = directly entailed   — every ordering it would impose already exists
     *       as a direct edge (and every alignment already holds). The separation
     *       is *explicitly asserted* by existing constraints, not merely derived.
     *   1 = transitively entailed — every ordering holds via reachability, but at
     *       least one only transitively (no direct edge).
     *   2 = not entailed — it would introduce at least one new ordering/alignment.
     *
     * The maximal-feasible-subset builder prefers lower ranks so a node stays on
     * the side it *already* sits, favouring the side asserted by direct user
     * constraints. Without this it picks the first merely-addable side in
     * [left, right, top, bottom] order — which both mis-renders (e.g. a BDD root
     * shoved right of its children) and pollutes the conflict explanation: a
     * redundant group-separation edge short-circuits the real orientation cycle
     * during IIS path tracing, so the reported conflict names an auto-generated
     * group constraint instead of the user's own orientation constraints.
     *
     * Mirrors the edge enumeration of `addEdgeToGraphsExpanded`, but inspects
     * `hasEdge`/`isOrdered`/`areAligned` instead of mutating the graphs.
     */
    private static alternativeEntailmentRank(
        alternative: LayoutConstraint[],
        hGraph: DifferenceConstraintGraph,
        vGraph: DifferenceConstraintGraph,
    ): 0 | 1 | 2 {
        // Orderings (graph, from, to) this alternative would impose.
        const edges: { g: DifferenceConstraintGraph; from: string; to: string }[] = [];
        for (const constraint of alternative) {
            if (isBoundingBoxConstraint(constraint)) {
                const bc = constraint as BoundingBoxConstraint;
                for (const m of bc.group.nodeIds) {
                    switch (bc.side) {
                        case 'left':   edges.push({ g: hGraph, from: bc.node.id, to: m }); break;
                        case 'right':  edges.push({ g: hGraph, from: m, to: bc.node.id }); break;
                        case 'top':    edges.push({ g: vGraph, from: bc.node.id, to: m }); break;
                        case 'bottom': edges.push({ g: vGraph, from: m, to: bc.node.id }); break;
                    }
                }
            } else if (isGroupBoundaryConstraint(constraint)) {
                const gc = constraint as GroupBoundaryConstraint;
                for (const aId of gc.groupA.nodeIds) {
                    for (const bId of gc.groupB.nodeIds) {
                        switch (gc.side) {
                            case 'left':   edges.push({ g: hGraph, from: aId, to: bId }); break;
                            case 'right':  edges.push({ g: hGraph, from: bId, to: aId }); break;
                            case 'top':    edges.push({ g: vGraph, from: aId, to: bId }); break;
                            case 'bottom': edges.push({ g: vGraph, from: bId, to: aId }); break;
                        }
                    }
                }
            } else if (isLeftConstraint(constraint)) {
                edges.push({ g: hGraph, from: constraint.left.id, to: constraint.right.id });
            } else if (isTopConstraint(constraint)) {
                edges.push({ g: vGraph, from: constraint.top.id, to: constraint.bottom.id });
            } else if (isAlignmentConstraint(constraint)) {
                const ac = constraint as AlignmentConstraint;
                const graph = ac.axis === 'x' ? hGraph : vGraph;
                // An alignment that doesn't already hold introduces a new constraint.
                if (ac.node1.id !== ac.node2.id && !graph.areAligned(ac.node1.id, ac.node2.id)) return 2;
            }
        }
        let allDirect = true;
        for (const e of edges) {
            if (e.g.hasEdge(e.from, e.to)) continue;   // directly asserted
            allDirect = false;
            if (!e.g.isOrdered(e.from, e.to)) return 2; // not even reachable → new
        }
        return allDirect ? 0 : 1;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Maximal feasible subset
    // ═══════════════════════════════════════════════════════════════════════════

    private computeMaximalFeasibleSubset(): {
        feasibleConstraints: LayoutConstraint[];
        infeasibleDisjunctions: DisjunctiveConstraint[];
        hGraph: DifferenceConstraintGraph;
        vGraph: DifferenceConstraintGraph;
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
            // Use expanded encoding: BoundingBox/GroupBoundary are expanded to
            // per-member edges so cross-group conflicts are detected correctly.
            const ok = QualitativeConstraintValidator.addEdgeToGraphsExpanded(
                constraint, freshH, freshV);
            if (ok) feasibleConstraints.push(constraint);
        }
        const infeasibleDisjunctions: DisjunctiveConstraint[] = [];

        // Use originalDisjunctions (pre-presolve snapshot) so that disjunctions
        // resolved/committed by presolve are re-evaluated from scratch. This ensures
        // computeMaximalFeasibleSubset works with the full constraint set.
        const disjSource = this.originalDisjunctions.length > 0
            ? this.originalDisjunctions
            : this.allDisjunctions;
        const sortedDisjunctions = [...disjSource].sort((a, b) => {
            const aIdx = disjSource.indexOf(a);
            const bIdx = disjSource.indexOf(b);
            const aMax = Math.max(...a.alternatives.map((_, ai) => this.activityAt(aIdx, ai)));
            const bMax = Math.max(...b.alternatives.map((_, bi) => this.activityAt(bIdx, bi)));
            // Stable tiebreaker: use original index when activity scores are equal
            return aMax - bMax || aIdx - bIdx;
        });

        for (const disj of sortedDisjunctions) {
            let added = false;
            // Prefer an alternative whose separation already holds in the current
            // graphs (adds no new ordering) over the first merely-addable one, and
            // among those prefer the side asserted by *direct* edges. This keeps a
            // node on the side it already sits — e.g. a BDD root that is already
            // above its children stays "top" instead of being shoved "right" — and
            // matches presolve's already-separated behaviour. Picking the directly
            // -entailed side also avoids adding a redundant separation edge that
            // would short-circuit the real orientation cycle when the conflict is
            // later explained. Stable sort by rank, original order within a rank.
            const orderedAlternatives = disj.alternatives
                .map((alt, i) => ({ alt, i, rank: QualitativeConstraintValidator.alternativeEntailmentRank(alt, freshH, freshV) }))
                .sort((a, b) => a.rank - b.rank || a.i - b.i);
            for (const { alt: alternative } of orderedAlternatives) {
                const hClone = freshH.clone();
                const vClone = freshV.clone();
                let ok = true;
                for (const constraint of alternative) {
                    // For BoundingBox constraints, expand to per-member edges
                    // instead of using virtual group nodes. This captures the
                    // actual member positions so cross-group conflicts are detected.
                    if (!QualitativeConstraintValidator.addEdgeToGraphsExpanded(
                        constraint, hClone, vClone)) {
                        ok = false; break;
                    }
                }
                if (ok) {
                    for (const constraint of alternative) {
                        QualitativeConstraintValidator.addEdgeToGraphsExpanded(
                            constraint, freshH, freshV);
                        feasibleConstraints.push(constraint);
                    }
                    added = true;
                    break;
                }
            }
            if (!added) infeasibleDisjunctions.push(disj);
        }

        return { feasibleConstraints, infeasibleDisjunctions, hGraph: freshH, vGraph: freshV };
    }

    private addEdgeToGraphs(constraint: LayoutConstraint, hGraph: DifferenceConstraintGraph, vGraph: DifferenceConstraintGraph): boolean {
        if (isLeftConstraint(constraint)) return hGraph.addEdge(constraint.left.id, constraint.right.id, constraint.minDistance, constraint);
        if (isTopConstraint(constraint)) return vGraph.addEdge(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint);
        if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            const graph = ac.axis === 'x' ? hGraph : vGraph;
            if (!graph.addAlignmentEdges(ac.node1.id, ac.node2.id, constraint)) return false;
            // Dual-axis alignment forces overlap between nonzero-size nodes
            if (ac.node1.id !== ac.node2.id) {
                const otherGraph = ac.axis === 'x' ? vGraph : hGraph;
                if (QualitativeConstraintValidator.classHasDualAxisOverlap(
                    graph, otherGraph, ac.node1.id, ac.node2.id, true,
                )) {
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
        const { feasibleConstraints, infeasibleDisjunctions, hGraph: _h, vGraph: _v } = this.computeMaximalFeasibleSubset();

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

                    // Find alignment chains connecting n1↔n2 on each axis.
                    // Both chains together form the minimal conflicting set;
                    // breaking either chain resolves the overlap.
                    const xChain = this.findAlignmentPath(n1.id, n2.id, 'x');
                    const yChain = this.findAlignmentPath(n1.id, n2.id, 'y');
                    const allConflicting = [...xChain, ...yChain];

                    const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
                    const htmlMap = new Map<string, string[]>();
                    for (const c of allConflicting) {
                        const src = c.sourceConstraint;
                        if (!minimalConflictingSet.has(src)) minimalConflictingSet.set(src, []);
                        minimalConflictingSet.get(src)!.push(c);
                        const html = src.toHTML();
                        if (!htmlMap.has(html)) htmlMap.set(html, []);
                        htmlMap.get(html)!.push(orientationConstraintToString(c));
                    }

                    // MFS: remove the minimum constraints from one axis to break
                    // the dual-axis alignment. Pick the cheaper axis.
                    const toRemove = xChain.length > 0 && xChain.length <= yChain.length
                        ? this.findConstraintsToBreakAlignment(n1.id, n2.id, 'x')
                        : this.findConstraintsToBreakAlignment(n1.id, n2.id, 'y');
                    const removeSet = new Set(toRemove);
                    const maxFeasible = this.addedConstraints.filter(c => !removeSet.has(c));

                    const first = allConflicting[0] || this.addedConstraints[0];
                    return {
                        name: 'PositionalConstraintError', type: 'positional-conflict',
                        message: `Alignment constraints force ${n1.id} and ${n2.id} to occupy the same position`,
                        conflictingConstraint: first, conflictingSourceConstraint: first.sourceConstraint,
                        minimalConflictingSet,
                        maximalFeasibleSubset: maxFeasible,
                        errorMessages: {
                            conflictingConstraint: orientationConstraintToString(first),
                            conflictingSourceConstraint: first.sourceConstraint.toHTML(),
                            minimalConflictingConstraints: htmlMap,
                        },
                    };
                }
            }
        }
        return null;
    }

    /**
     * BFS to find the alignment constraint path connecting two nodes on a given axis.
     */
    private findAlignmentPath(nodeA: string, nodeB: string, axis: 'x' | 'y'): LayoutConstraint[] {
        const adj = new Map<string, { neighbor: string; constraint: LayoutConstraint }[]>();
        for (const c of this.addedConstraints) {
            if (!isAlignmentConstraint(c)) continue;
            const ac = c as AlignmentConstraint;
            if (ac.axis !== axis) continue;
            const a = ac.node1.id, b = ac.node2.id;
            if (!adj.has(a)) adj.set(a, []);
            if (!adj.has(b)) adj.set(b, []);
            adj.get(a)!.push({ neighbor: b, constraint: c });
            adj.get(b)!.push({ neighbor: a, constraint: c });
        }
        const visited = new Set<string>([nodeA]);
        const parent = new Map<string, { node: string; constraint: LayoutConstraint } | null>();
        parent.set(nodeA, null);
        const queue = [nodeA];
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === nodeB) {
                const result: LayoutConstraint[] = [];
                let node = nodeB;
                while (parent.get(node) !== null) {
                    const p = parent.get(node)!;
                    result.push(p.constraint);
                    node = p.node;
                }
                return result.reverse();
            }
            for (const { neighbor, constraint } of adj.get(current) || []) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    parent.set(neighbor, { node: current, constraint });
                    queue.push(neighbor);
                }
            }
        }
        return [];
    }

    /**
     * Find the minimum set of alignment constraints to remove on one axis
     * so that nodeA and nodeB are no longer aligned.
     */
    private findConstraintsToBreakAlignment(nodeA: string, nodeB: string, axis: 'x' | 'y'): LayoutConstraint[] {
        const axisAlignments = this.addedConstraints.filter(c =>
            isAlignmentConstraint(c) && (c as AlignmentConstraint).axis === axis
        );

        const connected = (excluded: Set<LayoutConstraint>): boolean => {
            const adj = new Map<string, string[]>();
            for (const c of axisAlignments) {
                if (excluded.has(c)) continue;
                const ac = c as AlignmentConstraint;
                if (!adj.has(ac.node1.id)) adj.set(ac.node1.id, []);
                if (!adj.has(ac.node2.id)) adj.set(ac.node2.id, []);
                adj.get(ac.node1.id)!.push(ac.node2.id);
                adj.get(ac.node2.id)!.push(ac.node1.id);
            }
            const visited = new Set<string>([nodeA]);
            const queue = [nodeA];
            while (queue.length > 0) {
                const cur = queue.shift()!;
                if (cur === nodeB) return true;
                for (const nb of adj.get(cur) || []) {
                    if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
                }
            }
            return false;
        };

        // Try single-constraint removal first (covers tree-shaped alignment graphs)
        for (const c of axisAlignments) {
            if (!connected(new Set([c]))) return [c];
        }

        // Redundant alignment edges — greedily remove until disconnected
        const toRemove = new Set<LayoutConstraint>();
        for (const c of axisAlignments) {
            toRemove.add(c);
            if (!connected(toRemove)) return [...toRemove];
        }
        return [...toRemove];
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Check if an alignment class on `graph` has any node pair that is also
     * aligned on `otherGraph`, creating a dual-axis overlap.
     *
     * When `alreadyAdded` is true, the alignment edges are already in `graph`.
     * When false, compute the hypothetical merged class of node1 and node2.
     */
    private static classHasDualAxisOverlap(
        graph: DifferenceConstraintGraph,
        otherGraph: DifferenceConstraintGraph,
        node1Id: string,
        node2Id: string,
        alreadyAdded: boolean,
    ): boolean {
        let cls: string[];
        if (alreadyAdded) {
            cls = graph.getAlignmentClassOf(node1Id);
        } else {
            const clsA = graph.getAlignmentClassOf(node1Id);
            const clsB = graph.getAlignmentClassOf(node2Id);
            cls = [...new Set([...clsA, ...clsB])];
        }
        for (let i = 0; i < cls.length; i++) {
            for (let j = i + 1; j < cls.length; j++) {
                if (otherGraph.areAligned(cls[i], cls[j])) return true;
            }
        }
        return false;
    }

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
        this.activityFlat = new Float64Array(0);
        this.simplicityFlat = new Float64Array(0);
        this.elimScratch = new Uint8Array(0);
        this.branchStride = 0;
        this.assignmentTrail = [];
        this.altVerdictCache.clear();
        this.probeIndex.clear();
        this.verdictEntryByIndex.length = 0;
        this.verdictEntryDisj.length = 0;
        this.lastPropagateOkStamp = -1;
        // The must-pair sets are O(n²) and were the largest thing this method
        // left behind; dropping them also stops modal getters answering from a
        // disposed validator.
        this.resetModalQueryState();
    }

    public getStats(): {
        hEdges: number; vEdges: number;
        learnedClauses: number; conflicts: number; addedConstraints: number;
        prunedByTransitivity: number; prunedByDecomposition: number;
    } {
        return {
            hEdges: this.hGraph.edgeCount(),
            vEdges: this.vGraph.edgeCount(),
            learnedClauses: this.learnedClauses.length,
            conflicts: this.conflictCount,
            addedConstraints: this.addedConstraints.length,
            prunedByTransitivity: this.prunedByTransitivity,
            prunedByDecomposition: this.prunedByDecomposition,
        };
    }
    // ─── Modal query computation ────────────────────────────────────────────

    /**
     * Build modal state on first use. Safe to defer past validation because
     * buildModalQueryState reads only the must-graph snapshots (taken before
     * CDCL) and this.allDisjunctions (final after solveCDCL) — neither
     * changes after validatePositionalConstraints returns.
     *
     * Gated on validationSucceeded, NOT merely on the snapshots being present:
     * they are taken at Phase 4b, before CDCL, so a later failure (CDCL UNSAT,
     * node overlap) would otherwise leave them populated for a rejected layout
     * and this deferred build would answer must/cannot queries about a
     * constraint system enforceMaximalFeasibleSubset already replaced. When
     * the eager build lived at Phase 5b it simply never ran on the CDCL-UNSAT
     * path; this restores that, and extends it to the overlap path.
     *
     * enforceMaximalFeasibleSubset also nulls the snapshots, which is what
     * covers the getters that read the must-graphs directly. This flag is the
     * belt to that braces: it keeps the build correct even for a future error
     * path that forgets to route through there.
     */
    private modalStateBuilt = false;

    /**
     * Drop every piece of modal state: the pre-CDCL graph snapshots, the
     * derived pair/alignment-class sets, and the two flags. Kept in one place
     * because the getters consult different halves of it — clearing only the
     * graphs leaves getMust answering from the derived sets, and clearing only
     * the sets leaves getCannot answering from the graphs.
     */
    private resetModalQueryState(): void {
        this.mustHGraph = null;
        this.mustVGraph = null;
        this.mustHPairs = null;
        this.mustVPairs = null;
        this.mustHAlignmentClasses = null;
        this.mustVAlignmentClasses = null;
        this.modalStateBuilt = false;
        this.validationSucceeded = false;
    }

    private ensureModalQueryState(): void {
        if (this.modalStateBuilt || !this.validationSucceeded) return;
        if (!this.mustHGraph || !this.mustVGraph) return;
        this.modalStateBuilt = true;
        this.buildModalQueryState();
    }

    /**
     * Build the precomputed must-ordering pairs by:
     * 1. Starting with the conjunctive base (post-presolve snapshot)
     * 2. Strengthening via disjunction intersection: for each remaining disjunction,
     *    compute which orderings ALL alternatives agree on
     *
     * Called once, lazily, via ensureModalQueryState.
     */
    private buildModalQueryState(): void {
        if (!this.mustHGraph || !this.mustVGraph) return;

        const realNodeIds = this.nodes.map(n => n.id);

        // Step 1: Collect pairs already forced by conjunctive base
        this.mustHPairs = this.collectStrictPairs(this.mustHGraph, realNodeIds);
        this.mustVPairs = this.collectStrictPairs(this.mustVGraph, realNodeIds);

        // Step 2: Strengthen via disjunction intersection
        // For each remaining disjunction (those with ≥2 alternatives after presolve),
        // check if ALL alternatives unanimously force additional orderings.
        for (const disj of this.allDisjunctions) {
            if (disj.alternatives.length < 2) continue;
            this.strengthenWithDisjunction(disj, realNodeIds);
        }

        // Step 3: Precompute alignment classes from the must graphs
        this.mustHAlignmentClasses = this.collectAlignmentClasses(this.mustHGraph, realNodeIds);
        this.mustVAlignmentClasses = this.collectAlignmentClasses(this.mustVGraph, realNodeIds);
    }

    /**
     * Collect the pairs this graph forces into a proper spatial relation:
     * a sits entirely before b, which is what getMust reports as "a is left of
     * / above b". Deliberately isProperlyBefore and not isStrictlyOrdered —
     * the latter only entails coord_a < coord_b, which for a box wider than
     * the forced separation still leaves a overlapping b's span.
     */
    private collectStrictPairs(graph: DifferenceConstraintGraph, nodeIds: string[]): Set<string> {
        const pairs = new Set<string>();
        for (const a of nodeIds) {
            for (const b of nodeIds) {
                if (a !== b && graph.isProperlyBefore(a, b)) {
                    pairs.add(`${a}\x00${b}`);
                }
            }
        }
        return pairs;
    }

    /** Collect alignment equivalence classes from a graph (one SCC pass). */
    private collectAlignmentClasses(graph: DifferenceConstraintGraph, nodeIds: string[]): Map<string, Set<string>> {
        const classes = new Map<string, Set<string>>();
        const realSet = new Set(nodeIds);
        for (const id of nodeIds) classes.set(id, new Set());
        for (const [, members] of graph.getAlignmentClasses()) {
            const real = members.filter(m => realSet.has(m));
            for (const m of real) {
                const set = classes.get(m);
                if (!set) continue;
                for (const other of real) {
                    if (other !== m) set.add(other);
                }
            }
        }
        return classes;
    }

    /**
     * For a disjunction with multiple alternatives, compute orderings that
     * ALL alternatives unanimously force and add them to the must sets.
     *
     * Algorithm: for each alternative, clone the conjunctive graph, add the
     * alternative's edges, collect strict pairs. Intersect across all alternatives.
     * Any pair in the intersection that isn't already in mustPairs is a new must fact.
     */
    private strengthenWithDisjunction(disj: DisjunctiveConstraint, realNodeIds: string[]): void {
        if (!this.mustHGraph || !this.mustVGraph || !this.mustHPairs || !this.mustVPairs) return;

        let hIntersection: Set<string> | null = null;
        let vIntersection: Set<string> | null = null;
        let hAlignIntersection: Set<string> | null = null;
        let vAlignIntersection: Set<string> | null = null;

        for (const alt of disj.alternatives) {
            // Clone conjunctive graphs and add this alternative's edges
            const tempH = this.mustHGraph.clone();
            const tempV = this.mustVGraph.clone();

            for (const constraint of alt) {
                this.addEdgeToGraph(constraint, tempH, tempV);
            }

            // Collect strict ordering pairs from this alternative
            const altHPairs = this.collectStrictPairs(tempH, realNodeIds);
            const altVPairs = this.collectStrictPairs(tempV, realNodeIds);

            // Collect alignment pairs from this alternative (encoded as "a\x00b" with a < b)
            const altHAligns = this.collectAlignmentPairs(tempH, realNodeIds);
            const altVAligns = this.collectAlignmentPairs(tempV, realNodeIds);

            if (hIntersection === null) {
                hIntersection = altHPairs;
                vIntersection = altVPairs;
                hAlignIntersection = altHAligns;
                vAlignIntersection = altVAligns;
            } else {
                // Intersect: keep only pairs present in ALL alternatives
                for (const p of hIntersection) {
                    if (!altHPairs.has(p)) hIntersection.delete(p);
                }
                for (const p of vIntersection!) {
                    if (!altVPairs.has(p)) vIntersection!.delete(p);
                }
                for (const p of hAlignIntersection!) {
                    if (!altHAligns.has(p)) hAlignIntersection!.delete(p);
                }
                for (const p of vAlignIntersection!) {
                    if (!altVAligns.has(p)) vAlignIntersection!.delete(p);
                }
            }
        }

        // Add universally forced strict ordering pairs to must sets AND must graphs
        if (hIntersection) {
            for (const p of hIntersection) {
                this.mustHPairs.add(p);
                // Also add edge to must graph so getCannot (canReach) sees it
                const [a, b] = p.split('\x00');
                this.mustHGraph.addEdge(a, b, 1); // minimal positive weight
            }
        }
        if (vIntersection) {
            for (const p of vIntersection) {
                this.mustVPairs.add(p);
                const [a, b] = p.split('\x00');
                this.mustVGraph.addEdge(a, b, 1);
            }
        }

        // Add universally forced alignments to must graphs
        if (hAlignIntersection) {
            for (const p of hAlignIntersection) {
                const [a, b] = p.split('\x00');
                this.mustHGraph.addAlignmentEdges(a, b);
            }
        }
        if (vAlignIntersection) {
            for (const p of vAlignIntersection) {
                const [a, b] = p.split('\x00');
                this.mustVGraph.addAlignmentEdges(a, b);
            }
        }
    }

    /** Collect alignment pairs from a graph (canonical "a\x00b" with a < b). */
    private collectAlignmentPairs(graph: DifferenceConstraintGraph, nodeIds: string[]): Set<string> {
        const pairs = new Set<string>();
        for (let i = 0; i < nodeIds.length; i++) {
            for (let j = i + 1; j < nodeIds.length; j++) {
                if (graph.areAligned(nodeIds[i], nodeIds[j])) {
                    pairs.add(`${nodeIds[i]}\x00${nodeIds[j]}`);
                }
            }
        }
        return pairs;
    }

    /**
     * Add a constraint's edges to temporary graphs (for disjunction analysis).
     * Simplified version of addQualitativeEdge — doesn't check cycles (we just
     * want to see what orderings the constraint creates, not enforce feasibility).
     */
    private addEdgeToGraph(constraint: LayoutConstraint, hGraph: DifferenceConstraintGraph, vGraph: DifferenceConstraintGraph): void {
        if (isLeftConstraint(constraint)) {
            hGraph.addEdge(constraint.left.id, constraint.right.id, constraint.minDistance, constraint);
        } else if (isTopConstraint(constraint)) {
            vGraph.addEdge(constraint.top.id, constraint.bottom.id, constraint.minDistance, constraint);
        } else if (isAlignmentConstraint(constraint)) {
            const ac = constraint as AlignmentConstraint;
            const graph = ac.axis === 'x' ? hGraph : vGraph;
            graph.addAlignmentEdges(ac.node1.id, ac.node2.id, constraint);
        } else if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const gId = `_group_${bc.group.name}`;
            hGraph.ensureNode(gId); vGraph.ensureNode(gId);
            switch (bc.side) {
                case 'left':
                    hGraph.addEdge(bc.node.id, gId, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) { hGraph.ensureNode(mId); hGraph.addEdge(bc.node.id, mId, bc.minDistance, constraint); }
                    break;
                case 'right':
                    hGraph.addEdge(gId, bc.node.id, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) { hGraph.ensureNode(mId); hGraph.addEdge(mId, bc.node.id, bc.minDistance, constraint); }
                    break;
                case 'top':
                    vGraph.addEdge(bc.node.id, gId, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) { vGraph.ensureNode(mId); vGraph.addEdge(bc.node.id, mId, bc.minDistance, constraint); }
                    break;
                case 'bottom':
                    vGraph.addEdge(gId, bc.node.id, bc.minDistance, constraint);
                    for (const mId of bc.group.nodeIds) { vGraph.ensureNode(mId); vGraph.addEdge(mId, bc.node.id, bc.minDistance, constraint); }
                    break;
            }
        }
    }

    // ─── Public modal query API ──────────────────────────────────────────────

    private static pairKey(a: string, b: string): string { return `${a}\x00${b}`; }

    /**
     * Nodes that MUST be in `relation` to `nodeId` — true in ALL valid layouts.
     * Derived from conjunctive entailment + disjunction intersection.
     */
    public getMust(nodeId: string, relation: 'leftOf' | 'rightOf' | 'above' | 'below'): Set<string> {
        this.ensureModalQueryState();
        const realNodeIds = new Set(this.nodes.map(n => n.id));
        const result = new Set<string>();
        if (!this.mustHPairs || !this.mustVPairs) return result;

        for (const n of realNodeIds) {
            if (n === nodeId) continue;
            let key: string;
            switch (relation) {
                case 'rightOf': key = QualitativeConstraintValidator.pairKey(nodeId, n); if (this.mustHPairs.has(key)) result.add(n); break;
                case 'leftOf':  key = QualitativeConstraintValidator.pairKey(n, nodeId); if (this.mustHPairs.has(key)) result.add(n); break;
                case 'below':   key = QualitativeConstraintValidator.pairKey(nodeId, n); if (this.mustVPairs.has(key)) result.add(n); break;
                case 'above':   key = QualitativeConstraintValidator.pairKey(n, nodeId); if (this.mustVPairs.has(key)) result.add(n); break;
            }
        }
        return result;
    }

    /**
     * Nodes that CANNOT be in `relation` to `nodeId` — true in NO valid layout.
     *
     * Feasibility check: cannot(leftOf, X, Y) iff adding leftOf(X, Y) to the
     * must-graph would create a cycle. In graph terms, this means Y can already
     * reach X (via any path, including zero-weight alignment edges), so adding
     * X→Y would close a cycle.
     *
     * This is strictly more precise than the old antisymmetry-based derivation,
     * because it also catches infeasibility via zero-weight path chains.
     */
    public getCannot(nodeId: string, relation: 'leftOf' | 'rightOf' | 'above' | 'below'): Set<string> {
        this.ensureModalQueryState();
        const result = new Set<string>();
        result.add(nodeId); // reflexive exclusion

        // Pick the must-graph for the relevant axis
        const graph = (relation === 'leftOf' || relation === 'rightOf')
            ? this.mustHGraph
            : this.mustVGraph;
        if (!graph) return result;

        for (const n of this.nodes) {
            if (n.id === nodeId) continue;
            // getCannot(X, rel) returns Y where rel(X,Y) is infeasible.
            // getMust(X, 'leftOf') = {Y : isStrictlyOrdered(Y, X)}  →  Y is left of X
            // getMust(X, 'rightOf') = {Y : isStrictlyOrdered(X, Y)} →  Y is right of X
            //
            // getCannot(X, 'leftOf') = {Y : Y cannot be left of X}
            //   = {Y : adding edge Y→X would cycle} = {Y : canReach(X, Y)}
            // getCannot(X, 'rightOf') = {Y : Y cannot be right of X}
            //   = {Y : adding edge X→Y would cycle} = {Y : canReach(Y, X)}
            // getCannot(X, 'above') = {Y : Y cannot be above X}
            //   = {Y : adding edge Y→X would cycle} = {Y : canReach(X, Y)}
            // getCannot(X, 'below') = {Y : Y cannot be below X}
            //   = {Y : adding edge X→Y would cycle} = {Y : canReach(Y, X)}
            const infeasible = (relation === 'leftOf' || relation === 'above')
                ? graph.canReach(nodeId, n.id)   // adding n→nodeId, cycle if nodeId→...→n exists
                : graph.canReach(n.id, nodeId);  // adding nodeId→n, cycle if n→...→nodeId exists
            if (infeasible) result.add(n.id);
        }
        return result;
    }

    /**
     * Nodes that CAN be in `relation` to `nodeId` — true in SOME valid layout.
     * can = ¬cannot = allNodes \ getCannot(...)
     */
    public getCan(nodeId: string, relation: 'leftOf' | 'rightOf' | 'above' | 'below'): Set<string> {
        const cannotSet = this.getCannot(nodeId, relation);
        const result = new Set<string>();
        for (const n of this.nodes) {
            if (!cannotSet.has(n.id)) result.add(n.id);
        }
        return result;
    }

    /** Alignment equivalence class — nodes that MUST be aligned with nodeId. */
    public getMustAligned(nodeId: string, axis: 'x' | 'y'): Set<string> {
        this.ensureModalQueryState();
        const classes = axis === 'x' ? this.mustHAlignmentClasses : this.mustVAlignmentClasses;
        return classes?.get(nodeId) ?? new Set();
    }

    /**
     * Nodes that CANNOT be aligned with nodeId on the given axis.
     *
     * Feasibility check: adding alignment(X, Y) means zero-weight edges in both
     * directions. This is infeasible if:
     * 1. There's a strict ordering between them (isStrictlyOrdered in either
     *    direction) — the zero-weight cycle would contradict the positive-weight
     *    edge; or
     * 2. Merging their alignment classes on this axis would put two distinct
     *    nodes that are aligned on the OTHER axis into the same class —
     *    dual-axis alignment forces identical positions, i.e. node overlap.
     *    This is the same rule the solver applies in isAlternativeFeasible
     *    (classHasDualAxisOverlap); without it getCanAligned over-claims,
     *    e.g. "A =x B" alone would report that A and B can also be y-aligned.
     */
    public getCannotAligned(nodeId: string, axis: 'x' | 'y'): Set<string> {
        this.ensureModalQueryState();
        const result = new Set<string>();
        result.add(nodeId); // X is not "aligned with itself" in the query sense
        const graph = axis === 'x' ? this.mustHGraph : this.mustVGraph;
        const otherGraph = axis === 'x' ? this.mustVGraph : this.mustHGraph;
        if (!graph) return result;

        for (const n of this.nodes) {
            if (n.id === nodeId) continue;
            if (graph.isStrictlyOrdered(nodeId, n.id) || graph.isStrictlyOrdered(n.id, nodeId)) {
                result.add(n.id);
                continue;
            }
            if (otherGraph && QualitativeConstraintValidator.classHasDualAxisOverlap(
                graph, otherGraph, nodeId, n.id, false,
            )) {
                result.add(n.id);
            }
        }
        return result;
    }

    /** Nodes that CAN be aligned — ¬cannotAligned. */
    public getCanAligned(nodeId: string, axis: 'x' | 'y'): Set<string> {
        const cannotSet = this.getCannotAligned(nodeId, axis);
        const result = new Set<string>();
        for (const n of this.nodes) {
            if (!cannotSet.has(n.id)) result.add(n.id);
        }
        return result;
    }

    // ─── Provenance / "why" queries ─────────────────────────────────────

    /**
     * Explain WHY `relation(nodeId, targetId)` is a must-fact.
     * Returns the set of source-level constraints whose edges form the
     * path in the must-graph that entails this ordering.
     * Returns null if the relation is not must-entailed.
     */
    public whyMust(
        nodeId: string, relation: 'leftOf' | 'rightOf' | 'above' | 'below', targetId: string
    ): LayoutConstraint['sourceConstraint'][] | null {
        if (!this.getMust(nodeId, relation).has(targetId)) return null;
        const graph = (relation === 'leftOf' || relation === 'rightOf')
            ? this.mustHGraph : this.mustVGraph;
        if (!graph) return null;

        // For leftOf/above: target is ordered before nodeId → path target→nodeId
        // For rightOf/below: nodeId is ordered before target → path nodeId→target
        const [from, to] = (relation === 'leftOf' || relation === 'above')
            ? [targetId, nodeId] : [nodeId, targetId];
        return this.collectPathProvenance(graph, from, to);
    }

    /**
     * Explain WHY `relation(nodeId, targetId)` is a cannot-fact.
     * Returns the set of source-level constraints forming the path that
     * would create a cycle if the relation were added.
     * Returns null if the relation is not cannot-entailed.
     */
    public whyCannot(
        nodeId: string, relation: 'leftOf' | 'rightOf' | 'above' | 'below', targetId: string
    ): LayoutConstraint['sourceConstraint'][] | null {
        if (!this.getCannot(nodeId, relation).has(targetId)) return null;
        if (nodeId === targetId) return []; // reflexive — no path needed
        const graph = (relation === 'leftOf' || relation === 'rightOf')
            ? this.mustHGraph : this.mustVGraph;
        if (!graph) return null;

        // cannot(leftOf, X, Y) ↔ canReach(X, Y): the path X→...→Y would become a cycle if Y→X added
        // cannot(rightOf, X, Y) ↔ canReach(Y, X): the path Y→...→X would become a cycle if X→Y added
        const [from, to] = (relation === 'leftOf' || relation === 'above')
            ? [nodeId, targetId] : [targetId, nodeId];
        return this.collectPathProvenance(graph, from, to);
    }

    /** Collect source constraints from a graph path's edge provenance. */
    private collectPathProvenance(
        graph: DifferenceConstraintGraph, from: string, to: string
    ): LayoutConstraint['sourceConstraint'][] {
        const path = graph.findPath(from, to);
        if (!path) return [];
        const seen = new Set<LayoutConstraint['sourceConstraint']>();
        const result: LayoutConstraint['sourceConstraint'][] = [];
        for (const [a, b] of path) {
            const provenance = graph.getEdgeProvenance(a, b);
            if (provenance && !seen.has(provenance.sourceConstraint)) {
                seen.add(provenance.sourceConstraint);
                result.push(provenance.sourceConstraint);
            }
        }
        return result;
    }

    // ─── Post-CDCL resolved model queries (what's true in THIS layout) ───

    /**
     * Get all nodes reachable from `nodeId` in the given direction (resolved model).
     *
     * Uses isProperlyBefore for the same reason getMust does: the question is
     * which boxes actually sit to the given side, not which ones merely start
     * earlier on the axis.
     */
    public getReachable(nodeId: string, relation: 'leftOf' | 'rightOf' | 'above' | 'below'): Set<string> {
        const realNodeIds = new Set(this.nodes.map(n => n.id));
        const result = new Set<string>();

        switch (relation) {
            case 'rightOf': {
                for (const n of realNodeIds) {
                    if (n !== nodeId && this.hGraph.isProperlyBefore(nodeId, n)) result.add(n);
                }
                break;
            }
            case 'leftOf': {
                for (const n of realNodeIds) {
                    if (n !== nodeId && this.hGraph.isProperlyBefore(n, nodeId)) result.add(n);
                }
                break;
            }
            case 'below': {
                for (const n of realNodeIds) {
                    if (n !== nodeId && this.vGraph.isProperlyBefore(nodeId, n)) result.add(n);
                }
                break;
            }
            case 'above': {
                for (const n of realNodeIds) {
                    if (n !== nodeId && this.vGraph.isProperlyBefore(n, nodeId)) result.add(n);
                }
                break;
            }
        }
        return result;
    }

    /** Get alignment class from the resolved model (post-CDCL). */
    public getAlignedWith(nodeId: string, axis: 'x' | 'y'): Set<string> {
        const graph = axis === 'x' ? this.hGraph : this.vGraph;
        const realNodeIds = new Set(this.nodes.map(n => n.id));
        const classMembers = graph.getAlignmentClassOf(nodeId);
        const result = new Set<string>();
        for (const m of classMembers) {
            if (m !== nodeId && realNodeIds.has(m)) result.add(m);
        }
        return result;
    }
}

export { QualitativeConstraintValidator };
