/** Whole-program comparisons for host-language critique sessions.
 *
 * Presentation directives are held fixed: hiding nodes or changing inferred
 * edges changes the universe being compared. This API reports that boundary
 * rather than treating such a change as a positional denotation difference.
 */
import { JSONDataInstance, IJsonDataInstance } from '../data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../evaluators/data/sgq-evaluator';
import { LayoutInstance } from './layoutinstance';
import { parseLayoutSpec } from './layoutspec';
import { isPositionalConstraintError } from './constraint-types';

export interface ComparisonProgram {
    constraints: Record<string, any>[];
    directives: Record<string, any>[];
}

export interface ProgramComparison {
    status: 'different' | 'no-difference' | 'infeasible' | 'unsupported';
    message?: string;
    sides?: { program: ComparisonProgram; origin: 'a' | 'b'; excludes: 'a' | 'b' | null }[];
}

function stable(value: any): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
    return JSON.stringify(value);
}

/** Search on ONE datum. `no-difference` means this conservative mode-flipping
 * search found no witness; it is not an equivalence certificate. In particular,
 * a flip over several selected pairs can be stronger than negating the whole
 * universally quantified constraint. Every returned witness is checked both
 * for satisfiability and for incompatibility with the complete rival program.
 */
export function comparePrograms(datum: IJsonDataInstance, a: ComparisonProgram, b: ComparisonProgram): ProgramComparison {
    const positional = (entry: Record<string, any>) => ['orientation', 'align', 'cyclic', 'group'].includes(Object.keys(entry)[0]);
    for (const program of [a, b]) {
        if (!Array.isArray(program.constraints) || !Array.isArray(program.directives)) {
            throw new Error('A program needs constraints and directives arrays.');
        }
        for (const entry of program.constraints) {
            const keys = Object.keys(entry);
            if (keys.length !== 1 || !['orientation', 'align', 'cyclic', 'group', 'hideAtom', 'size'].includes(keys[0])) {
                return { status: 'unsupported', message: 'Only positional constraints can be compared.' };
            }
            if (!positional(entry)) continue;
            const body = entry[keys[0]];
            if (!body || typeof body.selector !== 'string' || !body.selector.trim() ||
                (body.hold !== undefined && !['always', 'never'].includes(body.hold))) {
                throw new Error('Each positional constraint needs a selector and a valid hold mode.');
            }
            if (keys[0] === 'orientation' && (!Array.isArray(body.directions) || !body.directions.length ||
                body.directions.some((d: unknown) => !['above', 'below', 'left', 'right', 'directlyAbove', 'directlyBelow', 'directlyLeft', 'directlyRight'].includes(d as string)))) {
                throw new Error('Invalid orientation directions.');
            }
            if (keys[0] === 'align' && !['horizontal', 'vertical'].includes(body.direction)) throw new Error('Invalid alignment direction.');
            if (keys[0] === 'cyclic' && !['clockwise', 'counterclockwise'].includes(body.direction)) throw new Error('Invalid cyclic direction.');
        }
    }
    if (stable(a.directives) !== stable(b.directives) ||
        stable(a.constraints.filter(c => !positional(c))) !== stable(b.constraints.filter(c => !positional(c)))) {
        return { status: 'unsupported', message: 'Keep presentation directives identical when comparing positions.' };
    }
    const data = new JSONDataInstance(datum);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: data });
    const visibleNodes = new Map<string, string>();
    function feasible(program: ComparisonProgram): boolean {
        const spec = parseLayoutSpec(JSON.stringify(program));
        const result = new LayoutInstance(spec, evaluator).generateLayout(data);
        if (result.selectorErrors.length) throw new Error(result.selectorErrors.map(e => e.errorMessage).join('; '));
        const errors = result.warnings.filter(w => w.code === 'selector-arity' || w.code === 'evaluation-failed');
        if (errors.length) throw new Error(errors.map(w => w.message).join('; '));
        if (result.error) {
            if (isPositionalConstraintError(result.error)) return false;
            throw new Error(`Program could not be evaluated: ${JSON.stringify(result.error)}`);
        }
        visibleNodes.set(stable(program), stable(result.layout.nodes.map(n => n.id).sort()));
        return true;
    }
    function difference(left: ComparisonProgram, right: ComparisonProgram): ComparisonProgram | undefined {
        for (const entry of right.constraints) {
            if (!positional(entry)) continue;
            const kind = Object.keys(entry)[0];
            const body = entry[kind];
            const witness = {
                constraints: [...left.constraints, { [kind]: { ...body, hold: body.hold === 'never' ? 'always' : 'never' } }],
                directives: left.directives,
            };
            // Empty selectors and short cyclic fragments may impose no spatial
            // condition in either mode. A successful flip alone is therefore
            // insufficient evidence of a difference. Require the *whole*
            // rival program to be inconsistent with the witness as well.
            if (feasible(witness) && !feasible({
                constraints: [...witness.constraints, ...right.constraints],
                directives: witness.directives,
            })) return witness;
        }
    }
    try {
        if (!feasible(a)) return { status: 'infeasible', message: 'A candidate has conflicting constraints on this example.' };
        if (stable(a) === stable(b)) return { status: 'no-difference' };
        if (!feasible(b)) return { status: 'infeasible', message: 'A candidate has conflicting constraints on this example.' };
        const ab = difference(a, b);
        const ba = difference(b, a);
        if (!ab && !ba) return { status: 'no-difference' };
        if (visibleNodes.get(stable(ab ?? a)) !== visibleNodes.get(stable(ba ?? b))) {
            return { status: 'unsupported', message: 'These witness programs do not show the same nodes.' };
        }
        return {
            status: 'different',
            sides: [
                { program: ab ?? a, origin: 'a', excludes: ab ? 'b' : null },
                { program: ba ?? b, origin: 'b', excludes: ba ? 'a' : null },
            ],
        };
    } finally {
        evaluator.dispose();
    }
}
