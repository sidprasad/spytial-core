import { describe, expect, it } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

describe('Viewport fit bounds', () => {
  const proto = WebColaCnDGraph.prototype as any;

  function makeEmptySelection() {
    return {
      empty: () => true,
      each: () => {},
    };
  }

  it('computes node bounds from centered x/y coordinates', () => {
    const emptySelection = makeEmptySelection();
    const fakeThis: any = {
      currentLayout: {
        nodes: [{ id: 'n1', x: 100, y: 80, width: 40, height: 20 }],
      },
      container: {
        selectAll: () => emptySelection,
      },
      isHiddenNode: proto.isHiddenNode,
    };

    const bounds = proto.calculateContentBounds.call(fakeThis);
    expect(bounds).toEqual({ x: 80, y: 70, width: 40, height: 20 });
  });

  it('ignores hidden nodes when fitting viewport bounds', () => {
    const emptySelection = makeEmptySelection();
    const fakeThis: any = {
      currentLayout: {
        nodes: [
          { id: 'visible', x: 0, y: 0, width: 20, height: 10 },
          { id: '_hidden_helper', x: 1000, y: 1000, width: 200, height: 100 },
        ],
      },
      container: {
        selectAll: () => emptySelection,
      },
      isHiddenNode: proto.isHiddenNode,
    };

    const bounds = proto.calculateContentBounds.call(fakeThis);
    expect(bounds).toEqual({ x: -10, y: -5, width: 20, height: 10 });
  });

  it('ignores alignment-edge path geometry in viewport bounds', () => {
    const emptySelection = makeEmptySelection();
    const edgePathSelection = {
      empty: () => false,
      each: (iterator: (this: any, d: any) => void) => {
        iterator.call(
          { getBBox: () => ({ x: -500, y: -500, width: 1000, height: 1000 }) },
          { id: '_alignment_a_b' }
        );
        iterator.call(
          { getBBox: () => ({ x: 10, y: 20, width: 30, height: 40 }) },
          { id: 'edge_visible' }
        );
      },
    };

    const fakeThis: any = {
      currentLayout: { nodes: [] },
      container: {
        selectAll: (selector: string) => {
          if (selector === '.link-group path') return edgePathSelection;
          return emptySelection;
        },
      },
      edgeRoutingCache: { alignmentEdges: new Set<string>() },
      isHiddenNode: proto.isHiddenNode,
      isAlignmentEdge: proto.isAlignmentEdge,
    };

    const bounds = proto.calculateContentBounds.call(fakeThis);
    expect(bounds).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });
});
