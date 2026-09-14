// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { isGroupBoundaryConstraint } from '../src/layout/interfaces';
import { runHeadlessLayout } from '../src/evaluation/headless-layout';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';

const cases = [
  { side: 'left', alignment: 'horizontal', direction: 'right' },
  { side: 'right', alignment: 'horizontal', direction: 'left' },
  { side: 'top', alignment: 'vertical', direction: 'below' },
  { side: 'bottom', alignment: 'vertical', direction: 'above' },
] as const;

function fixture(alignment = 'horizontal', direction?: string, nested = false) {
  const pairs = [['g1', 'A'], ['g1', 'B'], ['g2', 'C'], ['g2', 'D']];
  if (nested) pairs.push(['outer', 'A'], ['outer', 'B'], ['outer', 'E']);
  const instance = new JSONDataInstance({
    atoms: [
      ...['g1', 'g2', ...(nested ? ['outer'] : [])].map(id => ({ id, type: 'Group', label: id })),
      ...['A', 'B', 'C', 'D', ...(nested ? ['E'] : [])].map(id => ({ id, type: 'Node', label: id })),
    ],
    relations: [{ id: 'member', name: 'member', types: ['Group', 'Node'],
      tuples: pairs.map(atoms => ({ atoms, types: ['Group', 'Node'] })) }],
  });
  const spec = parseLayoutSpec(`
constraints:
  - group: { selector: member, name: keys }
  - align: { selector: Node -> Node, direction: ${alignment} }
  - hideAtom: { selector: Group }
${direction ? `  - orientation: { selector: A->C, directions: [${direction}] }` : ''}
`);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const generated = new LayoutInstance(spec, evaluator, 0, true).generateLayout(instance);
  expect(generated.error).toBeNull();
  return { instance, spec, layout: generated.layout };
}

function assertBoundaries(result: Awaited<ReturnType<typeof runHeadlessLayout>>) {
  const groups = new Map(result.groups.map(g => [(g as typeof g & { name: string }).name, g]));
  const constraints = result.constraints.filter(isGroupBoundaryConstraint);
  expect(constraints.length).toBeGreaterThan(0);
  for (const c of constraints) {
    const a = groups.get(c.groupA.name)!.bounds!;
    const b = groups.get(c.groupB.name)!.bounds!;
    for (const value of [a.x, a.X, a.y, a.Y, b.x, b.X, b.y, b.Y]) expect(Number.isFinite(value)).toBe(true);
    const gap = c.side === 'left' ? b.x - a.X : c.side === 'right' ? a.x - b.X
      : c.side === 'top' ? b.y - a.Y : a.y - b.Y;
    expect(gap, `${c.groupA.name} ${c.side} of ${c.groupB.name}`).toBeGreaterThanOrEqual(c.minDistance - 0.01);
  }
  return constraints;
}

describe('preserving selected group ordering through WebCola (#585)', () => {
  it.each(cases)('enforces $side separation in final aligned group rectangles', async ({ side, alignment, direction }) => {
    const { instance, spec } = fixture(alignment, direction);
    const result = await runHeadlessLayout(spec, instance);
    expect(result.groups).toHaveLength(2);
    const constraints = assertBoundaries(result);
    expect(constraints[0].side).toBe(side);
    const coordinates = result.nodes.map(n => alignment === 'horizontal' ? n.y! : n.x!);
    expect(Math.max(...coordinates) - Math.min(...coordinates)).toBeLessThan(0.01);
  });

  it('accounts for nested group padding when separating an outer hull', async () => {
    const { instance, spec } = fixture('horizontal', undefined, true);
    const result = await runHeadlessLayout(spec, instance);
    expect(result.groups).toHaveLength(3);
    assertBoundaries(result);
  });

  it('uses label padding and preserves every member-pair boundary inequality', async () => {
    const { layout } = fixture();
    for (const group of layout.groups) group.showLabel = true;
    const translated = await new WebColaTranslator().translate(layout);
    const constraints = translated.constraints.filter(c => c.groupBoundary);
    expect(constraints).toHaveLength(4);
    expect(translated.constraints.some(c => c.type === 'noop')).toBe(false);
    for (const c of constraints) {
      const a = translated.nodes[c.left as number];
      const b = translated.nodes[c.right as number];
      expect(c.gap).toBe(a.width! / 2 + b.width! / 2 + 20 + 20 + 15);
    }
  });

  it('unlocks prior nodes that violate the preserved group side in stability mode', async () => {
    const { layout } = fixture();
    // Isolate group constraints so other orientation constraints cannot unlock them.
    layout.constraints = layout.constraints.filter(isGroupBoundaryConstraint);
    const translated = await new WebColaTranslator().translate(layout, 800, 600, {
      priorPositions: { positions: layout.nodes.map(n => ({ id: n.id, x: 0, y: 0 })), transform: { k: 1, x: 0, y: 0 } },
      lockUnconstrainedNodes: true,
    });
    expect(translated.nodes.every(n => n.fixed === 0)).toBe(true);
  });
});
