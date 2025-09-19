import { RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint } from "./layoutspec";

export interface AttributeMetadata {
    values: string[];
    prominent?: boolean;
}

export interface LayoutGroup {
    // The name of the group
    name : string;

    // The nodes that are in the group
    nodeIds : string[];

    // The key node of the group
    keyNodeId : string;

    // Show label
    showLabel : boolean;
}

export interface LayoutNode {
    id: string;
    label: string;
    color : string;
    groups?: string[];
    attributes?: Record<string, AttributeMetadata>;
    icon? : string;
    width : number;
    height : number;
    mostSpecificType : string;
    types : string[];
    showLabels : boolean;
}


export interface LayoutEdge {
    source: LayoutNode;
    target: LayoutNode;
    label: string;
    relationName : string;
    id : string;
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
    sourceConstraint: RelativeOrientationConstraint | CyclicOrientationConstraint | AlignConstraint | ImplicitConstraint; // Not grouping, and I hate introducing implicit (which should hopefully never show up)
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
    overlappingNodes?: LayoutNode[]; // IDs of overlapping nodes
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