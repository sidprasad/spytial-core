/**
 * Layout Evaluator — queries the spatial constraint system of an InstanceLayout.
 *
 * Delegates spatial reachability to the QualitativeConstraintValidator's
 * DifferenceConstraintGraphs (hGraph, vGraph). The solver is the single
 * source of truth for ordering and alignment — no duplicate graph is built.
 *
 * Design follows Margrave (Fisler & Krishnamurthi, ICSE 2005): pose boolean
 * queries over a constraint system, get enumerated node sets.
 *
 * The solver's resolved model (post-CDCL) gives:
 *   - isStrictlyOrdered for directional queries (distinguishes ordering from alignment)
 *   - areAligned / getAlignmentClassOf for alignment equivalence classes
 *   - Topological ordering for rank-based comparisons
 *
 * Group membership (grouped/contains) is tracked separately since the solver
 * models groups via virtual proxy nodes rather than queryable membership.
 *
 * Spatial predicates:
 *   leftOf(a, b)   rightOf(a, b)     — from LeftConstraint → hGraph
 *   above(a, b)    below(a, b)       — from TopConstraint → vGraph
 *   xAligned(a, b) yAligned(a, b)    — from AlignmentConstraint → hGraph/vGraph SCCs
 *   grouped(a, b)                    — from LayoutGroup membership
 *   contains(g, a)                   — from LayoutGroup key node → members
 */

import type { IEvaluatorResult, EvaluatorResult, SpatialQuery, SpatialRelation, ILayoutEvaluator } from './interfaces';
import type { SingleValue } from './interfaces';
import type { InstanceLayout, LayoutGroup } from '../layout/interfaces';
import type { QualitativeConstraintValidator } from '../layout/qualitative-constraint-validator';


// ─── Helpers ─────────────────────────────────────────────────────────────────

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
}


// ─── Group membership (not modeled in the solver's DCGs) ─────────────────────

interface GroupData {
    /** group key → member node IDs */
    groupMembers: Map<string, Set<string>>;
    /** node ID → group keys containing it */
    nodeGroups: Map<string, Set<string>>;
    /** key node ID → groups where that node is the key */
    keyNodeGroups: Map<string, LayoutGroup[]>;
    /** All real node IDs */
    nodeIds: Set<string>;
}

function buildGroupData(layout: InstanceLayout): GroupData {
    const groupMembers = new Map<string, Set<string>>();
    const nodeGroups = new Map<string, Set<string>>();
    const keyNodeGroups = new Map<string, LayoutGroup[]>();
    const nodeIds = new Set<string>();

    for (const node of layout.nodes) {
        nodeIds.add(node.id);
    }

    // Use index-based keys to handle duplicate group names (e.g., two groups
    // both named "G1" with different members from different source constraints).
    for (let gi = 0; gi < layout.groups.length; gi++) {
        const group = layout.groups[gi];
        if (group.negated) continue;

        const groupKey = `${group.name}__${gi}`;
        const members = new Set<string>(group.nodeIds);
        groupMembers.set(groupKey, members);

        for (const nodeId of group.nodeIds) {
            addToSetMap(nodeGroups, nodeId, groupKey);
        }

        if (!keyNodeGroups.has(group.keyNodeId)) {
            keyNodeGroups.set(group.keyNodeId, []);
        }
        keyNodeGroups.get(group.keyNodeId)!.push(group);
    }

    return { groupMembers, nodeGroups, keyNodeGroups, nodeIds };
}


// ─── Result type ─────────────────────────────────────────────────────────────

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


// ─── Evaluator ───────────────────────────────────────────────────────────────

/**
 * Evaluator over the spatial constraint system of an InstanceLayout.
 *
 * Requires a QualitativeConstraintValidator (post-validation) for all
 * directional and alignment queries. Group membership is tracked locally.
 *
 * Modalities:
 *   must  — entailed by the resolved model (post-CDCL)
 *   cannot — contradicted by antisymmetry in the resolved model
 *   can   — consistent with the resolved model (= must, since the solver
 *           picked one satisfying assignment and disjunctions are resolved)
 */
export class LayoutEvaluator implements ILayoutEvaluator {
    private groups: GroupData | null = null;
    private solver: QualitativeConstraintValidator | null = null;

    /**
     * Initialize with an InstanceLayout and the solver that validated it.
     * The solver must have already run validateConstraints() successfully.
     */
    initialize(layout: InstanceLayout, solver: QualitativeConstraintValidator): void {
        this.groups = buildGroupData(layout);
        this.solver = solver;
    }

    isReady(): boolean {
        return this.groups !== null && this.solver !== null;
    }

    // ── must ──────────────────────────────────────────────────────────────

    must(query: SpatialQuery): IEvaluatorResult {
        const { groups, solver } = this.ensureReady();
        const expr = formatQuery('must', query);

        if (!groups.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateMust(query, groups, solver);
        return LayoutEvaluatorResult.of(result, expr);
    }

    private evaluateMust(
        query: SpatialQuery,
        groups: GroupData,
        solver: QualitativeConstraintValidator,
    ): Set<string> {
        const { relation, nodeId } = query;

        switch (relation) {
            case 'leftOf':
                return solver.getReachable(nodeId, 'leftOf');
            case 'rightOf':
                return solver.getReachable(nodeId, 'rightOf');
            case 'above':
                return solver.getReachable(nodeId, 'above');
            case 'below':
                return solver.getReachable(nodeId, 'below');
            case 'xAligned':
                return solver.getAlignedWith(nodeId, 'x');
            case 'yAligned':
                return solver.getAlignedWith(nodeId, 'y');

            case 'grouped': {
                const result = new Set<string>();
                const memberGroups = groups.nodeGroups.get(nodeId);
                if (memberGroups) {
                    for (const groupKey of memberGroups) {
                        const members = groups.groupMembers.get(groupKey);
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
                const result = new Set<string>();
                const keyGroups = groups.keyNodeGroups.get(nodeId);
                if (keyGroups) {
                    for (const group of keyGroups) {
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
        const { groups, solver } = this.ensureReady();
        const expr = formatQuery('cannot', query);

        if (!groups.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateCannot(query.relation, query.nodeId, solver);
        return LayoutEvaluatorResult.of(result, expr);
    }

    private evaluateCannot(
        relation: SpatialRelation,
        nodeId: string,
        solver: QualitativeConstraintValidator,
    ): Set<string> {
        switch (relation) {
            case 'leftOf': {
                const result = solver.getReachable(nodeId, 'rightOf');
                result.add(nodeId);
                return result;
            }

            case 'rightOf': {
                const result = solver.getReachable(nodeId, 'leftOf');
                result.add(nodeId);
                return result;
            }

            case 'above': {
                const result = solver.getReachable(nodeId, 'below');
                result.add(nodeId);
                return result;
            }

            case 'below': {
                const result = solver.getReachable(nodeId, 'above');
                result.add(nodeId);
                return result;
            }

            case 'xAligned': {
                const leftOf = solver.getReachable(nodeId, 'leftOf');
                const rightOf = solver.getReachable(nodeId, 'rightOf');
                const result = new Set<string>();
                for (const n of leftOf) result.add(n);
                for (const n of rightOf) result.add(n);
                result.add(nodeId);
                return result;
            }

            case 'yAligned': {
                const above = solver.getReachable(nodeId, 'above');
                const below = solver.getReachable(nodeId, 'below');
                const result = new Set<string>();
                for (const n of above) result.add(n);
                for (const n of below) result.add(n);
                result.add(nodeId);
                return result;
            }

            case 'grouped':
            case 'contains':
                return new Set<string>();
        }
    }

    // ── can ───────────────────────────────────────────────────────────────
    //
    // With the solver backing, `can` = `must`: the resolved model is one
    // satisfying assignment (disjunctions already resolved by CDCL), so
    // everything that holds in it "can" hold.

    can(query: SpatialQuery): IEvaluatorResult {
        const { groups, solver } = this.ensureReady();
        const expr = formatQuery('can', query);

        if (!groups.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateMust(query, groups, solver);
        return LayoutEvaluatorResult.of(result, expr);
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private ensureReady(): { groups: GroupData; solver: QualitativeConstraintValidator } {
        if (!this.groups || !this.solver) {
            throw new Error('LayoutEvaluator not initialized. Call initialize(layout, solver) first.');
        }
        return { groups: this.groups, solver: this.solver };
    }
}


// ─── Query formatting ────────────────────────────────────────────────────────

function formatQuery(modality: 'must' | 'can' | 'cannot', query: SpatialQuery): string {
    const closure = query.transitive !== false ? '^' : '';
    return `${modality} { x | ${closure}${query.relation}(x, ${query.nodeId}) }`;
}
