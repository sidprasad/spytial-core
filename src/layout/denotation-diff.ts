/**
 * Denotation difference via mode-flipping.
 *
 * Given spytial programs A and B over a data instance, generates witness
 * programs whose denotations lie in ⟦A⟧ \ ⟦B⟧.
 *
 * Justified by the Lean theorem `denoteDiff_decompose`:
 *   denoteDiff P Q = ⋃ q ∈ Q, denotes(P ∪ {flipMode q})
 *
 * Each single-constraint flip is an under-approximation of the full diff.
 * The generator lazily yields witnesses — the caller controls how many to
 * pull. If the generator exhausts without yielding, A entails B.
 */

import {
    LayoutSpec,
    RelativeOrientationConstraint,
    CyclicOrientationConstraint,
    AlignConstraint,
    GroupBySelector,
    GroupByField,
} from './layoutspec';
import { InstanceLayout } from './interfaces';
import { LayoutInstance } from './layoutinstance';
import { isPositionalConstraintError } from './constraint-validator';
import IEvaluator from '../evaluators/interfaces';
import { IDataInstance } from '../data-instance/interfaces';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Union of all constraint types that carry a `negated` mode. */
export type SpytialConstraint =
    | RelativeOrientationConstraint
    | CyclicOrientationConstraint
    | AlignConstraint
    | GroupBySelector
    | GroupByField;

/** Result of a single flip-and-solve attempt. */
export interface FlipAttempt {
    /** The original constraint from B that was flipped. */
    originalConstraint: SpytialConstraint;
    /** The flipped constraint (negated toggled). */
    flippedConstraint: SpytialConstraint;
    /** Whether A ∪ {flipMode(q)} is satisfiable. */
    satisfiable: boolean;
    /** The generated layout if satisfiable, null otherwise. */
    layout: InstanceLayout | null;
    /** The merged LayoutSpec (A ∪ {flip(q)}) — this IS the witness program C. */
    witnessProgram: LayoutSpec;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Extract all qualified constraints from a LayoutSpec into a flat array.
 * Corresponds to viewing a Program as a finite set of QualifiedConstraints.
 */
export function flattenConstraints(spec: LayoutSpec): SpytialConstraint[] {
    const c = spec.constraints;
    return [
        ...c.orientation.relative,
        ...c.orientation.cyclic,
        ...c.alignment,
        ...c.grouping.byselector,
        ...c.grouping.byfield,
    ];
}

/**
 * Clone a constraint with its `negated` mode toggled.
 * Corresponds to Lean `flipMode : QualifiedConstraint → QualifiedConstraint`.
 */
export function flipConstraint(c: SpytialConstraint): SpytialConstraint {
    if (c instanceof RelativeOrientationConstraint) {
        return new RelativeOrientationConstraint(c.directions, c.selector, !c.negated);
    }
    if (c instanceof CyclicOrientationConstraint) {
        return new CyclicOrientationConstraint(c.direction, c.selector, !c.negated);
    }
    if (c instanceof AlignConstraint) {
        return new AlignConstraint(c.direction, c.selector, !c.negated);
    }
    if (c instanceof GroupBySelector) {
        return new GroupBySelector(c.selector, c.name, c.addEdge, !c.negated);
    }
    if (c instanceof GroupByField) {
        return new GroupByField(c.field, c.groupOn, c.addToGroup, c.selector, !c.negated);
    }
    throw new Error('Unknown constraint type');
}

/**
 * Create a new LayoutSpec that is A's spec with one flipped constraint appended.
 * Corresponds to Lean `P ∪ {flipMode q}`.
 *
 * Directives are copied from A unchanged (they don't affect denotation).
 */
export function mergeSpecWithFlip(specA: LayoutSpec, flipped: SpytialConstraint): LayoutSpec {
    // Deep-copy A's constraint arrays so we don't mutate the original.
    const merged: LayoutSpec = {
        constraints: {
            orientation: {
                relative: [...specA.constraints.orientation.relative],
                cyclic: [...specA.constraints.orientation.cyclic],
            },
            alignment: [...specA.constraints.alignment],
            grouping: {
                byfield: [...specA.constraints.grouping.byfield],
                byselector: [...specA.constraints.grouping.byselector],
            },
        },
        directives: specA.directives,
    };

    // Append the flipped constraint into the correct sub-array.
    if (flipped instanceof RelativeOrientationConstraint) {
        merged.constraints.orientation.relative.push(flipped);
    } else if (flipped instanceof CyclicOrientationConstraint) {
        merged.constraints.orientation.cyclic.push(flipped);
    } else if (flipped instanceof AlignConstraint) {
        merged.constraints.alignment.push(flipped);
    } else if (flipped instanceof GroupBySelector) {
        merged.constraints.grouping.byselector.push(flipped);
    } else if (flipped instanceof GroupByField) {
        merged.constraints.grouping.byfield.push(flipped);
    }

    return merged;
}

/**
 * Check whether a LayoutSpec is satisfiable over a data instance.
 * Returns the layout on success, null on UNSAT.
 */
export function checkSatisfiability(
    spec: LayoutSpec,
    evaluator: IEvaluator,
    data: IDataInstance,
): { satisfiable: boolean; layout: InstanceLayout | null } {
    const instance = new LayoutInstance(spec, evaluator);
    const result = instance.generateLayout(data);

    if (result.error && isPositionalConstraintError(result.error)) {
        return { satisfiable: false, layout: null };
    }
    return { satisfiable: true, layout: result.layout };
}

/**
 * Lazily generate witness programs whose denotations lie in ⟦A⟧ \ ⟦B⟧.
 *
 * For each constraint q in B, flips its mode and checks if A ∪ {flipMode(q)}
 * is satisfiable. If so, yields the witness. The caller controls iteration:
 *
 * ```ts
 * // Min disagreement: first witness
 * const first = denotationDiff(a, b, eval, data).next();
 *
 * // All witnesses
 * const all = [...denotationDiff(a, b, eval, data)];
 * ```
 *
 * If the generator exhausts without yielding, A entails B (the diff is empty).
 */
export function* denotationDiff(
    specA: LayoutSpec,
    specB: LayoutSpec,
    evaluator: IEvaluator,
    data: IDataInstance,
): Generator<FlipAttempt> {
    const constraintsB = flattenConstraints(specB);

    for (const q of constraintsB) {
        const flipped = flipConstraint(q);
        const witnessProgram = mergeSpecWithFlip(specA, flipped);
        const { satisfiable, layout } = checkSatisfiability(witnessProgram, evaluator, data);

        if (satisfiable) {
            yield {
                originalConstraint: q,
                flippedConstraint: flipped,
                satisfiable: true,
                layout,
                witnessProgram,
            };
        }
    }
}
