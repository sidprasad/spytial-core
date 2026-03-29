import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import {
    RelativeOrientationConstraint,
    CyclicOrientationConstraint,
    AlignConstraint,
    GroupBySelector,
    GroupByField,
} from '../src/layout/layoutspec';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import {
    flattenConstraints,
    flipConstraint,
    mergeSpecWithFlip,
    denotationDiff,
    checkSatisfiability,
} from '../src/layout/denotation-diff';

// ---------------------------------------------------------------------------
// Shared fixtures
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

function createInstance() {
    return new JSONDataInstance(jsonData);
}

function createEvaluator(instance: JSONDataInstance) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

// ---------------------------------------------------------------------------
// Unit: flipConstraint
// ---------------------------------------------------------------------------

describe('flipConstraint', () => {
    it('flips RelativeOrientationConstraint', () => {
        const c = new RelativeOrientationConstraint(['right'], 'r', false);
        const f = flipConstraint(c) as RelativeOrientationConstraint;
        expect(f.negated).toBe(true);
        expect(f.directions).toEqual(['right']);
        expect(f.selector).toBe('r');
    });

    it('flips negated back to non-negated', () => {
        const c = new RelativeOrientationConstraint(['above'], 'r', true);
        const f = flipConstraint(c) as RelativeOrientationConstraint;
        expect(f.negated).toBe(false);
    });

    it('flips CyclicOrientationConstraint', () => {
        const c = new CyclicOrientationConstraint('clockwise', 'r', false);
        const f = flipConstraint(c) as CyclicOrientationConstraint;
        expect(f.negated).toBe(true);
        expect(f.direction).toBe('clockwise');
    });

    it('flips AlignConstraint', () => {
        const c = new AlignConstraint('horizontal', 'r', false);
        const f = flipConstraint(c) as AlignConstraint;
        expect(f.negated).toBe(true);
        expect(f.direction).toBe('horizontal');
    });

    it('flips GroupBySelector', () => {
        const c = new GroupBySelector('r', 'grp', true, false);
        const f = flipConstraint(c) as GroupBySelector;
        expect(f.negated).toBe(true);
        expect(f.name).toBe('grp');
        expect(f.addEdge).toBe(true);
    });

    it('flips GroupByField', () => {
        const c = new GroupByField('field1', 0, 1, 'r', false);
        const f = flipConstraint(c) as GroupByField;
        expect(f.negated).toBe(true);
        expect(f.field).toBe('field1');
        expect(f.groupOn).toBe(0);
        expect(f.addToGroup).toBe(1);
    });

    it('is an involution (flip twice = identity)', () => {
        const c = new RelativeOrientationConstraint(['left', 'above'], 'sel', false);
        const ff = flipConstraint(flipConstraint(c)) as RelativeOrientationConstraint;
        expect(ff.negated).toBe(c.negated);
        expect(ff.directions).toEqual(c.directions);
        expect(ff.selector).toBe(c.selector);
    });
});

// ---------------------------------------------------------------------------
// Unit: flattenConstraints
// ---------------------------------------------------------------------------

describe('flattenConstraints', () => {
    it('extracts all constraints from a parsed spec', () => {
        const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
  - align:
      selector: r
      direction: horizontal
`);
        const flat = flattenConstraints(spec);
        expect(flat.length).toBe(2);
        expect(flat[0]).toBeInstanceOf(RelativeOrientationConstraint);
        expect(flat[1]).toBeInstanceOf(AlignConstraint);
    });

    it('returns empty array for spec with no constraints', () => {
        const spec = parseLayoutSpec('');
        const flat = flattenConstraints(spec);
        expect(flat.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Unit: mergeSpecWithFlip
// ---------------------------------------------------------------------------

describe('mergeSpecWithFlip', () => {
    it('adds flipped constraint without mutating original', () => {
        const specA = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
`);
        const originalLength = specA.constraints.orientation.relative.length;

        const flipped = new RelativeOrientationConstraint(['below'], 'r', true);
        const merged = mergeSpecWithFlip(specA, flipped);

        // Merged has one extra constraint
        expect(merged.constraints.orientation.relative.length).toBe(originalLength + 1);
        // Original is untouched
        expect(specA.constraints.orientation.relative.length).toBe(originalLength);
        // The extra constraint is the flipped one
        const last = merged.constraints.orientation.relative[merged.constraints.orientation.relative.length - 1];
        expect(last.negated).toBe(true);
        expect(last.directions).toEqual(['below']);
    });

    it('places AlignConstraint in the alignment array', () => {
        const specA = parseLayoutSpec('');
        const flipped = new AlignConstraint('vertical', 'r', true);
        const merged = mergeSpecWithFlip(specA, flipped);
        expect(merged.constraints.alignment.length).toBe(1);
        expect(merged.constraints.alignment[0].negated).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Integration: witness found (A and B differ)
// ---------------------------------------------------------------------------

describe('denotationDiff integration', () => {
    it('yields a witness when A and B differ', () => {
        const instance = createInstance();
        const evaluator = createEvaluator(instance);

        const specA = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
`);
        const specB = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - below
`);

        const witnesses = [...denotationDiff(specA, specB, evaluator, instance)];
        expect(witnesses.length).toBeGreaterThan(0);
        expect(witnesses[0].satisfiable).toBe(true);
        expect(witnesses[0].layout).not.toBeNull();
        // The witness program should contain A's constraint plus the flip of B's
        expect(witnesses[0].flippedConstraint.negated).toBe(true);
    });

    it('yields nothing when A equals B (entailment)', () => {
        const instance = createInstance();
        const evaluator = createEvaluator(instance);

        const spec = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const specA = parseLayoutSpec(spec);
        const specB = parseLayoutSpec(spec);

        const witnesses = [...denotationDiff(specA, specB, evaluator, instance)];
        expect(witnesses.length).toBe(0);
    });

    it('yields nothing when B is empty (no constraints to flip)', () => {
        const instance = createInstance();
        const evaluator = createEvaluator(instance);

        const specA = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
`);
        const specB = parseLayoutSpec('');

        const witnesses = [...denotationDiff(specA, specB, evaluator, instance)];
        expect(witnesses.length).toBe(0);
    });

    it('is lazy — can pull just the first witness without exhausting', () => {
        const instance = createInstance();
        const evaluator = createEvaluator(instance);

        // B has 2 constraints — both should produce witnesses when flipped
        const specA = parseLayoutSpec('');
        const specB = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions:
        - right
  - orientation:
      selector: r
      directions:
        - below
`);

        const gen = denotationDiff(specA, specB, evaluator, instance);
        const first = gen.next();

        // Generator yields without exhausting
        expect(first.done).toBe(false);
        expect(first.value.satisfiable).toBe(true);

        // We can still pull more if we want
        const second = gen.next();
        expect(second.done).toBe(false);
        expect(second.value.satisfiable).toBe(true);
    });
});
