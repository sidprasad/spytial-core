import { Solver, Variable, Constraint, Strength } from 'kiwi.js';

/**
 * Represents a single Kiwi constraint that can be added to the solver.
 */
export type KiwiConstraint = Constraint;

/**
 * Represents a conjunctive set of constraints (all must be satisfied).
 */
export type ConjunctiveConstraints = KiwiConstraint[];

/**
 * Represents a disjunctive set of constraints (at least one alternative must be satisfied).
 * Each element in the array is a conjunctive set of constraints.
 */
export type DisjunctiveConstraints = ConjunctiveConstraints[];

/**
 * A constraint solver that supports disjunctions on top of Kiwi's conjunctive constraint solver.
 * 
 * This solver uses a backtracking search approach with intelligent pruning to handle
 * disjunctive constraints (OR operations) while leveraging Kiwi for conjunctive constraints
 * (AND operations).
 * 
 * Example usage:
 * ```typescript
 * const solver = new DisjunctiveConstraintSolver();
 * 
 * // Add regular conjunctive constraints
 * solver.addConjunctiveConstraint(constraint1);
 * solver.addConjunctiveConstraint(constraint2);
 * 
 * // Add a disjunction: (constraint3 OR constraint4)
 * solver.addDisjunction([
 *   [constraint3],  // Option 1
 *   [constraint4]   // Option 2
 * ]);
 * 
 * // Solve
 * const result = solver.solve();
 * if (result.satisfiable) {
 *   // Use result.variables for the solution
 * }
 * ```
 */
export class DisjunctiveConstraintSolver {
    private conjunctiveConstraints: ConjunctiveConstraints = [];
    private disjunctions: DisjunctiveConstraints[] = [];
    private variables: Map<string, Variable> = new Map();

    /**
     * Adds a conjunctive constraint to the solver.
     * This constraint must always be satisfied.
     */
    public addConjunctiveConstraint(constraint: KiwiConstraint): void {
        this.conjunctiveConstraints.push(constraint);
    }

    /**
     * Adds multiple conjunctive constraints to the solver.
     */
    public addConjunctiveConstraints(constraints: ConjunctiveConstraints): void {
        this.conjunctiveConstraints.push(...constraints);
    }

    /**
     * Adds a disjunction to the solver.
     * At least one of the alternatives must be satisfied.
     * 
     * @param alternatives - Array of constraint sets, where each set is a conjunctive alternative
     */
    public addDisjunction(alternatives: DisjunctiveConstraints): void {
        if (alternatives.length === 0) {
            throw new Error('Disjunction must have at least one alternative');
        }
        this.disjunctions.push(alternatives);
    }

    /**
     * Registers a variable with the solver.
     * This is useful for tracking variables that appear in constraints.
     */
    public registerVariable(name: string, variable: Variable): void {
        this.variables.set(name, variable);
    }

    /**
     * Solves the constraint system using backtracking search.
     * 
     * @returns An object indicating whether the system is satisfiable, the solution if found,
     *          and the indices of the selected alternatives for each disjunction
     */
    public solve(): { 
        satisfiable: boolean; 
        variables?: Map<string, Variable>; 
        solver?: Solver;
        selectedAlternativeIndices?: number[];
    } {
        // If there are no disjunctions, just solve with the conjunctive constraints
        if (this.disjunctions.length === 0) {
            return { 
                ...this.solveConjunctive(this.conjunctiveConstraints),
                selectedAlternativeIndices: []
            };
        }

        // Use backtracking search to find a satisfying assignment
        return this.backtrackSearch(0, [], []);
    }

    /**
     * Attempts to solve a purely conjunctive set of constraints.
     */
    private solveConjunctive(constraints: ConjunctiveConstraints): { satisfiable: boolean; variables?: Map<string, Variable>; solver?: Solver } {
        const solver = new Solver();
        
        try {
            // Add all constraints to the solver
            for (const constraint of constraints) {
                solver.addConstraint(constraint);
            }
            
            // Update variables to get the solution
            solver.updateVariables();
            
            return {
                satisfiable: true,
                variables: this.variables,
                solver: solver
            };
        } catch (e) {
            // Constraint system is unsatisfiable
            return { satisfiable: false };
        }
    }

    /**
     * Backtracking search algorithm to find a satisfying assignment.
     * 
     * @param disjunctionIndex - The current disjunction being considered
     * @param selectedAlternatives - The alternatives selected so far
     * @param selectedIndices - The indices of the selected alternatives
     */
    private backtrackSearch(
        disjunctionIndex: number,
        selectedAlternatives: ConjunctiveConstraints[],
        selectedIndices: number[]
    ): { 
        satisfiable: boolean; 
        variables?: Map<string, Variable>; 
        solver?: Solver;
        selectedAlternativeIndices?: number[];
    } {
        // Base case: all disjunctions have been assigned
        if (disjunctionIndex >= this.disjunctions.length) {
            // Try to solve with the conjunctive constraints plus all selected alternatives
            const allConstraints = [
                ...this.conjunctiveConstraints,
                ...selectedAlternatives.flat()
            ];
            const result = this.solveConjunctive(allConstraints);
            return {
                ...result,
                selectedAlternativeIndices: selectedIndices
            };
        }

        // Try each alternative in the current disjunction
        const currentDisjunction = this.disjunctions[disjunctionIndex];
        
        for (let alternativeIndex = 0; alternativeIndex < currentDisjunction.length; alternativeIndex++) {
            const alternative = currentDisjunction[alternativeIndex];
            
            // Prune: Check if the current partial assignment is consistent
            const partialConstraints = [
                ...this.conjunctiveConstraints,
                ...selectedAlternatives.flat(),
                ...alternative
            ];
            
            const partialResult = this.solveConjunctive(partialConstraints);
            
            if (partialResult.satisfiable) {
                // This alternative is consistent, try to extend it
                const result = this.backtrackSearch(
                    disjunctionIndex + 1,
                    [...selectedAlternatives, alternative],
                    [...selectedIndices, alternativeIndex]
                );
                
                if (result.satisfiable) {
                    return result;
                }
                // Otherwise, backtrack and try the next alternative
            }
            // If not satisfiable, prune this branch and try the next alternative
        }

        // No satisfying assignment found
        return { satisfiable: false };
    }

    /**
     * Clears all constraints and variables from the solver.
     */
    public clear(): void {
        this.conjunctiveConstraints = [];
        this.disjunctions = [];
        this.variables.clear();
    }

    /**
     * Returns the number of disjunctions in the solver.
     */
    public getDisjunctionCount(): number {
        return this.disjunctions.length;
    }

    /**
     * Returns the number of conjunctive constraints in the solver.
     */
    public getConjunctiveConstraintCount(): number {
        return this.conjunctiveConstraints.length;
    }
}
