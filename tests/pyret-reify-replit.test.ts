import { describe, it, expect, vi } from 'vitest';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

/**
 * Tests for the ported reify/replit "recover structure" integration:
 *  - reify() recovers field order from the data instance itself (not live objects)
 *  - sharing (a non-primitive atom referenced twice) is bound once and reused
 *  - cycles (Pyret `ref` fields) become `rec` bindings instead of `/* cycle *​/`
 *  - replit() routes the reified source through the Pyret REPL (torepr)
 *
 * Mirrors spytial-py test_reify.py and caraspace tests/reify.rs.
 */

const norm = (s: unknown): string => String(s).replace(/\s+/g, '');

describe('PyretDataInstance.reify — recover structure', () => {
  it('reifies an acyclic value to a bare expression (no block wrapper)', () => {
    const tree = {
      dict: {
        value: 1,
        left: { dict: { value: 0 }, brands: { '$brandLeaf1': true } },
        right: { dict: { value: 2 }, brands: { '$brandLeaf1': true } },
      },
      brands: { '$brandNode1': true },
    };
    const reified = new PyretDataInstance(tree).reify();

    expect(reified).not.toContain('block:');
    expect(norm(reified)).toBe(norm('Node(1, Leaf(0), Leaf(2))'));
  });

  it('recovers field order from the data instance, not the live object', () => {
    // Simulate a transported / edited instance whose live objects are gone.
    const tree = {
      dict: {
        value: 1,
        left: { dict: { value: 0 }, brands: { '$brandLeaf1': true } },
        right: { dict: { value: 2 }, brands: { '$brandLeaf1': true } },
      },
      brands: { '$brandNode1': true },
    };
    const instance = new PyretDataInstance(tree);
    // Drop the live objects; only the recorded atomFieldOrder remains.
    (instance as unknown as { originalObjects: Map<string, unknown> }).originalObjects = new Map();

    const reified = instance.reify();
    expect(norm(reified)).toBe(norm('Node(1, Leaf(0), Leaf(2))'));
  });

  it('binds a genuinely shared sub-structure once and references it', () => {
    const shared = { dict: { v: 1 }, brands: { '$brandLeaf1': true } };
    const root = { dict: { left: shared, right: shared }, brands: { '$brandPair1': true } };

    const reified = new PyretDataInstance(root).reify();
    const n = norm(reified);

    expect(n).toContain('block:');
    expect(n).toContain('end');
    // exactly one binding for the shared Leaf(1)
    expect(n).toContain('cnd-v-1=Leaf(1)');
    // referenced from both positions of the Pair
    expect(n).toContain('Pair(cnd-v-1,cnd-v-1)');
    // and it really is bound just once
    expect((n.match(/Leaf\(1\)/g) || []).length).toBe(1);
  });

  it('does NOT bind shared primitives (idempotency is not structural sharing)', () => {
    // value 0 is reused by both leaves via number idempotency, but primitives inline.
    const tree = {
      dict: {
        left: { dict: { value: 0 }, brands: { '$brandLeaf1': true } },
        right: { dict: { value: 0 }, brands: { '$brandLeaf1': true } },
      },
      brands: { '$brandNode1': true },
    };
    const reified = new PyretDataInstance(tree).reify();
    expect(reified).not.toContain('block:');
    expect(norm(reified)).toBe(norm('Node(Leaf(0), Leaf(0))'));
  });

  it('emits valid Pyret string literals (escapes backslash, quote, newline, tab, CR)', () => {
    const cases: Array<[string, string]> = [
      ['hello', '"hello"'],
      ['a"b', '"a\\"b"'],
      ['c:\\path', '"c:\\\\path"'],
      ['line1\nline2', '"line1\\nline2"'],
      ['tab\there', '"tab\\there"'],
      ['cr\rhere', '"cr\\rhere"'],
    ];
    for (const [raw, expected] of cases) {
      const instance = new PyretDataInstance({
        dict: { s: raw },
        brands: { '$brandBox1': true },
      });
      // Box("...") — the field value is the escaped string literal.
      expect(instance.reify()).toBe(`Box(${expected})`);
    }
  });

  it('reifies a multi-column table to `table: ... end` syntax', () => {
    // A Pyret table is relationalized as an n-ary `row` relation (each row is a tuple
    // with no source atom at position 0), so reify has no constructor-shaped source
    // and previously emitted just the type name. It should rebuild table syntax.
    const table = {
      dict: {
        '_header-raw-array': ['origin', 'destination'],
        '_rows-raw-array': [
          ['PVD', 'ORD'],
          ['ORD', 'PVD'],
        ],
      },
      brands: { '$brandtable168': true },
    };
    const reified = new PyretDataInstance(table).reify();

    // No bare type-name fallback, and the second column is not dropped.
    expect(reified).not.toContain('table168');
    expect(reified).toContain('destination');
    expect(norm(reified)).toBe(
      norm('table: origin, destination row: "PVD", "ORD" row: "ORD", "PVD" end')
    );
  });

  it('reifies nested raw arrays as nested Pyret lists', () => {
    // The field holds [[1, 2], [3, 4]] wrapped in an outer array. Each nested JS array
    // becomes an intermediate `Array` atom linked via an `element` relation, which
    // previously reified to `Array(...)` instead of a `[list: ...]`.
    const box = {
      dict: { grid: [[[1, 2], [3, 4]]] },
      brands: { '$brandBox1': true },
    };
    const reified = new PyretDataInstance(box).reify();

    expect(reified).not.toContain('Array(');
    expect(norm(reified)).toBe(norm('Box([list: [list: 1, 2], [list: 3, 4]])'));
  });

  it('emits a rec binding for a cyclic value', () => {
    const node: { dict: Record<string, unknown>; brands: Record<string, boolean> } = {
      dict: { val: 1 },
      brands: { '$brandNode1': true },
    };
    node.dict.next = node; // self cycle through a (would-be) ref field

    const reified = new PyretDataInstance(node).reify();
    const n = norm(reified);

    expect(n).toContain('block:');
    expect(n).toContain('reccnd-v-1=Node(1,cnd-v-1)');
    // never falls back to the old non-evaluable placeholder
    expect(reified).not.toContain('/* cycle');
  });
});

describe('PyretDataInstance.replit — REPL-equivalent output', () => {
  const leaf = { dict: { v: 1 }, brands: { '$brandLeaf1': true } };

  it('routes the reified source through torepr on the live evaluator', async () => {
    const run = vi.fn(async (code: string) => ({ answer: `<repl:${code}>` }));
    const instance = new PyretDataInstance(leaf, {}, { run });

    const out = await instance.replit();

    expect(run).toHaveBeenCalledWith('torepr(Leaf(1))');
    expect(out).toBe('<repl:torepr(Leaf(1))>');
  });

  it('falls back to the reified source when no evaluator is wired in', async () => {
    const out = await new PyretDataInstance(leaf).replit();
    expect(out).toBe('Leaf(1)');
  });

  it('falls back to the reified source when evaluation fails', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    const out = await new PyretDataInstance(leaf, {}, { run }).replit();
    expect(out).toBe('Leaf(1)');
  });
});
