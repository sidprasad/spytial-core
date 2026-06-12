import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SpecDocument,
  getAllDefinitions,
  getDefinition,
  type FieldSpec,
  type ItemDefinition,
  type SpecDocumentState,
  type SpecItem,
} from '../src/spec-editor';
import { parseLayoutSpec } from '../src/layout/layoutspec';

// ---- arbitraries that produce VALID-ish params for a definition ----

// Orientation directions have internal-consistency rules in the engine
// (see RelativeOrientationConstraint.isInternallyConsistent): a "directly*"
// value may only coexist with the matching loose value on the same axis, so it
// effectively cannot be combined with the other axis. We therefore generate
// either a single "directly*" value, or a combination of loose values (at most
// one vertical + at most one horizontal). The codec round-trips invalid combos
// fine; they're simply not engine-valid, so we keep the arbitrary engine-valid
// to keep the "accepted by parseLayoutSpec" property meaningful.
const arbDirectlyDirection: fc.Arbitrary<string[]> = fc
  .constantFrom('directlyAbove', 'directlyBelow', 'directlyLeft', 'directlyRight')
  .map((d) => [d]);

const arbLooseDirections: fc.Arbitrary<string[]> = fc
  .tuple(
    fc.constantFrom(undefined, 'above', 'below'),
    fc.constantFrom(undefined, 'left', 'right'),
  )
  .map(([v, h]) => [v, h].filter((x): x is string => x !== undefined))
  .filter((arr) => arr.length > 0);

const arbOrientationDirections: fc.Arbitrary<string[]> = fc.oneof(
  arbLooseDirections,
  arbDirectlyDirection,
);

function arbValueForField(field: FieldSpec): fc.Arbitrary<unknown> {
  switch (field.kind) {
    case 'enum':
      if (field.multiple) {
        // The only multi-select enum in the registry is orientation directions.
        if (field.key === 'directions') {
          return arbOrientationDirections;
        }
        return fc
          .subarray([...(field.options ?? [])], { minLength: 1 })
          .filter((arr) => arr.length > 0);
      }
      return fc.constantFrom(...(field.options ?? ['']));
    case 'number':
      // positive integers keep size/weight valid
      return fc.integer({ min: 1, max: 500 });
    case 'boolean':
      return fc.boolean();
    case 'color':
      return fc.constantFrom('#ff0000', '#00ff00', '#123abc', 'red', 'blue');
    case 'selector':
    case 'relationName':
    case 'typeName':
    case 'text':
    default:
      // Free-text/selector tokens. We deliberately mix plain identifiers with
      // YAML-hostile strings (`:`, `#`, newlines, quotes, leading `- `) so the
      // codec's quoting is exercised, not just the bare-scalar fast path — this
      // is what let the flag-emission corruption bug (Finding 1) slip through.
      return arbTextParamValue;
  }
}

/**
 * A grab-bag of YAML-significant characters/strings. The codec must quote/escape
 * these so the emitted document stays parseable and the value survives exactly.
 */
const arbTextParamValue: fc.Arbitrary<string> = fc.oneof(
  // common case: plain identifier-ish tokens (weighted heavier)
  {
    arbitrary: fc
      .stringMatching(/^[A-Za-z][A-Za-z0-9_.]{0,12}$/)
      .filter((s) => s.length > 0),
    weight: 3,
  },
  // YAML-hostile values
  {
    arbitrary: fc.constantFrom(
      'a: b # c',
      'has # hash',
      'colon: here',
      '- leading dash',
      "quote ' inside",
      'double " quote',
      'x\ndirectives: []',
      'line one\nline two',
      'trailing space ',
      ' leading space',
      '{flow: map}',
      '[flow, seq]',
      '*anchor',
      '&ref',
      'yes',
      'null',
      '123',
      '@at',
      '`backtick`',
      'tab\tinside',
    ),
    weight: 2,
  },
);

function arbParamsForDefinition(def: ItemDefinition): fc.Arbitrary<Record<string, unknown>> {
  const entries = def.fields.map(
    (f) => fc.tuple(fc.constant(f.key), arbValueForField(f)) as fc.Arbitrary<[string, unknown]>,
  );
  return fc.tuple(...entries).map((pairs) => Object.fromEntries(pairs));
}

const DEFINITIONS = getAllDefinitions();

interface PlannedItem {
  type: string;
  params: Record<string, unknown>;
  comment?: string;
}

/**
 * Comments are stored trim-normalized (each line trimmed, blank lines dropped)
 * by SpecDocument, then emitted one `# <line>` per line. We mix plain text with
 * YAML-hostile characters and multi-line comments so both the per-line quoting
 * and the multi-line join/split (Finding 3) get exercised. We avoid lines that
 * are pure whitespace so the normalized form is non-empty and stable.
 */
const arbCommentLine: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,20}$/).filter((s) => s.trim().length > 0),
  fc.constantFrom(
    'has # a hash',
    'colon: separated',
    "an apostrophe's note",
    'quote " here',
    '- looks like a list item',
    'note: x # y',
    '{flow} [seq] *anchor',
  ),
);

const arbComment: fc.Arbitrary<string> = fc
  .array(arbCommentLine, { minLength: 1, maxLength: 3 })
  .map((lines) => lines.join('\n'));

const arbPlannedItem: fc.Arbitrary<PlannedItem> = fc
  .constantFrom(...DEFINITIONS.map((d) => d.type))
  .chain((type) => {
    const def = getDefinition(type) as ItemDefinition;
    return fc.record({
      type: fc.constant(type),
      params: arbParamsForDefinition(def),
      comment: fc.option(arbComment, { nil: undefined }),
    });
  });

const arbPlannedDoc: fc.Arbitrary<PlannedItem[]> = fc.array(arbPlannedItem, {
  minLength: 0,
  maxLength: 8,
});

function buildDoc(plan: PlannedItem[]): SpecDocument {
  const doc = new SpecDocument();
  for (const p of plan) {
    const def = getDefinition(p.type) as ItemDefinition;
    const item = doc.addItem(def.kind, p.type);
    doc.updateItem(item.id, { params: p.params, comment: p.comment });
  }
  return doc;
}

function normalizeItem(item: SpecItem): unknown {
  return {
    kind: item.kind,
    type: item.type,
    params: item.params,
    comment: item.comment ?? null,
  };
}

function normalize(state: Readonly<SpecDocumentState>): unknown {
  return {
    constraints: state.constraints.map(normalizeItem),
    directives: state.directives.map(normalizeItem),
  };
}

describe('SpecDocument — round-trip property', () => {
  it('fromYaml(toYaml(doc)) is semantically identical for random API-built docs', () => {
    fc.assert(
      fc.property(arbPlannedDoc, (plan) => {
        const doc = buildDoc(plan);
        const yaml = doc.toYaml();
        const reparsed = SpecDocument.fromYaml(yaml);
        expect(normalize(reparsed.getState())).toEqual(normalize(doc.getState()));
      }),
      { numRuns: 300 },
    );
  });

  it('emitted YAML is always readable by the authoritative parseLayoutSpec', () => {
    // The property is about WELL-FORMEDNESS: the codec must never emit YAML
    // the engine cannot read (quoting/structure bugs). The engine ALSO
    // rejects semantically contradictory specs at parse time (e.g. two
    // cyclic constraints on one selector with different directions —
    // "Inconsistent cyclic constraint…"); the document model deliberately
    // permits those mid-edit and surfaces them as diagnostics instead
    // (validateState's cyclic-consistency check). Such semantic rejections
    // are therefore acceptable outcomes here; any OTHER throw is a real
    // codec bug.
    fc.assert(
      fc.property(arbPlannedDoc, (plan) => {
        const doc = buildDoc(plan);
        const yaml = doc.toYaml();
        try {
          parseLayoutSpec(yaml);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/^Inconsistent /.test(msg)) {
            // semantic-consistency rejection: must be visible as a builder
            // diagnostic so the user is warned before the engine ever throws
            expect(
              doc
                .validate()
                .some(
                  (d) =>
                    d.severity === 'error' &&
                    d.message.includes('Inconsistent cyclic directions'),
                ),
            ).toBe(true);
            return;
          }
          throw e;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('serialization is deterministic (idempotent re-serialize)', () => {
    fc.assert(
      fc.property(arbPlannedDoc, (plan) => {
        const yaml = buildDoc(plan).toYaml();
        const again = SpecDocument.fromYaml(yaml).toYaml();
        expect(again).toBe(yaml);
      }),
      { numRuns: 200 },
    );
  });
});
