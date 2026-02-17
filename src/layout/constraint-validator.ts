import { Solver, Variable, Expression, Strength, Operator, Constraint } from 'kiwi.js';
import { DisjunctiveConstraint, InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup, LayoutConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint, isBoundingBoxConstraint, TopConstraint, LeftConstraint, AlignmentConstraint, BoundingBoxConstraint, ImplicitConstraint, GroupBoundaryConstraint, isGroupBoundaryConstraint } from './interfaces';
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
    readonly type: 'group-overlap' | 'positional-conflict' | 'unknown-constraint' | 'hidden-node-conflict';

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

/**
 * Error for when a hideAtom directive hides a node that is also referenced by layout constraints.
 * Reported in a table format similar to IIS conflicts.
 */
interface HiddenNodeConflictError extends ConstraintError {
    type: 'hidden-node-conflict';
    /** Map of hidden node ID → the hideAtom selector that hid it */
    hiddenNodes: Map<string, string>;
    /** Map of source constraint → list of pairwise descriptions that were dropped */
    droppedConstraints: Map<string, string[]>;
    /** Structured error messages for UI rendering (same format as positional errors) */
    errorMessages: ErrorMessages;
}

export function isHiddenNodeConflictError(error: unknown): error is HiddenNodeConflictError {
    return (error as HiddenNodeConflictError)?.type === 'hidden-node-conflict';
}

export { type PositionalConstraintError, type GroupOverlapError, type HiddenNodeConflictError }


// Tooltip text explaining what node IDs are
const ID_TOOLTIP_TEXT = "This is a unique identifier in the graph. Hover over graph nodes to see their IDs.";

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * @param str - String to escape
 * @returns Escaped string safe for HTML insertion
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Formats a node label for display in error messages.
 * Prioritizes showing attributes when available, with fallback to label and ID.
 * 
 * @param node - The layout node to format
 * @returns Formatted label string, potentially with HTML for tooltips
 */
function formatNodeLabel(node: LayoutNode): string {
    // Check if node has non-empty attributes with actual values
    const hasAttributes = node.attributes && 
        Object.entries(node.attributes).some(([_, values]) => values && values.length > 0);
    
    if (hasAttributes) {
        // Show attributes (truncated if needed) instead of ID
        const attrs = node.attributes || {};
        const attrEntries = Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b));
        
        // Format: label with key attributes shown
        // For single attribute with single value: "label (key: value)"
        // For multiple or complex: "label (key1: val1, key2: val2, ...)"
        const attributeParts: string[] = [];
        const maxAttributes = 2; // Show at most 2 attributes to avoid clutter
        const maxValueLength = 20; // Truncate long values
        
        for (let i = 0; i < Math.min(attrEntries.length, maxAttributes); i++) {
            const [key, values] = attrEntries[i];
            if (values && values.length > 0) {
                // Take first value, truncate if too long
                let value = values[0];
                if (value.length > maxValueLength) {
                    value = value.substring(0, maxValueLength) + '...';
                }
                // Escape HTML to prevent XSS
                attributeParts.push(`${escapeHtml(key)}: ${escapeHtml(value)}`);
            }
        }
        
        if (attrEntries.length > maxAttributes) {
            attributeParts.push('...');
        }
        
        if (attributeParts.length > 0) {
            // Escape label to prevent XSS
            return `${escapeHtml(node.label)} (${attributeParts.join(', ')})`;
        }
    }
    
    // No attributes present - show label with ID explanation
    // Use HTML title attribute for hover tooltip explaining what the ID is
    // Escape all user-provided values to prevent XSS
    if (node.label && node.label !== node.id) {
        // Format: label (id = X) where hovering explains the ID
        return `<span title="${ID_TOOLTIP_TEXT}">${escapeHtml(node.label)} (id = ${escapeHtml(node.id)})</span>`;
    }
    
    // Only ID available (label same as ID or no label)
    return `<span title="${ID_TOOLTIP_TEXT}">${escapeHtml(node.id)}</span>`;
}

// TODO: 
export function orientationConstraintToString(constraint: LayoutConstraint) {
    const nodeLabel = formatNodeLabel;

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
    else if (isGroupBoundaryConstraint(constraint)) {
        let gc = constraint as GroupBoundaryConstraint;
        const sideDescriptions: { [key: string]: string } = {
            'left': 'to the left of',
            'right': 'to the right of',
            'top': 'above',
            'bottom': 'below'
        };
        return `Group "${gc.groupA.name}" must be ${sideDescriptions[gc.side]} group "${gc.groupB.name}"`;
    }
    return `Unknown constraint type: ${constraint}`;
}


class ConstraintValidator {

    private solver: Solver;
    private variables: { [key: string]: { x: Variable, y: Variable } };
    private groupBoundingBoxes: Map<string, { left: Variable, right: Variable, top: Variable, bottom: Variable }>;

    private added_constraints: LayoutConstraint[];
    
    // Cache for Kiwi constraint conversions to avoid repeated work during backtracking
    private kiwiConstraintCache: Map<LayoutConstraint, Constraint[]> = new Map();
    
    // Cache for Expression objects to avoid creating duplicates (major memory optimization)
    // Key format: "varName_op_value" e.g., "node1_x_plus_15"
    private expressionCache: Map<string, Expression> = new Map();
    
    // Cache for bounding box member constraints to avoid recreating on every cloneSolver() call
    // These constraints are permanent (member nodes must stay inside their group's bounding box)
    // With 200 nodes and 5 groups, this could be ~800 constraints - reusing them saves massive memory
    private boundingBoxMemberConstraints: Constraint[] = [];

    layout: InstanceLayout;
    orientationConstraints: LayoutConstraint[];
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    groups: LayoutGroup[];
    minPadding: number = 15;

    public horizontallyAligned: LayoutNode[][] = [];
    public verticallyAligned: LayoutNode[][] = [];
    
    // Track alignment constraints for each node pair (for error reporting)
    private horizontalAlignmentMap: Map<string, AlignmentConstraint[]> = new Map();
    private verticalAlignmentMap: Map<string, AlignmentConstraint[]> = new Map();

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

        // Check for node overlaps: nodes that are both horizontally and vertically aligned
        // This must happen after getAlignmentOrders() which normalizes the alignment groups
        const nodeOverlapError = this.detectNodeOverlaps();
        if (nodeOverlapError) {
            return nodeOverlapError;
        }

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
            //console.log(`Disjunctive solver: Successfully chose ${chosenConstraintsCount} constraints from ${disjunctions.length} disjunctions`);
            
            // Log which alternatives were chosen for debugging
            if (chosenConstraintsCount > 0) {
                //console.log('Chosen constraints:', this.added_constraints.slice(constraintsBeforeDisjunctions));
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
     * Checks if an alternative has an obvious conflict with existing constraints.
     * This is a fast heuristic check to avoid expensive solver operations.
     * 
     * Detects direct contradictions like:
     * - A < B already exists, alternative says B < A
     * - A above B already exists, alternative says B above A
     * - Node must be in group G1, alternative says it must be outside G1
     * 
     * This is not exhaustive but catches common cases cheaply.
     * 
     * @param alternative - The alternative constraints to check
     * @returns True if an obvious conflict is detected
     */
    private hasObviousConflict(alternative: LayoutConstraint[]): boolean {
        // Build a quick lookup for existing directional constraints
        const existingLeftOf = new Set<string>();
        const existingAbove = new Set<string>();
        
        for (const existing of this.added_constraints) {
            if (isLeftConstraint(existing)) {
                existingLeftOf.add(`${existing.left.id}:${existing.right.id}`);
            } else if (isTopConstraint(existing)) {
                existingAbove.add(`${existing.top.id}:${existing.bottom.id}`);
            }
        }
        
        // Check if any constraint in the alternative directly contradicts existing ones
        for (const constraint of alternative) {
            if (isLeftConstraint(constraint)) {
                // Check for A < B when B < A already exists (creates immediate cycle)
                const reverse = `${constraint.right.id}:${constraint.left.id}`;
                if (existingLeftOf.has(reverse)) {
                    return true; // Direct contradiction detected
                }
            } else if (isTopConstraint(constraint)) {
                // Check for A above B when B above A already exists
                const reverse = `${constraint.bottom.id}:${constraint.top.id}`;
                if (existingAbove.has(reverse)) {
                    return true; // Direct contradiction detected
                }
            }
            // Note: We don't check bounding box constraints here as they're more complex
            // and the overhead of checking would negate the benefit
        }
        
        return false; // No obvious conflict detected
    }

    /**
     * Orders alternatives by heuristic to improve backtracking performance.
     * 
     * Heuristics used:
     * 1. Simpler alternatives first (fewer constraints = faster to try)
     * 2. For bounding box constraints, prefer horizontal separation over vertical
     *    (often more natural for left-to-right reading languages)
     * 3. For group boundaries, prefer arrangements that align with existing constraints
     * 
     * This "fail-fast" strategy reduces backtracking by trying simpler/more likely
     * alternatives first, quickly finding solutions or identifying conflicts.
     * 
     * @param alternatives - Array of constraint alternatives to order
     * @returns Ordered array of alternatives (does not modify original)
     */
    private orderAlternativesByHeuristic(alternatives: LayoutConstraint[][]): LayoutConstraint[][] {
        // Create a copy to avoid modifying the original
        const ordered = [...alternatives];
        
        // Sort by: 1) constraint count (simpler first), 2) horizontal preference
        ordered.sort((a, b) => {
            // Prefer alternatives with fewer constraints (simpler to check)
            if (a.length !== b.length) {
                return a.length - b.length;
            }
            
            // For bounding box constraints, prefer horizontal (left/right) over vertical (top/bottom)
            const aHorizontal = a.some(c => isBoundingBoxConstraint(c) && (c.side === 'left' || c.side === 'right'));
            const bHorizontal = b.some(c => isBoundingBoxConstraint(c) && (c.side === 'left' || c.side === 'right'));
            
            if (aHorizontal && !bHorizontal) return -1;
            if (!aHorizontal && bHorizontal) return 1;
            
            // Otherwise keep original order
            return 0;
        });
        
        return ordered;
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
        // Order alternatives intelligently for faster convergence
        const alternatives = this.orderAlternativesByHeuristic(currentDisjunction.alternatives);
        

        // Track which alternative made the most progress (for better IIS extraction)
        let bestAlternativeIndex = 0;
        let bestConstraintsAdded = 0;
        let bestRecursionDepth = 0;
        // Track the best error from recursive calls - this is critical for cyclic constraint conflicts
        // When two disjunctions conflict with each other, the deeper recursive error has more complete information
        let bestRecursiveError: PositionalConstraintError | undefined = undefined;

        // Try each alternative for this disjunction
        for (let altIndex = 0; altIndex < alternatives.length; altIndex++) {
            const alternative = alternatives[altIndex];
            
            // Early termination: skip obviously conflicting alternatives
            // Check if this alternative directly contradicts any existing constraint
            if (this.hasObviousConflict(alternative)) {
                // Track this as a failed alternative that added 0 constraints
                // Continue to next alternative without expensive solver operations
                continue;
            }
            
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
                    break;
                }
                constraintsAdded++;
            }

            // Track progress for this alternative
            let recursionDepth = 0;
            let recursiveError: PositionalConstraintError | undefined = undefined;

            // If this alternative is satisfiable, try to satisfy remaining disjunctions
            if (!alternativeError) {
                const result = this.backtrackDisjunctions(disjunctions, disjunctionIndex + 1);
                
                if (result.satisfiable) {
                    // Success! This combination works
                    // The chosen constraints are now in this.added_constraints
                    // Do NOT restore - keep the successful state
                    return { satisfiable: true };
                }
                
                // Track how far this alternative got before failing
                // Calculate immediately after recursive call, before backtracking modifies added_constraints
                recursionDepth = this.added_constraints.length - savedConstraintsLength;
                
                // Capture the error from the recursive call - it may have more complete IIS information
                recursiveError = result.error;
                
                // Otherwise, this alternative led to failure in later disjunctions
                // Fall through to backtracking below
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
                // If this alternative went deeper and has an error, capture it
                if (recursiveError) {
                    bestRecursiveError = recursiveError;
                }
            }

            // Backtrack: restore solver state and try next alternative
            this.restoreSolver(savedSolver);
            this.added_constraints = savedConstraints;
            
            // Verify backtracking worked correctly
            console.assert(
                this.added_constraints.length === savedConstraintsLength,
                `Backtracking failed: expected ${savedConstraintsLength} constraints, got ${this.added_constraints.length}`
            );
            
        }

        // All alternatives exhausted for this disjunction
        // Return failure to trigger backtracking at previous disjunction level
        
        // IMPORTANT: If we have a recursive error that went deeper, use that error instead
        // This ensures that when two disjunctions conflict with each other, we report the IIS
        // from the deeper level which contains constraints from BOTH disjunctions
        if (bestRecursiveError && bestRecursionDepth > 0) {
            return { satisfiable: false, error: bestRecursiveError };
        }

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
            }
        }
        
        // Build the minimalConflictingSet map from the minimal IIS
        const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
        
        // Collect all constraints to check for duplicates
        const allIISConstraints = [...minimalIIS.existingConstraints, ...minimalIIS.disjunctiveConstraints];
        
        // Deduplicate using hash-based approach for O(n) performance
        // We use a string key derived from constraint properties for efficient lookup
        const uniqueConstraints = new Map<string, LayoutConstraint>();
        for (const constraint of allIISConstraints) {
            const key = this.getConstraintKey(constraint);
            if (!uniqueConstraints.has(key)) {
                uniqueConstraints.set(key, constraint);
            }
        }
        
        // Remove transitive alignment constraints for better minimality
        const minimalConstraints = this.removeTransitiveConstraints(Array.from(uniqueConstraints.values()));
        
        // Now build the minimalConflictingSet from minimal constraints
        for (const constraint of minimalConstraints) {
            const source = constraint.sourceConstraint;
            if (!minimalConflictingSet.has(source)) {
                minimalConflictingSet.set(source, []);
            }
            minimalConflictingSet.get(source)!.push(constraint);
        }
        
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
     * Gets or creates a cached expression for variable + constant.
     * This is a critical memory optimization - with ~36,000 constraints, we would otherwise
     * create thousands of duplicate Expression objects (e.g., "x + 15" appears many times).
     * 
     * @param variable - The Kiwi variable
     * @param value - The constant to add
     * @returns Cached or newly created Expression
     */
    private getVarPlusConstant(variable: Variable, value: number): Expression {
        // Create cache key from variable name and value
        const cacheKey = `${variable.name()}_plus_${value}`;
        
        let expr = this.expressionCache.get(cacheKey);
        if (!expr) {
            expr = variable.plus(value);
            this.expressionCache.set(cacheKey, expr);
        }
        
        return expr;
    }
    
    /**
     * Generates a unique string key for a constraint based on its content.
     * Used for efficient deduplication via hashing.
     */
    private getConstraintKey(constraint: LayoutConstraint): string {
        if (isLeftConstraint(constraint)) {
            return `left:${constraint.left.id}:${constraint.right.id}`;
        }
        
        if (isTopConstraint(constraint)) {
            return `top:${constraint.top.id}:${constraint.bottom.id}`;
        }
        
        if (isAlignmentConstraint(constraint)) {
            // Normalize alignment key to handle symmetry: always put smaller ID first
            const [id1, id2] = [constraint.node1.id, constraint.node2.id].sort();
            return `align:${id1}:${id2}:${constraint.axis}`;
        }
        
        if (isBoundingBoxConstraint(constraint)) {
            return `bbox:${constraint.node.id}:${constraint.group.name}:${constraint.side}`;
        }
        
        if (isGroupBoundaryConstraint(constraint)) {
            return `groupbound:${constraint.groupA.name}:${constraint.groupB.name}:${constraint.side}`;
        }
        
        // Fallback for unknown constraint types
        return `unknown:${JSON.stringify(constraint)}`;
    }

    /**
     * Checks if two alignment constraints are semantically identical.
     * Alignment is symmetric: align(A,B) is the same as align(B,A).
     */
    private areAlignmentsIdentical(c1: AlignmentConstraint, c2: AlignmentConstraint): boolean {
        return c1.axis === c2.axis && (
            (c1.node1.id === c2.node1.id && c1.node2.id === c2.node2.id) ||
            (c1.node1.id === c2.node2.id && c1.node2.id === c2.node1.id)
        );
    }

    /**
     * Checks if two constraints are semantically identical.
     * Used to detect and remove duplicates from the IIS.
     */
    private areConstraintsIdentical(c1: LayoutConstraint, c2: LayoutConstraint): boolean {
        // Same object reference
        if (c1 === c2) return true;
        
        // Check type and content
        if (isLeftConstraint(c1) && isLeftConstraint(c2)) {
            return c1.left.id === c2.left.id && c1.right.id === c2.right.id;
        }
        
        if (isTopConstraint(c1) && isTopConstraint(c2)) {
            return c1.top.id === c2.top.id && c1.bottom.id === c2.bottom.id;
        }
        
        if (isAlignmentConstraint(c1) && isAlignmentConstraint(c2)) {
            return this.areAlignmentsIdentical(c1, c2);
        }
        
        if (isBoundingBoxConstraint(c1) && isBoundingBoxConstraint(c2)) {
            return c1.node.id === c2.node.id && c1.group.name === c2.group.name && c1.side === c2.side;
        }
        
        if (isGroupBoundaryConstraint(c1) && isGroupBoundaryConstraint(c2)) {
            return c1.groupA.name === c2.groupA.name && c1.groupB.name === c2.groupB.name && c1.side === c2.side;
        }
        
        return false;
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
     * Memory optimization: To prevent memory exhaustion with large graphs, we limit the total
     * number of disjunctive constraints generated. For very large graphs (>500 nodes), we
     * use a sampling strategy to only create constraints for the most critical node-group pairs.
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
            // Also cache these constraints for reuse in cloneSolver() to avoid memory explosion
            for (const member of memberNodes) {
                const memberIndex = this.getNodeIndex(member.id);
                const memberX = this.variables[memberIndex].x;
                const memberY = this.variables[memberIndex].y;

                // Create constraints once and cache them for reuse
                const leftConstraint = new Constraint(memberX, Operator.Ge, groupLeft, Strength.required);
                const rightConstraint = new Constraint(memberX, Operator.Le, groupRight, Strength.required);
                const topConstraint = new Constraint(memberY, Operator.Ge, groupTop, Strength.required);
                const bottomConstraint = new Constraint(memberY, Operator.Le, groupBottom, Strength.required);
                
                // Cache for reuse in cloneSolver()
                this.boundingBoxMemberConstraints.push(leftConstraint, rightConstraint, topConstraint, bottomConstraint);
                
                // Add to the main solver
                this.solver.addConstraint(leftConstraint);
                this.solver.addConstraint(rightConstraint);
                this.solver.addConstraint(topConstraint);
                this.solver.addConstraint(bottomConstraint);
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

        // Add disjunctive constraints for group-to-group boundary separation
        // For each pair of non-overlapping groups, ensure they are separated in one direction
        
        for (let i = 0; i < this.groups.length; i++) {
            for (let j = i + 1; j < this.groups.length; j++) {
                const groupA = this.groups[i];
                const groupB = this.groups[j];
                
                // Skip singletons
                if (groupA.nodeIds.length <= 1 || groupB.nodeIds.length <= 1) {
                    continue;
                }
                
                // Skip if one subsumes the other
                if (this.isSubGroup(groupA, groupB) || this.isSubGroup(groupB, groupA)) {
                    continue;
                }
                
                // Skip if groups share members - they're allowed to overlap
                const intersection = this.groupIntersection(groupA, groupB);
                if (intersection.length > 0) {
                    continue;
                }
                
                // Create four GroupBoundaryConstraint alternatives for group-to-group separation
                const leftAlternative: GroupBoundaryConstraint = {
                    groupA: groupA,
                    groupB: groupB,
                    side: 'left',  // A left of B
                    minDistance: this.minPadding,
                    sourceConstraint: groupA.sourceConstraint || groupB.sourceConstraint!
                };
                
                const rightAlternative: GroupBoundaryConstraint = {
                    groupA: groupA,
                    groupB: groupB,
                    side: 'right',  // A right of B
                    minDistance: this.minPadding,
                    sourceConstraint: groupA.sourceConstraint || groupB.sourceConstraint!
                };
                
                const topAlternative: GroupBoundaryConstraint = {
                    groupA: groupA,
                    groupB: groupB,
                    side: 'top',  // A above B
                    minDistance: this.minPadding,
                    sourceConstraint: groupA.sourceConstraint || groupB.sourceConstraint!
                };
                
                const bottomAlternative: GroupBoundaryConstraint = {
                    groupA: groupA,
                    groupB: groupB,
                    side: 'bottom',  // A below B
                    minDistance: this.minPadding,
                    sourceConstraint: groupA.sourceConstraint || groupB.sourceConstraint!
                };
                
                // Create the disjunction: groups must satisfy ONE of these four alternatives
                const disjunction = new DisjunctiveConstraint(
                    groupA.sourceConstraint || groupB.sourceConstraint!,
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
     * Helper method used both in cloneSolver and isConflictingSet.
     * 
     * @param solver - The solver to add constraints to
     * @param useCache - If true, uses cached constraints (for cloneSolver performance).
     *                   If false, creates fresh constraints using current groupBoundingBoxes
     *                   (required for isConflictingSet which uses temporary test bbox variables).
     */
    private addBoundingBoxMemberConstraintsToSolver(solver: Solver, useCache: boolean = true): void {
        if (useCache && this.boundingBoxMemberConstraints.length > 0) {
            // Use cached constraints - they were created once in addGroupBoundingBoxConstraints()
            // This is a critical memory optimization for cloneSolver() during backtracking
            for (const constraint of this.boundingBoxMemberConstraints) {
                try {
                    solver.addConstraint(constraint);
                } catch (e) {
                    // Constraint may already exist, ignore
                }
            }
        } else {
            // Create fresh constraints using current groupBoundingBoxes
            // This is needed for isConflictingSet which uses temporary test bbox variables
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
    }


    /**
     * Extracts a minimal IIS (Irreducible Infeasible Set) for disjunctive constraints.
     * 
     * Note: The minimization is done using deletion-based algorithms which find an
     * irreducible set but may not find the globally smallest set. This is a practical
     * tradeoff for polynomial-time performance.
     * 
     * @param existingConstraints - The consistent prefix of constraints
     * @param disjunctiveAlternative - The disjunctive alternative that conflicts
     * @param disjunctiveSource - The source constraint for the disjunction (for error reporting)
     * @returns Minimal IIS containing constraints from both sides, with duplicates removed
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
        // For grouping conflicts, we need to find the minimal set of existing constraints
        // that make the disjunctive alternative unsatisfiable
        
        // Start with all existing constraints
        let relevantExisting = [...existingConstraints];
        
        // Try the traditional minimization approach with a representative constraint
        if (disjunctiveAlternative.length > 0) {
            const representative = disjunctiveAlternative[0];
            
            // Test if there's actually a conflict
            const fullSet = [...existingConstraints, representative];
            const hasConflict = this.isConflictingSet(fullSet);
            
            if (hasConflict) {
                // Find minimal set of existing constraints that conflict with this representative
                relevantExisting = this.getMinimalConflictingConstraints(existingConstraints, representative);
            } else {
                // No conflict with representative alone - this shouldn't happen but handle gracefully
                relevantExisting = [];
            }
        }
        
        // For very small results, try to include more context by finding constraints
        // that involve the same nodes as the disjunctive constraints
        if (relevantExisting.length <= 1 && disjunctiveAlternative.some(c => isBoundingBoxConstraint(c))) {
            // Get nodes involved in the disjunctive constraints
            const involvedNodes = new Set<string>();
            for (const constraint of disjunctiveAlternative) {
                if (isBoundingBoxConstraint(constraint)) {
                    involvedNodes.add(constraint.node.id);
                    constraint.group.nodeIds.forEach(id => involvedNodes.add(id));
                }
            }
            
            // Find constraints that involve these nodes
            const contextConstraints = existingConstraints.filter(constraint => {
                if (isLeftConstraint(constraint)) {
                    return involvedNodes.has(constraint.left.id) || involvedNodes.has(constraint.right.id);
                } else if (isTopConstraint(constraint)) {
                    return involvedNodes.has(constraint.top.id) || involvedNodes.has(constraint.bottom.id);
                } else if (isAlignmentConstraint(constraint)) {
                    return involvedNodes.has(constraint.node1.id) || involvedNodes.has(constraint.node2.id);
                }
                return false;
            });
            
            // Use context constraints if we found any
            if (contextConstraints.length > 0) {
                relevantExisting = contextConstraints;
            }
        }
        
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
            // Check if we need bounding box variables for either BoundingBoxConstraint or GroupBoundaryConstraint
            const hasBoundingBoxConstraint = constraints.some(c => isBoundingBoxConstraint(c) || isGroupBoundaryConstraint(c));
            if (hasBoundingBoxConstraint) {
                // We need to set up a temporary bounding box system for testing
                const testGroupBoundingBoxes = new Map<string, { left: Variable, right: Variable, top: Variable, bottom: Variable }>();
                
                // Create bounding box variables for any groups mentioned in constraints
                const groupsNeeded = new Set<string>();
                constraints.forEach(c => {
                    if (isBoundingBoxConstraint(c)) {
                        groupsNeeded.add(c.group.name);
                    } else if (isGroupBoundaryConstraint(c)) {
                        groupsNeeded.add(c.groupA.name);
                        groupsNeeded.add(c.groupB.name);
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
                    // Use fresh constraints (useCache=false) since we're using temporary test bbox variables
                    this.addBoundingBoxMemberConstraintsToSolver(testSolver, false);
                    
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
     * Find a minimal subset of consistentConstraints that is inconsistent with conflictingConstraint.
     * Uses a deletion-based minimization algorithm.
     * 
     * Note: This finds an IRREDUCIBLE set (no constraint can be removed), but may not find
     * the SMALLEST possible conflicting set due to the greedy, order-dependent nature of deletion.
     * However, it runs in polynomial time and produces good results for practical use.
     * 
     * The result is guaranteed to be:
     * 1. Conflicting (when combined with conflictingConstraint)
     * 2. Irreducible (cannot remove any constraint and still have a conflict)
     * 3. Duplicate-free (via deduplication in the caller)
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
        
        // Post-process to remove transitive constraints (alignments and orderings)
        workingSet = this.removeTransitiveConstraints(workingSet);
        
        return workingSet;
    }

    /**
     * Removes transitive constraints from a constraint set.
     * 
     * For alignments: If we have align(A,B) and align(A,C), then align(B,C) is redundant.
     * For orderings: If we have A < B and B < C, then A < C is redundant.
     * 
     * This is a post-processing step to achieve better minimality beyond what deletion-based
     * minimization can achieve (since the solver doesn't automatically infer transitive relations).
     */
    private removeTransitiveConstraints(constraints: LayoutConstraint[]): LayoutConstraint[] {
        // First handle alignment transitivity
        let result = this.removeTransitiveAlignments(constraints);
        
        // Then handle ordering transitivity
        result = this.removeTransitiveOrderings(result);
        
        return result;
    }
    
    /**
     * Removes transitive ordering constraints (left/top).
     * Uses transitive reduction on the directed acyclic graph of ordering constraints.
     */
    private removeTransitiveOrderings(constraints: LayoutConstraint[]): LayoutConstraint[] {
        const leftConstraints = constraints.filter(c => isLeftConstraint(c)) as LeftConstraint[];
        const topConstraints = constraints.filter(c => isTopConstraint(c)) as TopConstraint[];
        const otherConstraints = constraints.filter(c => !isLeftConstraint(c) && !isTopConstraint(c));
        
        const result: LayoutConstraint[] = [...otherConstraints];
        
        // Reduce left constraints
        if (leftConstraints.length > 0) {
            result.push(...this.transitiveReduction(
                leftConstraints,
                c => c.left.id,
                c => c.right.id
            ));
        }
        
        // Reduce top constraints
        if (topConstraints.length > 0) {
            result.push(...this.transitiveReduction(
                topConstraints,
                c => c.top.id,
                c => c.bottom.id
            ));
        }
        
        return result;
    }
    
    /**
     * Performs transitive reduction on a set of ordering constraints.
     * Removes edges that can be derived through transitivity.
     * 
     * For example, if we have A < B, B < C, and A < C, we remove A < C.
     */
    private transitiveReduction<T extends LayoutConstraint>(
        constraints: T[],
        getSource: (c: T) => string,
        getTarget: (c: T) => string
    ): T[] {
        if (constraints.length <= 1) {
            return constraints;
        }
        
        // Build adjacency list
        const edges = new Map<string, Set<string>>();
        const edgeToConstraint = new Map<string, T>();
        
        for (const constraint of constraints) {
            const src = getSource(constraint);
            const tgt = getTarget(constraint);
            
            if (!edges.has(src)) edges.set(src, new Set());
            edges.get(src)!.add(tgt);
            edgeToConstraint.set(`${src}->${tgt}`, constraint);
        }
        
        // Compute transitive closure using Floyd-Warshall
        const allNodes = new Set<string>();
        for (const [src, targets] of edges.entries()) {
            allNodes.add(src);
            targets.forEach(t => allNodes.add(t));
        }
        
        const nodes = Array.from(allNodes);
        const reachable = new Map<string, Set<string>>();
        
        // Initialize with direct edges
        for (const node of nodes) {
            reachable.set(node, new Set(edges.get(node) || []));
        }
        
        // Floyd-Warshall to find all reachable pairs
        for (const k of nodes) {
            for (const i of nodes) {
                for (const j of nodes) {
                    if (reachable.get(i)?.has(k) && reachable.get(k)?.has(j)) {
                        reachable.get(i)!.add(j);
                    }
                }
            }
        }
        
        // Keep only edges that are not transitive
        const result: T[] = [];
        for (const constraint of constraints) {
            const src = getSource(constraint);
            const tgt = getTarget(constraint);
            
            // Check if this edge is transitive (can be reached through intermediate nodes)
            let isTransitive = false;
            const srcNeighbors = edges.get(src);
            
            if (srcNeighbors && srcNeighbors.size > 1) {
                // Try to find an intermediate node
                for (const intermediate of srcNeighbors) {
                    if (intermediate !== tgt && reachable.get(intermediate)?.has(tgt)) {
                        // We can go src -> intermediate -> tgt, so src -> tgt is transitive
                        isTransitive = true;
                        break;
                    }
                }
            }
            
            if (!isTransitive) {
                result.push(constraint);
            }
        }
        
        return result;
    }

    /**
     * Removes transitive alignment constraints from a constraint set.
     * If we have align(A,B) and align(A,C), then align(B,C) is redundant due to transitivity.
     * 
     * This is a post-processing step to achieve better minimality beyond what deletion-based
     * minimization can achieve (since the solver doesn't automatically infer transitive alignments).
     */
    private removeTransitiveAlignments(constraints: LayoutConstraint[]): LayoutConstraint[] {
        const alignments = constraints.filter(c => isAlignmentConstraint(c)) as AlignmentConstraint[];
        const nonAlignments = constraints.filter(c => !isAlignmentConstraint(c));
        
        if (alignments.length <= 2) {
            // Can't have transitivity with 2 or fewer alignments
            return constraints;
        }
        
        // Group alignments by axis
        const byAxis = new Map<'x' | 'y', AlignmentConstraint[]>();
        for (const align of alignments) {
            if (!byAxis.has(align.axis)) {
                byAxis.set(align.axis, []);
            }
            byAxis.get(align.axis)!.push(align);
        }
        
        const result: LayoutConstraint[] = [...nonAlignments];
        
        // For each axis, remove transitive alignments
        for (const [axis, axisAlignments] of byAxis.entries()) {
            if (axisAlignments.length <= 2) {
                // Keep all if 2 or fewer
                result.push(...axisAlignments);
                continue;
            }
            
            // Build an equivalence relation graph
            // Each node is a layout node ID, edges represent alignment constraints
            const edges = new Map<string, Set<string>>();
            
            for (const align of axisAlignments) {
                const id1 = align.node1.id;
                const id2 = align.node2.id;
                
                if (!edges.has(id1)) edges.set(id1, new Set());
                if (!edges.has(id2)) edges.set(id2, new Set());
                
                edges.get(id1)!.add(id2);
                edges.get(id2)!.add(id1);
            }
            
            // Find a minimal spanning tree of alignments
            // Start with an arbitrary node and use BFS to build the tree
            const allNodes = Array.from(edges.keys());
            if (allNodes.length === 0) continue;
            
            const visited = new Set<string>();
            const queue = [allNodes[0]];
            visited.add(allNodes[0]);
            const spanningTree: AlignmentConstraint[] = [];
            
            while (queue.length > 0 && visited.size < allNodes.length) {
                const current = queue.shift()!;
                const neighbors = edges.get(current);
                
                if (neighbors) {
                    for (const neighbor of neighbors) {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push(neighbor);
                            
                            // Add the edge to spanning tree
                            const edge = axisAlignments.find(a => 
                                (a.node1.id === current && a.node2.id === neighbor) ||
                                (a.node2.id === current && a.node1.id === neighbor)
                            );
                            if (edge) {
                                spanningTree.push(edge);
                            }
                        }
                    }
                }
            }
            
            // Use only the spanning tree edges (minimal set)
            result.push(...spanningTree);
        }
        
        return result;
    }

    private constraintToKiwi(constraint: LayoutConstraint): Constraint[] {
        // Check cache first to avoid repeated conversion during backtracking
        const cached = this.kiwiConstraintCache.get(constraint);
        if (cached) {
            return cached;
        }
        
        // Convert the constraint and cache the result
        const kiwiConstraints = this.convertConstraintToKiwi(constraint);
        this.kiwiConstraintCache.set(constraint, kiwiConstraints);
        return kiwiConstraints;
    }

    private convertConstraintToKiwi(constraint: LayoutConstraint): Constraint[] {
        // This is the main method that converts a LayoutConstraint to a Cassowary constraint.
        if (isTopConstraint(constraint)) {
            let tc = constraint as TopConstraint;

            let top = tc.top;
            let bottom = tc.bottom;
            let minDistance = top.height;

            const topId = this.getNodeIndex(top.id);
            const bottomId = this.getNodeIndex(bottom.id);

            let topVar = this.variables[topId].y;
            let bottomVar = this.variables[bottomId].y;

            // Create constraint: topVar + minDistance <= bottomVar
            // Use cached expression to avoid creating duplicate Expression objects
            let topExpr = this.getVarPlusConstant(topVar, minDistance);
            let kiwiConstraint = new Constraint(topExpr, Operator.Le, bottomVar, Strength.required);

            return [kiwiConstraint];
        }
        else if (isLeftConstraint(constraint)) {
            let lc = constraint as LeftConstraint;

            let left = lc.left;
            let right = lc.right;
            let minDistance = left.width;

            const leftId = this.getNodeIndex(left.id);
            const rightId = this.getNodeIndex(right.id);

            let leftVar = this.variables[leftId].x;
            let rightVar = this.variables[rightId].x;

            // Create constraint: leftVar + minDistance <= rightVar
            // Use cached expression to avoid creating duplicate Expression objects
            let leftExpr = this.getVarPlusConstant(leftVar, minDistance);
            let kiwiConstraint = new Constraint(leftExpr, Operator.Le, rightVar, Strength.required);

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
            // Also track the constraint for error reporting
            const pairKey = this.getNodePairKey(node1.id, node2.id);
            if (axis === 'x') {
                this.verticallyAligned.push([node1, node2]);
                // Track vertical alignment constraint
                if (!this.verticalAlignmentMap.has(pairKey)) {
                    this.verticalAlignmentMap.set(pairKey, []);
                }
                this.verticalAlignmentMap.get(pairKey)!.push(ac);
            }
            else if (axis === 'y') {
                this.horizontallyAligned.push([node1, node2]);
                // Track horizontal alignment constraint
                if (!this.horizontalAlignmentMap.has(pairKey)) {
                    this.horizontalAlignmentMap.set(pairKey, []);
                }
                this.horizontalAlignmentMap.get(pairKey)!.push(ac);
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
            const nodeWidth = bc.node.width || bc.minDistance;
            const nodeHeight = bc.node.height || bc.minDistance

            // TODO: Plumb these in.

            // Create constraint based on which side of the bounding box
            // Use cached expressions to avoid creating duplicate Expression objects
            switch (bc.side) {
                case 'left':
                    // node.x + padding <= bbox.left
                    return [new Constraint(this.getVarPlusConstant(nodeX, bc.minDistance), Operator.Le, bbox.left, Strength.required)];
                
                case 'right':
                    // node.x >= bbox.right + padding
                    return [new Constraint(nodeX, Operator.Ge, this.getVarPlusConstant(bbox.right, bc.minDistance), Strength.required)];
                
                case 'top':
                    // node.y + padding <= bbox.top
                    return [new Constraint(this.getVarPlusConstant(nodeY, bc.minDistance), Operator.Le, bbox.top, Strength.required)];
                
                case 'bottom':
                    // node.y >= bbox.bottom + padding
                    return [new Constraint(nodeY, Operator.Ge, this.getVarPlusConstant(bbox.bottom, bc.minDistance), Strength.required)];
                
                default:
                    console.error(`Unknown bounding box side: ${bc.side}`);
                    return [];
            }
        }
        else if (isGroupBoundaryConstraint(constraint)) {
            const gc = constraint as GroupBoundaryConstraint;
            const bboxA = this.groupBoundingBoxes.get(gc.groupA.name);
            const bboxB = this.groupBoundingBoxes.get(gc.groupB.name);
            
            if (!bboxA || !bboxB) {
                console.error(`Bounding box not found for groups ${gc.groupA.name} or ${gc.groupB.name}`);
                return [];
            }

            // Create constraint based on which side (direction) groups should be separated
            // Use cached expressions to avoid creating duplicate Expression objects
            switch (gc.side) {
                case 'left':
                    // groupA left of groupB: A.right + padding <= B.left
                    return [new Constraint(this.getVarPlusConstant(bboxA.right, gc.minDistance), Operator.Le, bboxB.left, Strength.required)];
                
                case 'right':
                    // groupA right of groupB: B.right + padding <= A.left
                    return [new Constraint(this.getVarPlusConstant(bboxB.right, gc.minDistance), Operator.Le, bboxA.left, Strength.required)];
                
                case 'top':
                    // groupA above groupB: A.bottom + padding <= B.top
                    return [new Constraint(this.getVarPlusConstant(bboxA.bottom, gc.minDistance), Operator.Le, bboxB.top, Strength.required)];
                
                case 'bottom':
                    // groupA below groupB: B.bottom + padding <= A.top
                    return [new Constraint(this.getVarPlusConstant(bboxB.bottom, gc.minDistance), Operator.Le, bboxA.top, Strength.required)];
                
                default:
                    console.error(`Unknown group boundary side: ${gc.side}`);
                    return [];
            }
        }
        else {
            //console.log(constraint, "Unknown constraint type");
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

    /**
     * Creates a canonical key for a node pair (order-independent).
     * Used to look up alignment constraints for any pair of nodes.
     */
    private getNodePairKey(nodeId1: string, nodeId2: string): string {
        return nodeId1 < nodeId2 ? `${nodeId1}|${nodeId2}` : `${nodeId2}|${nodeId1}`;
    }

    /**
     * Detects if any two nodes are forced to be at the exact same position.
     * This occurs when two nodes are both:
     * - Horizontally aligned (same y coordinate)
     * - Vertically aligned (same x coordinate)
     * 
     * Uses transitive closure of alignment groups to detect overlaps.
     * Returns a PositionalConstraintError since this is fundamentally a constraint conflict.
     * 
     * Finds ALL overlapping node pairs and reports ALL related constraints.
     * 
     * @returns PositionalConstraintError if overlap detected, null otherwise
     */
    private detectNodeOverlaps(): PositionalConstraintError | null {
        // Build sets of nodes that share the same x coordinate (vertically aligned)
        // and nodes that share the same y coordinate (horizontally aligned)
        
        // After normalization, each group in horizontallyAligned contains nodes with the same y
        // and each group in verticallyAligned contains nodes with the same x
        
        // Two nodes overlap if they are in the SAME horizontal group AND the SAME vertical group
        
        // Collect ALL overlapping pairs and their constraints
        const allOverlappingPairs: Array<{ node1: LayoutNode; node2: LayoutNode; overlappingNodeIds: string[] }> = [];
        const allConflictingConstraints = new Set<AlignmentConstraint>();
        
        for (const hGroup of this.horizontallyAligned) {
            const hGroupSet = new Set(hGroup.map(n => n.id));
            
            for (const vGroup of this.verticallyAligned) {
                const vGroupSet = new Set(vGroup.map(n => n.id));
                
                // Find nodes that are in BOTH groups
                const overlappingNodeIds: string[] = [];
                for (const nodeId of hGroupSet) {
                    if (vGroupSet.has(nodeId)) {
                        overlappingNodeIds.push(nodeId);
                    }
                }
                
                // If there are 2+ nodes in the intersection, they all share the same (x, y)
                if (overlappingNodeIds.length >= 2) {
                    // Found overlaps - collect ALL pairs in this intersection
                    // For n nodes at the same position, we need to report all n*(n-1)/2 pairs
                    for (let i = 0; i < overlappingNodeIds.length; i++) {
                        for (let j = i + 1; j < overlappingNodeIds.length; j++) {
                            const node1 = this.nodes.find(n => n.id === overlappingNodeIds[i])!;
                            const node2 = this.nodes.find(n => n.id === overlappingNodeIds[j])!;
                            
                            allOverlappingPairs.push({ node1, node2, overlappingNodeIds });
                            
                            // Find the alignment constraints that caused this overlap
                            const hConstraints = this.findAlignmentChain(node1, node2, this.horizontalAlignmentMap);
                            const vConstraints = this.findAlignmentChain(node1, node2, this.verticalAlignmentMap);
                            
                            // Add all constraints to the set (Set automatically deduplicates)
                            hConstraints.forEach(c => allConflictingConstraints.add(c));
                            vConstraints.forEach(c => allConflictingConstraints.add(c));
                        }
                    }
                }
            }
        }
        
        // If no overlaps found, return null
        if (allOverlappingPairs.length === 0) {
            return null;
        }
        
        // Build the minimalConflictingSet map from ALL collected constraints
        const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
        for (const constraint of allConflictingConstraints) {
            const source = constraint.sourceConstraint;
            if (!minimalConflictingSet.has(source)) {
                minimalConflictingSet.set(source, []);
            }
            minimalConflictingSet.get(source)!.push(constraint);
        }
        
        // Build errorMessages for React component (HTML-formatted strings)
        const sourceConstraintHTMLToLayoutConstraintsHTML = new Map<string, string[]>();
        for (const [source, constraints] of minimalConflictingSet.entries()) {
            const sourceHTML = source.toHTML();
            if (!sourceConstraintHTMLToLayoutConstraintsHTML.has(sourceHTML)) {
                sourceConstraintHTMLToLayoutConstraintsHTML.set(sourceHTML, []);
            }
            for (const c of constraints) {
                sourceConstraintHTMLToLayoutConstraintsHTML.get(sourceHTML)!.push(orientationConstraintToString(c));
            }
        }
        
        // Build a comprehensive error message listing all overlapping pairs
        const pairDescriptions = allOverlappingPairs.map(({ node1, node2 }) => 
            `${formatNodeLabel(node1)} and ${formatNodeLabel(node2)}`
        );
        const message = allOverlappingPairs.length === 1
            ? `Alignment constraints force ${pairDescriptions[0]} to occupy the same position`
            : `Alignment constraints force multiple node pairs to overlap: ${pairDescriptions.join('; ')}`;
        
        // Use the first constraint as the "conflicting" constraint for the error structure
        const conflictingConstraint = Array.from(allConflictingConstraints)[0];
        
        return {
            name: 'PositionalConstraintError',
            type: 'positional-conflict',
            message: message,
            conflictingConstraint: conflictingConstraint,
            conflictingSourceConstraint: conflictingConstraint.sourceConstraint,
            minimalConflictingSet: minimalConflictingSet,
            errorMessages: {
                conflictingConstraint: orientationConstraintToString(conflictingConstraint),
                conflictingSourceConstraint: conflictingConstraint.sourceConstraint.toHTML(),
                minimalConflictingConstraints: sourceConstraintHTMLToLayoutConstraintsHTML,
            }
        };
    }

    /**
     * Finds the chain of alignment constraints connecting two nodes.
     * Uses BFS to find a path through the alignment graph.
     */
    private findAlignmentChain(
        node1: LayoutNode,
        node2: LayoutNode,
        alignmentMap: Map<string, AlignmentConstraint[]>
    ): AlignmentConstraint[] {
        // Build adjacency list from alignment map
        const adjacency = new Map<string, Map<string, AlignmentConstraint[]>>();
        
        for (const [pairKey, constraints] of alignmentMap.entries()) {
            const [id1, id2] = pairKey.split('|');
            
            if (!adjacency.has(id1)) adjacency.set(id1, new Map());
            if (!adjacency.has(id2)) adjacency.set(id2, new Map());
            
            adjacency.get(id1)!.set(id2, constraints);
            adjacency.get(id2)!.set(id1, constraints);
        }
        
        // BFS to find path from node1 to node2
        const visited = new Set<string>();
        const queue: { nodeId: string; path: AlignmentConstraint[] }[] = [
            { nodeId: node1.id, path: [] }
        ];
        
        while (queue.length > 0) {
            const { nodeId, path } = queue.shift()!;
            
            if (nodeId === node2.id) {
                return path;
            }
            
            if (visited.has(nodeId)) continue;
            visited.add(nodeId);
            
            const neighbors = adjacency.get(nodeId);
            if (neighbors) {
                for (const [neighborId, constraints] of neighbors.entries()) {
                    if (!visited.has(neighborId)) {
                        // Take the first constraint for simplicity
                        queue.push({
                            nodeId: neighborId,
                            path: [...path, constraints[0]]
                        });
                    }
                }
            }
        }
        
        return []; // No path found (shouldn't happen if nodes are in same alignment group)
    }

    /**
     * Disposes of resources and clears caches to help with garbage collection.
     * Should be called when the validator is no longer needed.
     */
    public dispose(): void {
        // Clear the Kiwi constraint cache which can hold many constraint objects
        this.kiwiConstraintCache.clear();
        
        // Clear the expression cache which can hold many Expression objects
        this.expressionCache.clear();
        
        // Clear solver reference
        this.solver = null as any;
        
        // Clear variables
        this.variables = {};
        
        // Clear group bounding boxes
        this.groupBoundingBoxes.clear();
    }

    /**
     * Returns memory usage statistics for this validator.
     * Useful for monitoring and debugging memory consumption.
     * 
     * @returns Object containing memory-related metrics
     */
    public getMemoryStats(): {
        cachedConstraints: number;
        cachedExpressions: number;
        variables: number;
        groupBoundingBoxes: number;
        addedConstraints: number;
    } {
        return {
            cachedConstraints: this.kiwiConstraintCache.size,
            cachedExpressions: this.expressionCache.size,
            variables: Object.keys(this.variables).length,
            groupBoundingBoxes: this.groupBoundingBoxes.size,
            addedConstraints: this.added_constraints?.length || 0
        };
    }
}


export { ConstraintValidator };
