import { describe, it, expect } from 'vitest';
import {
  SpecDocument,
  parseYamlToState,
  serializeStateToYaml,
  type SpecDocumentState,
  type SpecItem,
} from '../src/spec-editor';
import { parseLayoutSpec } from '../src/layout/layoutspec';

// ---- semantic equality (ignores ids, which are regenerated on parse) ----

function normalizeItem(item: SpecItem): unknown {
  return {
    kind: item.kind,
    type: item.type,
    params: item.params,
    comment: item.comment ?? null,
    raw: item.raw ?? null,
  };
}

function normalizeState(state: Readonly<SpecDocumentState>): unknown {
  return {
    constraints: state.constraints.map(normalizeItem),
    directives: state.directives.map(normalizeItem),
    headerComment: state.headerComment ?? null,
  };
}

function assertRoundTrips(yaml: string): string {
  const first = parseYamlToState(yaml);
  const out = serializeStateToYaml(first);
  const second = parseYamlToState(out);
  expect(normalizeState(second)).toEqual(normalizeState(first));
  return out;
}

// ---- real-world fixtures pulled from demos/tests ----

const BST_SPEC = `constraints:
  - orientation:
      selector: right
      directions:
        - right
        - below
  - orientation:
      selector: left
      directions:
        - left
        - below
directives:
  - attribute:
      field: key
  - flag: hideDisconnectedBuiltIns`;

const FIELD_SELECTORS_SPEC = `directives:
  - edgeColor:
      field: 'name'
      value: 'red'
      selector: 'Person'
      style: 'dashed'
      weight: 2
  - inferredEdge:
      name: 'transitive'
      selector: 'Person->Person'
      color: 'gray'
      style: 'dotted'
      weight: 1.5
  - attribute:
      field: 'age'
      selector: 'Person'
  - hideField:
      field: 'secret'
      selector: 'User'
constraints:
  - group:
      field: 'owns'
      groupOn: 0
      addToGroup: 1
      selector: 'Car'
`;

const TAG_SPEC = `directives:
  - tag:
      toTag: 'Person'
      name: 'status'
      value: 'Person.status'
`;

const GROUP_SELECTOR_SPEC = `constraints:
  - group:
      selector: sameTeam
      name: team
      addEdge: true
`;

describe('yaml-codec — real-world round trips', () => {
  it('round-trips the BST spec (orientation + attribute + flag scalar)', () => {
    const out = assertRoundTrips(BST_SPEC);
    // and the emitted YAML is accepted by the authoritative parser
    expect(() => parseLayoutSpec(out)).not.toThrow();
    const spec = parseLayoutSpec(out);
    expect(spec.constraints.orientation.relative).toHaveLength(2);
    expect(spec.directives.attributes).toHaveLength(1);
    expect(spec.directives.hideDisconnectedBuiltIns).toBe(true);
  });

  it('round-trips field-selector directives + deprecated group-by-field', () => {
    const out = assertRoundTrips(FIELD_SELECTORS_SPEC);
    const spec = parseLayoutSpec(out);
    // edgeColor round-trips through the codec, then desugars to edgeStyle on parse.
    expect(spec.directives.edgeColors).toEqual([]);
    expect(spec.directives.edgeStyles).toHaveLength(1);
    expect(spec.directives.edgeStyles[0].style.lineStyle?.color).toBe('red');
    expect(spec.directives.inferredEdges).toHaveLength(1);
    expect(spec.directives.attributes).toHaveLength(1);
    expect(spec.directives.hiddenFields).toHaveLength(1);
    expect(spec.constraints.grouping.byfield).toHaveLength(1);
  });

  it('round-trips the tag directive (toTag/name/value)', () => {
    const out = assertRoundTrips(TAG_SPEC);
    const spec = parseLayoutSpec(out);
    expect(spec.directives.tags).toHaveLength(1);
    expect(spec.directives.tags[0].toTag).toBe('Person');
    expect(spec.directives.tags[0].name).toBe('status');
    expect(spec.directives.tags[0].value).toBe('Person.status');
  });

  it('round-trips group-by-selector (selector/name/addEdge); legacy addEdge:true → togroup', () => {
    const out = assertRoundTrips(GROUP_SELECTOR_SPEC);
    const spec = parseLayoutSpec(out);
    expect(spec.constraints.grouping.byselector).toHaveLength(1);
    expect(spec.constraints.grouping.byselector[0].name).toBe('team');
    // The legacy boolean `addEdge: true` normalises to the 'togroup' direction.
    expect(spec.constraints.grouping.byselector[0].addEdge).toBe('togroup');
  });

  it('round-trips group-by-selector with addEdge: fromgroup', () => {
    const yaml = `constraints:
  - group:
      selector: sameTeam
      name: team
      addEdge: fromgroup
`;
    const out = assertRoundTrips(yaml);
    const spec = parseLayoutSpec(out);
    expect(spec.constraints.grouping.byselector[0].addEdge).toBe('fromgroup');
  });
});

describe('yaml-codec — flag scalar form', () => {
  it('ingests `- flag: x` as { flag: x } and re-emits the scalar form', () => {
    const state = parseYamlToState('directives:\n  - flag: hideDisconnected\n');
    expect(state.directives[0].type).toBe('flag');
    expect(state.directives[0].params).toEqual({ flag: 'hideDisconnected' });
    const out = serializeStateToYaml(state);
    expect(out).toContain('- flag: hideDisconnected');
    expect(out).not.toContain('flag: {');
  });

  // Regression (Finding 1): a plain identifier flag still uses the bare-scalar
  // fast path; YAML-hostile values must be quoted, survive the round trip
  // exactly, and not inject extra structure.
  it('emits the bare `- flag: value` form for a plain identifier', () => {
    const doc = new SpecDocument();
    const f = doc.addItem('directive', 'flag');
    doc.updateItem(f.id, { params: { flag: 'hideDisconnectedBuiltIns' } });
    const out = doc.toYaml();
    expect(out).toContain('- flag: hideDisconnectedBuiltIns');
    expect(out).not.toContain('flag: {');
  });

  it('round-trips a flag value containing `: ` and `#` without corrupting the document', () => {
    const doc = new SpecDocument();
    const f = doc.addItem('directive', 'flag');
    doc.updateItem(f.id, { params: { flag: 'a: b # c' } });
    const out = doc.toYaml();
    // Document stays parseable (the buggy bare form `- flag: a: b # c` throws).
    const state = parseYamlToState(out);
    expect(state.directives).toHaveLength(1);
    expect(state.directives[0].type).toBe('flag');
    // Value survives exactly.
    expect(state.directives[0].params.flag).toBe('a: b # c');
    // No extra structure smuggled in.
    expect(state.constraints).toHaveLength(0);
    // And the authoritative parser accepts it too.
    expect(() => parseLayoutSpec(out)).not.toThrow();
  });

  it('does not let a newline-bearing flag value inject a top-level key', () => {
    const doc = new SpecDocument();
    const f = doc.addItem('directive', 'flag');
    // The buggy bare form would emit a literal newline, smuggling a
    // `directives: []` top-level key into the document.
    doc.updateItem(f.id, { params: { flag: 'x\ndirectives: []' } });
    const out = doc.toYaml();
    const reparsed = parseLayoutSpec(out);
    void reparsed; // accepted by the authoritative parser
    const state = parseYamlToState(out);
    expect(state.directives).toHaveLength(1);
    expect(state.directives[0].params.flag).toBe('x\ndirectives: []');
    // The smuggled `directives: []` did NOT become a real second directive list
    // (still exactly one directive, no constraints).
    expect(state.constraints).toHaveLength(0);
  });
});

describe('yaml-codec — group disambiguation', () => {
  it('classifies group with `field` as groupfield (deprecated)', () => {
    const state = parseYamlToState(
      'constraints:\n  - group:\n      field: owns\n      groupOn: 0\n      addToGroup: 1\n',
    );
    expect(state.constraints[0].type).toBe('groupfield');
    expect(state.constraints[0].params.field).toBe('owns');
  });

  it('classifies group with only `selector` as groupselector', () => {
    const state = parseYamlToState(
      'constraints:\n  - group:\n      selector: sameTeam\n      name: team\n',
    );
    expect(state.constraints[0].type).toBe('groupselector');
    expect(state.constraints[0].params.selector).toBe('sameTeam');
  });
});

describe('yaml-codec — comment preservation', () => {
  it('preserves a preceding comment line on a constraint', () => {
    const yaml =
      'constraints:\n  # this orients the tree\n  - orientation:\n      selector: parent\n      directions: [below]\n';
    const state = parseYamlToState(yaml);
    expect(state.constraints[0].comment).toBe('this orients the tree');
    const out = serializeStateToYaml(state);
    expect(out).toContain('# this orients the tree');
    // re-parse keeps it
    expect(parseYamlToState(out).constraints[0].comment).toBe('this orients the tree');
  });

  it('captures an inline comment on the item line', () => {
    const yaml =
      'directives:\n  - flag: hideDisconnected # built-ins too noisy\n';
    const state = parseYamlToState(yaml);
    expect(state.directives[0].comment).toBe('built-ins too noisy');
  });

  // Regression (Finding 3): consecutive `#` lines for one item must round-trip
  // as a multi-line comment (joined with `\n`), not be merged onto one line.
  it('round-trips a two-line item comment as one `#` line per line', () => {
    const yaml =
      'constraints:\n  # first line\n  # second line\n  - orientation:\n      selector: parent\n      directions: [below]\n';
    const state = parseYamlToState(yaml);
    // The scanned comment keeps the newline between the two lines.
    expect(state.constraints[0].comment).toBe('first line\nsecond line');

    const out = serializeStateToYaml(state);
    // Serializes to two `#` lines, not a single merged one.
    expect(out).toContain('# first line');
    expect(out).toContain('# second line');
    expect(out).not.toContain('# first line second line');
    const hashLines = out.split('\n').filter((l) => l.trim().startsWith('#'));
    expect(hashLines).toHaveLength(2);

    // Reparse yields the identical comment.
    expect(parseYamlToState(out).constraints[0].comment).toBe(
      'first line\nsecond line',
    );
  });

  it('preserves a header comment block before the first section', () => {
    const yaml =
      '# Layout for binary trees\n# (c) team\n\nconstraints:\n  - cyclic:\n      selector: ring\n      direction: clockwise\n';
    const state = parseYamlToState(yaml);
    expect(state.headerComment).toBe('Layout for binary trees\n(c) team');
    const out = serializeStateToYaml(state);
    expect(out).toContain('# Layout for binary trees');
    expect(out).toContain('# (c) team');
    expect(parseYamlToState(out).headerComment).toBe('Layout for binary trees\n(c) team');
  });
});

describe('yaml-codec — unknown type preservation', () => {
  it('keeps an unknown constraint type verbatim as raw and re-emits it', () => {
    const yaml =
      'constraints:\n  - futureThing:\n      foo: 1\n      bar: [a, b]\n';
    const state = parseYamlToState(yaml);
    expect(state.constraints[0].type).toBe('futureThing');
    expect(state.constraints[0].raw).toEqual({ futureThing: { foo: 1, bar: ['a', 'b'] } });
    const out = serializeStateToYaml(state);
    const reparsed = parseYamlToState(out);
    expect(reparsed.constraints[0].raw).toEqual({
      futureThing: { foo: 1, bar: ['a', 'b'] },
    });
  });

  it('keeps an unknown directive type verbatim', () => {
    const yaml = 'directives:\n  - wibble:\n      x: 9\n';
    const state = parseYamlToState(yaml);
    expect(state.directives[0].type).toBe('wibble');
    expect(state.directives[0].raw).toEqual({ wibble: { x: 9 } });
  });
});

describe('yaml-codec — determinism', () => {
  it('emits byte-identical YAML on repeated serialization of built-API docs', () => {
    const doc = new SpecDocument();
    const o = doc.addItem('constraint', 'orientation');
    doc.updateItem(o.id, { params: { selector: 'parent', directions: ['left', 'below'] } });
    const s = doc.addItem('constraint', 'size');
    doc.updateItem(s.id, { params: { selector: 'Node', width: 120, height: 40 } });
    const a = doc.addItem('directive', 'atomStyle');
    doc.updateItem(a.id, { params: { selector: 'Root', fillStyle: { color: '#ff0000' } } });

    const first = doc.toYaml();
    const second = SpecDocument.fromYaml(first).toYaml();
    expect(second).toBe(first);
    // and the result is engine-valid
    expect(() => parseLayoutSpec(first)).not.toThrow();
  });
});
