import { describe, it, expect } from 'vitest';
import {
  parseYamlToState,
  validateState,
  positionDiagnostics,
  lintYaml,
} from '../src/spec-editor';

/** The substring an editor would squiggle for a positioned diagnostic. */
function span(yaml: string, d: { from?: number; to?: number }): string {
  if (d.from === undefined || d.to === undefined) return '';
  return yaml.slice(d.from, d.to);
}

describe('code-positioning — resolve diagnostic ranges from YAML', () => {
  it('anchors an unknown field key to that exact token', () => {
    const yaml = 'directives:\n  - icon:\n      path: a.svg\n      showLabel: true\n';
    const state = parseYamlToState(yaml);
    const positioned = positionDiagnostics(yaml, state, validateState(state));
    const unknown = positioned.find((d) => d.code === 'unknown-key');
    expect(unknown).toBeDefined();
    expect(span(yaml, unknown!)).toBe('showLabel');
  });

  it('anchors a nested-block typo to the nested key', () => {
    const yaml =
      'directives:\n  - edgeStyle:\n      field: next\n      lineStyle:\n        colour: red\n';
    const state = parseYamlToState(yaml);
    const positioned = positionDiagnostics(yaml, state, validateState(state));
    const unknown = positioned.find((d) => d.code === 'unknown-key');
    expect(unknown).toBeDefined();
    expect(span(yaml, unknown!)).toBe('colour');
  });

  it('anchors a deprecation (no fieldKey) to the item type key', () => {
    const yaml = "directives:\n  - atomColor:\n      selector: Node\n      value: '#f00'\n";
    const state = parseYamlToState(yaml);
    const positioned = positionDiagnostics(yaml, state, validateState(state));
    const dep = positioned.find((d) => d.code === 'deprecated');
    expect(dep).toBeDefined();
    expect(span(yaml, dep!)).toBe('atomColor');
  });

  it('falls back to the item type key when the required field is absent', () => {
    // `directions` is required and missing → its key isn't in the text, so the
    // squiggle lands on the item type (`orientation`) instead of nowhere.
    const yaml = 'constraints:\n  - orientation:\n      selector: parent\n';
    const state = parseYamlToState(yaml);
    const positioned = positionDiagnostics(yaml, state, validateState(state));
    const missing = positioned.find((d) => d.code === 'missing-required');
    expect(missing).toBeDefined();
    expect(span(yaml, missing!)).toBe('orientation');
  });

  it('resolves the second item independently of the first (index-correct)', () => {
    const yaml =
      'directives:\n  - icon:\n      path: a.svg\n  - icon:\n      path: b.svg\n      showLabel: true\n';
    const state = parseYamlToState(yaml);
    const positioned = positionDiagnostics(yaml, state, validateState(state));
    const unknown = positioned.find((d) => d.code === 'unknown-key');
    expect(unknown).toBeDefined();
    // There is exactly one `showLabel`, on the second icon — the range must land there.
    expect(span(yaml, unknown!)).toBe('showLabel');
    expect(unknown!.from).toBe(yaml.indexOf('showLabel'));
  });

  it('lintYaml self-contains parse+validate+position (ranges always resolve)', () => {
    const yaml =
      '{directives: [{atomColor: {selector: Node, value: "#ff0000"}}, {icon: {path: a.svg, showLabel: true}}]}';
    const linted = lintYaml(yaml);
    const dep = linted.find((d) => d.code === 'deprecated');
    const unknown = linted.find((d) => d.code === 'unknown-key');
    // Both resolve to exact tokens — no drift, because state + diagnostics come
    // from the same parse of `yaml`.
    expect(span(yaml, dep!)).toBe('atomColor');
    expect(span(yaml, unknown!)).toBe('showLabel');
  });

  it('lintYaml reports a syntax error with a location', () => {
    const linted = lintYaml('constraints:\n  - orientation: {directions: [below]');
    expect(linted.length).toBeGreaterThan(0);
    expect(linted[0].severity).toBe('error');
    expect(linted[0].from).toBeGreaterThanOrEqual(0);
  });

  it('lintYaml returns nothing for empty text', () => {
    expect(lintYaml('')).toEqual([]);
    expect(lintYaml('   \n  ')).toEqual([]);
  });

  it('every positioned range is within bounds and matches its diagnostic', () => {
    const yaml = 'directives:\n  - icon:\n      path: a.svg\n      wibble: 1\n';
    const state = parseYamlToState(yaml);
    const positioned = positionDiagnostics(yaml, state, validateState(state));
    for (const d of positioned) {
      if (d.from === undefined || d.to === undefined) continue;
      expect(d.from).toBeGreaterThanOrEqual(0);
      expect(d.to).toBeLessThanOrEqual(yaml.length);
      expect(d.to).toBeGreaterThanOrEqual(d.from);
    }
  });
});
