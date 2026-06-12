/**
 * WP3 — selector tokenizer.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  tokenizeSelector,
  tokenClassName,
  type Token,
} from '../src/spec-editor/ui/highlight';

const kinds = (toks: Token[]) => toks.map((t) => t.kind);

describe('tokenizeSelector', () => {
  it('is lossless: concatenating token text reproduces the input', () => {
    const inputs = [
      'parent',
      'a -> b',
      'left.child + right.child',
      '~edges',
      'Node <: parent :> Leaf',
      'all n : Node | n in roots',
      '  spaced   out  ',
      'x.y.z',
      '"a string" + iden',
      '-- a comment\nnext',
      '',
    ];
    for (const input of inputs) {
      const toks = tokenizeSelector(input);
      expect(toks.map((t) => t.text).join('')).toBe(input);
    }
  });

  it('produces monotonic, gap-free offsets', () => {
    const toks = tokenizeSelector('a -> b.c');
    for (let i = 1; i < toks.length; i++) {
      expect(toks[i].start).toBe(toks[i - 1].end);
    }
    expect(toks[0].start).toBe(0);
    expect(toks[toks.length - 1].end).toBe('a -> b.c'.length);
  });

  it('classifies keywords vs identifiers', () => {
    const toks = tokenizeSelector('univ none iden parent foo');
    const ids = toks.filter((t) => t.kind !== 'whitespace');
    expect(ids.map((t) => [t.text, t.kind])).toEqual([
      ['univ', 'keyword'],
      ['none', 'keyword'],
      ['iden', 'keyword'],
      ['parent', 'identifier'],
      ['foo', 'identifier'],
    ]);
  });

  it('matches multi-char operators greedily (-> before -)', () => {
    const toks = tokenizeSelector('a->b').filter((t) => t.kind !== 'whitespace');
    expect(toks.map((t) => [t.text, t.kind])).toEqual([
      ['a', 'identifier'],
      ['->', 'operator'],
      ['b', 'identifier'],
    ]);
  });

  it('treats <: and :> as single operators', () => {
    const ops = tokenizeSelector('Node <: r :> Leaf')
      .filter((t) => t.kind === 'operator')
      .map((t) => t.text);
    expect(ops).toEqual(['<:', ':>']);
  });

  it('tokenizes the set/unary operators', () => {
    const ops = tokenizeSelector('+ & - ~ * ^ . #')
      .filter((t) => t.kind === 'operator')
      .map((t) => t.text);
    expect(ops).toEqual(['+', '&', '-', '~', '*', '^', '.', '#']);
  });

  it('tokenizes numbers including decimals', () => {
    const nums = tokenizeSelector('1 + 23.5')
      .filter((t) => t.kind === 'number')
      .map((t) => t.text);
    expect(nums).toEqual(['1', '23.5']);
  });

  it('tokenizes strings with escapes and leaves them intact', () => {
    const toks = tokenizeSelector('"he said \\"hi\\"" + x');
    const str = toks.find((t) => t.kind === 'string');
    expect(str?.text).toBe('"he said \\"hi\\""');
  });

  it('tokenizes -- and // line comments to end of line', () => {
    const toks = tokenizeSelector('a -- trailing\nb');
    expect(kinds(toks)).toContain('comment');
    const comment = toks.find((t) => t.kind === 'comment');
    expect(comment?.text).toBe('-- trailing');
  });

  it('never throws on odd input and never drops chars', () => {
    const weird = '@@@ ))) [[[ ¥ 漢字 \t\n';
    const toks = tokenizeSelector(weird);
    expect(toks.map((t) => t.text).join('')).toBe(weird);
  });
});

describe('tokenClassName', () => {
  it('maps token kinds to syn-* classes; whitespace/punctuation get none', () => {
    expect(tokenClassName('keyword')).toBe('spytial-ed-syn-keyword');
    expect(tokenClassName('operator')).toBe('spytial-ed-syn-operator');
    expect(tokenClassName('string')).toBe('spytial-ed-syn-string');
    expect(tokenClassName('number')).toBe('spytial-ed-syn-number');
    expect(tokenClassName('identifier')).toBe('spytial-ed-syn-identifier');
    expect(tokenClassName('comment')).toBe('spytial-ed-syn-comment');
    expect(tokenClassName('whitespace')).toBeUndefined();
    expect(tokenClassName('punctuation')).toBeUndefined();
  });
});
