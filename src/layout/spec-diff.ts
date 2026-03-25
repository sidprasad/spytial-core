/**
 * Spec Diff — syntactic property-level diff between two InstanceLayouts.
 *
 * Given two specs applied to the same IDataInstance, `generateLayout()` produces
 * two concrete InstanceLayouts. This module compares them element-by-element:
 * nodes, edges, constraints, and groups. The result tells you exactly WHERE and
 * HOW the two specs disagree on this data.
 *
 * This is a *syntactic* comparison of generated layouts — it compares properties
 * like colors, sizes, constraint directions, and group membership. For the
 * *semantic* denotation-level comparison (finding concrete realizations in
 * ⟦A⟧ \ ⟦B⟧), see equivalence-checker.ts and `findDistinguishingRealization`.
 */

import { IDataInstance } from '../data-instance/interfaces';
import IEvaluator from '../evaluators/interfaces';
import {
    InstanceLayout,
    LayoutNode,
    LayoutEdge,
    LayoutConstraint,
    LayoutGroup,
    isLeftConstraint,
    isTopConstraint,
    isAlignmentConstraint,
} from './interfaces';
import { parseLayoutSpec } from './layoutspec';
import { LayoutInstance } from './layoutinstance';
// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A single property that differs between the two layouts. */
export interface PropertyDiff<T = unknown> {
    property: string;
    inFirst: T;
    inSecond: T;
}

/** Diff for a single node. */
export interface NodeDiff {
    nodeId: string;
    label: string;
    status: 'identical' | 'modified' | 'only-in-first' | 'only-in-second';
    diffs: PropertyDiff[];
}

/** Diff for a single edge, keyed by (source, target, relationName). */
export interface EdgeDiff {
    sourceId: string;
    targetId: string;
    relationName: string;
    status: 'identical' | 'modified' | 'only-in-first' | 'only-in-second';
    diffs: PropertyDiff[];
}

/**
 * Diff for a single atom pair's constraint directions.
 * E.g., pair (A, B) has ['right'] in spec 1 but ['below'] in spec 2.
 */
export interface ConstraintDiff {
    pairId: [string, string];
    inFirst: string[];
    inSecond: string[];
}

/** Diff for a group. */
export interface GroupDiff {
    groupName: string;
    status: 'identical' | 'modified' | 'only-in-first' | 'only-in-second';
    membersDiff?: PropertyDiff<string[]>;
}

/** Full symmetric difference between two layouts. */
export interface SpecDiff {
    nodes: NodeDiff[];
    edges: EdgeDiff[];
    constraints: ConstraintDiff[];
    groups: GroupDiff[];
    /** Node IDs involved in any difference. */
    affectedNodeIds: Set<string>;
    /** Edge keys (source|target|relation) involved in any difference. */
    affectedEdgeKeys: Set<string>;
    /** True when the two layouts are visually identical. */
    isEmpty: boolean;
}

// ---------------------------------------------------------------------------
// Edge key helpers
// ---------------------------------------------------------------------------

function edgeKey(sourceId: string, targetId: string, relationName: string): string {
    return `${sourceId}|${targetId}|${relationName}`;
}

function edgeKeyFromEdge(e: LayoutEdge): string {
    return edgeKey(e.source.id, e.target.id, e.relationName);
}

// ---------------------------------------------------------------------------
// Constraint extraction
// ---------------------------------------------------------------------------

type ConstraintDirection = 'left-of' | 'right-of' | 'above' | 'below' | 'align-x' | 'align-y';

interface ExtractedConstraint {
    nodeA: string;
    nodeB: string;
    direction: ConstraintDirection;
}

function extractConstraint(c: LayoutConstraint): ExtractedConstraint | null {
    if (isLeftConstraint(c)) {
        return { nodeA: c.left.id, nodeB: c.right.id, direction: 'left-of' };
    }
    if (isTopConstraint(c)) {
        return { nodeA: c.top.id, nodeB: c.bottom.id, direction: 'above' };
    }
    if (isAlignmentConstraint(c)) {
        // Normalize alignment pair order for consistent comparison
        const [n1, n2] = [c.node1.id, c.node2.id].sort();
        return { nodeA: n1, nodeB: n2, direction: c.axis === 'x' ? 'align-x' : 'align-y' };
    }
    return null;
}

function constraintPairKey(nodeA: string, nodeB: string): string {
    return `${nodeA}|${nodeB}`;
}

// ---------------------------------------------------------------------------
// Node comparison
// ---------------------------------------------------------------------------

function compareNodes(a: LayoutNode, b: LayoutNode): PropertyDiff[] {
    const diffs: PropertyDiff[] = [];

    if (a.color !== b.color) {
        diffs.push({ property: 'color', inFirst: a.color, inSecond: b.color });
    }
    if (a.width !== b.width) {
        diffs.push({ property: 'width', inFirst: a.width, inSecond: b.width });
    }
    if (a.height !== b.height) {
        diffs.push({ property: 'height', inFirst: a.height, inSecond: b.height });
    }
    if ((a.icon ?? '') !== (b.icon ?? '')) {
        diffs.push({ property: 'icon', inFirst: a.icon, inSecond: b.icon });
    }

    // Groups
    const groupsA = (a.groups ?? []).slice().sort();
    const groupsB = (b.groups ?? []).slice().sort();
    if (JSON.stringify(groupsA) !== JSON.stringify(groupsB)) {
        diffs.push({ property: 'groups', inFirst: groupsA, inSecond: groupsB });
    }

    // Attributes
    const attrsA = a.attributes ?? {};
    const attrsB = b.attributes ?? {};
    if (JSON.stringify(attrsA) !== JSON.stringify(attrsB)) {
        diffs.push({ property: 'attributes', inFirst: attrsA, inSecond: attrsB });
    }

    // Labels (metadata labels like Skolems)
    const labelsA = a.labels ?? {};
    const labelsB = b.labels ?? {};
    if (JSON.stringify(labelsA) !== JSON.stringify(labelsB)) {
        diffs.push({ property: 'labels', inFirst: labelsA, inSecond: labelsB });
    }

    return diffs;
}

// ---------------------------------------------------------------------------
// Edge comparison
// ---------------------------------------------------------------------------

function compareEdges(a: LayoutEdge, b: LayoutEdge): PropertyDiff[] {
    const diffs: PropertyDiff[] = [];

    if (a.color !== b.color) {
        diffs.push({ property: 'color', inFirst: a.color, inSecond: b.color });
    }
    if ((a.style ?? 'solid') !== (b.style ?? 'solid')) {
        diffs.push({ property: 'style', inFirst: a.style, inSecond: b.style });
    }
    if ((a.weight ?? 1) !== (b.weight ?? 1)) {
        diffs.push({ property: 'weight', inFirst: a.weight, inSecond: b.weight });
    }
    if ((a.showLabel ?? true) !== (b.showLabel ?? true)) {
        diffs.push({ property: 'showLabel', inFirst: a.showLabel, inSecond: b.showLabel });
    }
    if ((a.hidden ?? false) !== (b.hidden ?? false)) {
        diffs.push({ property: 'hidden', inFirst: a.hidden, inSecond: b.hidden });
    }

    return diffs;
}

// ---------------------------------------------------------------------------
// Main diff computation
// ---------------------------------------------------------------------------

/**
 * Compute the symmetric difference between two InstanceLayouts.
 *
 * Both layouts should be generated from the same IDataInstance (different specs).
 * Compares nodes, edges, constraints, and groups element-by-element.
 */
export function computeSpecDiff(
    layoutA: InstanceLayout,
    layoutB: InstanceLayout,
): SpecDiff {
    const affectedNodeIds = new Set<string>();
    const affectedEdgeKeys = new Set<string>();

    // --- Nodes ---
    const nodesA = new Map<string, LayoutNode>();
    const nodesB = new Map<string, LayoutNode>();
    for (const n of layoutA.nodes) nodesA.set(n.id, n);
    for (const n of layoutB.nodes) nodesB.set(n.id, n);

    const allNodeIds = new Set([...nodesA.keys(), ...nodesB.keys()]);
    const nodeDiffs: NodeDiff[] = [];

    for (const id of allNodeIds) {
        const a = nodesA.get(id);
        const b = nodesB.get(id);

        if (a && !b) {
            nodeDiffs.push({ nodeId: id, label: a.label, status: 'only-in-first', diffs: [] });
            affectedNodeIds.add(id);
        } else if (!a && b) {
            nodeDiffs.push({ nodeId: id, label: b.label, status: 'only-in-second', diffs: [] });
            affectedNodeIds.add(id);
        } else if (a && b) {
            const diffs = compareNodes(a, b);
            if (diffs.length > 0) {
                nodeDiffs.push({ nodeId: id, label: a.label, status: 'modified', diffs });
                affectedNodeIds.add(id);
            } else {
                nodeDiffs.push({ nodeId: id, label: a.label, status: 'identical', diffs: [] });
            }
        }
    }

    // --- Edges ---
    const edgesA = new Map<string, LayoutEdge>();
    const edgesB = new Map<string, LayoutEdge>();
    for (const e of layoutA.edges) edgesA.set(edgeKeyFromEdge(e), e);
    for (const e of layoutB.edges) edgesB.set(edgeKeyFromEdge(e), e);

    const allEdgeKeys = new Set([...edgesA.keys(), ...edgesB.keys()]);
    const edgeDiffs: EdgeDiff[] = [];

    for (const key of allEdgeKeys) {
        const a = edgesA.get(key);
        const b = edgesB.get(key);

        if (a && !b) {
            edgeDiffs.push({
                sourceId: a.source.id, targetId: a.target.id,
                relationName: a.relationName, status: 'only-in-first', diffs: [],
            });
            affectedEdgeKeys.add(key);
        } else if (!a && b) {
            edgeDiffs.push({
                sourceId: b.source.id, targetId: b.target.id,
                relationName: b.relationName, status: 'only-in-second', diffs: [],
            });
            affectedEdgeKeys.add(key);
        } else if (a && b) {
            const diffs = compareEdges(a, b);
            if (diffs.length > 0) {
                edgeDiffs.push({
                    sourceId: a.source.id, targetId: a.target.id,
                    relationName: a.relationName, status: 'modified', diffs,
                });
                affectedEdgeKeys.add(key);
            } else {
                edgeDiffs.push({
                    sourceId: a.source.id, targetId: a.target.id,
                    relationName: a.relationName, status: 'identical', diffs: [],
                });
            }
        }
    }

    // --- Constraints ---
    // Extract concrete (nodeA, nodeB) → direction[] maps from both layouts
    const constraintsMapA = new Map<string, Set<ConstraintDirection>>();
    const constraintsMapB = new Map<string, Set<ConstraintDirection>>();

    for (const c of layoutA.constraints) {
        const ec = extractConstraint(c);
        if (!ec) continue;
        const key = constraintPairKey(ec.nodeA, ec.nodeB);
        if (!constraintsMapA.has(key)) constraintsMapA.set(key, new Set());
        constraintsMapA.get(key)!.add(ec.direction);
    }
    for (const c of layoutB.constraints) {
        const ec = extractConstraint(c);
        if (!ec) continue;
        const key = constraintPairKey(ec.nodeA, ec.nodeB);
        if (!constraintsMapB.has(key)) constraintsMapB.set(key, new Set());
        constraintsMapB.get(key)!.add(ec.direction);
    }

    const allConstraintKeys = new Set([...constraintsMapA.keys(), ...constraintsMapB.keys()]);
    const constraintDiffs: ConstraintDiff[] = [];

    for (const key of allConstraintKeys) {
        const dirsA = constraintsMapA.get(key) ?? new Set();
        const dirsB = constraintsMapB.get(key) ?? new Set();

        const sortedA = [...dirsA].sort();
        const sortedB = [...dirsB].sort();

        if (JSON.stringify(sortedA) !== JSON.stringify(sortedB)) {
            const [nodeA, nodeB] = key.split('|');
            constraintDiffs.push({
                pairId: [nodeA, nodeB],
                inFirst: sortedA,
                inSecond: sortedB,
            });
            affectedNodeIds.add(nodeA);
            affectedNodeIds.add(nodeB);
        }
    }

    // --- Groups ---
    const groupsA = new Map<string, LayoutGroup>();
    const groupsB = new Map<string, LayoutGroup>();
    for (const g of layoutA.groups) groupsA.set(g.name, g);
    for (const g of layoutB.groups) groupsB.set(g.name, g);

    const allGroupNames = new Set([...groupsA.keys(), ...groupsB.keys()]);
    const groupDiffs: GroupDiff[] = [];

    for (const name of allGroupNames) {
        const a = groupsA.get(name);
        const b = groupsB.get(name);

        if (a && !b) {
            groupDiffs.push({ groupName: name, status: 'only-in-first' });
        } else if (!a && b) {
            groupDiffs.push({ groupName: name, status: 'only-in-second' });
        } else if (a && b) {
            const membersA = [...a.nodeIds].sort();
            const membersB = [...b.nodeIds].sort();
            if (JSON.stringify(membersA) !== JSON.stringify(membersB)) {
                groupDiffs.push({
                    groupName: name,
                    status: 'modified',
                    membersDiff: { property: 'members', inFirst: membersA, inSecond: membersB },
                });
            } else {
                groupDiffs.push({ groupName: name, status: 'identical' });
            }
        }
    }

    const hasDiffs =
        nodeDiffs.some(d => d.status !== 'identical') ||
        edgeDiffs.some(d => d.status !== 'identical') ||
        constraintDiffs.length > 0 ||
        groupDiffs.some(d => d.status !== 'identical');

    return {
        nodes: nodeDiffs,
        edges: edgeDiffs,
        constraints: constraintDiffs,
        groups: groupDiffs,
        affectedNodeIds,
        affectedEdgeKeys,
        isEmpty: !hasDiffs,
    };
}

// ---------------------------------------------------------------------------
// Convenience wrapper: YAML specs → SpecDiff
// ---------------------------------------------------------------------------

/**
 * Parse two YAML specs, generate layouts against a data instance, and diff them.
 *
 * Returns both the diff and the generated layouts (for rendering).
 */
export function computeSpecDiffFromYAML(
    specA: string,
    specB: string,
    data: IDataInstance,
    evaluator: IEvaluator,
): { diff: SpecDiff; layoutA: InstanceLayout; layoutB: InstanceLayout } {
    const parsedA = parseLayoutSpec(specA);
    const parsedB = parseLayoutSpec(specB);

    const liA = new LayoutInstance(parsedA, evaluator);
    const liB = new LayoutInstance(parsedB, evaluator);

    const resultA = liA.generateLayout(data);
    const resultB = liB.generateLayout(data);

    const diff = computeSpecDiff(resultA.layout, resultB.layout);

    return { diff, layoutA: resultA.layout, layoutB: resultB.layout };
}
