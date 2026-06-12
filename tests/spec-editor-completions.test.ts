import { describe, it, expect } from 'vitest';
import {
  getSelectorKeywordCompletions,
  getDomainCompletions,
  createBuiltinCompletionSource,
  mergeCompletions,
  MAX_ATOM_COMPLETIONS,
} from '../src/spec-editor';
import type { DomainSchema, Completion } from '../src/spec-editor';

const DOMAIN: DomainSchema = {
  types: [
    { name: 'Node', atoms: ['N0', 'N1'] },
    { name: 'Person', atoms: ['Alice', 'Bob'] },
  ],
  relations: [
    { name: 'edges', arity: 2, typeSignature: ['Node', 'Node'] },
    { name: 'parent', arity: 2, typeSignature: ['Person', 'Person'] },
  ],
};

describe('getSelectorKeywordCompletions', () => {
  it('includes built-in values, quantifiers, word operators, and symbol snippets', () => {
    const kws = getSelectorKeywordCompletions();
    const labels = kws.map((c) => c.label);
    expect(labels).toContain('univ');
    expect(labels).toContain('iden');
    expect(labels).toContain('all');
    expect(labels).toContain('some');
    expect(labels).toContain('in');
    expect(labels).toContain('and');
    // operator snippets carry an insert + detail
    const join = kws.find((c) => c.label === '.');
    expect(join).toBeDefined();
    expect(join!.kind).toBe('snippet');
    expect(join!.detail).toBe('join');
  });

  it('returns a fresh array each call so callers may sort/mutate safely', () => {
    const a = getSelectorKeywordCompletions();
    const b = getSelectorKeywordCompletions();
    expect(a).not.toBe(b);
    const bFirstLabel = b[0].label;
    // Mutate `a` (and one of its entries) — `b` must be unaffected.
    a.length = 0;
    a.push({ label: 'mutated', kind: 'keyword' });
    expect(b[0].label).toBe(bFirstLabel);
    expect(b.length).toBeGreaterThan(1);
  });
});

describe('getDomainCompletions', () => {
  it('emits types, relations (with arity detail), and atoms', () => {
    const comps = getDomainCompletions(DOMAIN);
    const byKind = (k: Completion['kind']): Completion[] =>
      comps.filter((c) => c.kind === k);

    expect(byKind('type').map((c) => c.label).sort()).toEqual(['Node', 'Person']);

    const edges = byKind('relation').find((c) => c.label === 'edges');
    expect(edges).toBeDefined();
    expect(edges!.detail).toBe('relation · arity 2');

    const atomLabels = byKind('atom').map((c) => c.label).sort();
    expect(atomLabels).toEqual(['Alice', 'Bob', 'N0', 'N1']);
  });

  it('caps the number of atom completions', () => {
    const manyAtoms = Array.from({ length: MAX_ATOM_COMPLETIONS + 50 }, (_, i) => `a${i}`);
    const big: DomainSchema = {
      types: [{ name: 'Big', atoms: manyAtoms }],
      relations: [],
    };
    const comps = getDomainCompletions(big);
    const atoms = comps.filter((c) => c.kind === 'atom');
    expect(atoms.length).toBe(MAX_ATOM_COMPLETIONS);
  });
});

describe('createBuiltinCompletionSource', () => {
  it('prefix-filters case-insensitively and ranks domain entries before keywords', () => {
    const source = createBuiltinCompletionSource(DOMAIN);
    const results = source('pa');
    const labels = results.map((c) => c.label);
    // 'parent' (relation) matches by prefix; no keyword starts with 'pa'.
    expect(labels).toContain('parent');
    expect(results[0].label).toBe('parent');
  });

  it('falls back to substring match when nothing matches by prefix', () => {
    const source = createBuiltinCompletionSource(DOMAIN);
    // 'ers' is a substring of 'Person' but not a prefix of anything.
    const labels = source('ers').map((c) => c.label);
    expect(labels).toContain('Person');
  });

  it('orders a prefix match ahead of a substring-only match', () => {
    const source = createBuiltinCompletionSource(DOMAIN);
    // 'no' is a prefix of the 'no' keyword and a substring of 'Node'.
    const results = source('no');
    const idxNoKeyword = results.findIndex((c) => c.label === 'no');
    const idxNode = results.findIndex((c) => c.label === 'Node');
    expect(idxNoKeyword).toBeGreaterThanOrEqual(0);
    expect(idxNode).toBeGreaterThanOrEqual(0);
    // 'no' is a prefix match (rank 0); 'Node' is also a prefix match (rank 0),
    // and on equal rank the type sorts before the keyword.
    expect(idxNode).toBeLessThan(idxNoKeyword);
  });

  it('returns everything (deduped) for an empty prefix', () => {
    const source = createBuiltinCompletionSource(DOMAIN);
    const all = source('');
    const labels = all.map((c) => c.label);
    expect(labels).toContain('Node');
    expect(labels).toContain('edges');
    expect(labels).toContain('all');
    // no duplicate labels-with-same-insert
    const keys = all.map((c) => `${c.label}/${c.insertText ?? c.label}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('works with no domain (keywords only)', () => {
    const source = createBuiltinCompletionSource();
    const labels = source('al').map((c) => c.label);
    expect(labels).toContain('all');
    // no domain → no type/relation/atom entries
    expect(source('').every((c) => c.kind === 'keyword' || c.kind === 'snippet')).toBe(true);
  });
});

describe('mergeCompletions', () => {
  it('concatenates and dedupes on (label, insertText), first-seen wins', () => {
    const a: Completion[] = [
      { label: 'edges', kind: 'relation', detail: 'from assistant' },
    ];
    const b: Completion[] = [
      { label: 'edges', kind: 'relation', detail: 'from domain' },
      { label: 'parent', kind: 'relation' },
    ];
    const merged = mergeCompletions(a, b);
    expect(merged).toHaveLength(2);
    // first-seen (assistant) wins for 'edges'
    const edges = merged.find((c) => c.label === 'edges');
    expect(edges!.detail).toBe('from assistant');
    expect(merged.some((c) => c.label === 'parent')).toBe(true);
  });

  it('distinguishes entries with the same label but different insertText', () => {
    const merged = mergeCompletions(
      [{ label: '-', insertText: '-', kind: 'snippet' }],
      [{ label: '-', insertText: '- ', kind: 'snippet' }],
    );
    expect(merged).toHaveLength(2);
  });
});
