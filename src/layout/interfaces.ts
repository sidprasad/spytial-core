import { Group } from "webcola";
import { RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint, GroupByField, GroupBySelector, RelativeDirection } from "./layoutspec";
import { EdgeStyle } from "./edge-style";

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

    // If true, this is a negated group: "no clean rectangle can contain exactly these members."
    // Negated groups don't draw a visual rectangle; they generate anti-containment disjunctions.
    negated?: boolean;
}

export interface LayoutNode {
    id: string;
    label: string;
    color : string;
    groups?: string[];
    attributes?: Record<string, string[]>;
    /**
     * Labels associated with this node from the data instance (e.g., Skolems).
     * These are displayed prominently on nodes, typically styled in the node's color.
     * Unlike attributes (which come from field relationships), labels come from
     * metadata in the data instance.
     */
    labels?: Record<string, string[]>;
    icon? : string;
    width : number;
    height : number;
    mostSpecificType : string;
    types : string[];
    showLabels : boolean;
    /** True when the node has no edges connecting it to the rest of the graph. */
    disconnected?: boolean;
}


export interface LayoutEdge {
    source: LayoutNode;
    target: LayoutNode;
    label: string;
    relationName : string;
    id : string;
    color: string;
    style?: EdgeStyle;
    weight?: number;
    showLabel?: boolean;
    hidden?: boolean;
    /**
     * For group edges (_g_ prefix), the name of the group this edge was created for.
     * Matches `group.id` in the WebCola translator so routing can look up the group
     * directly without re-parsing edge IDs or matching fragile leaf indices.
     */
    groupId?: string;
    /**
     * For group edges (_g_ prefix), the node ID of the key (groupOn) node — i.e.
     * the external anchor node that is NOT inside the group.  Stamped at edge
     * construction time (= graphlib edge.v) so the renderer knows definitively
     * which end is the anchor and which end should be snapped to the group boundary.
     */
    keyNodeId?: string;
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
        public sourceConstraint:  CyclicOrientationConstraint | GroupByField | GroupBySelector | ImplicitConstraint | AlignConstraint | RelativeOrientationConstraint,
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


// ==================== Constraint Negation Utilities ====================
//
// NOT is implemented as a reversed inequality with minDistance=0:
//   NOT TopConstraint(A, B, D) → TopConstraint(B, A, 0)
//   NOT LeftConstraint(A, B, D) → LeftConstraint(B, A, 0)
//   NOT AlignmentConstraint(A, B, axis) → disjunction: must differ on axis
//
// For compound constraints, De Morgan's law applies:
//   NOT(C1 ∧ C2 ∧ ...) = ¬C1 ∨ ¬C2 ∨ ...   (negateConjunction)
//   NOT(A1 ∨ A2 ∨ ...) = ¬A1 ∧ ¬A2 ∧ ...   (negateDisjunction)

/**
 * Negates a single atomic LayoutConstraint.
 *
 * For ordering constraints (Top/Left), negation flips the direction
 * and sets minDistance=0, expressing the reversed ≤ inequality.
 * e.g. NOT(A above B) = A.y ≤ B.y = TopConstraint(B, A, 0).
 *
 * For alignment constraints, negation produces a disjunction (the two
 * nodes must differ on the aligned axis), returned as multiple alternatives.
 *
 * @returns An array of alternatives. Each alternative is a LayoutConstraint[].
 *          For ordering constraints this is [[reversed],[aligned]], for alignment [[alt1],[alt2]].
 */
export function negateAtomicConstraint(
    constraint: LayoutConstraint,
    sourceConstraint: LayoutConstraint['sourceConstraint']
): LayoutConstraint[][] {
    if (isTopConstraint(constraint)) {
        // ¬(top < bottom on y) = (bottom < top on y) ∨ (top ≡ bottom on y)
        const reversed: TopConstraint = {
            top: constraint.bottom,
            bottom: constraint.top,
            minDistance: 0,
            sourceConstraint
        };
        const aligned: AlignmentConstraint = {
            axis: 'y',
            node1: constraint.top,
            node2: constraint.bottom,
            sourceConstraint
        };
        return [[reversed], [aligned]];
    }

    if (isLeftConstraint(constraint)) {
        // ¬(left < right on x) = (right < left on x) ∨ (left ≡ right on x)
        const reversed: LeftConstraint = {
            left: constraint.right,
            right: constraint.left,
            minDistance: 0,
            sourceConstraint
        };
        const aligned: AlignmentConstraint = {
            axis: 'x',
            node1: constraint.left,
            node2: constraint.right,
            sourceConstraint
        };
        return [[reversed], [aligned]];
    }

    if (isAlignmentConstraint(constraint)) {
        // NOT (same axis) → must differ on that axis → disjunction
        if (constraint.axis === 'y') {
            // NOT same-Y → node1 above node2 OR node2 above node1
            const alt1: TopConstraint = {
                top: constraint.node1, bottom: constraint.node2,
                minDistance: 1, sourceConstraint
            };
            const alt2: TopConstraint = {
                top: constraint.node2, bottom: constraint.node1,
                minDistance: 1, sourceConstraint
            };
            return [[alt1], [alt2]];
        } else {
            // NOT same-X → node1 left-of node2 OR node2 left-of node1
            const alt1: LeftConstraint = {
                left: constraint.node1, right: constraint.node2,
                minDistance: 1, sourceConstraint
            };
            const alt2: LeftConstraint = {
                left: constraint.node2, right: constraint.node1,
                minDistance: 1, sourceConstraint
            };
            return [[alt1], [alt2]];
        }
    }

    // Fallback: return original unchanged (BoundingBox, GroupBoundary — not yet supported)
    return [[constraint]];
}

/**
 * Negates a conjunction of constraints using De Morgan's law.
 * NOT(C1 ∧ C2 ∧ ... ∧ Cn) = ¬C1 ∨ ¬C2 ∨ ... ∨ ¬Cn
 *
 * Each ¬Ci may itself produce multiple alternatives (e.g. negated alignment).
 * All are flattened into a single set of alternatives for a DisjunctiveConstraint.
 */
export function negateConjunction(
    conjunction: LayoutConstraint[],
    sourceConstraint: LayoutConstraint['sourceConstraint']
): LayoutConstraint[][] {
    const alternatives: LayoutConstraint[][] = [];
    for (const c of conjunction) {
        const negatedAlts = negateAtomicConstraint(c, sourceConstraint);
        alternatives.push(...negatedAlts);
    }
    return alternatives;
}

/**
 * Negates a DisjunctiveConstraint using De Morgan's law.
 * NOT(A1 ∨ A2 ∨ ... ∨ An) = ¬A1 ∧ ¬A2 ∧ ... ∧ ¬An
 *
 * Each ¬Ai = negateConjunction(Ai) produces a new DisjunctiveConstraint.
 * The returned array of DisjunctiveConstraints is implicitly conjunctive
 * (all must be satisfied), matching the existing solver contract.
 */
export function negateDisjunction(
    disjunction: DisjunctiveConstraint,
    sourceConstraint: DisjunctiveConstraint['sourceConstraint']
): DisjunctiveConstraint[] {
    const result: DisjunctiveConstraint[] = [];
    for (const alternative of disjunction.alternatives) {
        const negatedAlternatives = negateConjunction(alternative, sourceConstraint);
        result.push(new DisjunctiveConstraint(sourceConstraint, negatedAlternatives));
    }
    return result;
}
