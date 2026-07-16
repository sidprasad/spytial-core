import { describe, expect, it } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

/**
 * Regression tests for resolving a link label's edge path.
 *
 * Edge ids come from the source data, so they carry whatever characters the
 * data has — `_inferred_<: <:"k4"->n3` is a real id off an Alloy subtyping
 * relation. Interpolated into `path[data-link-id="..."]`, its quotes closed the
 * selector's string early and querySelector threw SyntaxError. The throw
 * escaped the WebCola 'end' handler, so link labels never got positioned and
 * the loading overlay wedged at "Finalizing...". The lookup now scopes to the
 * label's own link-group and never puts an id in a selector, so no id can
 * break it.
 *
 * These cases build their own markup, so they pin the lookup's behaviour but
 * cannot notice if the renderer stops producing that markup. The companion
 * webcola-link-render-contract.test.ts drives the real creation code and
 * covers that half.
 */

const proto = WebColaCnDGraph.prototype as any;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Build a shadow root of link-groups shaped like the real render: an optional
 * highlight underlay, the main path carrying data-link-id, and a label.
 */
function renderLinkGroups(specs: Array<{ id: string; highlighted?: boolean }>) {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const labels = new Map<string, SVGTextElement>();
  const paths = new Map<string, SVGPathElement>();

  for (const { id, highlighted } of specs) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'link-group');

    if (highlighted) {
      const underlay = document.createElementNS(SVG_NS, 'path');
      underlay.setAttribute('class', 'highlight-underlay');
      group.appendChild(underlay);
    }

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'link');
    path.setAttribute('data-link-id', id);
    group.appendChild(path);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'linklabel');
    group.appendChild(label);

    shadowRoot.appendChild(group);
    labels.set(id, label);
    paths.set(id, path);
  }
  return { labels, paths };
}

const lookup = (el: unknown) => proto.getLinkPathElement.call({}, el);

// Both ids are real, and differ only inside the quoted segment.
const K4 = '_inferred_<: <:"k4"->n3';
const K1 = '_inferred_<: <:"k1"->n3';

describe('WebColaCnDGraph.getLinkPathElement', () => {
  it('resolves the path for a label whose id contains quotes and angle brackets', () => {
    const { labels, paths } = renderLinkGroups([{ id: K1 }, { id: K4 }]);
    expect(lookup(labels.get(K4))).toBe(paths.get(K4));
  });

  it('resolves each label to its own path, never a neighbour', () => {
    const { labels, paths } = renderLinkGroups([{ id: K1 }, { id: K4 }]);
    expect(lookup(labels.get(K1))).toBe(paths.get(K1));
    expect(lookup(labels.get(K4))).toBe(paths.get(K4));
  });

  it.each([
    ['bracket', 'a]b[c'],
    ['backslash', 'back\\slash'],
    ['quote and backslash', 'quote"and\\slash'],
    ['newline', 'new\nline'],
    ['leading digit', '9leading'],
    ['space', 'has space'],
    ['emoji', 'emoji🚀'],
    ['empty', ''],
  ])('resolves a label whose id contains a %s', (_label, id) => {
    const { labels, paths } = renderLinkGroups([{ id }, { id: 'decoy' }]);
    expect(lookup(labels.get(id))).toBe(paths.get(id));
  });

  it('picks the main path, not the highlight underlay drawn beneath it', () => {
    const { labels, paths } = renderLinkGroups([{ id: K4, highlighted: true }]);
    const found = lookup(labels.get(K4));
    expect(found).toBe(paths.get(K4));
    expect(found?.getAttribute('class')).toBe('link');
  });

  it.each([null, undefined])('returns null for a missing element (%s)', (el) => {
    expect(lookup(el)).toBeNull();
  });

  it('returns null for an element outside any link-group', () => {
    const orphan = document.createElementNS(SVG_NS, 'text');
    expect(lookup(orphan)).toBeNull();
  });
});
