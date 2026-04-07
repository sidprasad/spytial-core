/**
 * LayoutEvaluator — spatial modal queries over a validated layout.
 *
 * Delegates directional/alignment queries to QualitativeConstraintValidator's
 * modal methods (must/can/cannot). Group queries (grouped/contains) are
 * resolved locally from InstanceLayout group data.
 *
 * All query results are returned as IEvaluatorResult for REPL compatibility.
 */

import { QualitativeConstraintValidator } from '../../layout/qualitative-constraint-validator';
import { InstanceLayout, LayoutEdge, LayoutGroup, LayoutNode } from '../../layout/interfaces';
import {
    IEvaluatorResult, EvaluatorResult, SingleValue, Tuple
} from '../interfaces';
import { parse as parseQueryExpr } from './layout-query-parser';

// ─── Types ───────────────────────────────────────────────────────────

export type DirectionalRelation = 'leftOf' | 'rightOf' | 'above' | 'below';
export type AlignmentAxis = 'x' | 'y';
export type Modality = 'must' | 'can' | 'cannot';

export type SpatialQuery =
    | { kind: 'directional'; modality: Modality; relation: DirectionalRelation; nodeId: string }
    | { kind: 'aligned'; modality: Modality; axis: AlignmentAxis; nodeId: string }
    | { kind: 'grouped'; nodeId: string }
    | { kind: 'groupedTogether'; nodeIds: string[] }
    | { kind: 'contains'; groupName: string }
    | { kind: 'reachable'; relation: DirectionalRelation; nodeId: string }
    | { kind: 'alignedWith'; axis: AlignmentAxis; nodeId: string }
    | { kind: 'nodeInfo'; nodeId: string }
    | { kind: 'edgesOf'; nodeId: string }
    | { kind: 'edgesBetween'; nodeIdA: string; nodeIdB: string }
    | { kind: 'allNodes' }
    | { kind: 'allGroups' }
    | { kind: 'union'; operands: SpatialQuery[] }
    | { kind: 'intersection'; operands: SpatialQuery[] }
    | { kind: 'negation'; operand: SpatialQuery };

// ─── Result wrapper ──────────────────────────────────────────────────

export class LayoutEvaluatorResult implements IEvaluatorResult {
    private atoms: string[];
    private expr: string;
    private err: { message: string; code?: string } | null;

    constructor(atoms: string[], expr: string, error?: { message: string; code?: string }) {
        this.atoms = atoms;
        this.expr = expr;
        this.err = error ?? null;
    }

    static fromSet(set: Set<string>, expr: string): LayoutEvaluatorResult {
        return new LayoutEvaluatorResult(Array.from(set).sort(), expr);
    }

    static error(message: string, expr: string): LayoutEvaluatorResult {
        return new LayoutEvaluatorResult([], expr, { message, code: 'LAYOUT_QUERY_ERROR' });
    }

    prettyPrint(): string {
        if (this.err) return `Error: ${this.err.message}`;
        if (this.atoms.length === 0) return '(empty)';
        return this.atoms.join(', ');
    }

    noResult(): boolean {
        return !this.err && this.atoms.length === 0;
    }

    singleResult(): SingleValue {
        if (this.atoms.length !== 1) {
            throw new Error(`Expected single value from "${this.expr}", got ${this.atoms.length} results`);
        }
        return this.atoms[0];
    }

    selectedAtoms(): string[] {
        return [...this.atoms];
    }

    selectedTwoples(): string[][] {
        // Spatial queries return unary results (atom sets), not pairs
        return [];
    }

    selectedTuplesAll(): string[][] {
        return this.atoms.map(a => [a]);
    }

    maxArity(): number {
        return this.atoms.length > 0 ? 1 : 0;
    }

    isError(): boolean {
        return this.err !== null;
    }

    isSingleton(): boolean {
        return this.atoms.length === 1;
    }

    getExpression(): string {
        return this.expr;
    }

    getRawResult(): EvaluatorResult {
        if (this.err) return { error: { message: this.err.message, code: this.err.code } };
        return this.atoms.map(a => [a] as Tuple);
    }
}

// ─── Record result (for node lookups) ───────────────────────────────

export class LayoutEvaluatorRecordResult implements IEvaluatorResult {
    private entries: [string, string][];
    private expr: string;
    private err: { message: string; code?: string } | null;

    constructor(entries: [string, string][], expr: string, error?: { message: string; code?: string }) {
        this.entries = entries;
        this.expr = expr;
        this.err = error ?? null;
    }

    static error(message: string, expr: string): LayoutEvaluatorRecordResult {
        return new LayoutEvaluatorRecordResult([], expr, { message, code: 'LAYOUT_QUERY_ERROR' });
    }

    prettyPrint(): string {
        if (this.err) return `Error: ${this.err.message}`;
        if (this.entries.length === 0) return '(empty)';
        return this.entries.map(([k, v]) => `${k}: ${v}`).join('\n');
    }

    noResult(): boolean { return !this.err && this.entries.length === 0; }

    singleResult(): SingleValue {
        if (this.entries.length !== 1) {
            throw new Error(`Expected single value from "${this.expr}", got ${this.entries.length} entries`);
        }
        return this.entries[0][1];
    }

    selectedAtoms(): string[] { return this.entries.map(([, v]) => v); }
    selectedTwoples(): string[][] { return this.entries.map(([k, v]) => [k, v]); }
    selectedTuplesAll(): string[][] { return this.entries.map(([k, v]) => [k, v]); }
    maxArity(): number { return this.entries.length > 0 ? 2 : 0; }
    isError(): boolean { return this.err !== null; }
    isSingleton(): boolean { return this.entries.length === 1; }
    getExpression(): string { return this.expr; }

    getRawResult(): EvaluatorResult {
        if (this.err) return { error: { message: this.err.message, code: this.err.code } };
        return this.entries.map(([k, v]) => [k, v] as Tuple);
    }
}

// ─── Edge result (for edge queries) ─────────────────────────────────

export interface EdgeInfo {
    source: string;
    target: string;
    label: string;
    relationName: string;
    color: string;
    style: string;
    weight: number;
}

export class LayoutEvaluatorEdgeResult implements IEvaluatorResult {
    private edgeInfos: EdgeInfo[];
    private expr: string;
    private err: { message: string; code?: string } | null;

    constructor(edges: EdgeInfo[], expr: string, error?: { message: string; code?: string }) {
        this.edgeInfos = edges;
        this.expr = expr;
        this.err = error ?? null;
    }

    static fromLayoutEdges(edges: LayoutEdge[], expr: string): LayoutEvaluatorEdgeResult {
        const infos = edges.map(e => ({
            source: e.source.id,
            target: e.target.id,
            label: e.label,
            relationName: e.relationName,
            color: e.color,
            style: e.style ?? 'solid',
            weight: e.weight ?? 1,
        }));
        return new LayoutEvaluatorEdgeResult(infos, expr);
    }

    static error(message: string, expr: string): LayoutEvaluatorEdgeResult {
        return new LayoutEvaluatorEdgeResult([], expr, { message, code: 'LAYOUT_QUERY_ERROR' });
    }

    prettyPrint(): string {
        if (this.err) return `Error: ${this.err.message}`;
        if (this.edgeInfos.length === 0) return '(empty)';
        return this.edgeInfos
            .map(e => `${e.source} --[${e.label}]--> ${e.target} (${e.color}, ${e.style})`)
            .join('\n');
    }

    noResult(): boolean { return !this.err && this.edgeInfos.length === 0; }

    singleResult(): SingleValue {
        if (this.edgeInfos.length !== 1) {
            throw new Error(`Expected single edge from "${this.expr}", got ${this.edgeInfos.length} results`);
        }
        return `${this.edgeInfos[0].source} --[${this.edgeInfos[0].label}]--> ${this.edgeInfos[0].target}`;
    }

    selectedAtoms(): string[] {
        const atoms = new Set<string>();
        for (const e of this.edgeInfos) {
            atoms.add(e.source);
            atoms.add(e.target);
        }
        return [...atoms].sort();
    }

    selectedTwoples(): string[][] {
        return this.edgeInfos.map(e => [e.source, e.target]);
    }

    selectedTuplesAll(): string[][] {
        return this.edgeInfos.map(e => [
            e.source, e.target, e.label, e.relationName, e.color, e.style, String(e.weight)
        ]);
    }

    maxArity(): number { return this.edgeInfos.length > 0 ? 2 : 0; }
    isError(): boolean { return this.err !== null; }
    isSingleton(): boolean { return this.edgeInfos.length === 1; }
    getExpression(): string { return this.expr; }

    getEdges(): EdgeInfo[] { return [...this.edgeInfos]; }

    getRawResult(): EvaluatorResult {
        if (this.err) return { error: { message: this.err.message, code: this.err.code } };
        return this.edgeInfos.map(e => [e.source, e.target, e.label, e.color, e.style] as Tuple);
    }
}

// ─── LayoutEvaluator ─────────────────────────────────────────────────

export class LayoutEvaluator {
    private validator: QualitativeConstraintValidator;
    private layout: InstanceLayout;
    private allNodeIds: Set<string>;
    private groupsByNode: Map<string, string[]>;
    private groupMembers: Map<string, string[]>;
    private nodeById: Map<string, LayoutNode>;
    private edgesByNode: Map<string, LayoutEdge[]>;
    private edgesBetweenPair: Map<string, LayoutEdge[]>;

    constructor(validator: QualitativeConstraintValidator, layout: InstanceLayout) {
        this.validator = validator;
        this.layout = layout;

        // Collect all real node IDs — must match validator's node.id, NOT node.name/label
        this.allNodeIds = new Set(
            (layout.nodes ?? [])
                .filter((n: any) => !n._isAuxiliary && !n._isBoundingBox)
                .map((n: LayoutNode) => n.id)
                .filter((id: string) => id !== '')
        );

        // Build node index
        this.nodeById = new Map();
        for (const node of (layout.nodes ?? [])) {
            if (this.allNodeIds.has(node.id)) {
                this.nodeById.set(node.id, node);
            }
        }

        // Build group indices
        this.groupsByNode = new Map();
        this.groupMembers = new Map();
        for (const group of (layout.groups ?? []) as LayoutGroup[]) {
            const name = group.name;
            const memberIds: string[] = [];
            for (const nodeId of (group.nodeIds ?? [])) {
                if (this.allNodeIds.has(nodeId)) {
                    memberIds.push(nodeId);
                    const existing = this.groupsByNode.get(nodeId) ?? [];
                    existing.push(name);
                    this.groupsByNode.set(nodeId, existing);
                }
            }
            this.groupMembers.set(name, memberIds);
        }

        // Build edge indices (exclude hidden edges)
        this.edgesByNode = new Map();
        this.edgesBetweenPair = new Map();
        for (const edge of (layout.edges ?? [])) {
            if (edge.hidden) continue;
            const srcId = edge.source.id;
            const tgtId = edge.target.id;
            if (!this.edgesByNode.has(srcId)) this.edgesByNode.set(srcId, []);
            if (!this.edgesByNode.has(tgtId)) this.edgesByNode.set(tgtId, []);
            this.edgesByNode.get(srcId)!.push(edge);
            if (srcId !== tgtId) this.edgesByNode.get(tgtId)!.push(edge);
            const pairKey = [srcId, tgtId].sort().join('|');
            if (!this.edgesBetweenPair.has(pairKey)) this.edgesBetweenPair.set(pairKey, []);
            this.edgesBetweenPair.get(pairKey)!.push(edge);
        }
    }

    /** Execute a spatial query and return the result. */
    query(q: SpatialQuery): IEvaluatorResult {
        const expr = this.queryToString(q);
        try {
            switch (q.kind) {
                case 'directional':
                    return this.queryDirectional(q.modality, q.relation, q.nodeId, expr);
                case 'aligned':
                    return this.queryAligned(q.modality, q.axis, q.nodeId, expr);
                case 'grouped':
                    return this.queryGrouped(q.nodeId, expr);
                case 'groupedTogether':
                    return this.queryGroupedTogether(q.nodeIds, expr);
                case 'contains':
                    return this.queryContains(q.groupName, expr);
                case 'reachable':
                    return LayoutEvaluatorResult.fromSet(
                        this.validator.getReachable(q.nodeId, q.relation), expr);
                case 'alignedWith':
                    return LayoutEvaluatorResult.fromSet(
                        this.validator.getAlignedWith(q.nodeId, q.axis), expr);
                case 'nodeInfo':
                    return this.queryNodeInfo(q.nodeId, expr);
                case 'edgesOf':
                    return this.queryEdgesOf(q.nodeId, expr);
                case 'edgesBetween':
                    return this.queryEdgesBetween(q.nodeIdA, q.nodeIdB, expr);
                case 'allNodes':
                    return LayoutEvaluatorResult.fromSet(this.allNodeIds, expr);
                case 'allGroups':
                    return new LayoutEvaluatorResult([...this.groupMembers.keys()].sort(), expr);
                case 'union': {
                    const sets = q.operands.map(op => this.evaluateToAtomSet(op));
                    const result = new Set<string>();
                    for (const s of sets) for (const v of s) result.add(v);
                    return LayoutEvaluatorResult.fromSet(result, expr);
                }
                case 'intersection': {
                    const sets = q.operands.map(op => this.evaluateToAtomSet(op));
                    let result = sets[0];
                    for (let i = 1; i < sets.length; i++) {
                        const next = sets[i];
                        result = new Set([...result].filter(v => next.has(v)));
                    }
                    return LayoutEvaluatorResult.fromSet(result, expr);
                }
                case 'negation': {
                    const inner = this.evaluateToAtomSet(q.operand);
                    const result = new Set([...this.allNodeIds].filter(v => !inner.has(v)));
                    return LayoutEvaluatorResult.fromSet(result, expr);
                }
            }
        } catch (e: any) {
            return LayoutEvaluatorResult.error(e.message ?? String(e), expr);
        }
    }

    /** Convenience: evaluate a string expression. */
    evaluate(expression: string): IEvaluatorResult {
        const parsed = this.parseExpression(expression);
        if (!parsed) {
            return LayoutEvaluatorResult.error(
                `Unrecognized spatial query: "${expression}"`, expression);
        }
        return this.query(parsed);
    }

    /** Get all node IDs in the layout. */
    getAllNodeIds(): Set<string> {
        return new Set(this.allNodeIds);
    }

    // ─── Private query implementations ───

    private queryDirectional(
        modality: Modality, relation: DirectionalRelation, nodeId: string, expr: string
    ): LayoutEvaluatorResult {
        if (!this.allNodeIds.has(nodeId)) {
            return LayoutEvaluatorResult.error(`Unknown node: "${nodeId}"`, expr);
        }
        let result: Set<string>;
        switch (modality) {
            case 'must':    result = this.validator.getMust(nodeId, relation); break;
            case 'cannot':  result = this.validator.getCannot(nodeId, relation); break;
            case 'can':     result = this.validator.getCan(nodeId, relation); break;
        }
        return LayoutEvaluatorResult.fromSet(result, expr);
    }

    private queryAligned(
        modality: Modality, axis: AlignmentAxis, nodeId: string, expr: string
    ): LayoutEvaluatorResult {
        if (!this.allNodeIds.has(nodeId)) {
            return LayoutEvaluatorResult.error(`Unknown node: "${nodeId}"`, expr);
        }
        let result: Set<string>;
        switch (modality) {
            case 'must':    result = this.validator.getMustAligned(nodeId, axis); break;
            case 'cannot':  result = this.validator.getCannotAligned(nodeId, axis); break;
            case 'can':     result = this.validator.getCanAligned(nodeId, axis); break;
        }
        return LayoutEvaluatorResult.fromSet(result, expr);
    }

    private queryGrouped(nodeId: string, expr: string): LayoutEvaluatorResult {
        const groups = this.groupsByNode.get(nodeId) ?? [];
        return new LayoutEvaluatorResult(groups.sort(), expr);
    }

    private queryGroupedTogether(nodeIds: string[], expr: string): LayoutEvaluatorResult {
        // Find groups that contain ALL of the given node IDs
        if (nodeIds.length === 0) {
            return new LayoutEvaluatorResult([...this.groupMembers.keys()].sort(), expr);
        }

        // Start with groups of the first node, then intersect
        const firstGroups = new Set(this.groupsByNode.get(nodeIds[0]) ?? []);
        for (let i = 1; i < nodeIds.length; i++) {
            const nodeGroups = new Set(this.groupsByNode.get(nodeIds[i]) ?? []);
            for (const g of firstGroups) {
                if (!nodeGroups.has(g)) firstGroups.delete(g);
            }
        }
        return new LayoutEvaluatorResult([...firstGroups].sort(), expr);
    }

    private queryContains(groupName: string, expr: string): LayoutEvaluatorResult {
        const members = this.groupMembers.get(groupName);
        if (!members) {
            return LayoutEvaluatorResult.error(`Unknown group: "${groupName}"`, expr);
        }
        return new LayoutEvaluatorResult(members.sort(), expr);
    }

    /**
     * Recursively evaluate a sub-query and extract its atom set.
     * Throws if the sub-query returns a non-atom result (record or edge result).
     */
    private evaluateToAtomSet(q: SpatialQuery): Set<string> {
        const result = this.query(q);
        if (result.isError()) {
            throw new Error(result.prettyPrint());
        }
        if (result instanceof LayoutEvaluatorRecordResult) {
            throw new Error(`Cannot use set operations on record-returning query: ${this.queryToString(q)}`);
        }
        if (result instanceof LayoutEvaluatorEdgeResult) {
            throw new Error(`Cannot use set operations on edge-returning query: ${this.queryToString(q)}`);
        }
        return new Set(result.selectedAtoms());
    }

    // ─── Affordance query implementations ───

    private queryNodeInfo(nodeId: string, expr: string): LayoutEvaluatorRecordResult {
        const node = this.nodeById.get(nodeId);
        if (!node) {
            return LayoutEvaluatorRecordResult.error(`Unknown node: "${nodeId}"`, expr);
        }
        const entries: [string, string][] = [
            ['id', node.id],
            ['label', node.label],
            ['color', node.color],
            ['size', `${node.width}x${node.height}`],
            ['type', node.mostSpecificType],
        ];
        if (node.types.length > 1) {
            entries.push(['types', node.types.join(', ')]);
        }
        if (node.attributes && Object.keys(node.attributes).length > 0) {
            for (const [key, values] of Object.entries(node.attributes)) {
                entries.push([`attr:${key}`, values.join(', ')]);
            }
        }
        if (node.labels && Object.keys(node.labels).length > 0) {
            for (const [key, values] of Object.entries(node.labels)) {
                entries.push([`label:${key}`, values.join(', ')]);
            }
        }
        if (node.groups && node.groups.length > 0) {
            entries.push(['groups', node.groups.join(', ')]);
        }
        return new LayoutEvaluatorRecordResult(entries, expr);
    }

    private queryEdgesOf(nodeId: string, expr: string): LayoutEvaluatorEdgeResult {
        if (!this.allNodeIds.has(nodeId)) {
            return LayoutEvaluatorEdgeResult.error(`Unknown node: "${nodeId}"`, expr);
        }
        const edges = this.edgesByNode.get(nodeId) ?? [];
        return LayoutEvaluatorEdgeResult.fromLayoutEdges(edges, expr);
    }

    private queryEdgesBetween(nodeIdA: string, nodeIdB: string, expr: string): LayoutEvaluatorEdgeResult {
        if (!this.allNodeIds.has(nodeIdA)) {
            return LayoutEvaluatorEdgeResult.error(`Unknown node: "${nodeIdA}"`, expr);
        }
        if (!this.allNodeIds.has(nodeIdB)) {
            return LayoutEvaluatorEdgeResult.error(`Unknown node: "${nodeIdB}"`, expr);
        }
        const pairKey = [nodeIdA, nodeIdB].sort().join('|');
        const edges = this.edgesBetweenPair.get(pairKey) ?? [];
        return LayoutEvaluatorEdgeResult.fromLayoutEdges(edges, expr);
    }

    // ─── Expression parser ───

    /**
     * Parse a spatial/affordance query expression using the Peggy-generated parser.
     *
     * Supported forms:
     *   must.leftOf(A)      can.rightOf(B)     cannot.above(C)
     *   must.aligned.x(A)   can.aligned.y(B)
     *   reachable.leftOf(A) alignedWith.x(A)
     *   grouped(A)          contains(GroupName)
     *   node(A)             edges(A)           edges(A, B)
     *   nodes()             groups()
     *   union(expr, expr)   inter(expr, expr)  not(expr)
     */
    parseExpression(expr: string): SpatialQuery | null {
        try {
            return parseQueryExpr(expr.trim()) as SpatialQuery;
        } catch {
            return null;
        }
    }

    private queryToString(q: SpatialQuery): string {
        switch (q.kind) {
            case 'directional': return `${q.modality}.${q.relation}(${q.nodeId})`;
            case 'aligned': return `${q.modality}.aligned.${q.axis}(${q.nodeId})`;
            case 'grouped': return `grouped(${q.nodeId})`;
            case 'groupedTogether': return `grouped(${q.nodeIds.join(', ')})`;
            case 'contains': return `contains(${q.groupName})`;
            case 'reachable': return `reachable.${q.relation}(${q.nodeId})`;
            case 'alignedWith': return `alignedWith.${q.axis}(${q.nodeId})`;
            case 'nodeInfo': return `node(${q.nodeId})`;
            case 'edgesOf': return `edges(${q.nodeId})`;
            case 'edgesBetween': return `edges(${q.nodeIdA}, ${q.nodeIdB})`;
            case 'allNodes': return `nodes()`;
            case 'allGroups': return `groups()`;
            case 'union': return `union(${q.operands.map(o => this.queryToString(o)).join(', ')})`;
            case 'intersection': return `inter(${q.operands.map(o => this.queryToString(o)).join(', ')})`;
            case 'negation': return `not(${this.queryToString(q.operand)})`;
        }
    }
}
