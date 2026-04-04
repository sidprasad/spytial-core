/**
 * Layout Evaluator — queries the spatial constraint system of an InstanceLayout.
 *
 * Phase 1: conjunctive must/cannot via transitive closure (graph reachability).
 * Phase 2: disjunctive can via per-alternative augmentation with cycle checking.
 *
 * The evaluator treats InstanceLayout.constraints as a formula in a spatial
 * constraint logic and answers modal queries (must/can/cannot) over it.
 *
 * Design follows Margrave (Fisler & Krishnamurthi, ICSE 2005): pose boolean
 * queries over a constraint system, get enumerated node sets.
 *
 * Spatial predicates:
 *   leftOf(a, b)   rightOf(a, b)     — from LeftConstraint
 *   above(a, b)    below(a, b)       — from TopConstraint
 *   xAligned(a, b) yAligned(a, b)    — from AlignmentConstraint
 *   grouped(a, b)                    — from LayoutGroup membership
 *   contains(g, a)                   — from LayoutGroup key node → members
 *
 * Transitive closure (^relation) follows the partial order.
 */

import type { IEvaluatorResult, EvaluatorResult, SpatialQuery, SpatialRelation, ILayoutEvaluator } from './interfaces';
import type { SingleValue } from './interfaces';
import type { InstanceLayout, LayoutConstraint, LayoutGroup, DisjunctiveConstraint } from '../layout/interfaces';
import { isTopConstraint, isLeftConstraint, isAlignmentConstraint } from '../layout/interfaces';


// ─── Graph helpers ────────────────────────────────────────────────────────────

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
}

function getTransitiveReachable(start: string, adjacency: Map<string, Set<string>>): Set<string> {
    const visited = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const neighbors = adjacency.get(current);
        if (neighbors) {
            for (const n of neighbors) {
                if (!visited.has(n)) stack.push(n);
            }
        }
    }
    visited.delete(start); // Don't include the start node itself
    return visited;
}

/**
 * For symmetric relations (alignment), compute the full equivalence class
 * reachable from `start` via BFS, excluding start itself.
 */
function getEquivalenceClass(start: string, adjacency: Map<string, Set<string>>): Set<string> {
    // Same as transitive reachable — alignment is symmetric and transitive
    return getTransitiveReachable(start, adjacency);
}

/** Deep-clone a set map (each value is a new Set). */
function cloneSetMap(map: Map<string, Set<string>>): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const [k, v] of map) {
        result.set(k, new Set(v));
    }
    return result;
}

/**
 * Check if adding an edge (from → to) to a directed graph would create a cycle.
 * A cycle exists if `to` can already reach `from` transitively.
 */
function wouldCreateCycle(from: string, to: string, adjacency: Map<string, Set<string>>): boolean {
    if (from === to) return true;
    const reachable = getTransitiveReachable(to, adjacency);
    return reachable.has(from);
}


// ─── Spatial Graph ────────────────────────────────────────────────────────────

/**
 * Internal adjacency structure built from InstanceLayout constraints.
 * Each map goes from a node ID to the set of node IDs reachable in one step.
 */
interface SpatialGraph {
    /** A → nodes directly below A (from TopConstraint: A is top, B is bottom) */
    belowOf: Map<string, Set<string>>;
    /** A → nodes directly above A */
    aboveOf: Map<string, Set<string>>;
    /** A → nodes directly to the right of A */
    rightOf: Map<string, Set<string>>;
    /** A → nodes directly to the left of A */
    leftOf: Map<string, Set<string>>;
    /** A → nodes x-aligned with A (same x position) */
    alignedX: Map<string, Set<string>>;
    /** A → nodes y-aligned with A (same y position) */
    alignedY: Map<string, Set<string>>;
    /** group name → member node IDs */
    groupMembers: Map<string, Set<string>>;
    /** node ID → group names containing it */
    nodeGroups: Map<string, Set<string>>;
    /** key node ID → groups where that node is the key */
    keyNodeGroups: Map<string, LayoutGroup[]>;
    /** All known node IDs */
    nodeIds: Set<string>;
    /** Disjunctive constraints from the layout (for `can` queries) */
    disjunctions: DisjunctiveConstraint[];
}

function buildSpatialGraph(layout: InstanceLayout): SpatialGraph {
    const belowOf = new Map<string, Set<string>>();
    const aboveOf = new Map<string, Set<string>>();
    const rightOf = new Map<string, Set<string>>();
    const leftOf = new Map<string, Set<string>>();
    const alignedX = new Map<string, Set<string>>();
    const alignedY = new Map<string, Set<string>>();
    const groupMembers = new Map<string, Set<string>>();
    const nodeGroups = new Map<string, Set<string>>();
    const keyNodeGroups = new Map<string, LayoutGroup[]>();
    const nodeIds = new Set<string>();

    // Collect all node IDs
    for (const node of layout.nodes) {
        nodeIds.add(node.id);
    }

    // Process conjunctive constraints
    for (const constraint of layout.constraints) {
        if (isTopConstraint(constraint)) {
            // TopConstraint(top, bottom): top is above bottom
            addToSetMap(belowOf, constraint.top.id, constraint.bottom.id);
            addToSetMap(aboveOf, constraint.bottom.id, constraint.top.id);
        } else if (isLeftConstraint(constraint)) {
            // LeftConstraint(left, right): left is to the left of right
            addToSetMap(rightOf, constraint.left.id, constraint.right.id);
            addToSetMap(leftOf, constraint.right.id, constraint.left.id);
        } else if (isAlignmentConstraint(constraint)) {
            // AlignmentConstraint(axis, node1, node2): same position on axis
            if (constraint.axis === 'x') {
                addToSetMap(alignedX, constraint.node1.id, constraint.node2.id);
                addToSetMap(alignedX, constraint.node2.id, constraint.node1.id);
            } else {
                addToSetMap(alignedY, constraint.node1.id, constraint.node2.id);
                addToSetMap(alignedY, constraint.node2.id, constraint.node1.id);
            }
        }
    }

    // Process groups (skip negated groups — they don't establish positive membership)
    for (const group of layout.groups) {
        if (group.negated) continue;

        const members = new Set<string>(group.nodeIds);
        groupMembers.set(group.name, members);

        for (const nodeId of group.nodeIds) {
            addToSetMap(nodeGroups, nodeId, group.name);
        }

        if (!keyNodeGroups.has(group.keyNodeId)) {
            keyNodeGroups.set(group.keyNodeId, []);
        }
        keyNodeGroups.get(group.keyNodeId)!.push(group);
    }

    const disjunctions = layout.disjunctiveConstraints ?? [];

    return { belowOf, aboveOf, rightOf, leftOf, alignedX, alignedY, groupMembers, nodeGroups, keyNodeGroups, nodeIds, disjunctions };
}


// ─── Result type ──────────────────────────────────────────────────────────────

/**
 * Result of a spatial query. Wraps a set of node IDs in the IEvaluatorResult
 * interface for downstream compatibility with the data evaluator result API.
 */
export class LayoutEvaluatorResult implements IEvaluatorResult {
    private readonly atoms: string[];
    private readonly expr: string;
    private readonly errorMsg: string | null;

    private constructor(atoms: string[], expr: string, errorMsg: string | null = null) {
        this.atoms = atoms;
        this.expr = expr;
        this.errorMsg = errorMsg;
    }

    static of(atoms: string[] | Set<string>, expr: string): LayoutEvaluatorResult {
        const arr = atoms instanceof Set ? Array.from(atoms) : atoms;
        return new LayoutEvaluatorResult(arr.sort(), expr);
    }

    static error(expr: string, message: string): LayoutEvaluatorResult {
        return new LayoutEvaluatorResult([], expr, message);
    }

    prettyPrint(): string {
        if (this.errorMsg) return `Error: ${this.errorMsg}`;
        if (this.atoms.length === 0) return '(empty)';
        return this.atoms.join(', ');
    }

    noResult(): boolean {
        return !this.errorMsg && this.atoms.length === 0;
    }

    singleResult(): SingleValue {
        if (this.atoms.length !== 1) {
            throw new Error(`Expected single value for ${this.expr}, got ${this.atoms.length} results`);
        }
        return this.atoms[0];
    }

    selectedAtoms(): string[] {
        if (this.errorMsg) {
            throw new Error(`Cannot get atoms from error result: ${this.errorMsg}`);
        }
        return this.atoms;
    }

    selectedTwoples(): string[][] {
        // Spatial queries return unary results (node IDs), not pairs
        return [];
    }

    selectedTuplesAll(): string[][] {
        return this.atoms.map(a => [a]);
    }

    maxArity(): number {
        return this.atoms.length > 0 ? 1 : 0;
    }

    isError(): boolean {
        return this.errorMsg !== null;
    }

    isSingleton(): boolean {
        return this.atoms.length === 1;
    }

    getExpression(): string {
        return this.expr;
    }

    getRawResult(): EvaluatorResult {
        if (this.errorMsg) {
            return { error: { message: this.errorMsg, code: 'SPATIAL_QUERY_ERROR' } };
        }
        return this.atoms.map(a => [a] as SingleValue[]);
    }
}


// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Evaluator over the spatial constraint system of an InstanceLayout.
 *
 * Phase 1: conjunctive must/cannot via graph reachability.
 * - must: transitive closure of directional constraints; equivalence classes
 *   for alignment; co-membership for groups.
 * - cannot: antisymmetry — if A must be right of X, A cannot be left of X.
 *
 * Phase 2: disjunctive can via per-alternative augmentation.
 * - can: for each disjunctive alternative, augment the conjunctive graph and
 *   check if new relations emerge. Infeasible alternatives (ordering cycles)
 *   are pruned. Sound under-approximation — cross-disjunction interactions
 *   are not captured.
 */
export class LayoutEvaluator implements ILayoutEvaluator {
    private graph: SpatialGraph | null = null;

    initialize(layout: InstanceLayout): void {
        this.graph = buildSpatialGraph(layout);
    }

    isReady(): boolean {
        return this.graph !== null;
    }

    // ── must ──────────────────────────────────────────────────────────────

    must(query: SpatialQuery): IEvaluatorResult {
        const g = this.ensureReady();
        const expr = formatQuery('must', query);

        if (!g.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateMust(query, g);
        return LayoutEvaluatorResult.of(result, expr);
    }

    private evaluateMust(query: SpatialQuery, g: SpatialGraph): Set<string> {
        const { relation, nodeId } = query;
        // Default to transitive for directional relations (the common case
        // for diagram logic queries — "what must be left of X?" means
        // transitively, not just immediate neighbors)
        const transitive = query.transitive !== false;

        switch (relation) {
            case 'leftOf':
                return transitive
                    ? getTransitiveReachable(nodeId, g.leftOf)
                    : g.leftOf.get(nodeId) ?? new Set();

            case 'rightOf':
                return transitive
                    ? getTransitiveReachable(nodeId, g.rightOf)
                    : g.rightOf.get(nodeId) ?? new Set();

            case 'above':
                return transitive
                    ? getTransitiveReachable(nodeId, g.aboveOf)
                    : g.aboveOf.get(nodeId) ?? new Set();

            case 'below':
                return transitive
                    ? getTransitiveReachable(nodeId, g.belowOf)
                    : g.belowOf.get(nodeId) ?? new Set();

            case 'xAligned':
                return getEquivalenceClass(nodeId, g.alignedX);

            case 'yAligned':
                return getEquivalenceClass(nodeId, g.alignedY);

            case 'grouped': {
                // All nodes sharing at least one group with nodeId
                const result = new Set<string>();
                const groups = g.nodeGroups.get(nodeId);
                if (groups) {
                    for (const groupName of groups) {
                        const members = g.groupMembers.get(groupName);
                        if (members) {
                            for (const m of members) {
                                if (m !== nodeId) result.add(m);
                            }
                        }
                    }
                }
                return result;
            }

            case 'contains': {
                // If nodeId is a group key node, return the group's members (excluding the key)
                const result = new Set<string>();
                const groups = g.keyNodeGroups.get(nodeId);
                if (groups) {
                    for (const group of groups) {
                        for (const m of group.nodeIds) {
                            if (m !== nodeId) result.add(m);
                        }
                    }
                }
                return result;
            }
        }
    }

    // ── cannot ────────────────────────────────────────────────────────────

    cannot(query: SpatialQuery): IEvaluatorResult {
        const g = this.ensureReady();
        const expr = formatQuery('cannot', query);

        if (!g.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateCannot(query, g);
        return LayoutEvaluatorResult.of(result, expr);
    }

    private evaluateCannot(query: SpatialQuery, g: SpatialGraph): Set<string> {
        const { relation, nodeId } = query;

        // Antisymmetry: if X must be right of A, then A cannot be left of X.
        // Also include the node itself (a node cannot be left of itself).
        switch (relation) {
            case 'leftOf': {
                // Cannot be left of X = things that must be right of X, plus X itself
                const mustRight = getTransitiveReachable(nodeId, g.rightOf);
                mustRight.add(nodeId);
                return mustRight;
            }

            case 'rightOf': {
                const mustLeft = getTransitiveReachable(nodeId, g.leftOf);
                mustLeft.add(nodeId);
                return mustLeft;
            }

            case 'above': {
                const mustBelow = getTransitiveReachable(nodeId, g.belowOf);
                mustBelow.add(nodeId);
                return mustBelow;
            }

            case 'below': {
                const mustAbove = getTransitiveReachable(nodeId, g.aboveOf);
                mustAbove.add(nodeId);
                return mustAbove;
            }

            case 'xAligned': {
                // If there's a strict left/right ordering between two nodes,
                // they cannot be x-aligned (same x position)
                const mustLeft = getTransitiveReachable(nodeId, g.leftOf);
                const mustRight = getTransitiveReachable(nodeId, g.rightOf);
                const result = new Set<string>();
                for (const n of mustLeft) result.add(n);
                for (const n of mustRight) result.add(n);
                result.add(nodeId); // Can't be x-aligned with yourself is trivially true but consistent
                return result;
            }

            case 'yAligned': {
                // If there's a strict above/below ordering, can't be y-aligned
                const mustAbove = getTransitiveReachable(nodeId, g.aboveOf);
                const mustBelow = getTransitiveReachable(nodeId, g.belowOf);
                const result = new Set<string>();
                for (const n of mustAbove) result.add(n);
                for (const n of mustBelow) result.add(n);
                result.add(nodeId);
                return result;
            }

            case 'grouped':
            case 'contains':
                // Phase 2: requires reasoning about negated groups and anti-containment.
                // For now, return empty (we can't prove any node CANNOT be grouped).
                return new Set<string>();
        }
    }

    // ── can (Phase 2) ──────────────────────────────────────────────────────
    //
    // `can(query)` = nodes where the relation holds in at least one satisfying
    // assignment. Computed by augmenting the conjunctive graph with each
    // disjunctive alternative (one at a time) and checking if the augmented
    // graph produces new results. Alternatives that would create ordering
    // cycles are skipped as infeasible.
    //
    // This is a per-alternative analysis: for each disjunction, we try each
    // alternative independently. Cross-disjunction interactions (where two
    // alternatives from different disjunctions must both be selected to
    // produce a relation) are not captured — this makes the result a sound
    // under-approximation of the true `can` set.

    can(query: SpatialQuery): IEvaluatorResult {
        const g = this.ensureReady();
        const expr = formatQuery('can', query);

        if (!g.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateCan(query, g);
        return LayoutEvaluatorResult.of(result, expr);
    }

    private evaluateCan(query: SpatialQuery, g: SpatialGraph): Set<string> {
        // Start with everything that must hold (must ⊆ can)
        const result = new Set(this.evaluateMust(query, g));

        // For grouped/contains, can = must (group membership is conjunctive)
        if (query.relation === 'grouped' || query.relation === 'contains') {
            return result;
        }

        // Try each alternative from each disjunction
        for (const disj of g.disjunctions) {
            for (const alternative of disj.alternatives) {
                const augmented = this.augmentGraph(g, alternative);
                if (!augmented) continue; // Infeasible (cycle detected)

                const augResult = this.evaluateMust(query, augmented);
                for (const node of augResult) {
                    result.add(node);
                }
            }
        }

        return result;
    }

    /**
     * Create an augmented copy of the spatial graph with an alternative's
     * constraints added. Returns null if the augmentation creates a cycle
     * (infeasible alternative).
     */
    private augmentGraph(base: SpatialGraph, constraints: LayoutConstraint[]): SpatialGraph | null {
        // Clone the directional and alignment maps
        const belowOf = cloneSetMap(base.belowOf);
        const aboveOf = cloneSetMap(base.aboveOf);
        const rightOf = cloneSetMap(base.rightOf);
        const leftOf = cloneSetMap(base.leftOf);
        const alignedX = cloneSetMap(base.alignedX);
        const alignedY = cloneSetMap(base.alignedY);

        // Try adding each constraint, checking for cycles
        for (const constraint of constraints) {
            if (isTopConstraint(constraint)) {
                const topId = constraint.top.id;
                const bottomId = constraint.bottom.id;
                if (wouldCreateCycle(topId, bottomId, belowOf)) return null;
                addToSetMap(belowOf, topId, bottomId);
                addToSetMap(aboveOf, bottomId, topId);
            } else if (isLeftConstraint(constraint)) {
                const leftId = constraint.left.id;
                const rightId = constraint.right.id;
                if (wouldCreateCycle(leftId, rightId, rightOf)) return null;
                addToSetMap(rightOf, leftId, rightId);
                addToSetMap(leftOf, rightId, leftId);
            } else if (isAlignmentConstraint(constraint)) {
                if (constraint.axis === 'x') {
                    addToSetMap(alignedX, constraint.node1.id, constraint.node2.id);
                    addToSetMap(alignedX, constraint.node2.id, constraint.node1.id);
                } else {
                    addToSetMap(alignedY, constraint.node1.id, constraint.node2.id);
                    addToSetMap(alignedY, constraint.node2.id, constraint.node1.id);
                }
            }
            // BoundingBoxConstraint and GroupBoundaryConstraint don't affect
            // directional/alignment queries — they constrain group geometry
            // which we don't model in the spatial graph.
        }

        return {
            belowOf, aboveOf, rightOf, leftOf, alignedX, alignedY,
            // Groups and disjunctions are shared (not modified)
            groupMembers: base.groupMembers,
            nodeGroups: base.nodeGroups,
            keyNodeGroups: base.keyNodeGroups,
            nodeIds: base.nodeIds,
            disjunctions: [], // Don't recurse into disjunctions
        };
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private ensureReady(): SpatialGraph {
        if (!this.graph) {
            throw new Error('LayoutEvaluator not initialized. Call initialize(layout) first.');
        }
        return this.graph;
    }
}


// ─── Query formatting ─────────────────────────────────────────────────────────

function formatQuery(modality: 'must' | 'can' | 'cannot', query: SpatialQuery): string {
    const closure = query.transitive !== false ? '^' : '';
    return `${modality} { x | ${closure}${query.relation}(x, ${query.nodeId}) }`;
}
