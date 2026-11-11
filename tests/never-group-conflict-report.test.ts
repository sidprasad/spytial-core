import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { parseLayoutSpec, GroupBySelector } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import type { PositionalConstraintError } from '../src/layout/constraint-types';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { isLeftConstraint, isTopConstraint, isAlignmentConstraint } from '../src/layout/interfaces';
import { parseConstraintSpec } from './helpers/constraint-dsl';

/**
 * Conflict reports for `hold: never` group rules (issue #401).
 *
 * A report must name every rule that takes part in the conflict, and the
 * error diagram must not draw a box for a never-group.
 */
describe('never-group conflict reports (#401)', () => {
    const datumXml = fs.readFileSync(
        path.resolve(__dirname, '../sample/unsat-grouping/datum.xml'), 'utf-8');

    function layoutFor(constraints: string) {
        const spec = `${constraints}\ndirectives:\n  - flag: hideDisconnected\n`;
        const instance = new AlloyDataInstance(parseAlloyXML(datumXml).instances[0]);
        const evaluator = new SGraphQueryEvaluator();
        evaluator.initialize({ sourceData: instance });
        return new LayoutInstance(parseLayoutSpec(spec), evaluator, 0, true, undefined, 'qualitative')
            .generateLayout(instance);
    }

    function positionalError(result: ReturnType<typeof layoutFor>): PositionalConstraintError {
        expect(result.error).not.toBeNull();
        expect(result.error!.type).toBe('positional-conflict');
        return result.error as PositionalConstraintError;
    }

    const groupSources = (pe: PositionalConstraintError) =>
        [...pe.minimalConflictingSet.keys()].filter((s): s is GroupBySelector => s instanceof GroupBySelector);

    const GROUP_AND_NEVER_GROUP = `
constraints:
  - group: {selector: "Cell8 + Cell4", name: "s"}
  - group: {hold: never, selector: "Cell8 + Cell4"}
`;

    // Proving this conflict takes a few seconds, so the tests share one run.
    let shared: ReturnType<typeof layoutFor> | undefined;
    const groupAndNeverGroup = () => (shared ??= layoutFor(GROUP_AND_NEVER_GROUP));

    it('names both the group rule and the never-group rule on the same members', { timeout: 30000 }, () => {
        const pe = positionalError(groupAndNeverGroup());

        const sources = groupSources(pe);
        expect(sources.some(s => !s.negated)).toBe(true);
        expect(sources.some(s => s.negated)).toBe(true);

        // Each rule carries at least one constraint, so both are highlighted.
        for (const [, constraints] of pe.minimalConflictingSet) {
            expect(constraints.length).toBeGreaterThan(0);
        }

        // The displayed report has an entry for both rules too.
        const shown = pe.errorMessages!.minimalConflictingConstraints;
        expect(shown.size).toBe(2);
    });

    it('does not describe a never-group placement as something a node "can be"', () => {
        const pe = positionalError(groupAndNeverGroup());
        const lines = [...pe.errorMessages!.minimalConflictingConstraints.values()].flat();
        expect(lines.some(l => l.includes(' can be '))).toBe(false);
    });

    it('reports a never-group over single-member groups by itself, with a reason', () => {
        // `right` is a binary selector: one group per key, each with one member.
        // One node is always a group, so the rule fails without any other rule.
        const pe = positionalError(layoutFor(`
constraints:
  - orientation: {selector: down, directions: [below]}
  - group: {hold: never, selector: "right"}
`));
        expect(pe.minimalConflictingSet.size).toBe(1);
        const [source] = [...pe.minimalConflictingSet.keys()];
        expect(source).toBeInstanceOf(GroupBySelector);
        expect((source as GroupBySelector).negated).toBe(true);

        const lines = [...pe.errorMessages!.minimalConflictingConstraints.values()].flat();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('single member');
    });

    it('draws no box for a never-group in the error diagram', () => {
        const result = groupAndNeverGroup();
        positionalError(result);
        expect(result.layout.groups.length).toBeGreaterThan(0);
        expect(result.layout.groups.some(g => g.negated)).toBe(false);
    });
});

/**
 * A never-group holds when another node sits inside the box around its
 * members. Members in one row or column leave no room strictly inside that
 * box on one axis, so a node that lines up with them must count too.
 */
describe('never-group over aligned members', () => {
    const validate = (spec: string) => {
        const layout = parseConstraintSpec(spec);
        const error = new QualitativeConstraintValidator(layout).validateConstraints();
        return { layout, error };
    };

    it('holds when another node is between two members of one row', () => {
        expect(validate('a <x c, c <x b, a =y b, c =y a, {!G: a, b}').error).toBeNull();
    });

    it('holds when a free node can move between two members of one row', () => {
        expect(validate('a <x b, a =y b, c <x d, {!G: a, b}').error).toBeNull();
    });

    it('holds for two members of one column', () => {
        expect(validate('a <y b, a =x b, c <x d, {!G: a, b}').error).toBeNull();
    });

    it('fails when the only other node is kept out of the row', () => {
        // c is between a and b left-to-right, but below the row they share.
        expect(validate('a <x b, a =y b, a <x c, c <x b, a <y c, {!G: a, b}').error).not.toBeNull();
    });

    it('still prefers a strictly-inside placement when there is room', () => {
        const { layout, error } = validate('c <x d, {!G: a, b}');
        expect(error).toBeNull();
        const chosen = layout.constraints.filter(c => c.sourceConstraint instanceof GroupBySelector);
        expect(chosen.length).toBe(4);
        expect(chosen.every(c => isLeftConstraint(c) || isTopConstraint(c))).toBe(true);
    });

    it('leaves no helper node in the layout constraints of a large never-group', () => {
        const { layout, error } = validate('x <x y, {!G: a1, a2, a3, a4, a5, a6}');
        expect(error).toBeNull();
        const ids = new Set(layout.nodes.map(n => n.id));
        for (const c of layout.constraints) {
            const nodes = isLeftConstraint(c) ? [c.left, c.right]
                : isTopConstraint(c) ? [c.top, c.bottom]
                : isAlignmentConstraint(c) ? [c.node1, c.node2] : [];
            for (const n of nodes) expect(ids.has(n.id)).toBe(true);
        }
    });
});

