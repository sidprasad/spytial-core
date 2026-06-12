import { describe, it, expect } from 'vitest';
import {
  SpecDocument,
  SpecParseError,
  type SpecDocumentState,
} from '../src/spec-editor';

function constraintTypes(state: Readonly<SpecDocumentState>): string[] {
  return state.constraints.map((c) => c.type);
}

describe('SpecDocument — mutations', () => {
  it('addItem seeds params from FieldSpec defaults and appends to the right section', () => {
    const doc = new SpecDocument();
    const cyclic = doc.addItem('constraint', 'cyclic');
    expect(cyclic.kind).toBe('constraint');
    expect(cyclic.type).toBe('cyclic');
    expect(cyclic.params.direction).toBe('clockwise');

    const flag = doc.addItem('directive', 'flag');
    expect(flag.kind).toBe('directive');

    const state = doc.getState();
    expect(state.constraints).toHaveLength(1);
    expect(state.directives).toHaveLength(1);
  });

  it('addItem rejects unknown types and kind mismatches', () => {
    const doc = new SpecDocument();
    expect(() => doc.addItem('constraint', 'nope')).toThrow();
    // flag is a directive, not a constraint
    expect(() => doc.addItem('constraint', 'flag')).toThrow();
  });

  it('updateItem shallow-merges params and can delete a key with undefined', () => {
    const doc = new SpecDocument();
    const item = doc.addItem('constraint', 'orientation');
    doc.updateItem(item.id, { params: { selector: 'parent', directions: ['left'] } });
    expect(doc.getState().constraints[0].params).toEqual({
      selector: 'parent',
      directions: ['left'],
    });

    doc.updateItem(item.id, { params: { directions: undefined } });
    expect(doc.getState().constraints[0].params).toEqual({ selector: 'parent' });
  });

  it('updateItem sets and clears comments', () => {
    const doc = new SpecDocument();
    const item = doc.addItem('directive', 'flag');
    doc.updateItem(item.id, { comment: 'note' });
    expect(doc.getState().directives[0].comment).toBe('note');
    doc.updateItem(item.id, { comment: '' });
    expect(doc.getState().directives[0].comment).toBeUndefined();
  });

  it('removeItem removes by id and is a no-op for unknown ids', () => {
    const doc = new SpecDocument();
    const a = doc.addItem('constraint', 'cyclic');
    doc.addItem('constraint', 'align');
    doc.removeItem('does-not-exist');
    expect(doc.getState().constraints).toHaveLength(2);
    doc.removeItem(a.id);
    expect(constraintTypes(doc.getState())).toEqual(['align']);
  });

  it('moveItem reorders within a section and clamps the index', () => {
    const doc = new SpecDocument();
    const a = doc.addItem('constraint', 'cyclic');
    doc.addItem('constraint', 'align');
    doc.addItem('constraint', 'size');
    doc.moveItem(a.id, 2);
    expect(constraintTypes(doc.getState())).toEqual(['align', 'size', 'cyclic']);
    doc.moveItem(a.id, 999); // clamp — already last, no-op
    expect(constraintTypes(doc.getState())).toEqual(['align', 'size', 'cyclic']);
  });

  it('getState returns a frozen, defensive snapshot', () => {
    const doc = new SpecDocument();
    doc.addItem('constraint', 'cyclic');
    const state = doc.getState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.constraints)).toBe(true);
    expect(Object.isFrozen(state.constraints[0].params)).toBe(true);
  });
});

describe('SpecDocument — undo/redo', () => {
  it('each mutation records exactly one undo step', () => {
    const doc = new SpecDocument();
    expect(doc.canUndo()).toBe(false);

    const a = doc.addItem('constraint', 'cyclic');
    doc.updateItem(a.id, { params: { selector: 'next' } });
    doc.addItem('directive', 'flag');

    expect(doc.canUndo()).toBe(true);
    doc.undo(); // remove flag add
    expect(doc.getState().directives).toHaveLength(0);
    doc.undo(); // revert update
    expect(doc.getState().constraints[0].params.selector).toBeUndefined();
    doc.undo(); // revert add
    expect(doc.getState().constraints).toHaveLength(0);
    expect(doc.canUndo()).toBe(false);
  });

  it('redo replays undone steps; a new mutation clears the redo stack', () => {
    const doc = new SpecDocument();
    doc.addItem('constraint', 'cyclic');
    doc.undo();
    expect(doc.canRedo()).toBe(true);
    doc.redo();
    expect(doc.getState().constraints).toHaveLength(1);

    doc.undo();
    doc.addItem('constraint', 'align');
    expect(doc.canRedo()).toBe(false);
  });

  it('a no-op move does not record an undo step', () => {
    const doc = new SpecDocument();
    const a = doc.addItem('constraint', 'cyclic');
    const undoDepthBefore = doc.canUndo();
    expect(undoDepthBefore).toBe(true);
    doc.moveItem(a.id, 0); // already at index 0
    // exactly the add is still on the stack; undo it and there's nothing left
    doc.undo();
    expect(doc.canUndo()).toBe(false);
  });
});

describe('SpecDocument — events', () => {
  it('subscribe is notified on each mutation and unsubscribe stops it', () => {
    const doc = new SpecDocument();
    const seen: number[] = [];
    const unsub = doc.subscribe((s) => seen.push(s.constraints.length));

    doc.addItem('constraint', 'cyclic');
    doc.addItem('constraint', 'align');
    expect(seen).toEqual([1, 2]);

    unsub();
    doc.addItem('constraint', 'size');
    expect(seen).toEqual([1, 2]);
  });

  it('undo/redo also emit events', () => {
    const doc = new SpecDocument();
    doc.addItem('constraint', 'cyclic');
    const seen: number[] = [];
    doc.subscribe((s) => seen.push(s.constraints.length));
    doc.undo();
    doc.redo();
    expect(seen).toEqual([0, 1]);
  });
});

describe('SpecDocument — replaceFromYaml', () => {
  it('replaces state from valid YAML as a single undo step', () => {
    const doc = new SpecDocument();
    doc.addItem('constraint', 'cyclic');
    doc.replaceFromYaml(
      'constraints:\n  - orientation:\n      selector: parent\n      directions: [left]\n',
    );
    expect(constraintTypes(doc.getState())).toEqual(['orientation']);
    doc.undo();
    expect(constraintTypes(doc.getState())).toEqual(['cyclic']);
  });

  it('throws SpecParseError with line/column and does NOT mutate state', () => {
    const doc = new SpecDocument();
    doc.addItem('constraint', 'cyclic');
    const before = doc.toYaml();
    let err: unknown;
    try {
      doc.replaceFromYaml('constraints:\n  - orientation: {\n');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SpecParseError);
    expect((err as SpecParseError).line).toBeGreaterThan(0);
    // state untouched
    expect(doc.toYaml()).toBe(before);
    expect(doc.canUndo()).toBe(true); // only the original add
  });
});

describe('SpecDocument.fromYaml', () => {
  it('throws SpecParseError on malformed YAML', () => {
    expect(() => SpecDocument.fromYaml('constraints:\n  - : : :')).toThrow(
      SpecParseError,
    );
  });

  it('parses an empty string to an empty document', () => {
    const doc = SpecDocument.fromYaml('');
    expect(doc.getState().constraints).toHaveLength(0);
    expect(doc.getState().directives).toHaveLength(0);
    expect(doc.toYaml()).toBe('');
  });
});

describe('SpecDocument — duplicateItem (PR review regression)', () => {
  it('duplicates params/comment with a fresh id, adjacent to the original', () => {
    const doc = new SpecDocument();
    const a = doc.addItem('constraint', 'cyclic');
    doc.updateItem(a.id, {
      params: { selector: 'ring', direction: 'clockwise' },
      comment: 'a note',
    });
    const b = doc.addItem('constraint', 'align');

    const copy = doc.duplicateItem(a.id)!;
    expect(copy).not.toBeNull();
    expect(copy.id).not.toBe(a.id);
    expect(copy.params).toEqual({ selector: 'ring', direction: 'clockwise' });
    expect(copy.comment).toBe('a note');

    // placed directly after the original, before unrelated items
    const ids = doc.getState().constraints.map((i) => i.id);
    expect(ids).toEqual([a.id, copy.id, b.id]);
  });

  it('is undone by a SINGLE undo step (was three: add + update + move)', () => {
    const doc = new SpecDocument();
    const a = doc.addItem('constraint', 'cyclic');
    doc.updateItem(a.id, { params: { selector: 'ring', direction: 'clockwise' } });
    const before = doc.toYaml();

    doc.duplicateItem(a.id);
    expect(doc.getState().constraints).toHaveLength(2);

    doc.undo();
    expect(doc.getState().constraints).toHaveLength(1);
    expect(doc.toYaml()).toBe(before);
  });

  it('returns null for an unknown id without recording history', () => {
    const doc = new SpecDocument();
    const canUndoBefore = doc.canUndo();
    expect(doc.duplicateItem('nope')).toBeNull();
    expect(doc.canUndo()).toBe(canUndoBefore);
  });
});
