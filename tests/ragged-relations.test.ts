import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import type { IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { SQLEvaluator } from '../src/evaluators/data/sql-evaluator';
import type { EvaluationContext } from '../src/evaluator-contracts';

/**
 * A relation may be RAGGED: one name holding tuples of different arity.
 *
 * Host languages hand us this routinely. Two unrelated Python classes can both
 * have a `foo` field, one holding pairs and one holding triples; both are the
 * relation `foo`. Alloy arrives at the same place with two sigs that each
 * declare a field `foo` — different ids (`A<:foo`, `B<:foo`), one name.
 *
 * These tests pin the permissive contract: the name is the relation, every
 * tuple survives, arity lives on the tuple, and `IRelation.types` is only a
 * summary that goes empty when the tuples disagree.
 */

/** Two relations, both named `foo`: `A -> B` and `B -> C -> D`. */
function raggedFoo(): IJsonDataInstance {
  return {
    atoms: [
      { id: 'a1', type: 'A', label: 'a1' },
      { id: 'b1', type: 'B', label: 'b1' },
      { id: 'c1', type: 'C', label: 'c1' },
      { id: 'd1', type: 'D', label: 'd1' },
    ],
    relations: [
      { id: 'A<:foo', name: 'foo', types: ['A', 'B'], tuples: [{ atoms: ['a1', 'b1'], types: ['A', 'B'] }] },
      { id: 'B<:foo', name: 'foo', types: ['B', 'C', 'D'], tuples: [{ atoms: ['b1', 'c1', 'd1'], types: ['B', 'C', 'D'] }] },
    ],
  } as IJsonDataInstance;
}

function foo(instance: JSONDataInstance) {
  return instance.getRelations().find(r => r.name === 'foo')!;
}

describe('ragged relations: the data instance', () => {
  it('merges two same-named relations and keeps every tuple', () => {
    const relation = foo(new JSONDataInstance(raggedFoo()));

    expect(relation.tuples).toHaveLength(2);
    expect(relation.tuples.map(t => t.atoms)).toEqual([
      ['a1', 'b1'],
      ['b1', 'c1', 'd1'],
    ]);
  });

  it('carries no column signature once the tuples disagree on width', () => {
    // `[]` is IRelation.types' "no shared signature" value. Anything else —
    // notably the first tuple's width — claims a shape only some tuples have.
    expect(foo(new JSONDataInstance(raggedFoo())).types).toEqual([]);
  });

  it('leaves each tuple holding its own signature', () => {
    const tuples = foo(new JSONDataInstance(raggedFoo())).tuples;

    expect(tuples[0].types).toEqual(['A', 'B']);
    expect(tuples[1].types).toEqual(['B', 'C', 'D']);
  });

  it('still summarises a relation whose tuples do agree', () => {
    const uniform = new JSONDataInstance({
      atoms: [
        { id: 'a1', type: 'A', label: 'a1' },
        { id: 'b1', type: 'B', label: 'b1' },
        { id: 'b2', type: 'B', label: 'b2' },
      ],
      relations: [
        { id: 'foo', name: 'foo', types: [], tuples: [{ atoms: ['a1', 'b1'] }, { atoms: ['a1', 'b2'] }] },
      ],
    } as unknown as IJsonDataInstance);

    expect(foo(uniform).types).toEqual(['A', 'B']);
  });

  it('draws an edge for every tuple, wide ones included', () => {
    const graph = new JSONDataInstance(raggedFoo()).generateGraph(false, false);

    // Each tuple is drawn on its own: first atom to last atom.
    expect(graph.edges().map(e => [e.v, e.w])).toEqual([
      ['a1', 'b1'],
      ['b1', 'd1'],
    ]);
  });
});

describe('ragged relations: selectors', () => {
  const evaluatorFor = (instance: JSONDataInstance) => {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance } as unknown as EvaluationContext);
    return evaluator;
  };

  it('resolves the name to every tuple under it', () => {
    const result = evaluatorFor(new JSONDataInstance(raggedFoo())).evaluate('foo');

    expect(result.isError()).toBe(false);
    expect(result.selectedTuplesAll()).toEqual([
      ['a1', 'b1'],
      ['b1', 'c1', 'd1'],
    ]);
    expect(result.maxArity()).toBe(3);
  });

  it('joins at the width of the tuple it hits, not the relation', () => {
    const evaluator = evaluatorFor(new JSONDataInstance(raggedFoo()));

    expect(evaluator.evaluate('a1.foo').prettyPrint()).toBe('b1');
    expect(evaluator.evaluate('b1.foo').prettyPrint()).toBe('c1->d1');
  });

  it('lets a constraint take the part of a mixed result it can use', () => {
    const result = evaluatorFor(new JSONDataInstance(raggedFoo())).evaluate('foo');

    // Nothing here is arity 1, and the wide tuple reduces to (first, last) —
    // the same reduction generateGraph uses when it draws that tuple.
    expect(result.selectedAtoms()).toEqual([]);
    expect(result.selectedTwoples()).toEqual([['a1', 'b1'], ['b1', 'd1']]);
  });
});

describe('ragged relations: SQL (known gap)', () => {
  it('skips the relation and says so, rather than truncating its wide tuples', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const evaluator = new SQLEvaluator();

    await evaluator.initialize({ sourceData: new JSONDataInstance(raggedFoo()) } as unknown as EvaluationContext);

    expect(evaluator.getTableSchemas().map(s => s.name)).not.toContain('foo');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('foo'));
    warn.mockRestore();
  });
});
