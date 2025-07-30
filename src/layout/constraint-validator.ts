import { Solver, Variable, Expression, Strength, Operator, Constraint } from 'kiwi.js';
import { InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup, LayoutConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint, TopConstraint, LeftConstraint, AlignmentConstraint, ImplicitConstraint } from './interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint } from './layoutspec';



type SourceConstraint = RelativeOrientationConstraint | CyclicOrientationConstraint | ImplicitConstraint;

export interface ErrorMessages {
    conflictingConstraint: string;
    conflictingSourceConstraint: string;
    minimalConflictingConstraints: Map<string, string[]>;
}

/**
 * Represents a constraint validation error with structured data
 * Provides detailed information about constraint conflicts for programmatic handling
 */
export interface ConstraintError  extends Error {
    /** Type of constraint error */
    readonly type: 'group-overlap' | 'positional-conflict' | 'unknown-constraint';

    /** Human-readable error message */
    readonly message: string;

}

export function isPositionalConstraintError(error: unknown): error is PositionalConstraintError {
    return (error as PositionalConstraintError).type === 'positional-conflict';
}

export function isGroupOverlapError(error: unknown): error is GroupOverlapError {
    return (error as GroupOverlapError).type === 'group-overlap';
}

interface PositionalConstraintError extends ConstraintError {
    type: 'positional-conflict';
    conflictingConstraint: LayoutConstraint;
    conflictingSourceConstraint: SourceConstraint;
    minimalConflictingSet: Map<SourceConstraint, LayoutConstraint[]>;
    errorMessages?: ErrorMessages;
}

interface GroupOverlapError extends ConstraintError {
    type: 'group-overlap';
    group1: LayoutGroup;
    group2: LayoutGroup;
    overlappingNodes: LayoutNode[];
}

export { type PositionalConstraintError, type GroupOverlapError }

export function orientationConstraintToString(constraint: LayoutConstraint) {
    if (isTopConstraint(constraint)) {
        let tc = constraint as TopConstraint;
        return `ENSURE: ${tc.top.id} is above ${tc.bottom.id}`;
    }
    else if (isLeftConstraint(constraint)) {
        let lc = constraint as LeftConstraint;
        return `ENSURE: ${lc.left.id} is to the left of ${lc.right.id}`;
    }
    else if (isAlignmentConstraint(constraint)) {
        let ac = constraint as AlignmentConstraint;
        let axis = ac.axis;
        let node1 = ac.node1;
        let node2 = ac.node2;

        if (axis === 'x') {
            return `ENSURE: ${node1.id} is vertically aligned with ${node2.id}`;
        }
        else if (axis === 'y') {
            return `ENSURE: ${node1.id} is horizontally aligned with ${node2.id}`;
        }

        return `ENSURE: ${node1.id} is aligned with ${node2.id} along the ${axis} axis`;
    }
    return `ENSURE: Unknown constraint type: ${constraint}`;
}


class ConstraintValidator {

    private solver: Solver;
    private variables: { [key: string]: { x: Variable, y: Variable } };

    private added_constraints: any[];

    layout: InstanceLayout;
    orientationConstraints: LayoutConstraint[];
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    groups: LayoutGroup[];
    minPadding: number = 15;

    public horizontallyAligned: LayoutNode[][] = [];
    public verticallyAligned: LayoutNode[][] = [];

    constructor(layout: InstanceLayout) {
        this.layout = layout;
        this.solver = new Solver();
        this.nodes = layout.nodes;
        this.edges = layout.edges;
        this.orientationConstraints = layout.constraints;
        this.variables = {};
        this.groups = layout.groups;
        this.added_constraints = [];
    }

    public validateConstraints(): ConstraintError | null {
        return this.validateGroupConstraints() || this.validatePositionalConstraints();
    }

    public validatePositionalConstraints(): PositionalConstraintError | null {

        this.nodes.forEach(node => {
            let index = this.getNodeIndex(node.id);
            this.variables[index] = {
                x: new Variable(`${node.id}_x`),
                y: new Variable(`${node.id}_y`),
            };
        });

        for (let i = 0; i < this.orientationConstraints.length; i++) {
            let constraint = this.orientationConstraints[i]; // TODO: This changes?
            let error = this.addConstraintToSolver(constraint);
            if (error) {
                return error;
            }
        }

        // Add group boundary constraints to prevent non-member nodes from being positioned within group boundaries
        const groupBoundaryConstraints = this.generateGroupBoundaryConstraints();
        for (const constraint of groupBoundaryConstraints) {
            let error = this.addConstraintToSolver(constraint);
            if (error) {
                return error;
            }
        }

        this.solver.updateVariables();

        //// TODO: Does adding these play badly when we have circular layouts?

        // Now that the solver has solved, we can get an ALIGNMENT ORDER for the nodes.
        let and_more_constraints = this.getAlignmentOrders();

        // Now add THESE constraints to the layout constraints (including group boundary constraints)
        this.layout.constraints = this.layout.constraints.concat(and_more_constraints).concat(groupBoundaryConstraints);

        return null;
    }

    /**
     * Validates group constraints and returns the first overlap error found
     * @returns GroupOverlapError if groups overlap, null otherwise
     */
    public validateGroupConstraints(): GroupOverlapError | null {
        for (let i = 0; i < this.groups.length; i++) {
            const group = this.groups[i];
            
            for (let j = i + 1; j < this.groups.length; j++) {
                const otherGroup = this.groups[j];
                
                // Skip if one group is a subgroup of the other
                if (this.isSubGroup(group, otherGroup) || this.isSubGroup(otherGroup, group)) {
                    continue;
                }
                
                const intersection = this.groupIntersection(group, otherGroup);
                
                if (intersection.length > 0) {
                    // Map node IDs to actual LayoutNode objects
                    const overlappingNodes: LayoutNode[] = intersection
                        .map(nodeId => this.nodes.find(n => n.id === nodeId))
                        .filter((node): node is LayoutNode => node !== undefined);
                    
                    const groupOverlapError: GroupOverlapError = {
                        name: 'GroupOverlapError',
                        type: 'group-overlap',
                        message: `Groups <b>"${group.name}"</b> and <b>"${otherGroup.name}"</b> overlap with nodes: ${intersection.join(', ')}`,
                        group1: group,
                        group2: otherGroup,
                        overlappingNodes: overlappingNodes
                    };
                    
                    return groupOverlapError; // ✅ Properly returns from the method
                }
            }
        }
        
        return null; // No overlaps found
    }

    private getNodeIndex(nodeId: string) {
        return this.nodes.findIndex(node => node.id === nodeId);
    }


    //Find the SMALLEST subset of consistentConstraints that is inconsistent with conflictingConstraint

    // This is still only LOCALLY minimal.
    private getMinimalConflictingConstraints(consistentConstraints: LayoutConstraint[], conflictingConstraint: LayoutConstraint): LayoutConstraint[] {
        // Start with all consistent constraints plus the conflicting one
        let core = [...consistentConstraints, conflictingConstraint];
        let changed = true;

        // Only try removing from the consistent constraints, not the conflicting one (which must be present)
        while (changed) {
            changed = false;
            for (let i = 0; i < core.length - 1; i++) { // -1 to always keep conflictingConstraint
                let testSet = core.slice(0, i).concat(core.slice(i + 1));
                let solver = new Solver();
                try {
                    for (const c of testSet) {


                        let cassowaryConstraints = this.constraintToKiwi(c);
                        // Add the Cassowary constraints to the solver
                        cassowaryConstraints.forEach((cassowaryConstraint) => {
                            // console.log("Adding constraint to solver:", cassowaryConstraint);
                            // console.log("Constraint to add:", this.orientationConstraintToString(c));
                            // console.log("Cassowary constraint:", cassowaryConstraint);
                            solver.addConstraint(cassowaryConstraint);
                        });
                    }
                    solver.updateVariables();
                    // If no error, this subset is satisfiable, so keep the constraint in the core
                } catch {
                    // Still unsat, so we can remove this constraint from the core
                    core = testSet;
                    changed = true;
                    break;
                }
            }
        }
        // Return only the minimal subset of consistentConstraints (excluding the conflictingConstraint)
        return core.filter(c => c !== conflictingConstraint);
    }

    private constraintToKiwi(constraint: LayoutConstraint): any[] {
        // This is the main method that converts a LayoutConstraint to a Cassowary constraint.
        if (isTopConstraint(constraint)) {
            let tc = constraint as TopConstraint;

            let top = tc.top;
            let bottom = tc.bottom;
            let minDistance = tc.minDistance;

            const topId = this.getNodeIndex(top.id);
            const bottomId = this.getNodeIndex(bottom.id);

            let topVar = this.variables[topId].y;
            let bottomVar = this.variables[bottomId].y;

            // Create constraint: topVar + minDistance <= bottomVar
            let kiwiConstraint = new Constraint(topVar.plus(minDistance), Operator.Le, bottomVar, Strength.required);

            return [kiwiConstraint];
        }
        else if (isLeftConstraint(constraint)) {
            let lc = constraint as LeftConstraint;

            let left = lc.left;
            let right = lc.right;
            let minDistance = lc.minDistance;

            const leftId = this.getNodeIndex(left.id);
            const rightId = this.getNodeIndex(right.id);

            let leftVar = this.variables[leftId].x;
            let rightVar = this.variables[rightId].x;

            // Create constraint: leftVar + minDistance <= rightVar
            let kiwiConstraint = new Constraint(leftVar.plus(minDistance), Operator.Le, rightVar, Strength.required);

            return [kiwiConstraint];
        }
        else if (isAlignmentConstraint(constraint)) {


            // This is trickier. We want to REGISTER alignment AS WELL.

            let ac = constraint as AlignmentConstraint;
            let axis = ac.axis;
            let node1 = ac.node1;
            let node2 = ac.node2;

            const node1Id = this.getNodeIndex(node1.id);
            const node2Id = this.getNodeIndex(node2.id);

            let node1Var = this.variables[node1Id][axis];
            let node2Var = this.variables[node2Id][axis];

            // And register the alignment
            if (axis === 'x') {
                this.verticallyAligned.push([node1, node2]);
            }
            else if (axis === 'y') {
                this.horizontallyAligned.push([node1, node2]);
            }

            // Create equality constraint: node1Var == node2Var
            return [new Constraint(node1Var, Operator.Eq, node2Var, Strength.required)];
        }
        else {
            console.log(constraint, "Unknown constraint type");
            return [];
        }
    }

    // TODO: Factor out the constraintToCassowary bit. from the ADD to solver.
    private addConstraintToSolver(constraint: LayoutConstraint) {
        try {
            let cassowaryConstraints = this.constraintToKiwi(constraint);
            cassowaryConstraints.forEach((cassowaryConstraint) => {
                this.solver.addConstraint(cassowaryConstraint);
            });
            this.added_constraints.push(constraint);
        }
        catch (e) {

            const minimal_conflicting_constraints = this.getMinimalConflictingConstraints(this.added_constraints, constraint);


            let sourceConstraintToLayoutConstraints: Map<SourceConstraint, LayoutConstraint[]> = new Map();
            let sourceConstraintHTMLToLayoutConstraintsHTML: Map<string, string[]> = new Map();

            minimal_conflicting_constraints.forEach((c) => {
                const sourceConstraint = c.sourceConstraint;
                
                if (!sourceConstraintToLayoutConstraints.has(sourceConstraint)) {
                    sourceConstraintToLayoutConstraints.set(sourceConstraint, []);
                }

                if (!sourceConstraintHTMLToLayoutConstraintsHTML.has(sourceConstraint.toHTML())) {
                    sourceConstraintHTMLToLayoutConstraintsHTML.set(sourceConstraint.toHTML(), []);
                }
                
                sourceConstraintToLayoutConstraints.get(sourceConstraint)!.push(c);
                sourceConstraintHTMLToLayoutConstraintsHTML.get(sourceConstraint.toHTML())!.push(orientationConstraintToString(c));
            });


            const positionalConstraintError : PositionalConstraintError = {
                name: "PositionalConstraintError", // Add this required property
                type: 'positional-conflict',
                message: `Constraint "${orientationConstraintToString(constraint)}" conflicts with existing constraints`,
                conflictingConstraint: constraint,
                conflictingSourceConstraint: constraint.sourceConstraint,
                minimalConflictingSet: sourceConstraintToLayoutConstraints,
                // TODO: Migrate this to `webcola-demo.html`
                errorMessages: {
                    conflictingConstraint: `${orientationConstraintToString(constraint)}`,
                    conflictingSourceConstraint: `${constraint.sourceConstraint.toHTML()}`,
                    minimalConflictingConstraints: sourceConstraintHTMLToLayoutConstraintsHTML,
                }
            };
            return positionalConstraintError;
        }
        return null;
    }

    /**
     * Generates group boundary constraints to prevent non-member nodes from being positioned within group boundaries.
     * This fixes the issue where nodes can appear visually inside a group without being semantic members.
     * 
     * The approach uses soft constraints to encourage non-member nodes to maintain distance from group boundaries
     * without creating hard conflicts with existing layout constraints.
     */
    private generateGroupBoundaryConstraints(): LayoutConstraint[] {
        const groupBoundaryConstraints: LayoutConstraint[] = [];

        // For each group, ensure non-member nodes are encouraged to stay outside group boundaries
        for (const group of this.groups) {
            const groupMemberIds = new Set([group.keyNodeId, ...group.nodeIds]);
            
            // Find all nodes that are NOT members of this group
            const nonMemberNodes = this.nodes.filter(node => !groupMemberIds.has(node.id));
            
            // For each non-member node, add soft constraints to encourage separation from the key node
            // This helps prevent visual overlap without creating hard conflicts
            for (const nonMemberNode of nonMemberNodes) {
                const keyNode = this.nodes.find(n => n.id === group.keyNodeId);
                if (!keyNode) continue;

                // Create implicit constraint to encourage group boundary separation
                const implicitRoc = new RelativeOrientationConstraint(
                    ['left'], // Encourage horizontal separation
                    `${nonMemberNode.id}<->${group.keyNodeId}`
                );
                const groupBoundaryConstraint = new ImplicitConstraint(
                    implicitRoc, 
                    `Group Boundary: ${nonMemberNode.id} outside ${group.name}`
                );

                // Add a soft separation constraint with increased distance
                // This encourages the non-member to stay away from the group key node
                const separationConstraint: LeftConstraint = {
                    left: keyNode,
                    right: nonMemberNode,
                    minDistance: this.minPadding * 3, // Extra padding to encourage group boundary respect
                    sourceConstraint: groupBoundaryConstraint
                };

                groupBoundaryConstraints.push(separationConstraint);
            }
        }

        return groupBoundaryConstraints;
    }


    private getAlignmentOrders(): LayoutConstraint[] {
        // Make sure the solver has solved
        this.solver.updateVariables();

        // Now first, create the normalized groups.
        this.horizontallyAligned = this.normalizeAlignment(this.horizontallyAligned);
        this.verticallyAligned = this.normalizeAlignment(this.verticallyAligned);

        let implicitAlignmentConstraints: LayoutConstraint[] = [];


        // Now we need to get the order of the nodes in each group
        for (let i = 0; i < this.horizontallyAligned.length; i++) {
            this.horizontallyAligned[i].sort((a, b) => {
                const aValue = this.variables[this.getNodeIndex(a.id)].x.value();
                const bValue = this.variables[this.getNodeIndex(b.id)].x.value();
                return (aValue as number) - (bValue as number);
            });
        }

        this.horizontallyAligned.forEach((alignedLeftToRight) => {

            for (let i = 0; i < alignedLeftToRight.length - 1; i++) {
                let node1 = alignedLeftToRight[i];
                let node2 = alignedLeftToRight[i + 1];


                let roc: RelativeOrientationConstraint = new RelativeOrientationConstraint(['directlyLeft'], `${node1.id}->${node2.id}`);
                let sourceConstraint = new ImplicitConstraint(roc, "Preventing Overlap");

                let lc: LeftConstraint = {
                    left: node1,
                    right: node2,
                    minDistance: this.minPadding,
                    // sourceConstraint is ``implied'' or ``implicit'' here, since it is derived from the alignment order. That's tricky.
                    sourceConstraint: sourceConstraint
                };

                implicitAlignmentConstraints.push(lc);
            }

        });


        for (let i = 0; i < this.verticallyAligned.length; i++) {
            this.verticallyAligned[i].sort((a, b) => {
                const aValue = this.variables[this.getNodeIndex(a.id)].y.value();
                const bValue = this.variables[this.getNodeIndex(b.id)].y.value();
                return (aValue as number) - (bValue as number);
            });
        }


        this.verticallyAligned.forEach((alignedTopToBottom) => {

            for (let i = 0; i < alignedTopToBottom.length - 1; i++) {
                let node1 = alignedTopToBottom[i];
                let node2 = alignedTopToBottom[i + 1];

                let roc: RelativeOrientationConstraint = new RelativeOrientationConstraint(['directlyAbove'], `${node1.id}->${node2.id}`);
                let sourceConstraint = new ImplicitConstraint(roc, "Preventing Overlap");

                let tc: TopConstraint = {
                    top: node1,
                    bottom: node2,
                    minDistance: this.minPadding,
                    sourceConstraint: sourceConstraint
                };
                implicitAlignmentConstraints.push(tc);
            }
        });


        return implicitAlignmentConstraints;
    }


    private normalizeAlignment(aligned: LayoutNode[][]): LayoutNode[][] {
        const merged: LayoutNode[][] = [];


        /*
        Initial Merging: The first loop iterates over each group in the aligned array and checks if it has any common elements with the existing groups in the merged array. If it does, it merges them.
        */

        for (const group of aligned) {
            let mergedWithExisting = false;

            for (const existing of merged) {
                if (group.some(item => existing.includes(item))) {
                    existing.push(...group.filter(item => !existing.includes(item)));
                    mergedWithExisting = true;
                    break;
                }
            }

            if (!mergedWithExisting) {
                merged.push([...group]);
            }
        }

        // Final pass to ensure full transitive closure
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < merged.length; i++) {
                for (let j = i + 1; j < merged.length; j++) {
                    if (merged[i].some(item => merged[j].includes(item))) {
                        merged[i].push(...merged[j].filter(item => !merged[i].includes(item)));
                        merged.splice(j, 1);
                        changed = true;
                        break;
                    }
                }
                if (changed) break;
            }
        }

        return merged;
    }



    private isSubGroup(subgroup: LayoutGroup, group: LayoutGroup): boolean {
        const sgElements = subgroup.nodeIds;
        const gElements = group.nodeIds;
        return sgElements.every((element) => gElements.includes(element));
    }



    private groupIntersection(group1: LayoutGroup, group2: LayoutGroup): string[] {
        const g1Elements = group1.nodeIds;
        const g2Elements = group2.nodeIds;

        // Get elements that are in both groups
        const commonElements = g1Elements.filter(element => g2Elements.includes(element));
        return commonElements;
    }
}


export { ConstraintValidator };