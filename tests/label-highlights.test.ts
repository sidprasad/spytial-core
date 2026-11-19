import { afterEach, describe, expect, it } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import type { DiagramLabelTarget } from '../src';

afterEach(() => document.body.replaceChildren());

function diagram() {
  const graph = new WebColaCnDGraph();
  document.body.append(graph);
  const renderer = graph as any;
  const edges = renderer.container.selectAll('.link-group').data([
    { id: 'edge"1', label: 'child' }, { id: 'edge2', label: 'child' },
    { id: 'hidden', label: 'child', showLabel: false },
  ]).enter().append('g').attr('class', 'link-group');
  edges.append('path').attr('d', 'M0 0 L80 0').style('stroke', 'purple');
  renderer.setupLinkLabels(edges);
  const nodes = renderer.container.selectAll('.node').data(['a', 'b'].map(id => ({
    id, label: id, showLabels: true, attributes: { rank: ['1', '2'] }, tagAttributeOffsets: { rank: 1 },
  }))).enter().append('g').attr('class', 'node');
  renderer.setupNodeLabels(nodes);
  const root = graph.shadowRoot!;
  for (const el of root.querySelectorAll<SVGGraphicsElement>('text.linklabel, tspan')) {
    el.getBBox = () => ({ x: Number(el.getAttribute('x')), y: 20, width: 14, height: 10 }) as DOMRect;
  }
  return { graph, root };
}
const edge: DiagramLabelTarget = { kind: 'edge', edgeId: 'edge"1' };
const tag: DiagramLabelTarget = { kind: 'tag', nodeId: 'a', key: 'rank' };
const attribute: DiagramLabelTarget = { kind: 'attribute', nodeId: 'a', key: 'rank' };

describe('highlighting diagram labels', () => {
  it('resolves exact labels, including attribute and tag lines sharing a key', () => {
    const { graph, root } = diagram();
    expect(graph.hasLabel(edge)).toBe(true);
    expect(graph.hasLabel({ kind: 'edge', edgeId: 'hidden' })).toBe(false);
    expect(graph.hasLabel({ kind: 'attribute', nodeId: 'a', key: 'missing' })).toBe(false);
    const release = graph.highlightLabels([edge, attribute, tag, edge]);
    const marks = root.querySelectorAll('.label-highlight-marker');
    expect(marks).toHaveLength(3);
    expect(marks[0].parentElement).toBe(root.querySelector('.link-group'));
    expect(marks[1].parentElement).toBe(root.querySelector('.node'));
    expect(marks[2].parentElement).toBe(root.querySelector('.node'));
    expect(root.querySelector('.link-group path')?.getAttribute('style')).toBe('stroke: purple;');
    const releaseTag = graph.highlightLabels([tag]);
    release(); release();
    expect(root.querySelectorAll('.label-highlight-marker')).toHaveLength(1);
    expect(root.contains(marks[2])).toBe(true);
    releaseTag();
    expect(root.querySelector('.label-highlight-marker')).toBeNull();
  });

  it('moves a pinned mark with the caption and forgets labels when the diagram clears', async () => {
    const { graph, root } = diagram();
    const release = graph.highlightLabels([edge, attribute]);
    const [edgeMark, attrMark] = root.querySelectorAll('.label-highlight-marker');
    const beforeEdge = edgeMark.getAttribute('points'), beforeAttr = attrMark.getAttribute('points');
    root.querySelector('.linklabel')!.setAttribute('x', '50');
    root.querySelector('.node tspan:nth-of-type(2)')!.setAttribute('x', '60');
    await Promise.resolve();
    expect(edgeMark.getAttribute('points')).not.toBe(beforeEdge);
    expect(attrMark.getAttribute('points')).not.toBe(beforeAttr);
    graph.clear();
    expect(graph.hasLabel(edge)).toBe(false);
    expect(graph.hasLabel(attribute)).toBe(false);
    release();
  });
});
