import { describe, it, expect, vi } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';

/**
 * `parseLayoutSpec` returns advisory warnings on the parsed `LayoutSpec` so a
 * direct library consumer can read them off the result — opt-in (ignore the
 * field and nothing changes) and non-breaking (parsing never throws for a
 * warning, and the same messages still go to `console.warn`).
 */
describe('parseLayoutSpec — returned warnings (consumable, non-breaking)', () => {
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
