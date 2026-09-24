import { describe, expect, it, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { WebColaLayout } from '../src/translators/webcola/webcolatranslator';

const data: IJsonDataInstance = {
  atoms: ['A', 'B', 'C'].map(id => ({ id, type: 'Node', label: id })),
  relations: [{
    id: 'next', name: 'next', types: ['Node', 'Node'],
    tuples: [
      { atoms: ['A', 'B'], types: ['Node', 'Node'] },
      { atoms: ['B', 'C'], types: ['Node', 'Node'] },
    ],
  }],
};

describe('inferred edge line pattern', () => {
  it.each(['reachable', 'renamed'])('keeps the dashed pattern on inferred edge %s after morph entrance', async name => {
    const instance = new JSONDataInstance(data);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    const spec = parseLayoutSpec(`
directives:
  - inferredEdge:
      name: ${name}
      selector: next.next
      lineStyle:
        pattern: dashed
`);
    const { layout } = new LayoutInstance(spec, evaluator, 0, true).generateLayout(instance);
    const edge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes(name));
    expect(edge?.style).toBe('dashed');

    const datum = (WebColaLayout.prototype as any).toColaEdge.call(
      { getNodeIndex: (id: string) => ['A', 'B', 'C'].indexOf(id) }, edge,
    );
    expect(datum.style).toBe('dashed');
    const graph = new WebColaCnDGraph() as any;
    graph.setAttribute('morph-speed', '0.01');
    graph.currentLayout = { nodes: [], links: [datum] };
    graph.svgLinkGroups = graph.setupLinks([datum], null);
    const path = graph.container.node().querySelector('path[data-link-id]') as SVGPathElement;
    path.setAttribute('d', 'M0,0L100,0');
    path.getTotalLength = () => 100;
    expect(path.getAttribute('stroke-dasharray')).toBe('6,4');

    graph.morphEnteringEdgeIds = new Set([datum.id]);
    graph.morphEnteringNodeIds = new Set();
    graph.applyMorphEnterTransition();
    expect(path.getAttribute('stroke-dasharray')).toBe('100');

    await vi.waitFor(() => expect(path.getAttribute('stroke-dasharray')).toBe('6,4'));
    expect(path.hasAttribute('stroke-dashoffset')).toBe(false);
  });
});
