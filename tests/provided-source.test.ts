/**
 * Tests for author provenance (`source`): the rule as its author wrote it in
 * an embedding (a Python decorator, a Rust attribute, …), carried on spec
 * items and cited by conflict reports in place of the engine's own rendering.
 *
 * Covers:
 *  - parsing (`parseProvidedSource`, carrying on all four constraint kinds and
 *    hideAtom, malformed blocks ignored, dedup keeps the first source)
 *  - display (`toHTML()` prefers the author text, escaped; fallback unchanged)
 *  - end-to-end conflict reports (positional IIS and hideAtom-vs-constraint)
 *  - the JSON Schema (accepts `source` on block-bodied items, stays closed)
 *  - the spec editor (round-trips `source`; no unknown-key warning)
 */
import { describe, it, expect } from 'vitest';
import * as yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020';

import { parseLayoutSpec, LayoutInstance } from '../src/layout';
import { parseProvidedSource, providedSourceHTML } from '../src/layout/layoutspec';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { getLanguageManifest } from '../src/language/manifest';
import { buildJsonSchema } from '../src/language/json-schema';
import {
  parseYamlToState,
  serializeStateToYaml,
  validateItem,
  newId,
  type SpecItem,
} from '../src/spec-editor';

const PY_ORIENTATION = "@spytial.orientation(selector='r', directions=['left'])";
const PY_HIDE = "@spytial.hide_atom('B')";

// What the author text looks like inside report HTML — reports escape it.
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

describe('parseProvidedSource', () => {
  it('accepts a block with text, and text plus location', () => {
    expect(parseProvidedSource({ text: PY_ORIENTATION })).toEqual({ text: PY_ORIENTATION });
    expect(parseProvidedSource({ text: PY_ORIENTATION, location: 'tree.py:12' }))
      .toEqual({ text: PY_ORIENTATION, location: 'tree.py:12' });
  });

  it('ignores anything without a non-empty string text', () => {
    expect(parseProvidedSource(undefined)).toBeUndefined();
    expect(parseProvidedSource('just a string')).toBeUndefined();
    expect(parseProvidedSource({ location: 'tree.py:12' })).toBeUndefined();
    expect(parseProvidedSource({ text: '' })).toBeUndefined();
    expect(parseProvidedSource({ text: '   ' })).toBeUndefined();
    expect(parseProvidedSource({ text: 3 })).toBeUndefined();
    expect(parseProvidedSource(['text'])).toBeUndefined();
  });

  it('drops a blank or non-string location but keeps the text', () => {
    expect(parseProvidedSource({ text: 't', location: '' })).toEqual({ text: 't' });
    expect(parseProvidedSource({ text: 't', location: 42 })).toEqual({ text: 't' });
  });
});

describe('providedSourceHTML', () => {
  it('escapes the author text and shows it as code', () => {
    const html = providedSourceHTML({ text: `a < b & "q" <script>` });
    expect(html).toBe('<code>a &lt; b &amp; &quot;q&quot; &lt;script&gt;</code>');
  });

  it('appends an escaped location', () => {
    const html = providedSourceHTML({ text: 't', location: '<file>:1' });
    expect(html).toBe('<code>t</code> (&lt;file&gt;:1)');
  });
});

describe('parseLayoutSpec carries source', () => {
  it('onto all four constraint kinds', () => {
    const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: { text: "orientation-as-written", location: "a.py:1" }
  - cyclic:
      selector: c
      direction: clockwise
      source: { text: "cyclic-as-written" }
  - align:
      selector: r
      direction: horizontal
      source: { text: "align-as-written" }
  - group:
      selector: g
      name: cluster
      source: { text: "group-as-written" }
`);
    expect(spec.constraints.orientation.relative[0].source)
      .toEqual({ text: 'orientation-as-written', location: 'a.py:1' });
    expect(spec.constraints.orientation.cyclic[0].source).toEqual({ text: 'cyclic-as-written' });
    expect(spec.constraints.alignment[0].source).toEqual({ text: 'align-as-written' });
    expect(spec.constraints.grouping.byselector[0].source).toEqual({ text: 'group-as-written' });
  });

  it('onto hideAtom in both sections', () => {
    const fromConstraints = parseLayoutSpec(`
constraints:
  - hideAtom:
      selector: B
      source: { text: "hide-as-written" }
`);
    expect(fromConstraints.directives.hiddenAtoms[0].source).toEqual({ text: 'hide-as-written' });

    const fromDirectives = parseLayoutSpec(`
directives:
  - hideAtom:
      selector: B
      source: { text: "hide-as-written" }
`);
    expect(fromDirectives.directives.hiddenAtoms[0].source).toEqual({ text: 'hide-as-written' });
  });

  it('ignores a malformed source without failing the parse', () => {
    const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: "not a block"
`);
    expect(spec.constraints.orientation.relative[0].source).toBeUndefined();
  });

  it('keeps the first provided source when duplicates de-duplicate', () => {
    const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [left]
  - orientation:
      selector: r
      directions: [left]
      source: { text: "kept-from-duplicate" }
`);
    expect(spec.constraints.orientation.relative).toHaveLength(1);
    expect(spec.constraints.orientation.relative[0].source).toEqual({ text: 'kept-from-duplicate' });
  });

  it('toHTML prefers the author text, escaped, and falls back without one', () => {
    const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: { text: "@orientation(<dirs>)", location: "a.py:1" }
  - align:
      selector: r
      direction: horizontal
`);
    const withSource = spec.constraints.orientation.relative[0].toHTML();
    expect(withSource).toBe('<code>@orientation(&lt;dirs&gt;)</code> (a.py:1)');
    expect(spec.constraints.alignment[0].toHTML()).toContain('AlignConstraint');
  });
});

describe('conflict reports cite the author text', () => {
  const cycleData = {
    atoms: [
      { id: 'A', type: 'Node', label: 'A' },
      { id: 'B', type: 'Node', label: 'B' },
    ],
    relations: [
      {
        id: 'r',
        name: 'r',
        types: ['Node', 'Node'],
        tuples: [
          { atoms: ['A', 'B'], types: ['Node', 'Node'] },
          { atoms: ['B', 'A'], types: ['Node', 'Node'] },
        ],
      },
    ],
  };

  function createLayout(specYaml: string, data: object) {
    const layoutSpec = parseLayoutSpec(specYaml);
    const dataInstance = new JSONDataInstance(data);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    return layoutInstance.generateLayout(dataInstance);
  }

  it('positional IIS rows are keyed by the provided source', () => {
    const result = createLayout(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: { text: "${PY_ORIENTATION}", location: "tree.py:12" }
`, cycleData);

    expect(result.error).not.toBeNull();
    expect(result.error!.type).toBe('positional-conflict');
    const messages = (result.error as { errorMessages?: {
      conflictingSourceConstraint: string;
      minimalConflictingConstraints: Map<string, string[]>;
    } }).errorMessages;
    expect(messages).toBeDefined();
    expect(messages!.conflictingSourceConstraint).toContain(esc(PY_ORIENTATION));
    expect(messages!.conflictingSourceConstraint).toContain('tree.py:12');
    const keys = [...messages!.minimalConflictingConstraints.keys()];
    expect(keys.some((k) => k.includes(esc(PY_ORIENTATION)))).toBe(true);
    // The engine's own rendering is replaced, not merely prefixed.
    expect(keys.some((k) => k.includes('OrientationConstraint'))).toBe(false);
  });

  it('hideAtom conflicts cite both provided sources', () => {
    const chainData = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
      ],
      relations: [
        {
          id: 'edge',
          name: 'edge',
          types: ['Node', 'Node'],
          tuples: [{ atoms: ['A', 'B'], types: ['Node', 'Node'] }],
        },
      ],
    };
    const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
      source: { text: "${PY_ORIENTATION}" }
  - hideAtom:
      selector: B
      source: { text: "${PY_HIDE}", location: "tree.py:20" }
`, chainData);

    expect(result.error).not.toBeNull();
    expect(result.error!.type).toBe('hidden-node-conflict');
    const messages = (result.error as { errorMessages: {
      minimalConflictingConstraints: Map<string, string[]>;
    } }).errorMessages;
    const keys = [...messages.minimalConflictingConstraints.keys()];
    expect(keys.some((k) => k.includes(esc(PY_ORIENTATION)))).toBe(true);
    expect(keys.some((k) => k.includes(esc(PY_HIDE)) && k.includes('tree.py:20'))).toBe(true);
    expect(keys.some((k) => k.includes('hideAtom with selector'))).toBe(false);
  });
});

describe('JSON Schema', () => {
  const manifest = getLanguageManifest('0.0.0-test');
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(buildJsonSchema(manifest));

  it('accepts source on constraints and directives alike', () => {
    const doc = yaml.load(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: { text: "as-written", location: "a.py:1" }
  - hideAtom:
      selector: B
      source: { text: "as-written" }
directives:
  - atomStyle:
      selector: Node
      fillStyle: { color: red }
      source: { text: "as-written" }
`);
    const ok = validate(doc);
    expect(validate.errors ?? [], JSON.stringify(validate.errors)).toEqual([]);
    expect(ok).toBe(true);
  });

  it('stays closed: unknown leaves and a missing text fail validation', () => {
    const unknownLeaf = yaml.load(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: { text: "t", language: python }
`);
    expect(validate(unknownLeaf)).toBe(false);

    const missingText = yaml.load(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: { location: "a.py:1" }
`);
    expect(validate(missingText)).toBe(false);
  });

  it('the manifest names which items accept and display source', () => {
    expect(manifest.source.supportedBy).not.toContain('flag');
    expect(manifest.source.supportedBy).toContain('orientation');
    expect(manifest.source.supportedBy).toContain('atomStyle');
    expect(manifest.source.displayedBy).toEqual(['orientation', 'cyclic', 'align', 'group', 'hideAtom']);
  });
});

describe('spec editor', () => {
  it('round-trips source through the default and the group codec', () => {
    const state = parseYamlToState(`
constraints:
  - orientation:
      selector: r
      directions: [left]
      source: { text: "orientation-as-written" }
  - group:
      selector: g
      name: cluster
      source: { text: "group-as-written", location: "a.py:3" }
`);
    const reparsed = yaml.load(serializeStateToYaml(state)) as {
      constraints: Record<string, Record<string, unknown>>[];
    };
    const orientation = reparsed.constraints.find((c) => c.orientation)?.orientation;
    const group = reparsed.constraints.find((c) => c.group)?.group;
    expect(orientation?.source).toEqual({ text: 'orientation-as-written' });
    expect(group?.source).toEqual({ text: 'group-as-written', location: 'a.py:3' });
  });

  it('does not flag source as an unknown key', () => {
    const constraint: SpecItem = {
      id: newId(),
      kind: 'constraint',
      type: 'orientation',
      params: { selector: 'r', directions: ['left'], source: { text: 't' } },
    };
    const directive: SpecItem = {
      id: newId(),
      kind: 'directive',
      type: 'attribute',
      params: { field: 'f', source: { text: 't' } },
    };
    for (const item of [constraint, directive]) {
      const unknown = validateItem(item).filter((d) => d.code === 'unknown-key');
      expect(unknown).toEqual([]);
    }
  });
});
