import { describe, it, expect } from 'vitest';
import {
  SpecDocument,
  getDefinition,
  getDefinitions,
  defaultParamsFor,
  validateItem,
  type SpecItem,
} from '../src/spec-editor';
import { newId } from '../src/spec-editor';

function item(type: string, params: Record<string, unknown>, kind: 'constraint' | 'directive'): SpecItem {
  return { id: newId(), kind, type, params };
}

describe('registry — definitions and defaults', () => {
  it('exposes every built-in type listed in the design doc', () => {
    const expected = [
      // constraints
      'orientation',
      'cyclic',
      'align',
      'groupselector',
      'groupfield',
      'size',
      'hideAtom',
      // directives
      'flag',
      'attribute',
      'hideField',
      'icon',
      'atomColor',
      'edgeColor',
      'inferredEdge',
      'tag',
    ];
    for (const type of expected) {
      expect(getDefinition(type), `missing definition: ${type}`).toBeDefined();
    }
  });

  it('marks groupfield deprecated and hides it from the add menu', () => {
    expect(getDefinition('groupfield')?.deprecated).toBe(true);
    const menu = getDefinitions('constraint').map((d) => d.type);
    expect(menu).not.toContain('groupfield');
    // but it is included when explicitly requested
    expect(
      getDefinitions('constraint', { includeDeprecated: true }).map((d) => d.type),
    ).toContain('groupfield');
  });

  it('seeds defaults from FieldSpec defaults only', () => {
    expect(defaultParamsFor('cyclic')).toEqual({ direction: 'clockwise' });
    expect(defaultParamsFor('size')).toEqual({ width: 100, height: 60 });
    expect(defaultParamsFor('groupselector')).toEqual({ addEdge: 'none' });
    // orientation has no defaultable fields
    expect(defaultParamsFor('orientation')).toEqual({});
  });
});

describe('registry — summaries (orientation target-relative-to-source semantics)', () => {
  it('orientation reads target <dir> of source', () => {
    const def = getDefinition('orientation')!;
    expect(def.summary({ selector: 'parent', directions: ['left'] })).toBe(
      'target left of source · parent',
    );
    expect(def.summary({ selector: 'parent', directions: ['left', 'above'] })).toBe(
      'target left, above of source · parent',
    );
  });

  it('other constraint/directive summaries are short one-liners', () => {
    expect(getDefinition('cyclic')!.summary({ direction: 'clockwise', selector: 'ring' })).toBe(
      'clockwise · ring',
    );
    expect(getDefinition('size')!.summary({ width: 120, height: 40, selector: 'Node' })).toBe(
      '120×40 · Node',
    );
    expect(
      getDefinition('groupselector')!.summary({ selector: 'sameTeam', name: 'team' }),
    ).toBe('group "team" · sameTeam');
    expect(getDefinition('atomColor')!.summary({ value: '#ff0000', selector: 'Root' })).toBe(
      '#ff0000 · Root',
    );
    expect(getDefinition('tag')!.summary({ toTag: 'Person', name: 'status' })).toBe(
      'status · Person',
    );
  });
});

describe('diagnostics — structural validation', () => {
  it('reports missing required fields as errors', () => {
    const diags = validateItem(item('orientation', {}, 'constraint'));
    const messages = diags.map((d) => d.message);
    expect(diags.every((d) => d.severity === 'error')).toBe(true);
    expect(messages.some((m) => /Selector/.test(m))).toBe(true);
    expect(messages.some((m) => /Directions/.test(m))).toBe(true);
  });

  it('reports unknown enum values as errors', () => {
    const diags = validateItem(
      item('orientation', { selector: 'p', directions: ['sideways'] }, 'constraint'),
    );
    expect(diags.some((d) => d.fieldKey === 'directions' && d.severity === 'error')).toBe(true);
  });

  it('runs per-definition validate() (orientation contradiction)', () => {
    const diags = validateItem(
      item('orientation', { selector: 'p', directions: ['left', 'right'] }, 'constraint'),
    );
    expect(diags.some((d) => /left and right/.test(d.message))).toBe(true);
  });

  it('flags non-positive size dimensions', () => {
    const diags = validateItem(
      item('size', { selector: 'Node', width: 0, height: -3 }, 'constraint'),
    );
    expect(diags.filter((d) => d.severity === 'error').length).toBe(2);
  });

  it('treats unknown types as warnings, not errors', () => {
    const unknown: SpecItem = {
      id: newId(),
      kind: 'constraint',
      type: 'futureThing',
      params: {},
      raw: { futureThing: { x: 1 } },
    };
    const diags = validateItem(unknown);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
  });

  it('SpecDocument.validate aggregates over both sections', () => {
    const doc = new SpecDocument();
    doc.addItem('constraint', 'orientation'); // missing selector + directions
    // flag defaults to a valid choice now (closed enum) — force an off-list
    // value so the directive section also contributes a diagnostic.
    const f = doc.addItem('directive', 'flag');
    doc.updateItem(f.id, { params: { flag: 'notARealFlag' } });
    const diags = doc.validate();
    expect(diags.length).toBeGreaterThanOrEqual(3);
    expect(diags.every((d) => d.source === 'structure')).toBe(true);
    // the off-list flag is called out with the allowed values
    expect(
      diags.some((d) => d.message.includes('notARealFlag')),
    ).toBe(true);
  });

  it('a fully-specified document validates clean', () => {
    const doc = new SpecDocument();
    const o = doc.addItem('constraint', 'orientation');
    doc.updateItem(o.id, { params: { selector: 'parent', directions: ['below'] } });
    expect(doc.validate()).toHaveLength(0);
  });
});

describe('diagnostics — unknown keys (typo detection)', () => {
  it('warns on an unknown top-level key with a did-you-mean', () => {
    // `showLabel` is a near-miss for the icon field `showLabels`.
    const diags = validateItem(item('icon', { path: 'a.svg', showLabel: true }, 'directive'));
    const warn = diags.find((d) => d.message.includes('showLabel'));
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(warn!.source).toBe('structure');
    expect(warn!.message).toContain('Did you mean "showLabels"');
  });

  it('warns on an unknown key inside a nested style block', () => {
    const diags = validateItem(
      item('edgeStyle', { field: 'next', lineStyle: { colour: 'red' } }, 'directive'),
    );
    const warn = diags.find((d) => d.message.includes('colour'));
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(warn!.message).toContain('Line style');
    expect(warn!.message).toContain('Did you mean "color"');
  });

  it('lists valid fields when the unknown key has no near-miss', () => {
    const diags = validateItem(item('atomStyle', { wibble: 1 }, 'directive'));
    const warn = diags.find((d) => d.message.includes('wibble'));
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(warn!.message).not.toContain('Did you mean');
    expect(warn!.message).toContain('Known fields:');
  });

  it('a typo of a required field is reported both ways', () => {
    // `directon` for `directions`: the field is still missing (error) AND the
    // stray key is flagged with the fix (warning) — the warning is the clue.
    const diags = validateItem(
      item('orientation', { selector: 'p', directon: ['left'] }, 'constraint'),
    );
    expect(diags.some((d) => d.severity === 'error' && /Directions/.test(d.message))).toBe(true);
    const warn = diags.find((d) => d.message.includes('directon'));
    expect(warn!.severity).toBe('warning');
    expect(warn!.message).toContain('Did you mean "directions"');
  });

  it('does not flag `hold` on a constraint (negation marker, not a field)', () => {
    const diags = validateItem(
      item('orientation', { selector: 'p', directions: ['left'], hold: 'never' }, 'constraint'),
    );
    expect(diags).toHaveLength(0);
  });

  it('does not flag inferredEdge deprecated inline line keys', () => {
    // color/style/weight/highlight are still parsed (deprecation-warned
    // elsewhere), so they are not "unknown".
    const diags = validateItem(
      item(
        'inferredEdge',
        { name: 'e', selector: 'r', color: '#f00', style: 'dashed', weight: 2 },
        'directive',
      ),
    );
    expect(diags.filter((d) => /Unknown field/.test(d.message))).toHaveLength(0);
  });

  it('does not flag `filter` on attribute/hideField (engine-accepted, not yet a field)', () => {
    const attr = validateItem(
      item('attribute', { field: 'age', filter: 'x.isAdult' }, 'directive'),
    );
    expect(attr.filter((d) => /Unknown field/.test(d.message))).toHaveLength(0);
    const hide = validateItem(
      item('hideField', { field: 'age', filter: 'x.isAdult' }, 'directive'),
    );
    expect(hide.filter((d) => /Unknown field/.test(d.message))).toHaveLength(0);
  });

  it('leaves valid items (including nested blocks) clean', () => {
    const diags = validateItem(
      item(
        'edgeStyle',
        { field: 'next', lineStyle: { color: 'red', pattern: 'dashed' }, showLabel: true },
        'directive',
      ),
    );
    expect(diags).toHaveLength(0);
  });
});
