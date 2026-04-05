/**
 * Layout Evaluator — queries the spatial constraint system of an InstanceLayout.
 *
 * Delegates directional and alignment queries to an ISpatialIndex (the
 * resolved model from a constraint validator). Group membership is tracked
 * separately from layout data since solvers model groups via virtual nodes.
 *
 * Design follows Margrave (Fisler & Krishnamurthi, ICSE 2005): pose boolean
 * queries over a constraint system, get enumerated node sets.
 *
 * Spatial predicates:
 *   leftOf, rightOf, above, below    — directional via ISpatialIndex.getReachable
 *   xAligned, yAligned               — equivalence classes via ISpatialIndex.getAlignedWith
 *   grouped, contains                — from LayoutGroup membership (layout data)
 */

import type { IEvaluatorResult, EvaluatorResult, SpatialQuery, SpatialRelation, ILayoutEvaluator, ISpatialIndex } from './interfaces';
import type { SingleValue } from './interfaces';
import type { InstanceLayout, LayoutGroup } from '../layout/interfaces';


// ─── Helpers ─────────────────────────────────────────────────────────────────

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
}


// ─── Group membership (tracked from layout data, not from ISpatialIndex) ─────

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
 * Requires a ISpatialIndex (post-validation) for all
 * directional and alignment queries. Group membership is tracked locally.
 *
 * Modalities:
 *   must  — entailed by the resolved model (post-CDCL)
 *   cannot — contradicted by antisymmetry in the resolved model
 *   can   — consistent with the resolved model (= must, since the index
 *           reflects one satisfying assignment with disjunctions resolved)
 */
export class LayoutEvaluator implements ILayoutEvaluator {
    private groups: GroupData | null = null;
    private spatialIndex: ISpatialIndex | null = null;

    /**
     * Initialize with a layout (for group membership) and a spatial index
     * (for directional/alignment queries from a resolved constraint model).
     */
    initialize(layout: InstanceLayout, spatialIndex: ISpatialIndex): void {
        this.groups = buildGroupData(layout);
        this.spatialIndex = spatialIndex;
    }

    isReady(): boolean {
        return this.groups !== null && this.spatialIndex !== null;
    }

    // ── must ──────────────────────────────────────────────────────────────

    must(query: SpatialQuery): IEvaluatorResult {
        const { groups, index } = this.ensureReady();
        const expr = formatQuery('must', query);

        if (!groups.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateMust(query, groups, index);
        return LayoutEvaluatorResult.of(result, expr);
    }

    private evaluateMust(
        query: SpatialQuery,
        groups: GroupData,
        index: ISpatialIndex,
    ): Set<string> {
        const { relation, nodeId } = query;

        switch (relation) {
            case 'leftOf':
                return index.getReachable(nodeId, 'leftOf');
            case 'rightOf':
                return index.getReachable(nodeId, 'rightOf');
            case 'above':
                return index.getReachable(nodeId, 'above');
            case 'below':
                return index.getReachable(nodeId, 'below');
            case 'xAligned':
                return index.getAlignedWith(nodeId, 'x');
            case 'yAligned':
                return index.getAlignedWith(nodeId, 'y');

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
        const { groups, index } = this.ensureReady();
        const expr = formatQuery('cannot', query);

        if (!groups.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateCannot(query.relation, query.nodeId, index);
        return LayoutEvaluatorResult.of(result, expr);
    }

    private evaluateCannot(
        relation: SpatialRelation,
        nodeId: string,
        index: ISpatialIndex,
    ): Set<string> {
        switch (relation) {
            case 'leftOf': {
                const result = index.getReachable(nodeId, 'rightOf');
                result.add(nodeId);
                return result;
            }

            case 'rightOf': {
                const result = index.getReachable(nodeId, 'leftOf');
                result.add(nodeId);
                return result;
            }

            case 'above': {
                const result = index.getReachable(nodeId, 'below');
                result.add(nodeId);
                return result;
            }

            case 'below': {
                const result = index.getReachable(nodeId, 'above');
                result.add(nodeId);
                return result;
            }

            case 'xAligned': {
                const leftOf = index.getReachable(nodeId, 'leftOf');
                const rightOf = index.getReachable(nodeId, 'rightOf');
                const result = new Set<string>();
                for (const n of leftOf) result.add(n);
                for (const n of rightOf) result.add(n);
                result.add(nodeId);
                return result;
            }

            case 'yAligned': {
                const above = index.getReachable(nodeId, 'above');
                const below = index.getReachable(nodeId, 'below');
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
    // With a resolved model, `can` = `must`: the index reflects one
    // satisfying assignment (disjunctions already resolved), so
    // everything that holds in it "can" hold.

    can(query: SpatialQuery): IEvaluatorResult {
        const { groups, index } = this.ensureReady();
        const expr = formatQuery('can', query);

        if (!groups.nodeIds.has(query.nodeId)) {
            return LayoutEvaluatorResult.error(expr, `Unknown node: ${query.nodeId}`);
        }

        const result = this.evaluateMust(query, groups, index);
        return LayoutEvaluatorResult.of(result, expr);
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private ensureReady(): { groups: GroupData; index: ISpatialIndex } {
        if (!this.groups || !this.spatialIndex) {
            throw new Error('LayoutEvaluator not initialized. Call initialize(layout, spatialIndex) first.');
        }
        return { groups: this.groups, index: this.spatialIndex };
    }
}


// ─── Query formatting ────────────────────────────────────────────────────────

function formatQuery(modality: 'must' | 'can' | 'cannot', query: SpatialQuery): string {
    const closure = query.transitive !== false ? '^' : '';
    return `${modality} { x | ${closure}${query.relation}(x, ${query.nodeId}) }`;
}
