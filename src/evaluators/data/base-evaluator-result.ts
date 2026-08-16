import { IEvaluatorResult, EvaluatorResult, SingleValue, Tuple } from '../interfaces';

/**
 * Type guard to check if a value is a SingleValue
 */
export function isSingleValue(value: unknown): value is SingleValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Convert a SingleValue to string representation
 */
export function singleValueToString(value: SingleValue): string {
    if (typeof value === 'string') {
        return value;
    } else if (typeof value === 'number') {
        return value.toString();
    } else if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    throw new Error('Invalid SingleValue type');
}

/**
 * Shared IEvaluatorResult implementation for the data evaluators (Forge,
 * simple-graph-query, SQL). The three wrappers carried byte-identical copies
 * of every selection method; only two things actually differ per evaluator,
 * and both are injected:
 *
 * - what counts as an error result — each subclass decides and passes the
 *   verdict to `super` (a constructor parameter rather than an abstract
 *   method, so the base never virtual-dispatches before the subclass's own
 *   fields exist);
 * - the raw-result shape — the default `getRawResult()` normalizes errors to
 *   the neutral `{ error: { message, code } }` form; the SQL wrapper
 *   overrides it to return its already-neutral result untouched.
 */
export abstract class BaseEvaluatorResult implements IEvaluatorResult {
    protected readonly result: EvaluatorResult;
    protected readonly expr: string;
    protected readonly isErrorResult: boolean;
    protected readonly isSingletonResult: boolean;

    protected constructor(result: EvaluatorResult, expr: string, isErrorResult: boolean) {
        this.result = result;
        this.expr = expr;
        this.isErrorResult = isErrorResult;
        this.isSingletonResult = isSingleValue(result);
    }

    isError(): boolean {
        return this.isErrorResult;
    }

    isSingleton(): boolean {
        return this.isSingletonResult;
    }

    getExpression(): string {
        return this.expr;
    }

    noResult(): boolean {
        return !this.isErrorResult && (Array.isArray(this.result) && this.result.length === 0);
    }

    getRawResult(): EvaluatorResult {
        if (this.isErrorResult) {
            const errorResult = this.result as { error: { message: string } };
            return {
                error: {
                    message: errorResult.error.message,
                    code: 'FORGE_ERROR'
                }
            };
        }

        if (this.isSingletonResult) {
            return this.result as SingleValue;
        }

        return this.result as Tuple[];
    }

    prettyPrint(): string {
        if (typeof this.result === 'string') {
            return this.result;
        }
        else if (typeof this.result === 'number') {
            return this.result.toString();
        }
        else if (typeof this.result === 'boolean') {
            return this.result ? 'true' : 'false';
        }
        else if (this.isErrorResult) {
            const errorResult = this.result as { error: { message: string } };
            return `Error: ${errorResult.error.message}`;
        }
        else {
            // Join each tuple's elements with -> and the tuples with commas
            const asTuple = this.result as Tuple[];
            return asTuple.map((tuple) => tuple.join('->')).join(' , ');
        }
    }

    singleResult(): SingleValue {
        if (!this.isSingletonResult) {
            const pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to a single value. Instead: ${pp}`);
        }
        return this.result as SingleValue;
    }

    selectedAtoms(): string[] {
        if (this.isSingletonResult || this.isErrorResult) {
            const pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 1. Instead: ${pp}`);
        }

        const asTuple = this.result as Tuple[];

        let selectedElements = asTuple.filter((element) => element.length > 0);
        if (selectedElements.length === 0) {
            return [];
        }

        // Keep only elements of arity 1, flatten, and dedupe
        selectedElements = selectedElements.filter((element) => element.length === 1);
        const flattened = selectedElements.flat().map((element) => singleValueToString(element));
        return Array.from(new Set(flattened));
    }

    selectedTwoples(): string[][] {
        if (this.isSingletonResult || this.isErrorResult) {
            const pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead: ${pp}`);
        }

        const asTuple = this.result as Tuple[];

        const selectedElements = asTuple.filter((element) => element.length > 1);
        if (selectedElements.length === 0) {
            return [];
        }

        // Keep the FIRST and LAST element of each tuple
        return selectedElements.map((element) => {
            return [element[0], element[element.length - 1]];
        }).map((element) => {
            return element.map((e) => singleValueToString(e));
        });
    }

    maxArity(): number {
        if (this.isSingletonResult || this.isErrorResult) {
            return 0;
        }
        const asTuple = this.result as Tuple[];
        if (asTuple.length === 0) {
            return 0;
        }
        return Math.max(...asTuple.map((t) => t.length));
    }

    selectedTuplesAll(): string[][] {
        if (this.isSingletonResult || this.isErrorResult) {
            const pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2+. Instead: ${pp}`);
        }

        const asTuple = this.result as Tuple[];

        const selectedElements = asTuple.filter((element) => element.length > 1);
        if (selectedElements.length === 0) {
            return [];
        }

        return selectedElements.map((element) => {
            return element.map((e) => singleValueToString(e));
        });
    }
}
