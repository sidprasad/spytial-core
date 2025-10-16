import { Solver, Variable, Expression, Strength, Operator, Constraint } from 'kiwi.js';
import { DisjunctiveConstraint, InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup, LayoutConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint, isBoundingBoxConstraint, TopConstraint, LeftConstraint, AlignmentConstraint, BoundingBoxConstraint, ImplicitConstraint } from './interfaces';
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
        return `${nodeLabel(lc.left)} must be to the left of  ${nodeLabel(lc.right)}`;
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
    else if (isBoundingBoxConstraint(constraint)) {
        let bc = constraint as BoundingBoxConstraint;
        // const sideDescriptions = {
        //     'left': 'to the left of',
        //     'right': 'to the right of',
        //     'top': 'above',
        //     'bottom': 'below'
        // };
        //return `${nodeLabel(bc.node)} must be ${sideDescriptions[bc.side]} group "${bc.group.name}"`;
        return `${nodeLabel(bc.node)} cannot be in group "${bc.group.name}".`;
    }
    return `Unknown constraint type: ${constraint}`;
}


class ConstraintValidator {

    private solver: Solver;
    private variables: { [key: string]: { x: Variable, y: Variable } };
    private groupBoundingBoxes: Map<string, { left: Variable, right: Variable, top: Variable, bottom: Variable }>;

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
        this.groupBoundingBoxes = new Map();
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

        // Deduplicate groups before validation to reduce constraint solving space
        const { dedupedGroups, groupMap } = this.deduplicateGroups(this.groups);
        const originalGroups = this.groups;
        this.groups = dedupedGroups; // Use deduplicated for solving

        try {
            // Add group bounding box constraints (members inside, non-members outside)
            // This must happen BEFORE updateVariables() so the solver enforces these constraints
            const groupBoundingBoxError = this.addGroupBoundingBoxConstraints();
            if (groupBoundingBoxError) {
                return groupBoundingBoxError;
            }
        } finally {
            // Restore original groups
            this.groups = originalGroups;
        }

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
            return { satisfiable: true };
        }

        const currentDisjunction = disjunctions[disjunctionIndex];
        const alternatives = currentDisjunction.alternatives;
        
        //console.log(`Disjunction ${disjunctionIndex + 1}/${disjunctions.length}: Trying ${alternatives.length} alternatives`);

        // Track which alternative made the most progress (for better IIS extraction)
        let bestAlternativeIndex = 0;
        let bestConstraintsAdded = 0;
        let bestRecursionDepth = 0;

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
            let constraintsAdded = 0;
            for (const constraint of alternative) {
                const error = this.addConstraintToSolver(constraint);
                if (error) {
                    alternativeError = error;
                    console.log(`    ✗ Alternative ${altIndex + 1} conflicts with existing constraints (added ${constraintsAdded}/${alternative.length} constraints)`);
                    break;
                }
                constraintsAdded++;
            }

            // Track progress for this alternative
            let recursionDepth = 0;

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
                
                // Track how far this alternative got before failing
                // Calculate immediately after recursive call, before backtracking modifies added_constraints
                recursionDepth = this.added_constraints.length - savedConstraintsLength;
                
                // Otherwise, this alternative led to failure in later disjunctions
                // Fall through to backtracking below
                console.log(`    ✗ Alternative ${altIndex + 1} failed in later disjunctions, backtracking... (depth: ${recursionDepth})`);
            }

            // Update best alternative if this one made more progress
            // Tie-breaking priority (most important first):
            //   1) recursionDepth: Total constraints added (local + deeper disjunctions)
            //   2) constraintsAdded: Local constraints added from this alternative
            // This ensures we use the alternative that went "deepest" for better IIS extraction
            if (recursionDepth > bestRecursionDepth || 
                (recursionDepth === bestRecursionDepth && constraintsAdded > bestConstraintsAdded)) {
                bestAlternativeIndex = altIndex;
                bestConstraintsAdded = constraintsAdded;
                bestRecursionDepth = recursionDepth;
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
        console.log(`  → Using alternative ${bestAlternativeIndex + 1} for conflict analysis (went deepest: depth=${bestRecursionDepth}, local=${bestConstraintsAdded})`);
        
        // Find the minimal set of existing constraints that conflict with this disjunction
        // Use the alternative that made the most progress (went deepest) for better IIS extraction
        const bestAlternative = alternatives[bestAlternativeIndex];
        
        // Extract truly minimal IIS using bidirectional minimization
        const minimalIIS = this.getMinimalDisjunctiveConflict(this.added_constraints, bestAlternative, currentDisjunction.sourceConstraint);
        
        // For user-facing error reporting, find the most relevant constraint from the IIS
        // Rather than using an arbitrary representative, use a constraint that involves key nodes
        let representativeConstraint = bestAlternative[0]; // fallback
        
        // If we have group constraints, prioritize constraints involving group members
        const hasGroupConstraints = bestAlternative.some(c => isBoundingBoxConstraint(c));
        // For grouping constraints, try to find a meaningful representative from the IIS
        if (hasGroupConstraints && minimalIIS.existingConstraints.length > 0) {
            // Find group members from the disjunctive constraints
            const groupMembers = new Set<string>();
            bestAlternative.forEach(c => {
                if (isBoundingBoxConstraint(c)) {
                    c.group.nodeIds.forEach(id => groupMembers.add(id));
                }
            });
            
            // Look for the first constraint in the IIS that involves group members
            const relevantConstraint = minimalIIS.existingConstraints.find(c => {
                if (isLeftConstraint(c)) {
                    return groupMembers.has(c.left.id) || groupMembers.has(c.right.id);
                } else if (isTopConstraint(c)) {
                    return groupMembers.has(c.top.id) || groupMembers.has(c.bottom.id);
                } else if (isAlignmentConstraint(c)) {
                    return groupMembers.has(c.node1.id) || groupMembers.has(c.node2.id);
                }
                return false;
            });
            
            if (relevantConstraint) {
                representativeConstraint = relevantConstraint;
                console.log(`  Using IIS constraint as representative: ${orientationConstraintToString(relevantConstraint)}`);
            }
        }
        
        // Build the minimalConflictingSet map from the minimal IIS
        const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
        
        // Add minimal existing constraints grouped by source
        for (const constraint of minimalIIS.existingConstraints) {
            const source = constraint.sourceConstraint;
            if (!minimalConflictingSet.has(source)) {
                minimalConflictingSet.set(source, []);
            }
            minimalConflictingSet.get(source)!.push(constraint);
        }
        
        // Add minimal disjunctive constraints
        minimalConflictingSet.set(currentDisjunction.sourceConstraint, minimalIIS.disjunctiveConstraints);
        
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
     * Note: The bounding box variables and member constraints are part of the main solver
     * and will be included in the clone automatically since they're in the same solver instance.
     * 
     * @returns A new Solver with the same constraints as the current one
     */
    private cloneSolver(): Solver {
        const newSolver = new Solver();
        
        // First, re-add the bounding box member constraints (these are permanent conjunctive constraints)
        this.addBoundingBoxMemberConstraintsToSolver(newSolver);
        
        // Then re-add all constraints from added_constraints (regular + disjunctive choices made so far)
        for (const constraint of this.added_constraints) {
            const kiwiConstraints = this.constraintToKiwi(constraint);
            kiwiConstraints.forEach(kiwiConstraint => {
                // try {
                //     newSolver.addConstraint(kiwiConstraint);
                // } catch (e) {
                //     // Constraint may already exist, ignore
                // }
                newSolver.addConstraint(kiwiConstraint);
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

    /**
     * Adds group bounding box constraints to the solver.
     * 
     * For each group, we create 4 variables representing the bounding box:
     * - groupLeft, groupRight, groupTop, groupBottom
     * 
     * Then we add constraints:
     * 1. Each member must be inside the bounding box (added directly to solver)
     * 2. For each "free" node (not in any other non-singleton group), create a disjunctive constraint:
     *    - Node is LEFT of box OR RIGHT of box OR ABOVE box OR BELOW box
     * 
     * Key optimization: Since groups cannot overlap (except via subsumption), we only create
     * disjunctions for nodes that are not already members of other groups. This dramatically
     * reduces the number of disjunctive constraints from O(n_nodes) to O(n_free_nodes) per group.
     * 
     * This approach scales as O(members + free_nodes) per group instead of O(members × n_nodes × 4).
     * 
     * @returns PositionalConstraintError if adding constraints fails, null otherwise
     */
    private addGroupBoundingBoxConstraints(): PositionalConstraintError | null {
        // Pre-compute which nodes belong to which groups (for non-singleton groups)
        // This allows us to identify "free" nodes that aren't in any group
        const nodeToGroups = new Map<string, Set<LayoutGroup>>();
        
        for (const node of this.nodes) {
            nodeToGroups.set(node.id, new Set());
        }
        
        for (const group of this.groups) {
            // Only track non-singleton groups with source constraints
            if (group.nodeIds.length > 1 && group.sourceConstraint) {
                for (const nodeId of group.nodeIds) {
                    nodeToGroups.get(nodeId)?.add(group);
                }
            }
        }

        for (const group of this.groups) {
            // Skip groups with no members or only one member
            if (group.nodeIds.length <= 1) continue;

            // Skip groups without a source constraint (e.g., singleton groups for disconnected nodes)
            if (!group.sourceConstraint) continue;

            // Get all member nodes
            const memberNodes = group.nodeIds
                .map(id => this.nodes.find(n => n.id === id))
                .filter((n): n is LayoutNode => n !== undefined);

            if (memberNodes.length === 0) continue;

            // Pre-compute member set for O(1) lookup instead of O(n) with includes()
            const memberIds = new Set(group.nodeIds);

            // Create 4 variables for the bounding box
            const groupLeft = new Variable(`${group.name}_bbox_left`);
            const groupRight = new Variable(`${group.name}_bbox_right`);
            const groupTop = new Variable(`${group.name}_bbox_top`);
            const groupBottom = new Variable(`${group.name}_bbox_bottom`);

            // Store the bounding box variables for this group
            this.groupBoundingBoxes.set(group.name, {
                left: groupLeft,
                right: groupRight,
                top: groupTop,
                bottom: groupBottom
            });

            // Add constraints: each member must be inside the bounding box
            // These are conjunctive (always enforced), so add directly to solver
            // IMPORTANT: We DON'T add these to added_constraints because they use the bbox variables
            // which need to exist in the solver. They'll be automatically included when we clone the solver.
            for (const member of memberNodes) {
                const memberIndex = this.getNodeIndex(member.id);
                const memberX = this.variables[memberIndex].x;
                const memberY = this.variables[memberIndex].y;

                // member.x >= groupLeft
                this.solver.addConstraint(new Constraint(memberX, Operator.Ge, groupLeft, Strength.required));
                // member.x <= groupRight
                this.solver.addConstraint(new Constraint(memberX, Operator.Le, groupRight, Strength.required));
                // member.y >= groupTop
                this.solver.addConstraint(new Constraint(memberY, Operator.Ge, groupTop, Strength.required));
                // member.y <= groupBottom
                this.solver.addConstraint(new Constraint(memberY, Operator.Le, groupBottom, Strength.required));
            }

            // For each "free" node (not in any other non-singleton group), add disjunctive constraint
            // This optimization leverages the fact that groups cannot overlap (except via subsumption)
            for (const node of this.nodes) {
                // Skip if this node is a member of this group
                if (memberIds.has(node.id)) continue;
                
                // Skip if this node belongs to other non-singleton groups
                // (it's already constrained to be in those groups, so it can't be outside this one)
                const nodeGroups = nodeToGroups.get(node.id);
                if (nodeGroups && nodeGroups.size > 0) continue;

                const sourceConstraint = group.sourceConstraint;

                // Create 4 alternatives using BoundingBoxConstraint
                const leftAlternative: BoundingBoxConstraint = {
                    group: group,
                    node: node,
                    side: 'left',
                    minDistance: this.minPadding,
                    sourceConstraint: sourceConstraint
                };

                const rightAlternative: BoundingBoxConstraint = {
                    group: group,
                    node: node,
                    side: 'right',
                    minDistance: this.minPadding,
                    sourceConstraint: sourceConstraint
                };

                const topAlternative: BoundingBoxConstraint = {
                    group: group,
                    node: node,
                    side: 'top',
                    minDistance: this.minPadding,
                    sourceConstraint: sourceConstraint
                };

                const bottomAlternative: BoundingBoxConstraint = {
                    group: group,
                    node: node,
                    side: 'bottom',
                    minDistance: this.minPadding,
                    sourceConstraint: sourceConstraint
                };

                // Create the disjunction: node must satisfy ONE of these four alternatives
                // Each alternative is an array with a single BoundingBoxConstraint
                const disjunction = new DisjunctiveConstraint(
                    sourceConstraint,
                    [[leftAlternative], [rightAlternative], [topAlternative], [bottomAlternative]]
                );

                // Add to the list of disjunctive constraints that will be solved
                if (!this.layout.disjunctiveConstraints) {
                    this.layout.disjunctiveConstraints = [];
                }
                this.layout.disjunctiveConstraints.push(disjunction);
            }
        }

        return null;
    }

    private getNodeIndex(nodeId: string) {
        return this.nodes.findIndex(node => node.id === nodeId);
    }

    /**
     * Creates a deduplicated view of groups for constraint solving.
     * Groups with identical members are collapsed into a single representative.
     * This reduces the constraint solving space without modifying the original groups.
     * 
     * @param groups - Original groups array
     * @returns Object with deduplicated groups and mapping back to originals
     */
    private deduplicateGroups(groups: LayoutGroup[]): {
        dedupedGroups: LayoutGroup[];
        groupMap: Map<LayoutGroup, LayoutGroup[]>;
    } {
        
        // Group by normalized member set (sorted IDs for comparison)
        const groupsByMembers = new Map<string, LayoutGroup[]>();
        
        for (const group of groups) {
            if (group.nodeIds.length <= 1) {
                // Keep singleton groups as-is with unique key
                const singletonKey = `_singleton_${group.nodeIds[0] || 'empty'}_${Math.random()}`;
                groupsByMembers.set(singletonKey, [group]);
                continue;
            }
            
            // Create canonical key from sorted node IDs
            // This allows us to detect groups with identical members
            const sortedIds = [...group.nodeIds].sort();
            const key = sortedIds.join('|');
            
            if (!groupsByMembers.has(key)) {
                groupsByMembers.set(key, []);
            }
            groupsByMembers.get(key)!.push(group);
        }
        
        // Create deduplicated groups (pick first of each equivalence class)
        const dedupedGroups: LayoutGroup[] = [];
        const groupMap = new Map<LayoutGroup, LayoutGroup[]>();
        
        for (const equivalentGroups of groupsByMembers.values()) {
            const representative = equivalentGroups[0];
            dedupedGroups.push(representative);
            groupMap.set(representative, equivalentGroups);
            
            // Log if we're deduplicating multiple groups
            if (equivalentGroups.length > 1) {
                console.log(`Deduplicating ${equivalentGroups.length} groups with identical members: ${equivalentGroups.map(g => g.name).join(', ')}`);
            }
        }
        
        return { dedupedGroups, groupMap };
    }

    /**
     * Adds bounding box member constraints to the given solver.
     * Helper method used both in cloneSolver and getMinimalConflictingConstraints.
     * 
     * @param solver - The solver to add constraints to
     */
    private addBoundingBoxMemberConstraintsToSolver(solver: Solver): void {
        for (const group of this.groups) {
            if (group.nodeIds.length <= 1) continue;
            if (!group.sourceConstraint) continue;

            const bbox = this.groupBoundingBoxes.get(group.name);
            if (!bbox) continue;

            const memberNodes = group.nodeIds
                .map(id => this.nodes.find(n => n.id === id))
                .filter((n): n is LayoutNode => n !== undefined);

            for (const member of memberNodes) {
                const memberIndex = this.getNodeIndex(member.id);
                const memberX = this.variables[memberIndex].x;
                const memberY = this.variables[memberIndex].y;

                try {
                    solver.addConstraint(new Constraint(memberX, Operator.Ge, bbox.left, Strength.required));
                    solver.addConstraint(new Constraint(memberX, Operator.Le, bbox.right, Strength.required));
                    solver.addConstraint(new Constraint(memberY, Operator.Ge, bbox.top, Strength.required));
                    solver.addConstraint(new Constraint(memberY, Operator.Le, bbox.bottom, Strength.required));
                } catch (e) {
                    // Constraint may already exist, ignore
                }
            }
        }
    }


    /**
     * Extracts a truly minimal IIS (Irreducible Infeasible Set) for disjunctive constraints.
     * Uses a more sophisticated bidirectional minimization algorithm that is aware of grouping constraint complexities.
     * The goal is mathematical minimality - include only constraints that are NECESSARY for the conflict.
     * 
     * @param existingConstraints - The consistent prefix of constraints
     * @param disjunctiveAlternative - The disjunctive alternative that conflicts
     * @param disjunctiveSource - The source constraint for the disjunction (for error reporting)
     * @returns Minimal IIS containing only necessary constraints from both sides
     */
    private getMinimalDisjunctiveConflict(
        existingConstraints: LayoutConstraint[], 
        disjunctiveAlternative: LayoutConstraint[],
        disjunctiveSource: SourceConstraint
    ): {
        existingConstraints: LayoutConstraint[];
        disjunctiveConstraints: LayoutConstraint[];
    } {
        // Check if this involves grouping/bounding box constraints
        const hasGroupingConstraint = disjunctiveAlternative.some(c => isBoundingBoxConstraint(c)) ||
                                      existingConstraints.some(c => isBoundingBoxConstraint(c));
        
        if (hasGroupingConstraint) {
            // For grouping constraints, use a less aggressive minimization approach
            // because group positioning involves complex interdependencies
            return this.getMinimalGroupingConflict(existingConstraints, disjunctiveAlternative);
        } else {
            // For simple constraints, use the aggressive deletion-based approach
            return this.getMinimalSimpleConflict(existingConstraints, disjunctiveAlternative);
        }
    }

    /**
     * Handle IIS extraction for grouping-related conflicts.
     * These require special handling because group positioning involves multiple interdependent constraints.
     */
    private getMinimalGroupingConflict(
        existingConstraints: LayoutConstraint[], 
        disjunctiveAlternative: LayoutConstraint[]
    ): {
        existingConstraints: LayoutConstraint[];
        disjunctiveConstraints: LayoutConstraint[];
    } {
        // Debug logging for your specific case
        console.log(`🔍 Grouping Conflict Analysis:`);
        console.log(`  Existing constraints (${existingConstraints.length}):`);
        existingConstraints.forEach((c, i) => {
            let desc = `${i}: `;
            if (isLeftConstraint(c)) {
                desc += `${c.left.id} → ${c.right.id}`;
            } else if (isTopConstraint(c)) {
                desc += `${c.top.id} ↓ ${c.bottom.id}`;
            } else if (isBoundingBoxConstraint(c)) {
                desc += `${c.node.id} ${c.side} of group ${c.group.name}`;
            } else if (isAlignmentConstraint(c)) {
                desc += `align ${c.node1.id} + ${c.node2.id} on ${c.axis}`;
            } else {
                desc += `unknown constraint type`;
            }
            console.log(`    ${desc} (source: ${c.sourceConstraint?.toHTML?.() || 'unknown'})`);
        });
        
        console.log(`  Disjunctive alternative (${disjunctiveAlternative.length}):`);
        disjunctiveAlternative.forEach((c, i) => {
            let desc = `${i}: `;
            if (isBoundingBoxConstraint(c)) {
                desc += `${c.node.id} ${c.side} of group ${c.group.name}`;
            } else if (isLeftConstraint(c)) {
                desc += `${c.left.id} → ${c.right.id}`;
            } else if (isTopConstraint(c)) {
                desc += `${c.top.id} ↓ ${c.bottom.id}`;
            } else if (isAlignmentConstraint(c)) {
                desc += `align ${c.node1.id} + ${c.node2.id} on ${c.axis}`;
            } else {
                desc += `unknown constraint type`;
            }
            console.log(`    ${desc}`);
        });
        
        // For grouping conflicts, we need to be more conservative about minimization
        // because the conflict often involves the interaction of multiple constraints
        
        // Start with a simple approach: find constraints that directly conflict
        let relevantExisting = [...existingConstraints];
        
        // Try the traditional minimization approach first, but recognize its limitations for disjunctive constraints
        if (disjunctiveAlternative.length > 0) {
            const representative = disjunctiveAlternative[0];
            console.log(`  Testing traditional minimization with representative:`, 
                        isBoundingBoxConstraint(representative) ? 
                        `${representative.node.id} ${representative.side} of group ${representative.group.name}` : 
                        'non-bbox constraint');
            
            // Test if there's actually a conflict first
            const fullSet = [...existingConstraints, representative];
            const hasConflict = this.isConflictingSet(fullSet);
            console.log(`  Full set conflict test: ${hasConflict}`);
            
            if (hasConflict) {
                relevantExisting = this.getMinimalConflictingConstraints(existingConstraints, representative);
                console.log(`  After traditional minimization: ${relevantExisting.length} constraints`);
            } else {
                console.log(`  No conflict detected with traditional approach!`);
                // For grouping constraints, fall back to a simple expansion
                relevantExisting = [];
            }
        }
        
        // If we get too few constraints, include a broader set
        if (relevantExisting.length <= 1) {
            console.log(`  Too few constraints (${relevantExisting.length}), expanding based on group members...`);
            
            // Get group members from the disjunctive constraints
            const groupMembers = new Set<string>();
            for (const constraint of disjunctiveAlternative) {
                if (isBoundingBoxConstraint(constraint)) {
                    constraint.group.nodeIds.forEach(id => groupMembers.add(id));
                }
            }
            
            console.log(`  Group members: ${Array.from(groupMembers).join(', ')}`);
            
            // Include constraints that involve group members
            relevantExisting = existingConstraints.filter(constraint => {
                if (isLeftConstraint(constraint)) {
                    return groupMembers.has(constraint.left.id) || groupMembers.has(constraint.right.id);
                } else if (isTopConstraint(constraint)) {
                    return groupMembers.has(constraint.top.id) || groupMembers.has(constraint.bottom.id);
                } else if (isAlignmentConstraint(constraint)) {
                    return groupMembers.has(constraint.node1.id) || groupMembers.has(constraint.node2.id);
                }
                return false;
            });
            
            console.log(`  After expansion: ${relevantExisting.length} constraints`);
        }
        
        console.log(`  Final IIS - Existing constraints:`);
        relevantExisting.forEach((c, i) => {
            let desc = `${i}: `;
            if (isLeftConstraint(c)) {
                desc += `${c.left.id} → ${c.right.id}`;
            } else if (isTopConstraint(c)) {
                desc += `${c.top.id} ↓ ${c.bottom.id}`;
            } else if (isBoundingBoxConstraint(c)) {
                desc += `${c.node.id} ${c.side} of group ${c.group.name}`;
            } else if (isAlignmentConstraint(c)) {
                desc += `align ${c.node1.id} + ${c.node2.id} on ${c.axis}`;
            } else {
                desc += `unknown constraint type`;
            }
            console.log(`    ${desc}`);
        });
        
        return {
            existingConstraints: relevantExisting,
            disjunctiveConstraints: disjunctiveAlternative
        };
    }

    /**
     * Handle IIS extraction for simple (non-grouping) conflicts.
     * These can use aggressive deletion-based minimization.
     */
    private getMinimalSimpleConflict(
        existingConstraints: LayoutConstraint[], 
        disjunctiveAlternative: LayoutConstraint[]
    ): {
        existingConstraints: LayoutConstraint[];
        disjunctiveConstraints: LayoutConstraint[];
    } {
        // Algorithm: Find the truly minimal IIS using deletion-based minimization
        // Start with the full conflicting set and iteratively remove constraints
        // until we can't remove any more without making the set satisfiable
        
        let currentExisting = [...existingConstraints];
        let currentDisjunctive = [...disjunctiveAlternative];
        
        // Verify we actually have a conflict to start with
        if (!this.isConflicting(currentExisting, currentDisjunctive)) {
            // No conflict - return empty sets (shouldn't happen, but handle gracefully)
            return {
                existingConstraints: [],
                disjunctiveConstraints: disjunctiveAlternative.length > 0 ? [disjunctiveAlternative[0]] : []
            };
        }
        
        // Phase 1: Minimize existing constraints
        // Try removing each existing constraint to see if we still have a conflict
        let changed = true;
        while (changed && currentExisting.length > 0) {
            changed = false;
            for (let i = currentExisting.length - 1; i >= 0; i--) {
                const testExisting = currentExisting.slice(0, i).concat(currentExisting.slice(i + 1));
                
                // If removing this constraint still leaves a conflict, we can remove it
                if (this.isConflicting(testExisting, currentDisjunctive)) {
                    currentExisting = testExisting;
                    changed = true;
                    // Don't break - continue trying to remove more constraints
                }
            }
        }
        
        // Phase 2: Minimize disjunctive constraints
        // Try removing each disjunctive constraint to see if we still have a conflict
        changed = true;
        while (changed && currentDisjunctive.length > 0) {
            changed = false;
            for (let i = currentDisjunctive.length - 1; i >= 0; i--) {
                const testDisjunctive = currentDisjunctive.slice(0, i).concat(currentDisjunctive.slice(i + 1));
                
                // If removing this constraint still leaves a conflict, we can remove it
                if (this.isConflicting(currentExisting, testDisjunctive)) {
                    currentDisjunctive = testDisjunctive;
                    changed = true;
                    // Don't break - continue trying to remove more constraints
                }
            }
        }
        
        // Phase 3: Final bidirectional pass
        // Try one more round of minimization on existing constraints
        // in case the disjunctive minimization opened up new opportunities
        changed = true;
        while (changed && currentExisting.length > 0) {
            changed = false;
            for (let i = currentExisting.length - 1; i >= 0; i--) {
                const testExisting = currentExisting.slice(0, i).concat(currentExisting.slice(i + 1));
                
                if (this.isConflicting(testExisting, currentDisjunctive)) {
                    currentExisting = testExisting;
                    changed = true;
                }
            }
        }
        
        // Ensure we have at least some constraints in the result
        if (currentExisting.length === 0 && currentDisjunctive.length === 0) {
            // Fallback: use first constraint from each side
            currentExisting = existingConstraints.length > 0 ? [existingConstraints[0]] : [];
            currentDisjunctive = disjunctiveAlternative.length > 0 ? [disjunctiveAlternative[0]] : [];
        }
        
        return {
            existingConstraints: currentExisting,
            disjunctiveConstraints: currentDisjunctive
        };
    }

        /**
     * Tests if two sets of constraints are conflicting when combined.
     * 
     * @param constraints1 - First set of constraints
     * @param constraints2 - Second set of constraints  
     * @returns True if the combination is unsatisfiable
     */
    private isConflicting(constraints1: LayoutConstraint[], constraints2: LayoutConstraint[]): boolean {
        return this.isConflictingSet([...constraints1, ...constraints2]);
    }

    /**
     * Helper method to check if a set of constraints is conflicting.
     * Properly handles bounding box constraints by setting up required variables.
     */
    private isConflictingSet(constraints: LayoutConstraint[]): boolean {
        const testSolver = new Solver();
        
        try {
            // Add bounding box constraints if needed
            const hasBoundingBoxConstraint = constraints.some(c => isBoundingBoxConstraint(c));
            if (hasBoundingBoxConstraint) {
                // We need to set up a temporary bounding box system for testing
                const testGroupBoundingBoxes = new Map<string, { left: Variable, right: Variable, top: Variable, bottom: Variable }>();
                
                // Create bounding box variables for any groups mentioned in constraints
                const groupsNeeded = new Set<string>();
                constraints.forEach(c => {
                    if (isBoundingBoxConstraint(c)) {
                        groupsNeeded.add(c.group.name);
                    }
                });
                
                // Create bounding box variables for each group
                groupsNeeded.forEach(groupName => {
                    testGroupBoundingBoxes.set(groupName, {
                        left: new Variable(`test_${groupName}_bbox_left`),
                        right: new Variable(`test_${groupName}_bbox_right`),
                        top: new Variable(`test_${groupName}_bbox_top`),
                        bottom: new Variable(`test_${groupName}_bbox_bottom`)
                    });
                });
                
                // Temporarily replace the real groupBoundingBoxes with our test ones
                const originalGroupBoundingBoxes = this.groupBoundingBoxes;
                this.groupBoundingBoxes = testGroupBoundingBoxes;
                
                try {
                    // Add member constraints for groups if needed
                    this.addBoundingBoxMemberConstraintsToSolver(testSolver);
                    
                    // Add all constraints
                    for (const constraint of constraints) {
                        const kiwiConstraints = this.constraintToKiwi(constraint);
                        kiwiConstraints.forEach(kc => testSolver.addConstraint(kc));
                    }
                    
                    testSolver.updateVariables();
                    return false; // Satisfiable, so not conflicting
                } finally {
                    // Restore original groupBoundingBoxes
                    this.groupBoundingBoxes = originalGroupBoundingBoxes;
                }
            } else {
                // No bounding box constraints, use simple approach
                for (const constraint of constraints) {
                    const kiwiConstraints = this.constraintToKiwi(constraint);
                    kiwiConstraints.forEach(kc => testSolver.addConstraint(kc));
                }
                
                testSolver.updateVariables();
                return false; // Satisfiable, so not conflicting
            }
        } catch {
            return true; // Unsatisfiable, so conflicting
        }
    }

    /**
     * Find the SMALLEST subset of consistentConstraints that is inconsistent with conflictingConstraint.
     * Uses an improved deletion-based minimization algorithm.
     */
    private getMinimalConflictingConstraints(consistentConstraints: LayoutConstraint[], conflictingConstraint: LayoutConstraint): LayoutConstraint[] {
        // Start with all consistent constraints plus the conflicting one
        let core = [...consistentConstraints, conflictingConstraint];
        
        // Verify we have a conflict to begin with
        if (!this.isConflictingSet(core)) {
            return []; // No conflict
        }
        
        // Remove the conflicting constraint from consideration for removal
        // (it must be present for the conflict)
        let workingSet = [...consistentConstraints];
        
        // Try removing constraints from the working set until we can't remove any more
        let changed = true;
        while (changed && workingSet.length > 0) {
            changed = false;
            
            // Iterate backwards to avoid index issues when removing elements
            for (let i = workingSet.length - 1; i >= 0; i--) {
                const testSet = workingSet.slice(0, i).concat(workingSet.slice(i + 1));
                const testCore = [...testSet, conflictingConstraint];
                
                // If removing this constraint still leaves a conflict, we can remove it
                if (this.isConflictingSet(testCore)) {
                    workingSet = testSet;
                    changed = true;
                    // Continue removing more constraints in this pass
                }
            }
        }
        
        return workingSet;
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
        else if (isBoundingBoxConstraint(constraint)) {
            const bc = constraint as BoundingBoxConstraint;
            const bbox = this.groupBoundingBoxes.get(bc.group.name);
            
            if (!bbox) {
                console.error(`Bounding box not found for group ${bc.group.name}`);
                return [];
            }

            const nodeIndex = this.getNodeIndex(bc.node.id);
            const nodeX = this.variables[nodeIndex].x;
            const nodeY = this.variables[nodeIndex].y;

            // Create constraint based on which side of the bounding box
            switch (bc.side) {
                case 'left':
                    // node.x + padding <= bbox.left
                    return [new Constraint(nodeX.plus(bc.minDistance), Operator.Le, bbox.left, Strength.required)];
                
                case 'right':
                    // node.x >= bbox.right + padding
                    return [new Constraint(nodeX, Operator.Ge, bbox.right.plus(bc.minDistance), Strength.required)];
                
                case 'top':
                    // node.y + padding <= bbox.top
                    return [new Constraint(nodeY.plus(bc.minDistance), Operator.Le, bbox.top, Strength.required)];
                
                case 'bottom':
                    // node.y >= bbox.bottom + padding
                    return [new Constraint(nodeY, Operator.Ge, bbox.bottom.plus(bc.minDistance), Strength.required)];
                
                default:
                    console.error(`Unknown bounding box side: ${bc.side}`);
                    return [];
            }
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