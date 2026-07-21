import { describe, it, expect, vi } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';

/**
 * `parseLayoutSpec` returns advisory warnings on the parsed `LayoutSpec` so a
 * direct library consumer can read them off the result — opt-in (ignore the
 * field and nothing changes) and non-breaking (parsing never throws for a
 * warning, and the same messages still go to `console.warn`).
 */
describe('parseLayoutSpec — returned warnings (consumable, non-breaking)', () => {
  it('surfaces atomColor deprecation on spec.warnings AND still parses the directive', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spec = parseLayoutSpec("directives:\n  - atomColor: { selector: Node, value: '#ff0000' }");
    warn.mockRestore();

    const deprecations = (spec.warnings ?? []).filter((w) => w.code === 'deprecated');
    expect(deprecations.length).toBeGreaterThan(0);
    expect(deprecations.some((w) => w.message.includes('atomColor'))).toBe(true);
    // The spec is fully usable — atomColor desugared into an atomStyle rule.
    expect(spec.directives.atomStyles.length).toBeGreaterThan(0);
  });

  it('surfaces edgeColor deprecation on spec.warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spec = parseLayoutSpec("directives:\n  - edgeColor: { field: left, value: '#111111' }");
    warn.mockRestore();

    expect(
      (spec.warnings ?? []).some((w) => w.code === 'deprecated' && w.message.includes('edgeColor')),
    ).toBe(true);
  });

  it('keeps warnings empty (defined, not undefined) for a clean spec', () => {
    const spec = parseLayoutSpec(
      'constraints:\n  - orientation: { selector: parent, directions: [left] }',
    );
    expect(spec.warnings).toEqual([]);
    expect(spec.constraints.orientation.relative.length).toBe(1);
  });

  it('returns empty warnings for the default (empty) spec', () => {
    expect(parseLayoutSpec('').warnings).toEqual([]);
  });
});
