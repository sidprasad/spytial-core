// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { ImplicitConstraint, isGroupBoundaryConstraint, isLeftConstraint } from '../src/layout/interfaces';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { initZ3, shutdownZ3, solveZ3 } from './helpers/z3-oracle';

beforeAll(initZ3, 30_000);
afterAll(shutdownZ3);

function generateAlignedGroups() {
  const instance = new JSONDataInstance({
    atoms: [
      { id: 'g1', type: 'Group', label: 'g1' },
      { id: 'g2', type: 'Group', label: 'g2' },
      ...['A', 'B', 'C', 'D'].map(id => ({ id, type: 'Node', label: id })),
    ],
    relations: [{
      id: 'member', name: 'member', types: ['Group', 'Node'],
      tuples: [['g1', 'A'], ['g1', 'B'], ['g2', 'C'], ['g2', 'D']].map(atoms => ({
        atoms, types: ['Group', 'Node'],
      })),
    }],
  });
  // The issue's exact grouping/alignment/orientation example, with hideAtom
  // moved to its current (non-deprecated) section. No cross-group order is asked for.
  const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: member
      name: keys
  - align:
      selector: Node -> Node
      direction: horizontal
  - orientation:
      selector: A->B + C->D
      directions: [left]
  - hideAtom:
      selector: Group
`);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const { layout, error, selectorErrors } = new LayoutInstance(spec, evaluator, 0, true)
    .generateLayout(instance);
  expect(error).toBeNull();
  expect(selectorErrors ?? []).toHaveLength(0);
  expect(layout.groups.map(g => [...g.nodeIds].sort())).toEqual([['A', 'B'], ['C', 'D']]);

  // Check only the emitted conjunction plus actual group semantics. Do not
  // replay the validator's internal search disjunctions through the oracle.
  return { ...layout, disjunctiveConstraints: [] };
}

describe('issue #585: generated alignment orders must preserve group feasibility', () => {
  it('control: the original user constraints and group semantics are feasible', async () => {
    const layout = generateAlignedGroups();
    const constraints = layout.constraints.filter(c =>
      !(c.sourceConstraint instanceof ImplicitConstraint) && !isGroupBoundaryConstraint(c));
    expect(await solveZ3({ ...layout, constraints })).toBe(true);
  }, 30_000);

  it('control: the selected horizontal group boundary is feasible without implicit ordering', async () => {
    const layout = generateAlignedGroups();
    const constraints = layout.constraints.filter(c => !(c.sourceConstraint instanceof ImplicitConstraint));
    expect(await solveZ3({ ...layout, constraints })).toBe(true);
  }, 30_000);

  it('keeps its emitted constraints feasible after adding implicit alignment ordering', async () => {
    const layout = generateAlignedGroups();
    const implicitOrder = layout.constraints
      .filter(c => c.sourceConstraint instanceof ImplicitConstraint)
      .filter(isLeftConstraint)
      .map(c => `${c.left.id} < ${c.right.id}`);

    // Currently emits B < D < A < C while choosing {A,B} left of {C,D}.
    // Assert feasibility, not a particular ordering or continued emission of
    // a witness: either group order is valid under the original spec.
    // Use solveZ3, not verifyFeasibleSubset, which omits group containment.
    expect(
      await solveZ3(layout),
      `Validator accepted the spec but emitted infeasible constraints; implicit order: ${implicitOrder.join(', ')}`,
    ).toBe(true);
  }, 30_000);
});
