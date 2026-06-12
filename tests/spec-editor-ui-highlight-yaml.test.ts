/**
 * YAML highlighter for the Code view (`src/spec-editor/ui/highlight-yaml.ts`).
 *
 * The contract mirrors the selector highlighter's: lossless tokenization
 * (concatenated token texts reproduce the input exactly) plus correct kinds
 * for the spec vocabulary — section keys and registry YAML keys are keywords,
 * other mapping keys are plain keys, comments/strings/numbers/booleans get
 * their own kinds.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  tokenizeYaml,
  tokenizeYamlLine,
  yamlTokenClassName,
} from '../src/spec-editor/ui/highlight-yaml';

const SAMPLE = `constraints:
  # the left child sits below-left of its parent
  - orientation: {selector: left, directions: [directlyLeft, below]}
  - group: {selector: 'left + right', name: kids, addEdge: true}
directives:
  - attribute: {field: key}
  - flag: hideDisconnectedBuiltIns
  - size: {selector: Node, width: 40, height: -12.5}
`;

function rejoin(line: string): string {
  return tokenizeYamlLine(line)
    .map((t) => t.text)
    .join('');
}

describe('tokenizeYamlLine — lossless', () => {
  it('reproduces every line of a realistic spec exactly', () => {
    for (const line of SAMPLE.split('\n')) {
      expect(rejoin(line)).toBe(line);
    }
  });

  it('reproduces arbitrary printable lines exactly (property)', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[ -~]{0,80}$/), // printable ASCII incl. quotes/#/:
        (line) => rejoin(line) === line,
      ),
      { numRuns: 300 },
    );
  });
});

describe('tokenizeYamlLine — kinds', () => {
  it('classes section keys and registry YAML keys as typekey', () => {
    const top = tokenizeYamlLine('constraints:');
    expect(top[0]).toMatchObject({ kind: 'typekey', text: 'constraints' });

    const item = tokenizeYamlLine('  - orientation: {selector: left}');
    const kinds = Object.fromEntries(item.map((t) => [t.text, t.kind]));
    expect(kinds['orientation']).toBe('typekey');
    expect(kinds['selector']).toBe('key'); // ordinary mapping key
    expect(kinds['left']).toBe('text'); // value, not a key
    expect(kinds['-']).toBe('punct');
  });

  it('classes comments, strings, numbers and booleans', () => {
    expect(tokenizeYamlLine('# a note')[0]).toMatchObject({
      kind: 'comment',
      text: '# a note',
    });

    const line = tokenizeYamlLine(
      "  - size: {width: 40, height: -12.5, q: 'a: #x', on: true}",
    );
    const byText = Object.fromEntries(line.map((t) => [t.text, t.kind]));
    expect(byText['40']).toBe('number');
    expect(byText['-12.5']).toBe('number');
    expect(byText["'a: #x'"]).toBe('string'); // quoted: no key/comment inside
    expect(byText['true']).toBe('bool');
  });

  it('does not treat a value-position # without leading space as a comment', () => {
    // `#` is the cardinality operator in selector expressions
    const toks = tokenizeYamlLine('  - hideAtom: {selector: x#Node}');
    expect(toks.some((t) => t.kind === 'comment')).toBe(false);
  });
});

describe('tokenizeYaml / yamlTokenClassName', () => {
  it('splits the document into one token list per line', () => {
    const lines = tokenizeYaml(SAMPLE);
    expect(lines).toHaveLength(SAMPLE.split('\n').length);
    expect(
      lines.flat().some((t) => t.kind === 'typekey' && t.text === 'flag'),
    ).toBe(true);
  });

  it('maps kinds onto the themed syn-* classes (plain text gets none)', () => {
    expect(yamlTokenClassName('typekey')).toBe('spytial-ed-syn-keyword');
    expect(yamlTokenClassName('key')).toBe('spytial-ed-syn-relation');
    expect(yamlTokenClassName('comment')).toBe('spytial-ed-syn-comment');
    expect(yamlTokenClassName('text')).toBe('');
  });
});
