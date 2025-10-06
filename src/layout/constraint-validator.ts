import { Solver, Variable, Expression, Strength, Operator, Constraint } from 'kiwi.js';
import { DisjunctiveConstraint, InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup, LayoutConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint, TopConstraint, LeftConstraint, AlignmentConstraint, ImplicitConstraint } from './interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint, GroupByField, GroupBySelector } from './layoutspec';



type SourceConstraint = RelativeOrientationConstraint | CyclicOrientationConstraint | AlignConstraint | ImplicitConstraint | GroupByField | GroupBySelector;

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


// TODO: 
export function orientationConstraintToString(constraint: LayoutConstraint) {
    const nodeLabel = (node: LayoutNode) =>
        node.label && node.label !== node.id
            ? `${node.label} (${node.id})`
            : node.id;

    if (isTopConstraint(constraint)) {
        let tc = constraint as TopConstraint;
        return `${nodeLabel(tc.top)} must be above ${nodeLabel(tc.bottom)}`;
    }
    else if (isLeftConstraint(constraint)) {
        let lc = constraint as LeftConstraint;
        return `${nodeLabel(lc.left)} must be to the left of ${nodeLabel(lc.right)}`;
    }
    else if (isAlignmentConstraint(constraint)) {
        let ac = constraint as AlignmentConstraint;
        let axis = ac.axis;
        let node1 = ac.node1;
        let node2 = ac.node2;

        if (axis === 'x') {
            return `${nodeLabel(node1)} must be vertically aligned with ${nodeLabel(node2)}`;
        }
        else if (axis === 'y') {
            return `${nodeLabel(node1)} must be horizontally aligned with ${nodeLabel(node2)}`;
        }

        return `${nodeLabel(node1)} must be aligned with ${nodeLabel(node2)} along the ${axis} axis`;
    }
    return `Unknown constraint type: ${constraint}`;
}


class ConstraintValidator {

    private solver: Solver;
    private variables: { [key: string]: { x: Variable, y: Variable } };

    private added_constraints: LayoutConstraint[];

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

        // First, add all conjunctive constraints
        for (let i = 0; i < this.orientationConstraints.length; i++) {
            let constraint = this.orientationConstraints[i];
            let error = this.addConstraintToSolver(constraint);
            if (error) {
                return error;
            }
        }

        // Track how many constraints we have before disjunctions
        const constraintsBeforeDisjunctions = this.added_constraints.length;

        // Now handle disjunctive constraints using backtracking
        const disjunctiveConstraints = this.layout.disjunctiveConstraints || [];
        if (disjunctiveConstraints.length > 0) {
            const result = this.solveDisjunctiveConstraints(disjunctiveConstraints);
            if (!result.satisfiable) {
                return result.error || null;
            }
            
            // Verify that chosen alternatives were added to added_constraints
            const chosenConstraints = this.added_constraints.slice(constraintsBeforeDisjunctions);
            console.assert(
                chosenConstraints.length > 0,
                'Disjunctive solver succeeded but no constraints were added'
            );
            
            // Add the chosen constraints to the layout constraints so they're available downstream
            this.layout.constraints = this.layout.constraints.concat(chosenConstraints);
        }

        this.solver.updateVariables();

        // Now that the solver has solved, we can get an ALIGNMENT ORDER for the nodes.
        let and_more_constraints = this.getAlignmentOrders();

        // Now add THESE constraints to the layout constraints
        this.layout.constraints = this.layout.constraints.concat(and_more_constraints);

        return null;
    }

    /**
     * Solves disjunctive constraints using backtracking.
     * For each disjunction, tries each alternative until finding a satisfiable combination.
     * The chosen alternatives are added to this.added_constraints.
     * 
     * @param disjunctions - Array of disjunctive constraints to solve
     * @returns Object indicating satisfiability and any error
     */
    private solveDisjunctiveConstraints(disjunctions: DisjunctiveConstraint[]): {
        satisfiable: boolean;
        error?: PositionalConstraintError;
    } {
        const constraintsBeforeDisjunctions = this.added_constraints.length;
        
        // Use backtracking to find a satisfying assignment
        const result = this.backtrackDisjunctions(disjunctions, 0);
        
        if (result.satisfiable) {
            // Verify that constraints were actually added
            const chosenConstraintsCount = this.added_constraints.length - constraintsBeforeDisjunctions;
            console.log(`Disjunctive solver: Successfully chose ${chosenConstraintsCount} constraints from ${disjunctions.length} disjunctions`);
            
            // Log which alternatives were chosen for debugging
            if (chosenConstraintsCount > 0) {
                console.log('Chosen constraints:', this.added_constraints.slice(constraintsBeforeDisjunctions));
            }
        }
        
        return result;
    }

    /**
     * Returns the constraints that were chosen by the disjunctive solver.
     * This is the subset of added_constraints that came from disjunctive alternatives.
     * 
     * @param beforeCount - Number of constraints before solving disjunctions
     * @returns Array of constraints chosen from disjunctive alternatives
     */
    public getChosenDisjunctiveConstraints(beforeCount: number): LayoutConstraint[] {
        return this.added_constraints.slice(beforeCount);
    }

    /**
     * Recursive backtracking to solve disjunctive constraints.
     * 
     * This implements depth-first search with backtracking:
     * - At each disjunction level, tries alternatives in order
     * - If an alternative leads to success in all remaining disjunctions, keeps it
     * - If an alternative fails in a later disjunction, backtracks to try the next alternative
     * - Only backtracks to previous disjunction level after exhausting all alternatives at current level
     * 
     * Example execution for 3 disjunctions (D1, D2, D3):
     * 1. Try D1-Alt0, then recursively try D2
     * 2. Try D2-Alt0, then recursively try D3
     * 3. Try all D3 alternatives - all fail
     * 4. Backtrack to D2, try D2-Alt1, then recursively try D3
     * 5. If D3 still fails, try D2-Alt2, etc.
     * 6. Only after all D2 alternatives fail, backtrack to D1 and try D1-Alt1
     * 
     * When a satisfying assignment is found, the chosen alternatives remain in:
     * - this.added_constraints (the LayoutConstraints that were chosen)
     * - this.solver (the Kiwi solver with those constraints applied)
     * 
     * @param disjunctions - Array of all disjunctive constraints
     * @param disjunctionIndex - Current index in the disjunctions array (current recursion depth)
     * @returns Object indicating satisfiability and any error
     */
    private backtrackDisjunctions(
        disjunctions: DisjunctiveConstraint[],
        disjunctionIndex: number
    ): {
        satisfiable: boolean;
        error?: PositionalConstraintError;
    } {
        // Base case: all disjunctions satisfied
        if (disjunctionIndex >= disjunctions.length) {
            // Success! The current state of this.added_constraints contains all chosen alternatives
            console.log(`✓ Base case reached: All ${disjunctions.length} disjunctions satisfied`);
            return { satisfiable: true };
        }

        const currentDisjunction = disjunctions[disjunctionIndex];
        const alternatives = currentDisjunction.alternatives;
        
        console.log(`Disjunction ${disjunctionIndex + 1}/${disjunctions.length}: Trying ${alternatives.length} alternatives`);

        // Try each alternative for this disjunction
        for (let altIndex = 0; altIndex < alternatives.length; altIndex++) {
            const alternative = alternatives[altIndex];
            
            console.log(`  → Disjunction ${disjunctionIndex + 1}: Trying alternative ${altIndex + 1}/${alternatives.length} (${alternative.length} constraints)`);

            // Save current state for backtracking
            const savedSolver = this.cloneSolver();
            const savedConstraints = [...this.added_constraints];
            const savedConstraintsLength = this.added_constraints.length;

            // Try adding this alternative's constraints
            let alternativeError: PositionalConstraintError | null = null;
            for (const constraint of alternative) {
                const error = this.addConstraintToSolver(constraint);
                if (error) {
                    alternativeError = error;
                    console.log(`    ✗ Alternative ${altIndex + 1} conflicts with existing constraints`);
                    break;
                }
            }

            // If this alternative is satisfiable, try to satisfy remaining disjunctions
            if (!alternativeError) {
                console.log(`    ✓ Alternative ${altIndex + 1} is locally satisfiable, recursing to disjunction ${disjunctionIndex + 2}...`);
                const result = this.backtrackDisjunctions(disjunctions, disjunctionIndex + 1);
                
                if (result.satisfiable) {
                    // Success! This combination works
                    // The chosen constraints are now in this.added_constraints
                    // Do NOT restore - keep the successful state
                    console.log(`    ✓✓ Alternative ${altIndex + 1} led to full success!`);
                    return { satisfiable: true };
                }
                
                // Otherwise, this alternative led to failure in later disjunctions
                // Fall through to backtracking below
                console.log(`    ✗ Alternative ${altIndex + 1} failed in later disjunctions, backtracking...`);
            }

            // Backtrack: restore solver state and try next alternative
            this.restoreSolver(savedSolver);
            this.added_constraints = savedConstraints;
            
            // Verify backtracking worked correctly
            console.assert(
                this.added_constraints.length === savedConstraintsLength,
                `Backtracking failed: expected ${savedConstraintsLength} constraints, got ${this.added_constraints.length}`
            );
            
            console.log(`    ⟲ Backtracked from alternative ${altIndex + 1}, state restored`);
        }

        // All alternatives exhausted for this disjunction
        // Return failure to trigger backtracking at previous disjunction level
        console.log(`  ✗✗ Disjunction ${disjunctionIndex + 1}: All ${alternatives.length} alternatives exhausted, returning failure`);
        
        // Find the minimal set of existing constraints that conflict with this disjunction
        // We need to check against ALL constraints that have been added so far
        // We'll use the first alternative as a representative constraint for conflict analysis
        const representativeConstraint = alternatives[0][0];
        const minimalConflicting = this.getMinimalConflictingConstraints(this.added_constraints, representativeConstraint);
        
        // Build the minimalConflictingSet map grouped by source constraint
        const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
        
        for (const constraint of minimalConflicting) {
            const source = constraint.sourceConstraint;
            if (!minimalConflictingSet.has(source)) {
                minimalConflictingSet.set(source, []);
            }
            minimalConflictingSet.get(source)!.push(constraint);
        }
        
        // Also add the representative constraint itself under the disjunction's source
        // This shows which constraint from the disjunction was involved in the conflict
        minimalConflictingSet.set(currentDisjunction.sourceConstraint, [representativeConstraint]);
        
        // Format error message to match regular constraint errors (user-friendly, no mention of disjunctions)
        const firstConstraintString = orientationConstraintToString(representativeConstraint);
        
        // Build errorMessages for React component (HTML-formatted strings)
        const sourceConstraintHTMLToLayoutConstraintsHTML = new Map<string, string[]>();
        
        for (const [source, constraints] of minimalConflictingSet.entries()) {
            const sourceHTML = source.toHTML();
            if (!sourceConstraintHTMLToLayoutConstraintsHTML.has(sourceHTML)) {
                sourceConstraintHTMLToLayoutConstraintsHTML.set(sourceHTML, []);
            }
            constraints.forEach(c => {
                sourceConstraintHTMLToLayoutConstraintsHTML.get(sourceHTML)!.push(orientationConstraintToString(c));
            });
        }
        
        const lastError: PositionalConstraintError = {
            name: "PositionalConstraintError",
            type: 'positional-conflict',
            message: `Constraint "${firstConstraintString}" conflicts with existing constraints`,
            conflictingConstraint: representativeConstraint,
            conflictingSourceConstraint: currentDisjunction.sourceConstraint,
            minimalConflictingSet: minimalConflictingSet,
            errorMessages: {
                conflictingConstraint: firstConstraintString,
                conflictingSourceConstraint: currentDisjunction.sourceConstraint.toHTML(),
                minimalConflictingConstraints: sourceConstraintHTMLToLayoutConstraintsHTML,
            }
        };

        return { satisfiable: false, error: lastError };
    }

    /**
     * Clones the current solver state (constraints only, not variable values).
     * Used for backtracking in disjunctive constraint solving.
     * 
     * @returns A new Solver with the same constraints as the current one
     */
    private cloneSolver(): Solver {
        const newSolver = new Solver();
        
        // Re-add all constraints from added_constraints
        for (const constraint of this.added_constraints) {
            const kiwiConstraints = this.constraintToKiwi(constraint);
            kiwiConstraints.forEach(kiwiConstraint => {
                try {
                    newSolver.addConstraint(kiwiConstraint);
                } catch (e) {
                    // Constraint may already exist, ignore
                }
            });
        }

        return newSolver;
    }

    /**
     * Restores the solver to a previous state.
     * Used for backtracking in disjunctive constraint solving.
     * 
     * @param savedSolver - The solver state to restore
     */
    private restoreSolver(savedSolver: Solver): void {
        this.solver = savedSolver;
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

                    // Format intersection with labels if they differ from IDs
                    const intersectionDisplay = overlappingNodes.map(node =>
                        node.label && node.label !== node.id
                            ? `${node.label} (${node.id})`
                            : node.id
                    );

                    const groupOverlapError: GroupOverlapError = {
                        name: 'GroupOverlapError',
                        type: 'group-overlap',
                        message: `Groups <b>"${group.name}"</b> and <b>"${otherGroup.name}"</b> overlap with nodes: ${intersectionDisplay.join(', ')}`,
                        group1: group,
                        group2: otherGroup,
                        overlappingNodes: overlappingNodes
                    };
                    
                    return groupOverlapError; 
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

    private constraintToKiwi(constraint: LayoutConstraint): Constraint[] {
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