/**
 * Accessible Translator - Compiles InstanceLayout to an accessible representation
 *
 * This is a parallel compilation target to WebColaTranslator. Where WebCola produces
 * visual SVG output, this translator produces:
 * 1. A spatial navigation map (arrow-key traversal without vision)
 * 2. A structured description (navigable by section)
 * 3. Semantic HTML (ARIA tree + graphics roles)
 * 4. Flat alt-text for simple consumption
 *
 * The key insight: spatial ≠ visual. The constraints in an InstanceLayout define
 * spatial relationships (above, below, left, right, grouped) that can drive
 * keyboard navigation and structured descriptions without needing pixel positions.
 *
 * @example
 * ```typescript
 * import { AccessibleTranslator } from 'spytial-core';
 *
 * const translator = new AccessibleTranslator();
 * const accessible = translator.translate(instanceLayout);
 *
 * // Keyboard navigation: what's below Alice?
 * const neighbors = accessible.navigation.getNeighbors('Alice0');
 * console.log(neighbors.below); // 'Bob0'
 *
 * // Semantic HTML for screen readers
 * const html = accessible.toHTML();
 *
 * // Simple alt text
 * const alt = accessible.toAltText();
 * ```
 */

import {
    InstanceLayout,
    LayoutNode,
    LayoutEdge,
    LayoutConstraint,
    isTopConstraint,
    isLeftConstraint,
    isAlignmentConstraint,
} from '../../layout/interfaces';

// ─── Public Types ──────────────────────────────────────────────────────────

export interface AccessibleLayout {
    /** Structured description tree — navigable by section */
    description: LayoutDescription;

    /** Spatial navigation graph — arrow-key traversal without vision */
    navigation: SpatialNavigationMap;

    /** Render to semantic HTML string (ARIA tree + graphics roles) */
    toHTML(): string;

    /** Render to flat alt-text string */
    toAltText(): string;
}

// ─── Spatial Navigation ────────────────────────────────────────────────────

export interface SpatialNavigationMap {
    /** For each node, what can you reach in each spatial direction? */
    getNeighbors(nodeId: string): SpatialNeighbors | undefined;

    /** All node IDs in navigation order (topological from constraints) */
    nodeOrder: string[];

    /** All entries in the map */
    entries(): [string, SpatialNeighbors][];
}

export interface SpatialNeighbors {
    // Spatial (from constraints) — nearest neighbor in each direction
    above: string | null;
    below: string | null;
    left: string | null;
    right: string | null;

    // Structural (from edges)
    outgoing: EdgeReference[];
    incoming: EdgeReference[];

    // Grouping
    containingGroups: string[];
    groupMembers: string[];    // if this node is a group key
}

export interface EdgeReference {
    nodeId: string;
    nodeLabel: string;
    relation: string;
}

// ─── Layout Description ────────────────────────────────────────────────────

export interface LayoutDescription {
    overview: OverviewSection;
    types: TypeSection[];
    nodes: NodeDescription[];
    groups: GroupDescription[];
    relationships: RelationshipSummary[];
    spatialRelationships: SpatialRelationshipDescription[];
}

export interface OverviewSection {
    totalNodes: number;
    totalEdges: number;
    totalGroups: number;
    totalConstraints: number;
    typesPresent: string[];
    disconnectedNodeCount: number;
    summary: string;
}

export interface TypeSection {
    typeName: string;
    typeHierarchy: string[];
    nodeCount: number;
    nodeLabels: string[];
    summary: string;
}

export interface NodeDescription {
    id: string;
    label: string;
    mostSpecificType: string;
    types: string[];
    groups: string[];
    attributes: Record<string, string[]>;
    labels: Record<string, string[]>;
    disconnected: boolean;
    outgoing: EdgeDescription[];
    incoming: EdgeDescription[];
    summary: string;
}

export interface EdgeDescription {
    connectedNodeId: string;
    connectedNodeLabel: string;
    relation: string;
    style?: string;
    hidden: boolean;
    summary: string;
}

export interface GroupDescription {
    name: string;
    nodeCount: number;
    nodeIds: string[];
    nodeLabels: string[];
    keyNodeId: string;
    keyNodeLabel: string;
    negated: boolean;
    overlapping: boolean;
    summary: string;
}

export interface RelationshipSummary {
    relationName: string;
    edgeCount: number;
    sourceTypes: string[];
    targetTypes: string[];
    summary: string;
}

export interface SpatialRelationshipDescription {
    kind: 'above' | 'below' | 'left-of' | 'right-of' | 'aligned-horizontal' | 'aligned-vertical' | 'grouped';
    sourceNodeId: string;
    sourceNodeLabel: string;
    targetNodeId: string;
    targetNodeLabel: string;
    reason: string;
    description: string;
}

// ─── Options ───────────────────────────────────────────────────────────────

export interface AccessibleTranslatorOptions {
    /** Include hidden edges in descriptions. Default: false */
    includeHiddenEdges?: boolean;
    /** Include disconnected nodes. Default: true */
    includeDisconnectedNodes?: boolean;
    /** Maximum nodes to fully describe. Default: 50 */
    maxDetailedNodes?: number;
}

// ─── Translator Class ──────────────────────────────────────────────────────

/**
 * Translates an InstanceLayout to an accessible representation.
 *
 * Parallel to WebColaTranslator: takes the same InstanceLayout input,
 * but produces a navigable accessible output instead of visual SVG data.
 */
export class AccessibleTranslator {

    translate(layout: InstanceLayout, options: AccessibleTranslatorOptions = {}): AccessibleLayout {
        const opts = {
            includeHiddenEdges: false,
            includeDisconnectedNodes: true,
            maxDetailedNodes: 50,
            ...options,
        };

        const navigation = buildSpatialNavigationMap(layout);
        const description = buildLayoutDescription(layout, navigation, opts);

        return {
            description,
            navigation,
            toHTML: () => renderAccessibleHTML(layout, description, navigation),
            toAltText: () => renderAltText(description),
        };
    }
}


// ─── Spatial Navigation Map ────────────────────────────────────────────────

/**
 * Builds a spatial navigation map from the constraints in an InstanceLayout.
 *
 * The map enables arrow-key navigation through the diagram:
 * - TopConstraint(A, B) → A.below = B, B.above = A
 * - LeftConstraint(A, B) → A.right = B, B.left = A
 * - Transitive reduction ensures "nearest neighbor" semantics
 * - Unconstrained nodes fall back to edge connectivity
 */
export function buildSpatialNavigationMap(layout: InstanceLayout): SpatialNavigationMap {
    const nodeMap = new Map<string, LayoutNode>();
    for (const node of layout.nodes) {
        nodeMap.set(node.id, node);
    }

    // Build raw adjacency from constraints
    // For each direction, track all pairs (not just nearest yet)
    const belowOf = new Map<string, Set<string>>(); // A → set of nodes below A
    const aboveOf = new Map<string, Set<string>>(); // A → set of nodes above A
    const rightOf = new Map<string, Set<string>>(); // A → set of nodes right of A
    const leftOf = new Map<string, Set<string>>();  // A → set of nodes left of A

    for (const constraint of layout.constraints) {
        if (isTopConstraint(constraint)) {
            addToSetMap(belowOf, constraint.top.id, constraint.bottom.id);
            addToSetMap(aboveOf, constraint.bottom.id, constraint.top.id);
        } else if (isLeftConstraint(constraint)) {
            addToSetMap(rightOf, constraint.left.id, constraint.right.id);
            addToSetMap(leftOf, constraint.right.id, constraint.left.id);
        }
    }

    // Also extract from disjunctive constraints (pick the first alternative as a reasonable default)
    if (layout.disjunctiveConstraints) {
        for (const disj of layout.disjunctiveConstraints) {
            if (disj.alternatives.length > 0) {
                for (const constraint of disj.alternatives[0]) {
                    if (isTopConstraint(constraint)) {
                        addToSetMap(belowOf, constraint.top.id, constraint.bottom.id);
                        addToSetMap(aboveOf, constraint.bottom.id, constraint.top.id);
                    } else if (isLeftConstraint(constraint)) {
                        addToSetMap(rightOf, constraint.left.id, constraint.right.id);
                        addToSetMap(leftOf, constraint.right.id, constraint.left.id);
                    }
                }
            }
        }
    }

    // Transitive reduction: for each node, find the nearest neighbor in each direction.
    // If A below B and B below C, then A's nearest below is B, not C.
    const nearestBelow = transitiveReduce(belowOf);
    const nearestAbove = transitiveReduce(aboveOf);
    const nearestRight = transitiveReduce(rightOf);
    const nearestLeft = transitiveReduce(leftOf);

    // Build edge connectivity maps
    const outgoingEdges = new Map<string, EdgeReference[]>();
    const incomingEdges = new Map<string, EdgeReference[]>();
    for (const edge of layout.edges) {
        if (edge.hidden) continue;
        // Skip group-internal edges
        if (edge.groupId) continue;

        if (!outgoingEdges.has(edge.source.id)) outgoingEdges.set(edge.source.id, []);
        outgoingEdges.get(edge.source.id)!.push({
            nodeId: edge.target.id,
            nodeLabel: edge.target.label,
            relation: edge.relationName,
        });

        if (!incomingEdges.has(edge.target.id)) incomingEdges.set(edge.target.id, []);
        incomingEdges.get(edge.target.id)!.push({
            nodeId: edge.source.id,
            nodeLabel: edge.source.label,
            relation: edge.relationName,
        });
    }

    // Build group membership maps
    const groupMembership = new Map<string, string[]>(); // nodeId → group names
    const groupKeyMembers = new Map<string, string[]>(); // keyNodeId → member labels
    for (const group of layout.groups) {
        if (group.negated) continue;
        for (const nodeId of group.nodeIds) {
            if (!groupMembership.has(nodeId)) groupMembership.set(nodeId, []);
            groupMembership.get(nodeId)!.push(group.name);
        }
        const memberLabels = group.nodeIds
            .map(id => nodeMap.get(id)?.label ?? id)
            .filter(label => label !== (nodeMap.get(group.keyNodeId)?.label ?? group.keyNodeId));
        if (!groupKeyMembers.has(group.keyNodeId)) groupKeyMembers.set(group.keyNodeId, []);
        groupKeyMembers.get(group.keyNodeId)!.push(...memberLabels);
    }

    // Build the neighbors map
    const neighborsMap = new Map<string, SpatialNeighbors>();
    for (const node of layout.nodes) {
        const nid = node.id;
        neighborsMap.set(nid, {
            above: nearestAbove.get(nid) ?? null,
            below: nearestBelow.get(nid) ?? null,
            left: nearestLeft.get(nid) ?? null,
            right: nearestRight.get(nid) ?? null,
            outgoing: outgoingEdges.get(nid) ?? [],
            incoming: incomingEdges.get(nid) ?? [],
            containingGroups: groupMembership.get(nid) ?? [],
            groupMembers: groupKeyMembers.get(nid) ?? [],
        });
    }

    // For nodes with no spatial neighbors at all, fall back to edge connectivity
    for (const node of layout.nodes) {
        const nb = neighborsMap.get(node.id)!;
        const hasSpatial = nb.above || nb.below || nb.left || nb.right;
        if (!hasSpatial) {
            // Use first outgoing edge target as "right" and first incoming as "left"
            if (nb.outgoing.length > 0 && !nb.right) {
                nb.right = nb.outgoing[0].nodeId;
            }
            if (nb.incoming.length > 0 && !nb.left) {
                nb.left = nb.incoming[0].nodeId;
            }
        }
    }

    // Compute a topological navigation order from top-left to bottom-right
    const nodeOrder = computeNavigationOrder(layout.nodes, nearestBelow, nearestRight);

    return {
        getNeighbors: (nodeId: string) => neighborsMap.get(nodeId),
        nodeOrder,
        entries: () => Array.from(neighborsMap.entries()),
    };
}


// ─── Layout Description ────────────────────────────────────────────────────

function buildLayoutDescription(
    layout: InstanceLayout,
    navigation: SpatialNavigationMap,
    opts: Required<AccessibleTranslatorOptions>,
): LayoutDescription {
    return {
        overview: buildOverview(layout, opts),
        types: buildTypeBreakdown(layout),
        nodes: buildNodeDescriptions(layout, opts),
        groups: buildGroupDescriptions(layout),
        relationships: buildRelationshipSummary(layout, opts),
        spatialRelationships: buildSpatialRelationships(layout),
    };
}

function buildOverview(layout: InstanceLayout, opts: Required<AccessibleTranslatorOptions>): OverviewSection {
    const visibleEdges = opts.includeHiddenEdges
        ? layout.edges
        : layout.edges.filter(e => !e.hidden && !e.groupId);

    const typeCount = new Map<string, number>();
    for (const node of layout.nodes) {
        typeCount.set(node.mostSpecificType, (typeCount.get(node.mostSpecificType) ?? 0) + 1);
    }
    const typesPresent = Array.from(typeCount.keys()).sort();
    const disconnectedCount = layout.nodes.filter(n => n.disconnected).length;

    const typeBreakdown = Array.from(typeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');

    const parts: string[] = [];
    parts.push(`${layout.nodes.length} node${layout.nodes.length !== 1 ? 's' : ''}`);
    if (typeBreakdown) parts[0] += ` (${typeBreakdown})`;
    parts.push(`${visibleEdges.length} edge${visibleEdges.length !== 1 ? 's' : ''}`);
    if (layout.groups.length > 0) {
        parts.push(`${layout.groups.length} group${layout.groups.length !== 1 ? 's' : ''}`);
    }

    const summary = layout.nodes.length === 0
        ? 'This diagram is empty.'
        : `Diagram with ${parts.join(', ')}.`;

    return {
        totalNodes: layout.nodes.length,
        totalEdges: visibleEdges.length,
        totalGroups: layout.groups.length,
        totalConstraints: layout.constraints.length + (layout.disjunctiveConstraints?.length ?? 0),
        typesPresent,
        disconnectedNodeCount: disconnectedCount,
        summary,
    };
}

function buildTypeBreakdown(layout: InstanceLayout): TypeSection[] {
    const byType = new Map<string, LayoutNode[]>();
    for (const node of layout.nodes) {
        if (!byType.has(node.mostSpecificType)) byType.set(node.mostSpecificType, []);
        byType.get(node.mostSpecificType)!.push(node);
    }

    return Array.from(byType.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([typeName, nodes]) => {
            const hierarchy = nodes[0].types;
            const labels = nodes.map(n => n.label);
            const parentInfo = hierarchy.length > 1 ? ` (extends ${hierarchy[1]})` : '';
            return {
                typeName,
                typeHierarchy: hierarchy,
                nodeCount: nodes.length,
                nodeLabels: labels,
                summary: `${typeName}${parentInfo}: ${labels.join(', ')} (${nodes.length} node${nodes.length !== 1 ? 's' : ''})`,
            };
        });
}

function buildNodeDescriptions(layout: InstanceLayout, opts: Required<AccessibleTranslatorOptions>): NodeDescription[] {
    const nodes = opts.includeDisconnectedNodes
        ? layout.nodes
        : layout.nodes.filter(n => !n.disconnected);

    const limited = nodes.slice(0, opts.maxDetailedNodes);

    // Build edge lookup
    const outgoing = new Map<string, EdgeDescription[]>();
    const incoming = new Map<string, EdgeDescription[]>();

    for (const edge of layout.edges) {
        if (!opts.includeHiddenEdges && edge.hidden) continue;
        if (edge.groupId) continue;

        const outDesc: EdgeDescription = {
            connectedNodeId: edge.target.id,
            connectedNodeLabel: edge.target.label,
            relation: edge.relationName,
            style: edge.style,
            hidden: edge.hidden ?? false,
            summary: `--${edge.relationName}--> ${edge.target.label}`,
        };
        if (!outgoing.has(edge.source.id)) outgoing.set(edge.source.id, []);
        outgoing.get(edge.source.id)!.push(outDesc);

        const inDesc: EdgeDescription = {
            connectedNodeId: edge.source.id,
            connectedNodeLabel: edge.source.label,
            relation: edge.relationName,
            style: edge.style,
            hidden: edge.hidden ?? false,
            summary: `${edge.source.label} --${edge.relationName}-->`,
        };
        if (!incoming.has(edge.target.id)) incoming.set(edge.target.id, []);
        incoming.get(edge.target.id)!.push(inDesc);
    }

    return limited.map(node => {
        const nodeOutgoing = outgoing.get(node.id) ?? [];
        const nodeIncoming = incoming.get(node.id) ?? [];
        const groups = node.groups ?? [];
        const attrs = node.attributes ?? {};

        const summaryParts: string[] = [`${node.label} (${node.mostSpecificType})`];

        // Attributes
        const attrEntries = Object.entries(attrs);
        if (attrEntries.length > 0) {
            const attrStr = attrEntries
                .map(([k, v]) => `${k}: ${v.join(', ')}`)
                .join('; ');
            summaryParts.push(`Attributes: ${attrStr}`);
        }

        // Groups
        if (groups.length > 0) {
            summaryParts.push(`In group${groups.length > 1 ? 's' : ''}: ${groups.join(', ')}`);
        }

        // Connections
        if (nodeOutgoing.length > 0) {
            summaryParts.push(`Connects to: ${nodeOutgoing.map(e => `${e.connectedNodeLabel} (${e.relation})`).join(', ')}`);
        }
        if (nodeIncoming.length > 0) {
            summaryParts.push(`Connected from: ${nodeIncoming.map(e => `${e.connectedNodeLabel} (${e.relation})`).join(', ')}`);
        }

        if (node.disconnected) {
            summaryParts.push('(disconnected)');
        }

        return {
            id: node.id,
            label: node.label,
            mostSpecificType: node.mostSpecificType,
            types: node.types,
            groups,
            attributes: attrs,
            labels: node.labels ?? {},
            disconnected: node.disconnected ?? false,
            outgoing: nodeOutgoing,
            incoming: nodeIncoming,
            summary: summaryParts.join('. ') + '.',
        };
    });
}

function buildGroupDescriptions(layout: InstanceLayout): GroupDescription[] {
    const nodeMap = new Map<string, LayoutNode>();
    for (const node of layout.nodes) {
        nodeMap.set(node.id, node);
    }

    return layout.groups.map(group => {
        const nodeLabels = group.nodeIds.map(id => nodeMap.get(id)?.label ?? id);
        const keyLabel = nodeMap.get(group.keyNodeId)?.label ?? group.keyNodeId;

        let summary: string;
        if (group.negated) {
            summary = `Group "${group.name}" is negated (${nodeLabels.join(', ')} cannot form a contiguous group).`;
        } else {
            summary = `Group "${group.name}" contains ${nodeLabels.join(', ')} (${group.nodeIds.length} node${group.nodeIds.length !== 1 ? 's' : ''}).`;
            if (group.overlapping) {
                summary += ' This group overlaps with other groups.';
            }
        }

        return {
            name: group.name,
            nodeCount: group.nodeIds.length,
            nodeIds: [...group.nodeIds],
            nodeLabels,
            keyNodeId: group.keyNodeId,
            keyNodeLabel: keyLabel,
            negated: group.negated ?? false,
            overlapping: group.overlapping ?? false,
            summary,
        };
    });
}

function buildRelationshipSummary(layout: InstanceLayout, opts: Required<AccessibleTranslatorOptions>): RelationshipSummary[] {
    const byRelation = new Map<string, { edges: LayoutEdge[], sourceTypes: Set<string>, targetTypes: Set<string> }>();

    for (const edge of layout.edges) {
        if (!opts.includeHiddenEdges && edge.hidden) continue;
        if (edge.groupId) continue;

        if (!byRelation.has(edge.relationName)) {
            byRelation.set(edge.relationName, { edges: [], sourceTypes: new Set(), targetTypes: new Set() });
        }
        const entry = byRelation.get(edge.relationName)!;
        entry.edges.push(edge);
        entry.sourceTypes.add(edge.source.mostSpecificType);
        entry.targetTypes.add(edge.target.mostSpecificType);
    }

    return Array.from(byRelation.entries())
        .sort((a, b) => b[1].edges.length - a[1].edges.length)
        .map(([name, data]) => {
            const srcTypes = Array.from(data.sourceTypes).sort();
            const tgtTypes = Array.from(data.targetTypes).sort();
            return {
                relationName: name,
                edgeCount: data.edges.length,
                sourceTypes: srcTypes,
                targetTypes: tgtTypes,
                summary: `${name}: ${srcTypes.join('|')} → ${tgtTypes.join('|')} (${data.edges.length} edge${data.edges.length !== 1 ? 's' : ''})`,
            };
        });
}

function buildSpatialRelationships(layout: InstanceLayout): SpatialRelationshipDescription[] {
    const results: SpatialRelationshipDescription[] = [];

    for (const constraint of layout.constraints) {
        const reason = extractConstraintReason(constraint);

        if (isTopConstraint(constraint)) {
            results.push({
                kind: 'above',
                sourceNodeId: constraint.top.id,
                sourceNodeLabel: constraint.top.label,
                targetNodeId: constraint.bottom.id,
                targetNodeLabel: constraint.bottom.label,
                reason,
                description: `${constraint.top.label} is above ${constraint.bottom.label}${reason ? ` (${reason})` : ''}`,
            });
        } else if (isLeftConstraint(constraint)) {
            results.push({
                kind: 'left-of',
                sourceNodeId: constraint.left.id,
                sourceNodeLabel: constraint.left.label,
                targetNodeId: constraint.right.id,
                targetNodeLabel: constraint.right.label,
                reason,
                description: `${constraint.left.label} is to the left of ${constraint.right.label}${reason ? ` (${reason})` : ''}`,
            });
        } else if (isAlignmentConstraint(constraint)) {
            const kind = constraint.axis === 'y' ? 'aligned-horizontal' as const : 'aligned-vertical' as const;
            const axisDesc = constraint.axis === 'y' ? 'horizontally' : 'vertically';
            results.push({
                kind,
                sourceNodeId: constraint.node1.id,
                sourceNodeLabel: constraint.node1.label,
                targetNodeId: constraint.node2.id,
                targetNodeLabel: constraint.node2.label,
                reason,
                description: `${constraint.node1.label} is ${axisDesc} aligned with ${constraint.node2.label}${reason ? ` (${reason})` : ''}`,
            });
        }
    }

    return results;
}

function extractConstraintReason(constraint: LayoutConstraint): string {
    const src = constraint.sourceConstraint;
    if (!src) return '';

    // All ConstraintOperation subclasses have a `selector` field
    if ('selector' in src && typeof src.selector === 'string') {
        return src.selector;
    }
    // GroupByField has a `field` field
    if ('field' in src && typeof src.field === 'string') {
        return src.field;
    }
    // ImplicitConstraint has a `reason` field
    if ('reason' in src && typeof src.reason === 'string') {
        return src.reason;
    }
    return '';
}


// ─── HTML Rendering ────────────────────────────────────────────────────────

function renderAccessibleHTML(
    layout: InstanceLayout,
    description: LayoutDescription,
    navigation: SpatialNavigationMap,
): string {
    const lines: string[] = [];
    const esc = escapeHtml;

    lines.push(`<div role="graphics-document" aria-roledescription="diagram" aria-label="${esc(description.overview.summary)}">`);

    // Overview — visible to everyone, not just screen readers
    lines.push(`  <p class="diagram-overview">${esc(description.overview.summary)}</p>`);

    // Main navigable tree: groups as expandable parents, nodes as leaves
    lines.push(`  <div role="tree" aria-label="Diagram nodes">`);

    // Render groups first, keyed by node ID (not label, which may be duplicated)
    const groupedNodeIds = new Set<string>();
    const nodeDescById = new Map(description.nodes.map(n => [n.id, n]));

    let isFirstNode = true;
    for (const group of description.groups) {
        if (group.negated) continue;
        for (const nid of group.nodeIds) {
            groupedNodeIds.add(nid);
        }

        lines.push(`    <div role="treeitem" aria-expanded="true" aria-label="Group: ${esc(group.name)}" tabindex="-1">`);
        lines.push(`      <span class="group-label">${esc(group.name)} <span class="node-count">(${group.nodeCount} nodes)</span></span>`);
        lines.push(`      <div role="group">`);

        // Render nodes within this group by ID
        for (const nid of group.nodeIds) {
            const nodeDesc = nodeDescById.get(nid);
            if (nodeDesc) {
                lines.push(renderNodeTreeItem(nodeDesc, navigation, 8, isFirstNode));
                isFirstNode = false;
            }
        }

        lines.push(`      </div>`);
        lines.push(`    </div>`);
    }

    // Render ungrouped nodes
    for (const nodeDesc of description.nodes) {
        if (groupedNodeIds.has(nodeDesc.id)) continue;
        lines.push(renderNodeTreeItem(nodeDesc, navigation, 4, isFirstNode));
        isFirstNode = false;
    }

    lines.push(`  </div>`);

    // Relationships as a read-only data table (native table semantics, not role="grid")
    if (description.relationships.length > 0) {
        lines.push(`  <section class="diagram-relationships">`);
        lines.push(`    <h3>Relationships</h3>`);
        lines.push(`    <table aria-label="Relationships">`);
        lines.push(`      <thead><tr><th scope="col">From</th><th scope="col">Relation</th><th scope="col">To</th></tr></thead>`);
        lines.push(`      <tbody>`);

        for (const edge of layout.edges) {
            if (edge.hidden || edge.groupId) continue;
            lines.push(`        <tr><td>${esc(edge.source.label)}</td><td>${esc(edge.relationName)}</td><td>${esc(edge.target.label)}</td></tr>`);
        }

        lines.push(`      </tbody>`);
        lines.push(`    </table>`);
        lines.push(`  </section>`);
    }

    // Spatial relationships — visible as prose, not just dt/dd
    if (description.spatialRelationships.length > 0) {
        lines.push(`  <section class="diagram-spatial" aria-label="Spatial layout">`);
        lines.push(`    <h3>Spatial Layout</h3>`);
        lines.push(`    <ul>`);
        for (const sr of description.spatialRelationships) {
            // Human-readable: "Node (5) is to the left of Node (10), because of the left relation"
            const because = sr.reason ? `, because of the <em>${esc(sr.reason)}</em> relation` : '';
            lines.push(`      <li><strong>${esc(sr.sourceNodeLabel)}</strong> is ${kindToPhrase(sr.kind)} <strong>${esc(sr.targetNodeLabel)}</strong>${because}</li>`);
        }
        lines.push(`    </ul>`);
        lines.push(`  </section>`);
    }

    lines.push(`</div>`);
    return lines.join('\n');
}

function kindToPhrase(kind: string): string {
    switch (kind) {
        case 'above': return 'above';
        case 'below': return 'below';
        case 'left-of': return 'to the left of';
        case 'right-of': return 'to the right of';
        case 'aligned': return 'aligned with';
        case 'grouped': return 'grouped with';
        default: return 'related to';
    }
}

/**
 * Sanitize an ID for use in HTML id/aria-describedby attributes.
 * Replaces anything that isn't alphanumeric, hyphen, or underscore.
 */
function sanitizeId(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function renderNodeTreeItem(
    nodeDesc: NodeDescription,
    navigation: SpatialNavigationMap,
    indent: number,
    isFirstFocusable: boolean = false,
): string {
    const pad = ' '.repeat(indent);
    const esc = escapeHtml;
    const safeId = sanitizeId(nodeDesc.id);
    const nb = navigation.getNeighbors(nodeDesc.id);

    // Build data-nav attributes (IDs sanitized for attribute safety)
    const navAttrs: string[] = [];
    if (nb?.above) navAttrs.push(`data-nav-above="node-${sanitizeId(nb.above)}"`);
    if (nb?.below) navAttrs.push(`data-nav-below="node-${sanitizeId(nb.below)}"`);
    if (nb?.left) navAttrs.push(`data-nav-left="node-${sanitizeId(nb.left)}"`);
    if (nb?.right) navAttrs.push(`data-nav-right="node-${sanitizeId(nb.right)}"`);

    const descId = `desc-${safeId}`;
    const navStr = navAttrs.length > 0 ? ' ' + navAttrs.join(' ') : '';

    // First node in the tree gets tabindex="0" so the tree is keyboard-focusable;
    // all others get tabindex="-1" (roving tabindex pattern per WAI-ARIA APG).
    const tabIndex = isFirstFocusable ? '0' : '-1';

    // Build visible attribute chips
    const attrParts: string[] = [];
    if (nodeDesc.attributes) {
        for (const [key, values] of Object.entries(nodeDesc.attributes)) {
            if (values.length > 0) {
                attrParts.push(`<span class="node-attr"><span class="attr-key">${esc(key)}</span>: ${esc(values.join(', '))}</span>`);
            }
        }
    }

    // Build visible connection summary
    const connParts: string[] = [];
    for (const edge of nodeDesc.outgoing) {
        connParts.push(`<span class="node-edge node-edge-out">${esc(edge.relation)} &rarr; ${esc(edge.connectedNodeLabel)}</span>`);
    }
    for (const edge of nodeDesc.incoming) {
        connParts.push(`<span class="node-edge node-edge-in">${esc(edge.connectedNodeLabel)} &rarr; ${esc(edge.relation)}</span>`);
    }

    const lines: string[] = [];
    lines.push(`${pad}<div role="treeitem" id="node-${safeId}" aria-roledescription="diagram node" aria-label="${esc(nodeDesc.label)} (${esc(nodeDesc.mostSpecificType)})" aria-describedby="${descId}" tabindex="${tabIndex}"${navStr}>`);

    // Expanded screen reader description
    lines.push(`${pad}  <span id="${descId}" class="sr-only">${esc(nodeDesc.summary)}</span>`);

    // Visible content: label, type badge, attributes, connections
    lines.push(`${pad}  <span class="node-label">${esc(nodeDesc.label)}</span>`);
    lines.push(`${pad}  <span class="node-type">${esc(nodeDesc.mostSpecificType)}</span>`);

    if (attrParts.length > 0) {
        lines.push(`${pad}  <span class="node-attrs">${attrParts.join(' ')}</span>`);
    }
    if (connParts.length > 0) {
        lines.push(`${pad}  <span class="node-connections">${connParts.join(' ')}</span>`);
    }

    lines.push(`${pad}</div>`);

    return lines.join('\n');
}


// ─── Alt Text Rendering ────────────────────────────────────────────────────

function renderAltText(description: LayoutDescription): string {
    const sections: string[] = [];

    // Overview — concise
    sections.push(description.overview.summary);

    // Key relationships — expressed naturally
    if (description.relationships.length > 0) {
        const relParts = description.relationships.map(r =>
            `${r.relationName} (${r.edgeCount})`
        );
        sections.push('Edges: ' + relParts.join(', ') + '.');
    }

    // Groups
    if (description.groups.length > 0) {
        sections.push(description.groups.map(g => g.summary).join(' '));
    }

    // Spatial layout — expressed as natural prose, no redundant "(left)" suffix
    if (description.spatialRelationships.length > 0) {
        const spatialParts = description.spatialRelationships.slice(0, 8).map(s => {
            const phrase = kindToPhrase(s.kind);
            const because = s.reason ? ` (${s.reason})` : '';
            return `${s.sourceNodeLabel} ${phrase} ${s.targetNodeLabel}${because}`;
        });
        let spatialText = 'Layout: ' + spatialParts.join('; ') + '.';
        if (description.spatialRelationships.length > 8) {
            spatialText += ` And ${description.spatialRelationships.length - 8} more.`;
        }
        sections.push(spatialText);
    }

    return sections.join(' ');
}


// ─── Utilities ─────────────────────────────────────────────────────────────

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
}

/**
 * Computes transitive reduction: for each node, find only the nearest neighbor
 * in the given direction (removing transitively reachable nodes).
 *
 * If A→B and B→C both exist, A's nearest is B (not C).
 * Returns a map of nodeId → nearest single neighbor.
 */
function transitiveReduce(adjacency: Map<string, Set<string>>): Map<string, string | null> {
    const result = new Map<string, string | null>();

    for (const [nodeId, neighbors] of adjacency.entries()) {
        if (neighbors.size === 0) {
            result.set(nodeId, null);
            continue;
        }
        if (neighbors.size === 1) {
            result.set(nodeId, neighbors.values().next().value!);
            continue;
        }

        // Find neighbors that are NOT reachable through other neighbors
        // A neighbor X is "nearest" if no other neighbor Y has X in its transitive closure
        const reachableFromOthers = new Set<string>();
        for (const neighbor of neighbors) {
            // BFS/DFS from this neighbor to see what it can reach
            const reachable = getTransitiveReachable(neighbor, adjacency);
            for (const r of reachable) {
                if (r !== neighbor) reachableFromOthers.add(r);
            }
        }

        // Nearest = neighbors that aren't reachable from other neighbors
        const nearest = Array.from(neighbors).filter(n => !reachableFromOthers.has(n));
        // Pick the first one (arbitrary tie-breaking)
        result.set(nodeId, nearest.length > 0 ? nearest[0] : neighbors.values().next().value!);
    }

    return result;
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
 * Computes a navigation order for nodes based on spatial constraints.
 * Attempts top-to-bottom, left-to-right ordering.
 */
function computeNavigationOrder(
    nodes: LayoutNode[],
    belowOf: Map<string, string | null>,
    rightOf: Map<string, string | null>,
): string[] {
    if (nodes.length === 0) return [];

    // Build an ordering based on "above" and "left" constraints
    // Nodes that are above others come first; among peers, left comes first
    const nodeIds = new Set(nodes.map(n => n.id));

    // Find root nodes (nothing is above them and nothing is to their left)
    const hasAbove = new Set<string>();
    const hasLeft = new Set<string>();
    for (const [, to] of belowOf.entries()) {
        if (to && nodeIds.has(to)) hasAbove.add(to);
    }
    for (const [, to] of rightOf.entries()) {
        if (to && nodeIds.has(to)) hasLeft.add(to);
    }

    // Simple topological sort based on vertical ordering
    const visited = new Set<string>();
    const order: string[] = [];

    // Start with nodes that have nothing above them
    const starts = nodes.filter(n => !hasAbove.has(n.id)).map(n => n.id);
    // Sort starts by left-to-right (those with nothing to their left come first)
    starts.sort((a, b) => {
        const aHasLeft = hasLeft.has(a);
        const bHasLeft = hasLeft.has(b);
        if (aHasLeft !== bHasLeft) return aHasLeft ? 1 : -1;
        return 0;
    });

    const queue = [...starts];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        order.push(current);

        // Add right neighbor first (same row), then below neighbor (next row)
        const right = rightOf.get(current);
        if (right && !visited.has(right)) queue.push(right);
        const below = belowOf.get(current);
        if (below && !visited.has(below)) queue.push(below);
    }

    // Add any remaining nodes not reachable from constraints
    for (const node of nodes) {
        if (!visited.has(node.id)) {
            order.push(node.id);
        }
    }

    return order;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
