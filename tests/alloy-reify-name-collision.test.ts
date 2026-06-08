// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';

/**
 * Regression for https://github.com/sidprasad/spytial-core/issues/470
 *
 * Relation NAMES are not unique — only the qualified id (`Sig<:label`) is. The
 * ERTMS Level 3 model opens `util/ordering` twice, producing two fields both
 * named `Next` (`V/Ord<:Next` and `D/Ord<:Next`). reify() keyed the Forge INST
 * by name, so one ordering was silently dropped. The tuples of same-named
 * relations must be unioned, not clobbered.
 */
describe('reify() relation name collision (issue #470)', () => {
  const xml = readFileSync(
    resolve(__dirname, '../sample/alloy-odd-xml/emm3.xml'),
    'utf8'
  );

  it('parses both `Next` relations as distinct (sanity)', () => {
    const inst = parseAlloyXML(xml).instances[0];
    const nextIds = Object.values(inst.relations)
      .filter(r => r.name === 'Next')
      .map(r => r.id)
      .sort();
    expect(nextIds).toEqual(['D/Ord<:Next', 'V/Ord<:Next']);
  });

  it('reify() keeps tuples from every relation sharing a name', () => {
    const inst = parseAlloyXML(xml).instances[0];
    const di = new AlloyDataInstance(inst);

    const nextLine = di
      .reify()
      .split('\n')
      .find(l => l.startsWith('Next ='));
    expect(nextLine).toBeDefined();

    // V/Ord<:Next orders VSS$0..VSS$5; D/Ord<:Next orders TTD$0..TTD$2.
    // Pre-fix only one family appeared. Both must now be present.
    expect(nextLine).toContain('VSS$0->`VSS$1');
    expect(nextLine).toContain('TTD$0->`TTD$1');
  });
});
