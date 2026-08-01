import { describe, it, expect } from 'vitest';
import { Layout as ColaLayout } from 'webcola';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { computeConstraintAwareSeed } from '../src/translators/webcola/constraint-aware-seed';
import type { InstanceLayout, LayoutNode } from '../src/layout/interfaces';

/**
 * EXPERIMENT (issue #427, not a regression gate): does the constraint-aware
 * seed survive the FULL cold-render solver schedule (10 unconstrained, 50
 * user-constraint, 200 all-constraint iterations, 1 grid-snap, then decay
 * ticks to convergence — the schedule in WebColaCnDGraph.renderLayout)?
 *
 * Compares final layouts from the DAGRE seed vs the constraint-aware seed
 * on a complete binary tree with only "parent above child" constraints.
 */

function makeNode(id: string): LayoutNode {
  return {
    id, label: id, color: '#000', width: 100, height: 60,
    attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '',
  } as LayoutNode;
}

function binaryTree(depthNodes = 15): InstanceLayout {
  const nodes: LayoutNode[] = [];
  for (let i = 1; i <= depthNodes; i++) nodes.push(makeNode('N' + i));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges: any[] = [];
  const constraints: any[] = [];
  for (let i = 1; 2 * i + 1 <= depthNodes; i++) {
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

type Schedule = { iters: [number, number, number, number]; threshold: number };

async function solve(seedMode: 'dagre' | 'seed-only' | 'constraint-aware', schedule: Schedule) {
  const translator = new WebColaTranslator();
  const tree = binaryTree();
  const webcolaLayout = await translator.translate(tree, 800, 800, { seedMode });
  const seedSnapshot = webcolaLayout.colaNodes.map(n => ({ id: n.id, x: n.x, y: n.y }));

  // Plain cola.Layout (no d3 adaptor) runs start() + its kick() loop
  // synchronously to convergence.
  const layout = new ColaLayout()
    .linkDistance(150)
    .convergenceThreshold(schedule.threshold)
    .avoidOverlaps(true)
    .handleDisconnected(true)
    .nodes(webcolaLayout.colaNodes as any)
    .links(webcolaLayout.colaEdges as any)
    .constraints(webcolaLayout.colaConstraints as any[])
    .size([800, 800]);
  layout.start(...schedule.iters);

  const final = new Map(webcolaLayout.colaNodes.map(n => [n.id, { x: n.x!, y: n.y! }]));
  return { seedSnapshot, final, constraints: webcolaLayout.colaConstraints, nodes: webcolaLayout.colaNodes };
}

/** Count separation constraints violated by more than 1px in the final layout. */
function violations(nodes: any[], constraints: any[], final: Map<string, { x: number; y: number }>): number {
  let count = 0;
  for (const c of constraints) {
    if (c.type !== 'separation') continue;
    const left = final.get(nodes[c.left].id)!;
    const right = final.get(nodes[c.right].id)!;
    const axis = c.axis as 'x' | 'y';
    const delta = right[axis] - left[axis];
    if (c.equality ? Math.abs(delta - c.gap) > 1 : delta < c.gap - 1) count++;
  }
  return count;
}

/** Purchase-style displayed-symmetry proxy: reflect across the root's
 *  vertical axis and measure mean displacement to the structural mirror. */
function mirrorScore(final: Map<string, { x: number; y: number }>): number {
  const rootX = final.get('N1')!.x;
  const pairs: Array<[string, string]> = [
    ['N2', 'N3'], ['N4', 'N7'], ['N5', 'N6'],
    ['N8', 'N15'], ['N9', 'N14'], ['N10', 'N13'], ['N11', 'N12'],
  ];
  let total = 0;
  for (const [a, b] of pairs) {
    const pa = final.get(a)!;
    const pb = final.get(b)!;
    total += Math.hypot((pa.x - rootX) + (pb.x - rootX), pa.y - pb.y);
  }
  return total / pairs.length;
}

/** Rank uniformity: max y-spread among structurally same-depth nodes. */
function rankSpread(final: Map<string, { x: number; y: number }>): number {
  let worst = 0;
  for (let depth = 1; depth <= 3; depth++) {
    const ys: number[] = [];
    for (let i = 2 ** depth; i < 2 ** (depth + 1); i++) {
      ys.push(final.get('N' + i)!.y);
    }
    worst = Math.max(worst, Math.max(...ys) - Math.min(...ys));
  }
  return worst;
}

const FULL: Schedule = { iters: [10, 50, 200, 1], threshold: 1e-3 };
const REDUCED: Schedule = { iters: [0, 10, 20, 1], threshold: 0.1 };
const GENTLE: Schedule = { iters: [0, 30, 60, 1], threshold: 0.01 };

describe('seed experiment: schedules × seeds', () => {
  it('compares dagre vs constraint-aware seeds across solver schedules', async () => {
    const fmt = (m: Map<string, { x: number; y: number }>) =>
      [...m.entries()].map(([id, p]) => `${id}:(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' ');

    for (const [name, schedule] of Object.entries({ FULL, REDUCED, GENTLE })) {
      for (const mode of ['dagre', 'seed-only', 'constraint-aware'] as const) {
        const r = await solve(mode, schedule);
        console.log(
          `${name.padEnd(8)} ${mode.padEnd(17)} mirror=${mirrorScore(r.final).toFixed(1).padStart(7)}` +
          ` rankSpread=${rankSpread(r.final).toFixed(1).padStart(7)}` +
          ` violations=${violations(r.nodes, r.constraints, r.final)}`
        );
        if (name === 'FULL' && mode === 'constraint-aware') {
          console.log('   layout:', fmt(r.final));
        }
      }
    }

    // The anchored seed must deliver perfect displayed symmetry, uniform
    // ranks, and full constraint satisfaction on the production schedule.
    const anchored = await solve('constraint-aware', FULL);
    expect(mirrorScore(anchored.final)).toBeLessThan(1);
    expect(rankSpread(anchored.final)).toBeLessThan(1);
    expect(violations(anchored.nodes, anchored.constraints, anchored.final)).toBe(0);
  });

  it('drag does not snap back (issue #427 acceptance criterion)', async () => {
    // Reproduce the anchored solve, then simulate a user drag exactly the
    // way cola's drag adapter does: dragStart → move px/py → resume →
    // dragEnd → resume. The released node must stay at the drop position —
    // the seed exists only as initial px/py, which the drag overwrites, so
    // there is nothing left in the system to snap back to.
    const translator = new WebColaTranslator();
    const tree = binaryTree();
    const webcolaLayout = await translator.translate(tree, 800, 800);
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

    const n4 = webcolaLayout.colaNodes.find(n => n.id === 'N4')! as any;
    const seedPosition = { x: n4.x as number, y: n4.y as number };
    const others = webcolaLayout.colaNodes.filter(n => n.id !== 'N4');
    const beforeOthers = new Map(others.map(n => [n.id, { x: n.x!, y: n.y! }]));

    // Case 1: constraint-preserving drag (pure sideways). Nothing needs
    // repair, so the node must stay exactly where it was dropped.
    let dropX = n4.x - 60;
    let dropY = n4.y;
    (ColaLayout as any).dragStart(n4);
    (ColaLayout as any).drag(n4, { x: dropX, y: dropY });
    layout.resume();
    (ColaLayout as any).dragEnd(n4);
    layout.resume();
    expect(Math.hypot(n4.x - dropX, n4.y - dropY),
      `sideways drop: N4 ended ${Math.hypot(n4.x - dropX, n4.y - dropY).toFixed(1)}px away`
    ).toBeLessThan(5);
    for (const n of others) {
      const b = beforeOthers.get(n.id)!;
      expect(Math.hypot(n.x! - b.x, n.y! - b.y), `${n.id} should stay put`).toBeLessThan(5);
    }

    // Case 2: constraint-violating drag (dip toward the leaf rank). The
    // solver repairs the violated parent-above-child gap (user constraints
    // win) but must NOT restore the seed x — distinguishing repair from
    // snap-back.
    dropX = n4.x - 40;
    dropY = n4.y + 30;
    (ColaLayout as any).dragStart(n4);
    (ColaLayout as any).drag(n4, { x: dropX, y: dropY });
    layout.resume();
    (ColaLayout as any).dragEnd(n4);
    layout.resume();
    console.log(
      `violating drop: drop=(${dropX.toFixed(0)},${dropY.toFixed(0)})` +
      ` final=(${n4.x.toFixed(0)},${n4.y.toFixed(0)}) seed=(${seedPosition.x.toFixed(0)},${seedPosition.y.toFixed(0)})`
    );
    // x had no constraint pressure — it must stay at the drop, not creep
    // back toward the seed.
    expect(Math.abs(n4.x - dropX), 'x should stay at the drop').toBeLessThan(5);
    // y gets repaired AWAY from the drop only as far as constraints demand;
    // in particular it must not land back on the seed y.
    expect(Math.abs(n4.y - seedPosition.y), 'y must not return to the seed').toBeGreaterThan(5);
  });
});
