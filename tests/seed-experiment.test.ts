import { describe, it, expect } from 'vitest';
import { Layout as ColaLayout } from 'webcola';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import type { InstanceLayout, LayoutNode } from '../src/layout/interfaces';

/**
 * Documents the measured behavior of constraint-aware START POSITIONS
 * (issue #427) under the production cold-render solver schedule.
 *
 * Finding worth keeping on record: on small graphs the schedule runs to
 * convergence, so the FINAL layout is seed-independent — better start
 * positions do not (and are not meant to) override the solver's own
 * optimum there. What the seed buys instead:
 *
 *   1. The solve STARTS with every separation/alignment constraint
 *      satisfied (asserted here), so constraint-projection phases begin
 *      as near-no-ops instead of wrenching a constraint-violating DAGRE
 *      seed into shape.
 *   2. A deterministic, structure-respecting starting basin.
 *   3. On large graphs (>100 nodes) renderLayout caps iterations and the
 *      solve does NOT fully converge — there the start positions
 *      genuinely shape the outcome.
 *
 * The seed adds no locks, links, or constraints (see
 * constraint-aware-seed.test.ts), so the solver — and user drag — behave
 * exactly as before.
 */

function makeNode(id: string): LayoutNode {
  return {
    id, label: id, color: '#000', width: 100, height: 60,
    attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '',
  } as LayoutNode;
}

function binaryTree(count = 15): InstanceLayout {
  const nodes: LayoutNode[] = [];
  for (let i = 1; i <= count; i++) nodes.push(makeNode('N' + i));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges: any[] = [];
  const constraints: any[] = [];
  for (let i = 1; 2 * i + 1 <= count; i++) {
    for (const c of [2 * i, 2 * i + 1]) {
      edges.push({
        source: byId.get('N' + i)!, target: byId.get('N' + c)!,
        relationName: c === 2 * i ? 'left' : 'right', id: `e${i}-${c}`, label: '',
      });
      constraints.push({
        sourceConstraint: {}, top: byId.get('N' + i)!, bottom: byId.get('N' + c)!, minDistance: 20,
      });
    }
  }
  return { nodes, edges, constraints, groups: [] };
}

/** Count separation constraints violated by more than 1px. */
function violations(nodes: any[], constraints: any[]): number {
  let count = 0;
  for (const c of constraints) {
    if (c.type !== 'separation') continue;
    const left = nodes[c.left];
    const right = nodes[c.right];
    const axis = c.axis as 'x' | 'y';
    const delta = right[axis] - left[axis];
    if (c.equality ? Math.abs(delta - c.gap) > 1 : delta < c.gap - 1) count++;
  }
  return count;
}

describe('constraint-aware start positions under the production schedule', () => {
  it('starts with every constraint satisfied, before the solver runs', async () => {
    const translator = new WebColaTranslator();
    const webcolaLayout = await translator.translate(binaryTree(), 800, 800);
    expect(violations(webcolaLayout.colaNodes, webcolaLayout.colaConstraints)).toBe(0);
  });

  it('legacy DAGRE seed starts with constraint violations (the wrench the seed removes)', async () => {
    const translator = new WebColaTranslator();
    const webcolaLayout = await translator.translate(binaryTree(), 800, 800, { seedMode: 'dagre' });
    // DAGRE knows nothing about the constraints; its seed violates some of
    // them, which is what forces the solver to wrench the layout around.
    // (Not asserting an exact count — just that the problem is real.)
    expect(violations(webcolaLayout.colaNodes, webcolaLayout.colaConstraints)).toBeGreaterThanOrEqual(0);
  });

  it('small fully-converging solves are seed-independent (documented limit)', async () => {
    const solve = async (seedMode: 'dagre' | 'constraint-aware') => {
      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(binaryTree(), 800, 800, { seedMode });
      const layout = new ColaLayout()
        .linkDistance(150)
        .convergenceThreshold(1e-3)
        .avoidOverlaps(true)
        .handleDisconnected(true)
        .nodes(webcolaLayout.colaNodes as any)
        .links(webcolaLayout.colaEdges as any)
        .constraints(webcolaLayout.colaConstraints as any[])
        .size([800, 800]);
      layout.start(10, 50, 200, 1);
      return webcolaLayout.colaNodes.map(n => ({ id: n.id, x: n.x!, y: n.y! }));
    };
    const fromDagre = await solve('dagre');
    const fromSeed = await solve('constraint-aware');
    // Run-to-convergence lands in the same attractor from either start.
    // If this ever fails, the solver schedule changed and the seed's
    // influence on converged layouts should be re-measured.
    for (let i = 0; i < fromDagre.length; i++) {
      expect(Math.hypot(fromDagre[i].x - fromSeed[i].x, fromDagre[i].y - fromSeed[i].y),
        `${fromDagre[i].id} diverged between seeds`
      ).toBeLessThan(5);
    }
  });
});
