import { RelativeOrientationConstraint, CyclicOrientationConstraint } from "./layoutspec";

/**
 * Represents a visual grouping of related nodes in the layout.
 */
export interface LayoutGroup {
    /** Display name for the group */
    name : string;

    /** Array of node IDs that belong to this group */
    nodeIds : string[];

    /** The primary/key node ID that represents this group */
    keyNodeId : string;

    /** Whether to display the group label in the visualization */
    showLabel : boolean;
}

/**
 * Represents a visual node in the layout with styling and positioning information.
 */
export interface LayoutNode {
    /** Unique identifier for the node */
    id: string;
    /** Display label for the node */
    label: string;
    /** Color of the node in CSS format */
    color : string;
    /** Array of group names this node belongs to */
    groups?: string[];
    /** Additional attributes for the node */
    attributes?: Record<string, string[]>;
    /** Optional icon identifier for the node */
    icon? : string;
    /** Width of the node in pixels */
    width : number;
    /** Height of the node in pixels */
    height : number;
    /** The most specific type of this node */
    mostSpecificType : string;
    /** Array of all types this node belongs to */
    types : string[];
    /** Whether to show labels on this node */
    showLabels : boolean;
}

/**
 * Represents a visual edge connecting two nodes in the layout.
 */
export interface LayoutEdge {
    /** Source node of the edge */
    source: LayoutNode;
    /** Target node of the edge */
    target: LayoutNode;
    /** Display label for the edge */
    label: string;
    /** Name of the relation this edge represents */
    relationName : string;
    /** Unique identifier for the edge */
    id : string;
    /** Color of the edge in CSS format */
    color: string;
}

export class ImplicitConstraint {
    constructor(public c : RelativeOrientationConstraint | CyclicOrientationConstraint, public reason: string) {}

    toHTML(): string {
        const origHTML = this.c.toHTML();
        return `Implicit constraint ${origHTML} because ${this.reason}`;
    }
}

export interface LayoutConstraint {
    sourceConstraint: RelativeOrientationConstraint | CyclicOrientationConstraint | ImplicitConstraint; // Not grouping, and I hate introducing implicit (which should hopefully never show up)
}


export interface TopConstraint extends LayoutConstraint {
    top : LayoutNode;
    bottom : LayoutNode;
    minDistance : number;
}

// Add a typeguard for the constraint
export function isTopConstraint(constraint: LayoutConstraint): constraint is TopConstraint {
    return (constraint as TopConstraint).top !== undefined;
}

export interface LeftConstraint extends LayoutConstraint {
    left : LayoutNode;
    right : LayoutNode;
    minDistance : number;
}

export function isLeftConstraint(constraint: LayoutConstraint): constraint is LeftConstraint {
    return (constraint as LeftConstraint).left !== undefined;
}

// Same value along axis
export interface AlignmentConstraint extends LayoutConstraint {
    axis : "x" | "y";
    node1 : LayoutNode;
    node2 : LayoutNode;
}

export function isAlignmentConstraint(constraint: LayoutConstraint): constraint is AlignmentConstraint {
    return (constraint as AlignmentConstraint).axis !== undefined;
}



export interface InstanceLayout {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    constraints: LayoutConstraint[];
    groups: LayoutGroup[];
    conflictingConstraints?: LayoutConstraint[];
}

// Can we write a typeguard for this?
export function isInstanceLayout(obj: any): obj is InstanceLayout {
    return (
        Array.isArray(obj.nodes) &&
        Array.isArray(obj.edges) &&
        Array.isArray(obj.constraints) &&
        Array.isArray(obj.groups) &&
        obj.nodes.every((node: any) => typeof node.id === 'string') &&
        obj.edges.every((edge: any) => typeof edge.source === 'object' && typeof edge.target === 'object') &&
        obj.constraints.every((constraint: any) => typeof constraint.sourceConstraint === 'object') &&
        obj.groups.every((group: any) => typeof group.name === 'string')
    );
}