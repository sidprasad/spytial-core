// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { isPositionalConstraintError } from '../src/layout/constraint-types';
import { isBoundingBoxConstraint, isLeftConstraint } from '../src/layout/interfaces';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { runHeadlessLayout } from '../src/evaluation/headless-layout';
import { describeConstraint, solve } from './helpers/constraint-dsl';
import { maximumFeasibleSubset } from '../src/layout/maximum-feasible-subset';

function recover(spec: string) {
    const { error, validator: { layout } } = solve(spec);
    if (!error || !isPositionalConstraintError(error)) throw new Error('expected a positional conflict');
    return { kept: layout.constraints.map(describeConstraint),
        iis: [...error.minimalConflictingSet.values()].flat().map(describeConstraint) };
}

function generate(specification: string, ids: string[]) {
    const data = new JSONDataInstance({
        atoms: ids.map(id => ({id, label: id, type: 'Node'})), relations: [],
    });
    const spec = parseLayoutSpec(specification);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({sourceData: data});
    return {spec, data, ...new LayoutInstance(spec, evaluator).generateLayout(data)};
}

describe('maximum-cardinality counterfactuals on the reported branch', () => {
    it('trades one early edge for two later edges and counts repeated facts once', () => {
        const result = recover('A <x B, A <x B, B <x C, C <x A, B <x D, D <x A');
        expect(result.kept).toEqual(['B <x C', 'C <x A', 'B <x D', 'D <x A']);
        expect(result.iis).toEqual(['A <x B', 'B <x C', 'C <x A']);
    });

    it('counts explicit orders even if another path implied them before repair', () => {
        const pairs = ['C->A', 'D->C', 'B->C', 'A->D', 'A->C', 'B->A'];
        const rules = pairs.map(pair => `  - orientation: {selector: "${pair}", directions: [right]}`);
        const {layout, error} = generate(['constraints:', ...rules].join('\n'), ['A', 'B', 'C', 'D']);
        expect(error?.type).toBe('positional-conflict');
        expect(layout.relaxedConstraints!.map(describeConstraint)).toEqual(['C <x A']);
        expect(layout.constraints.map(describeConstraint).sort()).toEqual(
            ['A <x C', 'A <x D', 'B <x A', 'B <x C', 'D <x C']);
    });

    it('keeps a compatible part of the reported alternative without borrowing from its sibling', () => {
        const result = recover('A <x B, [B <x A & C <y D | B <x A & D <x C]');
        expect(result.iis).toEqual(['A <x B', 'B <x A']);
        expect(result.kept).toEqual(['A <x B', 'C <y D']);
    });

    it('drops the whole selected never-group witness together', () => {
        const {spec, layout, error} = generate(`constraints:
  - orientation: {selector: "A->N + B->N", directions: [right]}
  - group: {selector: "A + B", hold: never}
`, ['A', 'B', 'N']);
        expect(error?.type).toBe('positional-conflict');
        expect(layout.constraints.map(describeConstraint)).toEqual(['A <x N', 'B <x N']);
        expect(layout.relaxedConstraints!.length).toBeGreaterThan(1);
        expect(layout.relaxedConstraints!.every(c => c.sourceConstraint === spec.constraints.grouping.byselector[0])).toBe(true);
    });

    it('one node-to-group side gets one vote even with multiple member edges', () => {
        const { layout } = solve('{G: A, B, C}, X <y D');
        const group = layout.groups[0];
        const node = (id: string) => layout.nodes.find(n => n.id === id)!;
        const source = group.sourceConstraint!;
        const side = { group, node: node('X'), side: 'left' as const, minDistance: 15, sourceConstraint: source };
        // Two member orderings contradict the entire side; the third member could fit.
        const orders = ['A', 'B'].map(id => ({left: node(id), right: node('X'), minDistance: 15, sourceConstraint: source}));
        const fixed = { ...layout, groups: [], disjunctiveConstraints: [], constraints: [side, ...orders] };
        const error = new QualitativeConstraintValidator(fixed).validateConstraints();
        expect(error?.type).toBe('positional-conflict');
        expect(fixed.constraints).toEqual(orders);
    });

    it('keeps the row and puts the middle outsider inside the group rectangle', async () => {
        const {spec, data, layout, error} = generate(`constraints:
  - group: {selector: "A + C", name: G}
  - orientation: {selector: "A->B + B->C", directions: [right]}
  - align: {selector: "A->B + B->C", direction: horizontal}
`, ['A', 'B', 'C', 'X']);
        expect(error?.type).toBe('positional-conflict');
        expect(layout.groups[0].nodeIds).toEqual(['A', 'C']);
        expect(layout.relaxedConstraints).toHaveLength(1);
        expect(layout.relaxedConstraints![0]).toMatchObject({group: {name: 'G'}, node: {id: 'B'}});
        const rendered = await runHeadlessLayout(spec, data);
        const bounds = (id: string) => rendered.nodes.find(n => n.id === id)!.bounds!;
        const [a, b, c, x] = ['A', 'B', 'C', 'X'].map(bounds);
        expect(a.X).toBeLessThanOrEqual(b.x);
        expect(b.X).toBeLessThanOrEqual(c.x);
        expect(a.cy()).toBeCloseTo(b.cy());
        expect(b.cy()).toBeCloseTo(c.cy());
        const hull = rendered.groups[0].bounds!;
        expect(hull.x).toBeLessThan(b.x);
        expect(hull.X).toBeGreaterThan(b.X);
        expect(hull.y).toBeLessThan(b.y);
        expect(hull.Y).toBeGreaterThan(b.Y);
        // The second outsider's selected exclusion is still enforced.
        expect(x.X).toBeLessThanOrEqual(hull.x);
    });

    it('lets two group rectangles intersect when their selected separation is relaxed', async () => {
        const {layout, error, spec, data} = generate(`constraints:
  - group: {selector: "A + C", name: G}
  - group: {selector: "B + D", name: H}
  - orientation: {selector: "A->B + B->C + C->D", directions: [directlyRight]}
`, ['A', 'B', 'C', 'D']);
        expect(error?.type).toBe('positional-conflict');
        expect(layout.relaxedConstraints).toHaveLength(1);
        expect(layout.relaxedConstraints![0]).toMatchObject({groupA: {name: 'G'}, groupB: {name: 'H'}});
        const rendered = await runHeadlessLayout(spec, data);
        const [g, h] = rendered.groups.map(group => group.bounds!);
        expect(g.overlapX(h)).toBeGreaterThan(0);
        expect(g.overlapY(h)).toBeGreaterThan(0);
        const row = ['A', 'B', 'C', 'D'].map(id => rendered.nodes.find(n => n.id === id)!.bounds!);
        for (let i = 1; i < row.length; i++) {
            expect(row[i - 1].X).toBeLessThanOrEqual(row[i].x);
            expect(row[i - 1].cy()).toBeCloseTo(row[i].cy());
        }
    });

    it('carries a retained group side into the layout engine and the final geometry', async () => {
        const {spec, data, layout, error} = generate(`constraints:
  - group: {selector: "A + B", name: G}
  - orientation: {selector: "X->Y + Y->X", directions: [right]}
`, ['A', 'B', 'X', 'Y']);
        expect(error?.type).toBe('positional-conflict');
        expect(layout.groups[0].nodeIds.sort()).toEqual(['A','B']);
        expect(layout.constraints.filter(isLeftConstraint)).toHaveLength(1);
        const sides = layout.constraints.filter(isBoundingBoxConstraint);
        expect(sides).toHaveLength(2);
        const cola = await new WebColaTranslator().translate(layout);
        expect(cola.constraints.filter(c => c.groupBoundary)).toHaveLength(4);
        const rendered = await runHeadlessLayout(spec, data);
        const hull = rendered.groups[0].bounds!;
        for (const side of sides) {
            expect(side.side).toBe('left');
            const outsider = rendered.nodes.find(n => n.id === side.node.id)!;
            expect(hull.x - outsider.bounds!.X).toBeGreaterThanOrEqual(side.minDistance - 0.01);
        }
    });

    it('does not search the smaller budgets when the conflicts are independent', () => {
        // 14 pairs; the two constraints of a pair contradict each other and
        // no pair touches another. One deletion for each pair is necessary.
        // Before the fix the search tried each budget from 1 to 13 in full
        // and the validator needed some seconds for this input.
        const pairs = 14;
        let calls = 0;
        const firstFailure = (subset: number[]) => {
            calls++;
            const seen = new Set<number>();
            return subset.findIndex(i => {
                seen.add(i);
                return seen.has(i ^ 1);
            });
        };
        const { kept, iis } = maximumFeasibleSubset(2 * pairs, firstFailure);
        expect(kept).toHaveLength(pairs);
        expect(iis).toEqual([0, 1]);
        expect(calls).toBeLessThan(1000);

        const spec = Array.from({ length: pairs }, (_, i) => `a${i} <x b${i}, b${i} <x a${i}`).join(', ');
        expect(recover(spec).kept).toEqual(Array.from({ length: pairs }, (_, i) => `a${i} <x b${i}`));
    });
});
