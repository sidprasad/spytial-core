/**
 * The language manifest is a published contract: integrations read it to
 * generate specs, so a claim in it that the engine does not honour is a bug
 * shipped to every consumer. These tests pin it to reality from three sides.
 *
 *  1. **Conformance with the parser.** Every item's example must not merely
 *     parse — it must *land* in the parsed spec. A form that the manifest
 *     documents and `parseLayoutSpec` silently drops is exactly the failure
 *     that made `projection` linger in the docs for a year after it was removed
 *     from the language, and `landsIn` below is the check that catches it.
 *  2. **Enforcement claims.** Every field marked `required` is omitted in turn,
 *     and the parser's actual reaction is compared to the declared
 *     `enforcement` — so "the parser throws" and "the parser shrugs and your
 *     directive quietly does nothing" cannot be confused in the docs.
 *  3. **Agreement with the other surfaces.** Enums are compared against the
 *     engine's own constants, and the item/field inventory against the
 *     spec-editor registry, so the manifest cannot drift from either.
 *
 * Plus a staleness gate: the checked-in `docs/*.json` must match what the
 * generator would write today.
 */

import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

import {
  MANIFEST_PATH,
  SCHEMA_PATH,
  renderArtifacts,
} from '../scripts/generate-language-artifacts';
import { buildJsonSchema } from '../src/language/json-schema';
import { getLanguageManifest, LANGUAGE_VERSION } from '../src/language/manifest';
import type { LanguageField, LanguageItem, LanguageManifest } from '../src/language/types';
import { GROUP_EDGE_DIRECTIONS, parseInferredEdgeDraw, parseLayoutSpec } from '../src/layout/layoutspec';
import type { LayoutSpec } from '../src/layout/layoutspec';
import { ICON_PLACEMENTS } from '../src/layout/style/atom-style-spec';
import { TEXT_SIZES } from '../src/layout/style/text-style';
import {
  ALIGN_DIRECTIONS,
  CYCLIC_DIRECTIONS,
  EDGE_STYLES,
  FLAG_OPTIONS,
  ORIENTATION_DIRECTIONS,
  getAllDefinitions,
} from '../src/spec-editor/core/registry';
import type { FieldSpec } from '../src/spec-editor/core/types';

const manifest: LanguageManifest = getLanguageManifest('0.0.0-test');

/** Silence the deprecation warnings the parser writes straight to the console. */
function quietly<T>(fn: () => T): T {
  const original = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = original;
  }
}

/** Serialize one item, in the given section, as a complete spec document. */
function specFor(item: LanguageItem, body: unknown, section = item.sections[0]): string {
  const node = item.valueShape === 'scalar' ? { [item.yamlKey]: (body as Record<string, unknown>)[item.yamlKey] } : { [item.yamlKey]: body };
  return yaml.dump({ [section]: [node] });
}

/**
 * Where each item is expected to show up in the parsed spec. Deliberately hand
 * written rather than derived: the point is to state, independently of the
 * manifest, what the engine must actually do with each form.
 */
const landsIn: Record<string, (spec: LayoutSpec) => number> = {
  orientation: (s) => s.constraints.orientation.relative.length,
  cyclic: (s) => s.constraints.orientation.cyclic.length,
  align: (s) => s.constraints.alignment.length,
  group: (s) => s.constraints.grouping.byselector.length,
  size: (s) => s.directives.sizes.length,
  hideAtom: (s) => s.directives.hiddenAtoms.length,
  flag: (s) => (s.directives.hideDisconnected || s.directives.hideDisconnectedBuiltIns ? 1 : 0),
  atomStyle: (s) => s.directives.atomStyles.length,
  edgeStyle: (s) => s.directives.edgeStyles.length,
  attribute: (s) => s.directives.attributes.length,
  tag: (s) => s.directives.tags.length,
  hideField: (s) => s.directives.hiddenFields.length,
  inferredEdge: (s) => s.directives.inferredEdges.length,
  // The deprecated trio desugar onto their modern counterparts rather than
  // landing in their own (now vestigial) buckets.
  icon: (s) => s.directives.atomStyles.length,
  atomColor: (s) => s.directives.atomStyles.length,
  edgeColor: (s) => s.directives.edgeStyles.length,
};

describe('language manifest — conformance with the parser', () => {
  it.each(manifest.items.map((item) => [item.id, item] as const))(
    '%s: the documented example parses and lands in the spec',
    (id, item) => {
      const spec = quietly(() => parseLayoutSpec(specFor(item, item.example)));
      const reached = landsIn[id];
      expect(reached, `no landing assertion for '${id}'`).toBeDefined();
      expect(
        reached(spec),
        `'${id}' parsed without error but produced nothing — the engine ignores this form`,
      ).toBeGreaterThan(0);
    },
  );

  it('every item declares a landing assertion, and no stale ones remain', () => {
    expect(Object.keys(landsIn).sort()).toEqual(manifest.items.map((i) => i.id).sort());
  });

  it.each(
    manifest.items
      .filter((item) => item.deprecatedSections?.length)
      .flatMap((item) => item.deprecatedSections!.map((section) => [item.id, section, item] as const)),
  )('%s still parses in the deprecated %s section, and warns', (id, section, item) => {
    const spec = quietly(() => parseLayoutSpec(specFor(item, item.example, section)));

    // Identical meaning — the whole point of deprecating rather than removing.
    expect(landsIn[id](spec)).toBeGreaterThan(0);

    const warnings = spec.warnings ?? [];
    expect(warnings.map((w) => w.code)).toContain('deprecated');
    expect(warnings.map((w) => w.specType)).toContain(item.sectionDeprecation!.warningSpecType);
    expect(
      warnings.some((w) => w.message.includes(section) && w.message.includes(item.sections[0])),
      'the warning should name both the section it is in and the one to move it to',
    ).toBe(true);
  });

  it('size and hideAtom are constraints', () => {
    // Called out explicitly: they were historically documented as directives,
    // and the classification is the thing this pair of tests protects.
    for (const id of ['size', 'hideAtom']) {
      const item = manifest.items.find((i) => i.id === id)!;
      expect(item.sections).toEqual(['constraints']);
      expect(item.deprecatedSections).toEqual(['directives']);
    }
  });
});

describe('language manifest — enforcement claims', () => {
  const requiredFields = manifest.items.flatMap((item) =>
    item.fields
      .filter((field) => field.required)
      .map((field) => [`${item.id}.${field.name}`, item, field.name, field.enforcement] as const),
  );

  it.each(requiredFields)('%s: omitting it behaves as declared (%#)', (_label, item, fieldName, enforcement) => {
    const body = { ...(item.example as Record<string, unknown>) };
    delete body[fieldName];

    // The example may not exercise the field at all (an optional-looking
    // required field like `group.selector`); only omission from a body that had
    // it is a meaningful probe.
    if (!(fieldName in (item.example as Record<string, unknown>))) {
      return;
    }

    const run = () => quietly(() => parseLayoutSpec(specFor(item, body)));

    if (enforcement === 'parse-error') {
      expect(run, `manifest says omitting ${item.id}.${fieldName} is a parse error`).toThrow();
    } else {
      expect(run, `manifest says omitting ${item.id}.${fieldName} is not a parse error`).not.toThrow();
    }
  });

  it('group.name is required unless the constraint is negated', () => {
    expect(() => quietly(() => parseLayoutSpec('constraints:\n  - group: { selector: a.b }\n'))).toThrow();
    const negated = quietly(() =>
      parseLayoutSpec('constraints:\n  - group: { selector: a.b, hold: never }\n'),
    );
    expect(negated.constraints.grouping.byselector).toHaveLength(1);
    expect(negated.constraints.grouping.byselector[0].negated).toBe(true);
  });

  it('size rejects a missing or non-positive dimension', () => {
    for (const body of ['{ selector: a, height: 10 }', '{ selector: a, width: 0, height: 10 }']) {
      expect(() => parseLayoutSpec(`directives:\n  - size: ${body}\n`)).toThrow();
    }
  });

  it('items that do not support hold ignore it rather than negating', () => {
    for (const item of manifest.items.filter((i) => !i.supportsHold && i.valueShape === 'mapping')) {
      const body = { ...(item.example as Record<string, unknown>), hold: 'never' };
      expect(() => quietly(() => parseLayoutSpec(specFor(item, body)))).not.toThrow();
    }
    // `never` on a size still produces a plain, positive size directive.
    const spec = parseLayoutSpec('constraints:\n  - size: { selector: a, width: 10, height: 10, hold: never }\n');
    expect(spec.directives.sizes).toHaveLength(1);
  });

  it('only `never` negates; any other hold value is the positive constraint', () => {
    for (const hold of ['always', 'sometimes']) {
      const spec = parseLayoutSpec(
        `constraints:\n  - orientation: { selector: p, directions: [above], hold: ${hold} }\n`,
      );
      expect(spec.constraints.orientation.relative[0].negated).toBe(false);
    }
  });
});

describe('language manifest — document rules', () => {
  it('unknown keys really are ignored, at every level', () => {
    const spec = parseLayoutSpec(
      [
        'somethingElse:',
        '  - foo: bar',
        'directives:',
        '  - bogusDirective: { foo: bar }',
        '  - flag: notARealFlag',
      ].join('\n'),
    );
    expect(spec.directives.hideDisconnected).toBe(false);
    expect(spec.directives.hideDisconnectedBuiltIns).toBe(false);
    expect(manifest.document.unknownKeys).toBe('ignored');
  });

  it('a section written as a mapping instead of a list is ignored wholesale', () => {
    const spec = parseLayoutSpec('constraints:\n  orientation:\n    selector: p\n    directions: [above]\n');
    expect(spec.constraints.orientation.relative).toHaveLength(0);
    expect(manifest.document.sectionShape).toBe('list');
  });

  it('an empty document is valid', () => {
    for (const source of ['', 'constraints:\ndirectives:\n']) {
      expect(() => parseLayoutSpec(source)).not.toThrow();
    }
  });
});

describe('language manifest — deprecations', () => {
  it.each(manifest.items.filter((item) => item.deprecated).map((item) => [item.id, item] as const))(
    '%s raises a deprecation warning carrying its declared specType',
    (_id, item) => {
      const spec = quietly(() => parseLayoutSpec(specFor(item, item.example)));
      const warnings = spec.warnings ?? [];
      expect(warnings.map((w) => w.code)).toContain('deprecated');
      expect(warnings.map((w) => w.specType)).toContain(item.deprecated!.warningSpecType);
    },
  );

  it('a deprecated field raises a warning even on a supported item', () => {
    // inferredEdge is current; its inline color/style/weight/highlight are not.
    const spec = quietly(() =>
      parseLayoutSpec('directives:\n  - inferredEdge: { name: r, selector: "^parent", color: gray }\n'),
    );
    const warnings = spec.warnings ?? [];
    expect(warnings.some((w) => w.code === 'deprecated' && w.specType === 'inferredEdge')).toBe(true);
  });

  it('a current form raises no warnings', () => {
    for (const item of manifest.items.filter((i) => !i.deprecated)) {
      const hasDeprecatedField = item.fields.some(
        (field) => field.deprecated && field.name in (item.example as Record<string, unknown>),
      );
      if (hasDeprecatedField) continue;
      const spec = quietly(() => parseLayoutSpec(specFor(item, item.example)));
      expect(spec.warnings ?? [], `'${item.id}' warned on its own documented example`).toHaveLength(0);
    }
  });

  it('every deprecation names a replacement that exists in the manifest', () => {
    const ids = new Set(manifest.items.map((item) => item.id));
    for (const item of manifest.items) {
      if (item.deprecated) {
        expect(ids, `${item.id} → ${item.deprecated.replacedBy}`).toContain(item.deprecated.replacedBy);
      }
      for (const field of item.fields) {
        if (!field.deprecated) continue;
        const [head] = field.deprecated.replacedBy.split('.');
        const target = item.fields.some((f) => f.name === head);
        expect(target, `${item.id}.${field.name} → ${field.deprecated.replacedBy}`).toBe(true);
      }
    }
  });

  it('the flat deprecations list covers every deprecated item, field and placement', () => {
    const expected = [
      ...manifest.items.filter((i) => i.deprecated).map((i) => i.id),
      ...manifest.items.flatMap((i) => i.fields.filter((f) => f.deprecated).map((f) => `${i.id}.${f.name}`)),
      ...manifest.items.flatMap((i) => (i.deprecatedSections ?? []).map((s) => `${i.id}@${s}`)),
    ];
    expect(manifest.deprecations.map((d) => d.id).sort()).toEqual(expected.sort());
  });
});

describe('language manifest — agreement with the engine constants', () => {
  const enumOf = (itemId: string, fieldName: string): readonly string[] => {
    const field = manifest.items.find((i) => i.id === itemId)?.fields.find((f) => f.name === fieldName);
    return field?.values ?? [];
  };
  const blockEnum = (blockName: string, fieldName: string): readonly string[] =>
    manifest.blocks.find((b) => b.name === blockName)?.fields.find((f) => f.name === fieldName)?.values ?? [];

  it('orientation directions', () => {
    expect(enumOf('orientation', 'directions')).toEqual([...ORIENTATION_DIRECTIONS]);
  });
  it('cyclic + align directions', () => {
    expect(enumOf('cyclic', 'direction')).toEqual([...CYCLIC_DIRECTIONS]);
    expect(enumOf('align', 'direction')).toEqual([...ALIGN_DIRECTIONS]);
  });
  it('group edge directions', () => {
    expect(enumOf('group', 'addEdge')).toEqual([...GROUP_EDGE_DIRECTIONS]);
  });
  it('flags', () => {
    expect(enumOf('flag', 'flag')).toEqual([...FLAG_OPTIONS]);
  });
  it('line patterns, text sizes, icon placements', () => {
    expect(blockEnum('lineStyle', 'pattern')).toEqual([...EDGE_STYLES]);
    expect(blockEnum('textStyle', 'size')).toEqual([...TEXT_SIZES]);
    expect(blockEnum('iconStyle', 'placement')).toEqual([...ICON_PLACEMENTS]);
  });
});

describe('language manifest — selector arities', () => {
  /** Every selector-typed field in the manifest, including nested block leaves. */
  const selectorFields: { path: string; field: LanguageField }[] = [];
  const collect = (path: string, fields: readonly LanguageField[]) => {
    for (const field of fields) {
      if (field.type === 'selector') selectorFields.push({ path: `${path}.${field.name}`, field });
      if (field.fields) collect(`${path}.${field.name}`, field.fields);
      if (field.alternativeForm?.fields) collect(`${path}.${field.name}`, field.alternativeForm.fields);
    }
  };
  for (const item of manifest.items) collect(item.id, item.fields);
  for (const block of manifest.blocks) collect(block.name, block.fields);

  it('every selector field declares the shapes it accepts', () => {
    // The gap this closes: `arity` is one value, several fields take more than
    // one, and the extras used to live only in the `description`. A generator
    // reads structure, not prose, so a shape the engine accepts and the manifest
    // does not list is a shape no integration will ever emit.
    expect(selectorFields.length).toBeGreaterThan(0);
    for (const { path, field } of selectorFields) {
      expect(field.arity, `${path} declares an arity`).toBeDefined();
      expect(field.accepts?.length, `${path} lists what it accepts`).toBeGreaterThan(0);
      expect(field.accepts!.map((a) => a.arity), `${path} accepts its own primary arity`).toContain(field.arity);
      expect(
        new Set(field.accepts!.map((a) => a.arity)).size,
        `${path} lists each arity once`,
      ).toBe(field.accepts!.length);
      for (const accepted of field.accepts!) {
        // The arity words are not disjoint — `n-ary` is "two or more", so it
        // covers `binary` too — which is why the column range is what a
        // generator matches on. Each label still has to agree with its range.
        const bounds: Record<string, [number, number | undefined]> = {
          unary: [1, 1],
          binary: [2, 2],
        };
        const expected = bounds[accepted.arity];
        if (expected) {
          expect([accepted.minColumns, accepted.maxColumns], `${path}/${accepted.arity} bounds`).toEqual(expected);
        } else {
          expect(accepted.minColumns, `${path}/n-ary starts at two or more`).toBeGreaterThanOrEqual(2);
        }
        expect(
          accepted.maxColumns === undefined || accepted.maxColumns >= accepted.minColumns,
          `${path}/${accepted.arity} range is not inverted`,
        ).toBe(true);

        expect(accepted.meaning, `${path}/${accepted.arity} says what it means`).toBeTruthy();
        if (accepted.requires) {
          const siblings = manifest.items.flatMap((i) => (i.id === path.split('.')[0] ? i.fields : []));
          expect(siblings.map((f) => f.name), `${path}/${accepted.arity} requires a real field`).toContain(
            accepted.requires,
          );
        }
      }
    }
  });

  it('no two accepted shapes cover the same column count', () => {
    // The one property that makes `accepts` usable as a lookup: a generator
    // holding a k-column expression must find exactly one entry. Arity words
    // alone cannot give that — `n-ary` subsumes `binary` — so the ranges are
    // what has to be disjoint.
    const CHECK_UP_TO = 6;
    for (const { path, field } of selectorFields) {
      for (let k = 1; k <= CHECK_UP_TO; k++) {
        const covering = field.accepts!.filter(
          (a) => k >= a.minColumns && (a.maxColumns === undefined || k <= a.maxColumns),
        );
        expect(covering.length, `${path} at ${k} column(s): ${covering.map((a) => a.arity).join(' + ')}`)
          .toBeLessThanOrEqual(1);
      }
    }
  });

  it('non-primary arities are only claimed where the engine really takes them', () => {
    // A generator trusting `accepts` will emit these, so the extras have to be
    // real. Only these three branch on the result's arity in the engine — the
    // first two via `acceptSelectorResult(..., 'any', ...)`, `tag.value` on
    // `maxArity()` in `applyTags`. Everything else is checked against a single
    // shape, save the longer-tuple form that `selectedTwoples` makes universal.
    const branchesOnArity = ['group.selector', 'inferredEdge.selector', 'tag.value'];
    for (const { path, field } of selectorFields) {
      const extras = field.accepts!.filter((a) => a.arity !== field.arity).map((a) => a.arity);
      if (branchesOnArity.includes(path)) continue;
      expect(extras.filter((a) => a !== 'n-ary'), `${path} claims no unchecked extra`).toEqual([]);
      // Only pair-taking fields read a longer tuple as its two ends.
      if (extras.includes('n-ary')) {
        expect(field.arity, `${path} only widens to n-ary from binary`).toBe('binary');
      }
    }
  });

  it('the schema description names the extra shapes, not just the primary one', () => {
    // Arity is semantic, so the schema cannot validate it — but a reader of the
    // schema alone must not come away thinking `binary` is the only option.
    // Each item def wraps its fields under the item's own yamlKey.
    const defs = (buildJsonSchema(manifest) as { $defs: Record<string, {
      properties: Record<string, { properties: Record<string, { description: string }> }>;
    }> }).$defs;
    const describes = (defId: string, yamlKey: string, fieldName: string) =>
      defs[defId].properties[yamlKey].properties[fieldName].description;

    // Spelled in column counts, so "binary" and "n-ary" cannot read as two
    // descriptions of the same two-column result.
    const inferredEdge = describes('inferredEdge', 'inferredEdge', 'selector');
    expect(inferredEdge).toMatch(
      /Selector arity: binary — 2 columns \(also accepted: 3\+ columns; 1 column, with `draw`\)\./,
    );
    expect(describes('group', 'group', 'selector')).toMatch(/also accepted: 3\+ columns; 1 column/);
    expect(describes('hideAtom', 'hideAtom', 'selector'), 'single-arity fields stay terse').toMatch(
      /Selector arity: unary — 1 column\./,
    );
  });
});

describe('language manifest — agreement with the spec-editor registry', () => {
  /** registry type key → manifest item id. */
  const REGISTRY_TO_MANIFEST: Readonly<Record<string, string>> = {
    groupselector: 'group',
  };

  /**
   * Forms the editor still knows but the manifest deliberately does not.
   *
   * The two surfaces answer different questions. The registry has to *render*
   * whatever an author opens, including forms nobody should write any more; the
   * manifest says what to *emit*. `groupfield` is the one place they part: the
   * parser still accepts it, the editor still shows it to anyone who has it, and
   * no integration should generate it.
   */
  const REGISTRY_ONLY = ['groupfield'];

  const manifestId = (registryType: string): string => REGISTRY_TO_MANIFEST[registryType] ?? registryType;
  const shared = () => getAllDefinitions().filter((d) => !REGISTRY_ONLY.includes(d.type));

  it('describes every form the editor offers, bar the ones it deliberately drops', () => {
    expect(shared().map((d) => manifestId(d.type)).sort()).toEqual(manifest.items.map((i) => i.id).sort());
  });

  it('the forms it drops are ones the editor never offers to add', () => {
    // Dropping a form the builder can still *create* would leave the editor
    // producing specs the manifest calls invalid. Only render-for-back-compat
    // forms may be dropped, so each one has to be deprecated in the registry.
    for (const type of REGISTRY_ONLY) {
      const def = getAllDefinitions().find((d) => d.type === type);
      expect(def, `${type} is still in the registry`).toBeDefined();
      expect(def!.deprecated, `${type} is deprecated in the registry`).toBe(true);
    }
  });

  it('marks the same forms deprecated', () => {
    for (const def of shared()) {
      const item = manifest.items.find((i) => i.id === manifestId(def.type))!;
      expect(Boolean(item.deprecated), `${def.type} deprecation flag`).toBe(Boolean(def.deprecated));
    }
  });

  it('agrees on which section each form belongs to, and where else it is tolerated', () => {
    // The registry drives the editor's diagnostics and the manifest drives what
    // integrations generate. If they disagree about `size` being a constraint,
    // one of the two is telling someone the wrong thing.
    const sectionOf = { constraint: 'constraints', directive: 'directives' } as const;
    for (const def of shared()) {
      const item = manifest.items.find((i) => i.id === manifestId(def.type))!;
      expect(item.sections, `${def.type} home section`).toEqual([sectionOf[def.kind]]);
      expect(
        (def.alsoAcceptedIn ?? []).map((k) => sectionOf[k]),
        `${def.type} tolerated sections`,
      ).toEqual([...(item.deprecatedSections ?? [])]);
    }
  });

  it('covers every field the editor can produce', () => {
    // One-directional: the manifest may describe more than the editor exposes
    // (legacy inline leaves the builder deliberately hides), but never less —
    // anything the builder can emit must be documented.
    const missing: string[] = [];
    const walk = (itemId: string, path: string, specs: readonly FieldSpec[], fields: readonly { name: string; fields?: readonly unknown[]; block?: string }[]) => {
      for (const spec of specs) {
        const field = fields.find((f) => f.name === spec.key);
        if (!field) {
          missing.push(`${itemId}.${path}${spec.key}`);
          continue;
        }
        if (spec.children) {
          const block = manifest.blocks.find((b) => b.name === field.block);
          const children = (block?.fields ?? (field.fields as { name: string }[] | undefined) ?? []) as {
            name: string;
          }[];
          walk(itemId, `${path}${spec.key}.`, spec.children, children);
        }
      }
    };

    for (const def of shared()) {
      const item = manifest.items.find((i) => i.id === manifestId(def.type))!;
      walk(item.id, '', def.fields, item.fields);
    }

    expect(missing).toEqual([]);
  });
});

describe('spec JSON Schema', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(buildJsonSchema(manifest));

  it.each(manifest.items.map((item) => [item.id, item] as const))(
    '%s: the documented example validates',
    (_id, item) => {
      const doc = yaml.load(specFor(item, item.example));
      const ok = validate(doc);
      expect(validate.errors ?? [], JSON.stringify(validate.errors)).toEqual([]);
      expect(ok).toBe(true);
    },
  );

  it('rejects what the parser would silently ignore', () => {
    const badDocuments: [string, unknown][] = [
      ['unknown directive', { directives: [{ bogusDirective: { foo: 'bar' } }] }],
      ['unknown field', { constraints: [{ align: { selector: 'a', direction: 'horizontal', typo: 1 } }] }],
      ['out-of-range enum', { constraints: [{ cyclic: { selector: 'a', direction: 'widdershins' } }] }],
      ['bad orientation direction', { constraints: [{ orientation: { selector: 'p', directions: ['sideways'] } }] }],
      ['unknown flag', { directives: [{ flag: 'notARealFlag' }] }],
      ['unknown top-level section', { somethingElse: [] }],
      ['section as a mapping', { constraints: { align: { selector: 'a', direction: 'horizontal' } } }],
      ['size without dimensions', { directives: [{ size: { selector: 'a' } }] }],
      ['group without a name', { constraints: [{ group: { selector: 'a.b' } }] }],
      ['two items in one list entry', { constraints: [{ align: { selector: 'a', direction: 'horizontal' }, cyclic: { selector: 'b' } }] }],
    ];
    for (const [label, doc] of badDocuments) {
      expect(validate(doc), `${label} should not validate`).toBe(false);
    }
  });

  it('accepts the shapes the engine accepts', () => {
    const goodDocuments: [string, unknown][] = [
      ['empty document', {}],
      ['empty sections', { constraints: null, directives: null }],
      ['negated group without a name', { constraints: [{ group: { selector: 'a.b', hold: 'never' } }] }],
      [
        'styled group connector',
        {
          constraints: [
            {
              group: {
                selector: 'D.e',
                name: 'D',
                addEdge: { points: 'togroup', lineStyle: { color: '#0aa', pattern: 'dashed' } },
                textStyle: { color: '#7c3aed' },
              },
            },
          ],
        },
      ],
      ['legacy addEdge boolean', { constraints: [{ group: { selector: 'a.b', name: 'g', addEdge: true } }] }],
      ['size in either section', { constraints: [{ size: { selector: 'a', width: 1, height: 1 } }], directives: [{ size: { width: 2, height: 2 } }] }],
      ['inferredEdge with group endpoints', { constraints: [{ group: { selector: 'R.m', name: 'regions' } }], directives: [{ inferredEdge: { name: 'c', selector: 'connected', draw: 'regions -> regions' } }] }],
    ];
    for (const [label, doc] of goodDocuments) {
      expect(validate(doc), `${label} should validate: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('everything the schema accepts, the engine also parses', () => {
    // The schema is the stricter of the two; this is the direction that must
    // hold for it to be safe to generate against.
    const documents = manifest.items.map((item) => specFor(item, item.example));
    for (const source of documents) {
      expect(() => quietly(() => parseLayoutSpec(source))).not.toThrow();
    }
  });

  it('rejects the single-item shapes the parser throws on', () => {
    // Without these the schema would hand a generator a document it believes is
    // valid and the engine refuses — the exact failure the artifact exists to
    // prevent. Each case is asserted from both sides: schema rejects AND parser
    // throws, so the two cannot drift apart silently.
    const thrownOn: [string, string][] = [
      ['malformed draw', 'directives:\n  - inferredEdge: { name: x, selector: y, draw: malformed }\n'],
      ['draw with two arrows', 'directives:\n  - inferredEdge: { name: x, selector: y, draw: "a -> b -> c" }\n'],
      ['draw with an empty end', 'directives:\n  - inferredEdge: { name: x, selector: y, draw: "-> b" }\n'],
      ['blank orientation selector', 'constraints:\n  - orientation: { selector: "", directions: [above] }\n'],
      ['blank cyclic selector', 'constraints:\n  - cyclic: { selector: "" }\n'],
      ['blank align selector', 'constraints:\n  - align: { selector: "", direction: horizontal }\n'],
      ['blank group name', 'constraints:\n  - group: { selector: a.b, name: "" }\n'],
      ['above and below', 'constraints:\n  - orientation: { selector: p, directions: [above, below] }\n'],
      ['left and right', 'constraints:\n  - orientation: { selector: p, directions: [left, right] }\n'],
      ['directlyAbove with left', 'constraints:\n  - orientation: { selector: p, directions: [directlyAbove, left] }\n'],
    ];

    for (const [label, source] of thrownOn) {
      expect(() => quietly(() => parseLayoutSpec(source)), `${label}: parser should throw`).toThrow();
      expect(validate(yaml.load(source)), `${label}: schema should reject`).toBe(false);
    }
  });

  it('still accepts the direction combinations the parser allows', () => {
    for (const directions of [['above'], ['above', 'left'], ['directlyAbove'], ['directlyAbove', 'above'], ['directlyLeft', 'left']]) {
      const source = `constraints:\n  - orientation: { selector: p, directions: [${directions.join(', ')}] }\n`;
      expect(() => parseLayoutSpec(source), `${directions}: parser`).not.toThrow();
      expect(validate(yaml.load(source)), `${directions}: schema`).toBe(true);
    }
  });

  it("the draw pattern is exactly the parser's rule", () => {
    const pattern = manifest.items
      .find((i) => i.id === 'inferredEdge')!
      .fields.find((f) => f.name === 'draw')!.pattern!;
    const re = new RegExp(pattern);

    for (const value of [
      'regions -> regions', '_ -> regions', 'regions->_', '_->_', '  a  ->  b  ',
      'a - b -> c', 'my group -> other group',
      'malformed', 'a->b->c', '->b', 'a->', '', '   ->   ',
    ]) {
      let parses = true;
      try {
        parseInferredEdgeDraw(value);
      } catch {
        parses = false;
      }
      expect(re.test(value), `draw ${JSON.stringify(value)}`).toBe(parses);
    }
  });

  it('does not claim to catch what needs more than one item', () => {
    // Cross-item rules are outside what JSON Schema can see. The parser is what
    // catches them, and the module doc says so — this pins that boundary rather
    // than letting the claim quietly become false.
    const throwsOnParse =
      'constraints:\n  - cyclic: { selector: a, direction: clockwise }\n  - cyclic: { selector: a, direction: counterclockwise }\n';
    expect(validate(yaml.load(throwsOnParse)), 'schema cannot see this').toBe(true);
    expect(() => quietly(() => parseLayoutSpec(throwsOnParse)), 'parser catches it').toThrow();

    // An unresolved `draw` group is cross-item too, but deliberately not fatal:
    // one fragment may name a group another fragment defines. It warns, and the
    // manifest note says exactly that.
    const warnsOnParse = 'directives:\n  - inferredEdge: { name: x, selector: y, draw: "nosuchgroup -> _" }\n';
    expect(validate(yaml.load(warnsOnParse)), 'schema cannot see this').toBe(true);
    const parsed = quietly(() => parseLayoutSpec(warnsOnParse));
    expect(parsed.warnings!.map((w) => w.code), 'parser warns instead').toContain('unresolved-reference');
    expect(
      manifest.items.find((i) => i.id === 'inferredEdge')!.fields.find((f) => f.name === 'draw')!.note,
    ).toMatch(/unresolved-reference/);
  });
});

describe('published artifacts', () => {
  it('the checked-in artifacts match what the generator produces', () => {
    const { manifest: expectedManifest, schema: expectedSchema } = renderArtifacts();
    expect(readFileSync(MANIFEST_PATH, 'utf8'), 'run `npm run build:language`').toBe(expectedManifest);
    expect(readFileSync(SCHEMA_PATH, 'utf8'), 'run `npm run build:language`').toBe(expectedSchema);
  });

  it('both artifacts carry the same language version', () => {
    const published = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as LanguageManifest;
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
    expect(published.languageVersion).toBe(LANGUAGE_VERSION);
    expect(schema['x-spytial-language-version']).toBe(LANGUAGE_VERSION);
  });

  it('the language version is a plain ISO date', () => {
    expect(LANGUAGE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // A real calendar date, not just the right shape.
    expect(new Date(`${LANGUAGE_VERSION}T00:00:00Z`).toISOString().slice(0, 10)).toBe(LANGUAGE_VERSION);
  });
});
