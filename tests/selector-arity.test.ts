import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { getLanguageManifest } from '../src/language/manifest';
import type { LanguageField } from '../src/language/types';

/**
 * The manifest tells integrations which selector arities each field accepts
 * (`LanguageField.accepts`). Those entries are a promise to every generator that
 * reads them, so they are pinned here against the engine rather than against
 * prose. `tests/language-manifest.test.ts` checks the shape of the claims; this
 * file checks that the engine really behaves the way they say.
 */

const data: IJsonDataInstance = {
  atoms: [
    { id: 'a', type: 'Node', label: 'a' },
    { id: 'm', type: 'Node', label: 'm' },
    { id: 'z', type: 'Node', label: 'z' },
  ],
  relations: [
    {
      // Ternary, so a selector over it returns 3-column tuples.
      id: 'via',
      name: 'via',
      types: ['Node', 'Node', 'Node'],
      tuples: [{ atoms: ['a', 'm', 'z'], types: ['Node', 'Node', 'Node'] }],
    },
  ],
};

function generate(specStr: string) {
  const instance = new JSONDataInstance(data);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const spec = parseLayoutSpec(specStr);
  return new LayoutInstance(spec, evaluator, 0, true).generateLayout(instance).layout;
}

/** The `accepts` entry the manifest publishes for one field. */
function accepted(itemId: string, fieldName: string, arity: string) {
  const manifest = getLanguageManifest('0.0.0-test');
  const field: LanguageField = manifest.items
    .find((i) => i.id === itemId)!
    .fields.find((f) => f.name === fieldName)!;
  return field.accepts!.find((a) => a.arity === arity);
}

describe('selector arity — what the manifest promises generators', () => {
  it('a longer tuple is read as its two ends, for a constraint', () => {
    expect(accepted('orientation', 'selector', 'n-ary')).toBeDefined();
    const layout = generate(`
constraints:
  - orientation:
      selector: via
      directions: [left]
`);
    // (a, m, z) constrains a relative to z — the middle atom takes no part.
    const between = layout.constraints.filter(
      (c: any) => c.left?.id !== undefined || c.top?.id !== undefined,
    );
    expect(between.length, 'one constraint for the tuple').toBeGreaterThan(0);
    // Which end lands left is `directions` (target relative to source); the
    // arity claim is only about *which two atoms* the tuple resolves to.
    const pairs = between.map((c: any) =>
      [c.left?.id ?? c.top?.id, c.right?.id ?? c.bottom?.id].sort(),
    );
    expect(pairs).toContainEqual(['a', 'z']);
    expect(pairs.flat()).not.toContain('m');
  });

  it('a longer tuple keeps its middle atoms in an inferredEdge label', () => {
    expect(accepted('inferredEdge', 'selector', 'n-ary')).toBeDefined();
    const layout = generate(`
directives:
  - inferredEdge:
      name: hop
      selector: via
`);
    const edges = layout.edges.filter((e) => e.id.includes('_inferred_'));
    expect(edges).toHaveLength(1);
    expect(edges[0].source.id).toBe('a');
    expect(edges[0].target.id).toBe('z');
    // Unlike the constraints, the columns between are not discarded.
    expect(edges[0].label).toBe('hop[m]');
  });

  it('a unary group selector builds one unkeyed group', () => {
    expect(accepted('group', 'selector', 'unary')).toBeDefined();
    const layout = generate(`
constraints:
  - group:
      name: everything
      selector: Node
`);
    // Named for the constraint alone — no `[key]` suffix, unlike the keyed form.
    expect(layout.groups.map((gr) => gr.name)).toEqual(['everything']);
    expect(layout.groups[0].nodeIds.sort()).toEqual(['a', 'm', 'z']);
  });

  it('a unary inferredEdge selector draws nothing without draw', () => {
    // The `requires: draw` on this entry is the whole point: emit it alone and
    // you get a directive that silently does nothing.
    expect(accepted('inferredEdge', 'selector', 'unary')!.requires).toBe('draw');
    const layout = generate(`
directives:
  - inferredEdge:
      name: self
      selector: Node
`);
    expect(layout.edges.filter((e) => e.id.includes('_inferred_'))).toHaveLength(0);
  });

  it('a unary inferredEdge selector feeds both ends when draw is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const layout = generate(`
constraints:
  - group:
      name: everything
      selector: Node
directives:
  - inferredEdge:
      name: self
      selector: Node
      draw: _ -> everything
`);
      // One edge per selected atom, each anchored on the single group.
      expect(layout.edges.filter((e) => e.id.includes('_inferred_'))).toHaveLength(3);
    } finally {
      warn.mockRestore();
    }
  });
});
