import { Group } from "webcola";
import { RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint, GroupByField, GroupBySelector } from "./layoutspec";

export interface LayoutGroup {
    // The name of the group
    name : string;

    // The nodes that are in the group
    nodeIds : string[];

    // The key node of the group
    keyNodeId : string;

    // Show label
    showLabel : boolean;

    // The source constraint that created this group (GroupByField or GroupBySelector)
    sourceConstraint?: GroupByField | GroupBySelector;
}

export interface LayoutNode {
    id: string;
    label: string;
    color : string;
    groups?: string[];
    attributes?: Record<string, string[]>;
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
    sourceConstraint: RelativeOrientationConstraint | CyclicOrientationConstraint | AlignConstraint | ImplicitConstraint | GroupByField | GroupBySelector;
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

/**
 * Represents a bounding box constraint for a group.
 * The bounding box has 4 variables (left, right, top, bottom).
 * This is used in disjunctions to enforce that non-members are outside the group.
 * 
 * The actual Kiwi constraint generation happens in the solver - this is just the high-level representation.
 */
export interface BoundingBoxConstraint extends LayoutConstraint {
    /** The group whose bounding box this represents */
    group: LayoutGroup;
    /** The node that must be positioned relative to the bounding box */
    node: LayoutNode;
    /** Which side of the bounding box: 'left' | 'right' | 'top' | 'bottom' */
    side: 'left' | 'right' | 'top' | 'bottom';
    /** Minimum padding from the bounding box edge */
    minDistance: number;
}

export function isBoundingBoxConstraint(constraint: LayoutConstraint): constraint is BoundingBoxConstraint {
    return (constraint as BoundingBoxConstraint).group !== undefined && 
           (constraint as BoundingBoxConstraint).side !== undefined;
}

/**
 * Constraint representing group-to-group boundary separation.
 * Used in disjunctive constraints to ensure two groups are positioned in one of four ways:
 * - groupA left of groupB
 * - groupA right of groupB
 * - groupA above groupB
 * - groupA below groupB
 */
export interface GroupBoundaryConstraint extends LayoutConstraint {
    /** First group */
    groupA: LayoutGroup;
    /** Second group */
    groupB: LayoutGroup;
    /** Which separation: 'left' (A left of B) | 'right' (A right of B) | 'top' (A above B) | 'bottom' (A below B) */
    side: 'left' | 'right' | 'top' | 'bottom';
    /** Minimum padding between group boundaries */
    minDistance: number;
}

export function isGroupBoundaryConstraint(constraint: LayoutConstraint): constraint is GroupBoundaryConstraint {
    return (constraint as GroupBoundaryConstraint).groupA !== undefined && 
           (constraint as GroupBoundaryConstraint).groupB !== undefined;
}

export interface InstanceLayout {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    constraints: LayoutConstraint[]; // Conjunctive constraints that must always be satisfied
    groups: LayoutGroup[];
    conflictingConstraints?: LayoutConstraint[];
    overlappingNodes?: LayoutNode[]; // IDs of overlapping nodes
    /**
     * Disjunctive constraints, where at least one alternative in each disjunction must be satisfiable.
     * These are separate from conjunctive constraints for clearer solver integration.
     */
    disjunctiveConstraints?: DisjunctiveConstraint[];

    // TODO: One frustration in the instance layout is that really this is not ..quite.. what the
    // constraint validator should take. Its not a ``validator`` per se, its more like a ``refiner``
    // that takes an instance layout and produces a refined instance layout with more constraints, but also
    // validates if needed.

    // Perhaps there is another intermediate type here that is like a ``RefinableInstanceLayout`` that has
    // some of these extra fields, and then the constraint validator takes that and produces an InstanceLayout?
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
        obj.groups.every((group: any) => typeof group.name === 'string') &&
        (obj.disjunctiveConstraints === undefined || Array.isArray(obj.disjunctiveConstraints))
    );
}


/**
 * Represents a disjunctive constraint, where at least one of the provided alternatives must be satisfiable.
 * Each alternative is an array of layout constraints that must hold together if selected.
 * Used primarily for cyclic constraints, where alternatives represent different perturbations (rotations) of a cycle.
 */
export class DisjunctiveConstraint {
    /**
     * Creates a new disjunctive constraint.
     * @param sourceConstraint - The original constraint (e.g., CyclicOrientationConstraint, GroupByField, or ImplicitConstraint) that led to this disjunction.
     * @param alternatives - An array of alternatives, where each alternative is an array of constraints that must be satisfied together.
     */
    constructor(
        public sourceConstraint:  CyclicOrientationConstraint | GroupByField | GroupBySelector | ImplicitConstraint,
        public alternatives: LayoutConstraint[][]
    ) {}

    /**
     * Returns a string representation of the disjunctive constraint for debugging.
     */
    toString(): string {
        return `DisjunctiveConstraint with ${this.alternatives.length} alternatives from ${this.sourceConstraint}`;
    }

    /**
     * Add an alternative to the disjunctive constraint.
     * @param alternative - An array of layout constraints that form a new alternative.
     */
    addAlternative(alternative: LayoutConstraint[]) {
        this.alternatives.push(alternative);
    }

    //TODO: Should we have some simplification methods here? 
}

/**
 * Type guard to check if a constraint is a disjunctive constraint.
 * @param constraint - The constraint to check.
 * @returns True if the constraint is a DisjunctiveConstraint instance.
 */
export function isDisjunctiveConstraint(constraint: LayoutConstraint | DisjunctiveConstraint): constraint is DisjunctiveConstraint {
    return constraint instanceof DisjunctiveConstraint;
}
