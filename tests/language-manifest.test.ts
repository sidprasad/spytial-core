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
import type { LanguageItem, LanguageManifest } from '../src/language/types';
import { GROUP_EDGE_DIRECTIONS, parseLayoutSpec } from '../src/layout/layoutspec';
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
  'group.byField': (s) => s.constraints.grouping.byfield.length,
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
      .filter((item) => item.sections.length > 1)
      .flatMap((item) => item.sections.map((section) => [item.id, section, item] as const)),
  )('%s is accepted in the %s section', (id, section, item) => {
    const spec = quietly(() => parseLayoutSpec(specFor(item, item.example, section)));
    expect(landsIn[id](spec)).toBeGreaterThan(0);
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

  it('the flat deprecations list covers every deprecated item and field', () => {
    const expected = [
      ...manifest.items.filter((i) => i.deprecated).map((i) => i.id),
      ...manifest.items.flatMap((i) => i.fields.filter((f) => f.deprecated).map((f) => `${i.id}.${f.name}`)),
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

describe('language manifest — agreement with the spec-editor registry', () => {
  /** registry type key → manifest item id. */
  const REGISTRY_TO_MANIFEST: Readonly<Record<string, string>> = {
    groupselector: 'group',
    groupfield: 'group.byField',
  };

  const manifestId = (registryType: string): string => REGISTRY_TO_MANIFEST[registryType] ?? registryType;

  it('describes exactly the same set of forms as the editor registry', () => {
    const fromRegistry = getAllDefinitions().map((d) => manifestId(d.type));
    expect(fromRegistry.sort()).toEqual(manifest.items.map((i) => i.id).sort());
  });

  it('marks the same forms deprecated', () => {
    for (const def of getAllDefinitions()) {
      const item = manifest.items.find((i) => i.id === manifestId(def.type))!;
      expect(Boolean(item.deprecated), `${def.type} deprecation flag`).toBe(Boolean(def.deprecated));
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

    for (const def of getAllDefinitions()) {
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
