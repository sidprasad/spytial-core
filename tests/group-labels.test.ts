import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { parseYamlToState, serializeStateToYaml } from '../src/spec-editor';

(window as any).d3 = d3;
const { WebColaCnDGraph } = await import('../src/translators/webcola/webcola-cnd-graph');

function generate(labels = ['Alice', 'Bob'], options = '', selector = 'members') {
  const data: IJsonDataInstance = {
    atoms: [
      ...labels.map((label, i) => ({ id: `k${i}`, type: 'Key', label })),
      ...labels.map((_, i) => ({ id: `m${i}`, type: 'Member', label: `m${i}` })),
    ],
    relations: [{
      id: 'members', name: 'members', types: ['Key', 'Member'],
      tuples: labels.map((_, i) => ({ atoms: [`k${i}`, `m${i}`], types: ['Key', 'Member'] })),
    }],
  };
  const instance = new JSONDataInstance(data);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const spec = parseLayoutSpec(`constraints:\n  - group:\n      selector: ${selector}\n      name: Team\n${options}`);
  return new LayoutInstance(spec, evaluator, 0, true).generateLayout(instance).layout;
}

describe('group captions', () => {
  it('uses readable labels while retaining identity and connector attachments', async () => {
    const layout = generate(['Alice', 'Bob'], '      addEdge: togroup');
    expect(layout.groups.map(g => g.label)).toEqual(['Team[Alice]', 'Team[Bob]']);
    expect(layout.groups.map(g => g.name)).toEqual(['Team[Alice:k0]', 'Team[Bob:k1]']);
    const connector = layout.edges.find(e => e.groupId === 'Team[Alice:k0]');
    expect(connector).toMatchObject({ label: 'Team[Alice]', targetGroupId: 'Team[Alice:k0]' });
    const translated = await new WebColaTranslator().translate(layout);
    expect(translated.groups.find((g: any) => g.name === 'Team[Alice:k0]')).toMatchObject({
      id: 'Team[Alice:k0]', label: 'Team[Alice]', showLabel: true,
    });
  });

  it('adds IDs only to ambiguous captions', () => {
    const layout = generate(['Alice', 'Alice', 'Bob']);
    expect(layout.groups.map(g => g.label)).toEqual(['Team[Alice:k0]', 'Team[Alice:k1]', 'Team[Bob]']);
    expect(layout.groups.map(g => g.nodeIds)).toEqual([['m0'], ['m1'], ['m2']]);
  });

  it('normalizes quoted labels and falls back to IDs for blank labels', () => {
    const layout = generate(['"Alice"', '   ', '"k2"']);
    expect(layout.groups.map(g => g.label)).toEqual(['Team[Alice]', 'Team[k1]', 'Team[k2]']);
  });

  it('also distinguishes a literal label that matches an expanded caption', () => {
    expect(generate(['Alice', 'Alice', 'Alice:k0']).groups.map(g => g.label)).toEqual([
      'Team[Alice:k0]', 'Team[Alice:k1]', 'Team[Alice:k0:k2]',
    ]);
  });

  it.each(['members', 'Member'])('hides captions without removing %s groups', async (selector) => {
    const layout = generate(['Alice', 'Bob'], '      showLabel: false', selector);
    expect(layout.groups.length).toBe(selector === 'members' ? 2 : 1);
    expect(layout.groups.every(g => !g.showLabel)).toBe(true);
    const translated = await new WebColaTranslator().translate(layout);
    const groups = translated.groups.filter((g: any) => g.name.startsWith('Team'));
    expect(groups).toHaveLength(layout.groups.length);
    expect(groups.every((g: any) => !g.showLabel && g.padding === 12)).toBe(true);
  });

  it('uses the name alone for a unary group', () => {
    expect(generate(['Alice'], '', 'Member').groups[0]).toMatchObject({
      name: 'Team', label: 'Team', showLabel: true,
    });
  });

  it('does not expose a hidden caption when identical hulls are merged', async () => {
    const layout = generate(['Alice']);
    const first = layout.groups[0];
    layout.groups.push({ ...first, name: 'Hidden', label: 'Secret caption', showLabel: false });
    const translated = await new WebColaTranslator().translate(layout);
    const merged = translated.groups.find((g: any) => g.name.includes(' / '));
    expect(merged).toMatchObject({ label: 'Team[Alice]', showLabel: true });
  });

  it.each([false, true])('round-trips showLabel: %s through the Builder', (showLabel) => {
    const yaml = `constraints:\n  - group: { selector: members, name: Team, showLabel: ${showLabel} }`;
    const state = parseYamlToState(yaml);
    expect(state.constraints[0].params.showLabel).toBe(showLabel);
    const spec = parseLayoutSpec(serializeStateToYaml(state));
    expect(spec.constraints.grouping.byselector[0].showLabel).toBe(showLabel);
  });
});

describe('group caption SVG', () => {
  it('draws readable captions and omits both text and pill for hidden groups', () => {
    const proto = WebColaCnDGraph.prototype as any;
    const container = d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const graph: any = {
      container, currentLayout: { nodes: [] },
      getCanvasBackground: () => 'white', getFontFamily: () => 'sans-serif',
      calculateGroupLabelFontSize: () => 12, groupLabelColor: () => null,
    };
    proto.setupGroupLabels.call(graph, [
      { name: 'Team[Alice:k0]', label: 'Team[Alice]', showLabel: true },
      { name: 'Hidden', label: 'Hidden caption', showLabel: false },
      { name: 'Legacy custom layout', showLabel: true },
    ], { drag: () => {} });
    const svg = container.node()!;
    expect([...svg.querySelectorAll('.groupLabel')].map(t => t.textContent)).toEqual([
      'Team[Alice]', 'Legacy custom layout',
    ]);
    expect(svg.querySelectorAll('.groupLabelBg')).toHaveLength(2);
  });
});
