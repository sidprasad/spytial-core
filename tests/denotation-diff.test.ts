import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import {
    findDistinguishingRealization,
    type DistinguishingRealizationResult,
} from '../src/layout/equivalence-checker';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const jsonData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
    ],
    relations: [
        {
            id: 'r',
            name: 'r',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            ],
        },
    ],
};

function createEvaluator(instance: JSONDataInstance) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

// ===================================================================
// Tests
// ===================================================================

describe('findDistinguishingRealization', () => {
    it('returns found: false for identical specs', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const spec = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const result = findDistinguishingRealization(spec, spec, instance, evaluator);
        expect(result.found).toBe(false);
        if (!result.found) {
            expect(result.reason).toBe('equivalent');
        }
    });

    it('returns found: false when A has more constraints (⟦A⟧ ⊆ ⟦B⟧)', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        // specA has right + directlyRight (more constrained)
        // specB has just right (less constrained)
        // ⟦A⟧ ⊆ ⟦B⟧ by monotonicity, so ⟦A⟧ \ ⟦B⟧ = ∅
        const specA = `
constraints:
  - orientation:
      selector: r
      directions:
        - directlyRight
`;
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const result = findDistinguishingRealization(specA, specB, instance, evaluator);
        expect(result.found).toBe(false);
        if (!result.found) {
            expect(result.reason).toBe('first-contained-in-second');
        }
    });

    it('finds a realization when B has more constraints (⟦B⟧ ⊆ ⟦A⟧)', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        // specA has just right (less constrained, bigger denotation)
        // specB has directlyRight (more constrained, smaller denotation)
        // ⟦A⟧ \ ⟦B⟧ should be non-empty
        const specA = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - directlyRight
`;
        const result = findDistinguishingRealization(specA, specB, instance, evaluator);
        expect(result.found).toBe(true);
        if (result.found) {
            expect(result.realization).toBeDefined();
            expect(result.realization.size).toBeGreaterThan(0);
        }
    });

    it('finds a realization for incompatible specs', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        // specA: A right-of B, specB: B right-of A — incompatible
        const specA = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - left
`;
        const result = findDistinguishingRealization(specA, specB, instance, evaluator);
        expect(result.found).toBe(true);
        if (result.found) {
            expect(result.realization).toBeDefined();
            // The realization should have positions for all visible nodes
            expect(result.realization.size).toBeGreaterThan(0);
        }
    });

    it('finds a realization for overlapping specs', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        // specA: r goes right, align horizontally
        // specB: r goes right, align vertically
        // Both allow right-of, but with different alignment — partially overlapping
        const specA = `
constraints:
  - orientation:
      selector: r
      directions:
        - directlyRight
`;
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - below
`;
        const result = findDistinguishingRealization(specA, specB, instance, evaluator);
        expect(result.found).toBe(true);
        if (result.found) {
            expect(result.realization).toBeDefined();
        }
    });

    it('returns equivalent for empty specs', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const result = findDistinguishingRealization('', '', instance, evaluator);
        expect(result.found).toBe(false);
        if (!result.found) {
            expect(result.reason).toBe('equivalent');
        }
    });

    it('realization has positions for nodes in the data instance', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const specA = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - below
`;
        const result = findDistinguishingRealization(specA, specB, instance, evaluator);
        expect(result.found).toBe(true);
        if (result.found) {
            // Each entry in the realization should have numeric x and y
            for (const [nodeId, pos] of result.realization) {
                expect(typeof pos.x).toBe('number');
                expect(typeof pos.y).toBe('number');
                expect(Number.isFinite(pos.x)).toBe(true);
                expect(Number.isFinite(pos.y)).toBe(true);
            }
        }
    });
});
