import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { SelectorArityError } from '../src/evaluators/interfaces';

/**
 * Tests that selector arity mismatches are caught and reported as selectorErrors
 * at the constraint consumption level.
 *
 * - Binary-position constraints (orientation, align, cyclic) should error when
 *   given a unary selector (e.g. "Person" instead of "Person->Person").
 * - Unary-position constraints/directives (hideAtom, size, atomColor, icon) should
 *   error when given a binary selector.
 */

function createEvaluator(instance: JSONDataInstance): SGraphQueryEvaluator {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

/**
 * Data instance with both unary and binary relations:
 *   - "selected" is unary (Node)
 *   - "next" is binary (Node -> Node)
 */
const mixedData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
    ],
    relations: [
        {
            id: 'selected',
            name: 'selected',
            types: ['Node'],
            tuples: [
                { atoms: ['A'], types: ['Node'] },
                { atoms: ['C'], types: ['Node'] },
            ],
        },
        {
            id: 'next',
            name: 'next',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            ],
        },
    ],
};

describe('Selector Arity Validation', () => {
    // ── SelectorArityError class ──────────────────────────────────

    describe('SelectorArityError', () => {
        it('should be an instance of Error', () => {
            const err = new SelectorArityError('Person', 'binary', 'unary');
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('SelectorArityError');
        });

        it('should carry selector, expectedArity, and actualArity', () => {
            const err = new SelectorArityError('Person', 'binary', 'unary');
            expect(err.selector).toBe('Person');
            expect(err.expectedArity).toBe('binary');
            expect(err.actualArity).toBe('unary');
        });

        it('should produce a helpful default message for binary expected', () => {
            const err = new SelectorArityError('Person', 'binary', 'unary');
            expect(err.message).toContain('binary selector was expected');
            expect(err.message).toContain('Person');
        });

        it('should produce a helpful default message for unary expected', () => {
            const err = new SelectorArityError('next', 'unary', 'binary');
            expect(err.message).toContain('unary selector was expected');
            expect(err.message).toContain('next');
        });
    });

    // ── Binary-position constraints with unary selectors ──────────

    describe('unary selector in binary position', () => {
        it('orientation constraint reports error for unary selector', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: selected
      directions: [above]
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            expect(selectorErrors.length).toBeGreaterThan(0);
            const arityError = selectorErrors.find(e => e.selector === 'selected' && e.context === 'orientation selector');
            expect(arityError).toBeDefined();
            expect(arityError!.errorMessage).toContain('binary');
        });

        it('align constraint reports error for unary selector', () => {
            const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: selected
      direction: horizontal
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            expect(selectorErrors.length).toBeGreaterThan(0);
            const arityError = selectorErrors.find(e => e.selector === 'selected' && e.context === 'align selector');
            expect(arityError).toBeDefined();
            expect(arityError!.errorMessage).toContain('binary');
        });

        it('cyclic constraint reports error for unary selector', () => {
            const spec = parseLayoutSpec(`
constraints:
  - cyclic:
      selector: selected
      direction: clockwise
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            expect(selectorErrors.length).toBeGreaterThan(0);
            const arityError = selectorErrors.find(e => e.selector === 'selected' && e.context === 'cyclic orientation selector');
            expect(arityError).toBeDefined();
            expect(arityError!.errorMessage).toContain('binary');
        });
    });

    // ── Unary-position directives with binary selectors ───────────

    describe('binary selector in unary position', () => {
        it('hideAtom directive reports error for binary selector', () => {
            const spec = parseLayoutSpec(`
directives:
  - hideAtom:
      selector: next
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            expect(selectorErrors.length).toBeGreaterThan(0);
            const arityError = selectorErrors.find(e => e.selector === 'next' && e.context === 'hideAtom selector');
            expect(arityError).toBeDefined();
            expect(arityError!.errorMessage).toContain('unary');
        });

        it('size directive reports error for binary selector', () => {
            const spec = parseLayoutSpec(`
directives:
  - size:
      selector: next
      width: 100
      height: 60
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            expect(selectorErrors.length).toBeGreaterThan(0);
            const arityError = selectorErrors.find(e => e.selector === 'next' && e.context === 'size selector');
            expect(arityError).toBeDefined();
            expect(arityError!.errorMessage).toContain('unary');
        });

        it('atomColor directive reports error for binary selector', () => {
            const spec = parseLayoutSpec(`
directives:
  - atomColor:
      selector: next
      value: red
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            expect(selectorErrors.length).toBeGreaterThan(0);
            const arityError = selectorErrors.find(e => e.selector === 'next' && e.context === 'color selector');
            expect(arityError).toBeDefined();
            expect(arityError!.errorMessage).toContain('unary');
        });
    });

    // ── Correct arity should produce no errors ────────────────────

    describe('correct arity produces no arity errors', () => {
        it('binary selector in orientation works fine', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: next
      directions: [above]
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            const arityErrors = selectorErrors.filter(e => e.errorMessage.includes('binary') || e.errorMessage.includes('unary'));
            expect(arityErrors).toHaveLength(0);
        });

        it('binary selector in align works fine', () => {
            const spec = parseLayoutSpec(`
constraints:
  - align:
      selector: next
      direction: horizontal
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            const arityErrors = selectorErrors.filter(e => e.errorMessage.includes('binary') || e.errorMessage.includes('unary'));
            expect(arityErrors).toHaveLength(0);
        });

        it('unary selector in hideAtom works fine', () => {
            const spec = parseLayoutSpec(`
directives:
  - hideAtom:
      selector: selected
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            const arityErrors = selectorErrors.filter(e => e.errorMessage.includes('binary') || e.errorMessage.includes('unary'));
            expect(arityErrors).toHaveLength(0);
        });
    });

    // ── Group constraints accept both arities (no error) ─────────

    describe('group constraints accept both arities', () => {
        it('group with binary selector produces no arity error', () => {
            const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: next
      name: "Next Group"
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            const arityErrors = selectorErrors.filter(e => e.errorMessage.includes('binary') || e.errorMessage.includes('unary'));
            expect(arityErrors).toHaveLength(0);
        });

        it('group with unary selector produces no arity error', () => {
            const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: selected
      name: "Selected Group"
`);
            const instance = new JSONDataInstance(mixedData);
            const evaluator = createEvaluator(instance);
            const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
            const { selectorErrors } = layoutInstance.generateLayout(instance);

            const arityErrors = selectorErrors.filter(e => e.errorMessage.includes('binary') || e.errorMessage.includes('unary'));
            expect(arityErrors).toHaveLength(0);
        });
    });
});
