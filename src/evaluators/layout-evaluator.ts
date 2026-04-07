/**
 * LayoutEvaluator — spatial modal queries over a validated layout.
 *
 * Delegates directional/alignment queries to QualitativeConstraintValidator's
 * modal methods (must/can/cannot). Group queries (grouped/contains) are
 * resolved locally from InstanceLayout group data.
 *
 * All query results are returned as IEvaluatorResult for REPL compatibility.
 */

import { QualitativeConstraintValidator } from '../layout/qualitative-constraint-validator';
import { InstanceLayout, LayoutGroup } from '../layout/interfaces';
import {
    IEvaluatorResult, EvaluatorResult, SingleValue, Tuple
} from './interfaces';

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
    | { kind: 'alignedWith'; axis: AlignmentAxis; nodeId: string };

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

// ─── LayoutEvaluator ─────────────────────────────────────────────────

export class LayoutEvaluator {
    private validator: QualitativeConstraintValidator;
    private layout: InstanceLayout;
    private allNodeIds: Set<string>;
    private groupsByNode: Map<string, string[]>;
    private groupMembers: Map<string, string[]>;

    constructor(validator: QualitativeConstraintValidator, layout: InstanceLayout) {
        this.validator = validator;
        this.layout = layout;

        // Collect all real node IDs
        this.allNodeIds = new Set(
            (layout.nodes ?? [])
                .filter((n: any) => !n._isAuxiliary && !n._isBoundingBox)
                .map((n: any) => n.name ?? n.id?.toString() ?? '')
                .filter((id: string) => id !== '')
        );

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
    }

    /** Execute a spatial query and return the result. */
    query(q: SpatialQuery): LayoutEvaluatorResult {
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
            }
        } catch (e: any) {
            return LayoutEvaluatorResult.error(e.message ?? String(e), expr);
        }
    }

    /** Convenience: evaluate a string expression. */
    evaluate(expression: string): LayoutEvaluatorResult {
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

    // ─── Expression parser ───

    /**
     * Parse a simple spatial query expression.
     *
     * Supported forms:
     *   must.leftOf(A)      can.rightOf(B)     cannot.above(C)
     *   must.aligned.x(A)   can.aligned.y(B)
     *   reachable.leftOf(A) alignedWith.x(A)
     *   grouped(A)          contains(GroupName)
     */
    parseExpression(expr: string): SpatialQuery | null {
        const trimmed = expr.trim();

        // grouped(nodeId) or grouped(nodeId1, nodeId2, ...)
        const groupedMatch = trimmed.match(/^grouped\(([^)]+)\)$/);
        if (groupedMatch) {
            const args = groupedMatch[1].split(/\s*,\s*/).map(s => s.trim()).filter(s => s);
            if (args.length === 1) return { kind: 'grouped', nodeId: args[0] };
            return { kind: 'groupedTogether', nodeIds: args };
        }

        // contains(groupName)
        const containsMatch = trimmed.match(/^contains\((\w+)\)$/);
        if (containsMatch) return { kind: 'contains', groupName: containsMatch[1] };

        // reachable.relation(nodeId) — resolved model
        const reachableMatch = trimmed.match(/^reachable\.(leftOf|rightOf|above|below)\((\w+)\)$/);
        if (reachableMatch) {
            return { kind: 'reachable', relation: reachableMatch[1] as DirectionalRelation, nodeId: reachableMatch[2] };
        }

        // alignedWith.axis(nodeId) — resolved model
        const alignedWithMatch = trimmed.match(/^alignedWith\.(x|y)\((\w+)\)$/);
        if (alignedWithMatch) {
            return { kind: 'alignedWith', axis: alignedWithMatch[1] as AlignmentAxis, nodeId: alignedWithMatch[2] };
        }

        // modality.aligned.axis(nodeId)
        const alignMatch = trimmed.match(/^(must|can|cannot)\.aligned\.(x|y)\((\w+)\)$/);
        if (alignMatch) {
            return {
                kind: 'aligned',
                modality: alignMatch[1] as Modality,
                axis: alignMatch[2] as AlignmentAxis,
                nodeId: alignMatch[3]
            };
        }

        // modality.relation(nodeId)
        const dirMatch = trimmed.match(/^(must|can|cannot)\.(leftOf|rightOf|above|below)\((\w+)\)$/);
        if (dirMatch) {
            return {
                kind: 'directional',
                modality: dirMatch[1] as Modality,
                relation: dirMatch[2] as DirectionalRelation,
                nodeId: dirMatch[3]
            };
        }

        return null;
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
        }
    }
}
