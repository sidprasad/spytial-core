import { describe, expect, it } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

const proto = WebColaCnDGraph.prototype as any;
const node = { id: 'A', bounds: { x: 0, X: 80, y: 0, Y: 40 } };
const loop = { id: 'eh', source: node, target: node };

function routingContext(rightPorts: number) {
  return {
    edgeRoutingCache: {
      nodeEdgesBySide: new Map([['A', {
        right: Array(rightPorts).fill({}), bottom: [], left: [], top: [],
      }]]),
    },
    isGroupSelfLoop: proto.isGroupSelfLoop,
    getSelfLoopSideIndex: proto.getSelfLoopSideIndex,
    getSelfLoopIndex: () => 0,
  };
}

describe('self-loop side selection', () => {
  it('moves the petal off the side crowded by A→B edges in both routing modes', () => {
    const context = routingContext(3);
    const curved = proto.createSelfLoopRoute.call(context, loop);
    const grid = proto.createGridSelfLoopRoute.call(context, loop);

    // The right edge of A is x=80; the first free side in tie order is bottom.
    for (const route of [curved, grid]) {
      expect(route[0].y).toBe(40);
      expect(route.at(-1).y).toBe(40);
      expect(route.some((point: { y: number }) => point.y > 40)).toBe(true);
    }
  });

  it('spreads sibling loops across free sides before reusing a side', () => {
    const context = routingContext(3);
    const sides = [0, 1, 2, 3].map(index =>
      proto.getSelfLoopSideIndex.call(context, loop, index)
    );
    expect(sides).toEqual([1, 2, 3, 0]);
    expect(proto.getSelfLoopSideIndex.call(context, loop, 4)).toBe(1);
  });

  it('keeps the existing side order when no ordinary edges occupy the node', () => {
    const context = routingContext(0);
    expect([0, 1, 2, 3].map(index =>
      proto.getSelfLoopSideIndex.call(context, loop, index)
    )).toEqual([0, 1, 2, 3]);
  });
});
