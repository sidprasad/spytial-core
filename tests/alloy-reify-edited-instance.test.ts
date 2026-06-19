// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';

describe('AlloyDataInstance.reify edited atoms/relations', () => {
  const xml = readFileSync(resolve(__dirname, '../sample/forge/gw/datum.xml'), 'utf8');

  it('sanitizes edited atom ids and skips undeclared/editor-only sigs and fields', () => {
    const inst = parseAlloyXML(xml).instances[0];
    const di = new AlloyDataInstance(inst);

    di.addAtom({ id: 'Goat-1', type: 'Goat' });
    di.addAtom({ id: 'Frog-1', type: 'Frog' });
    di.addRelationTuple('custom-field-1', {
      atoms: ['Goat0', 'Goat-1'],
      types: ['Goat', 'Goat']
    });

    const reified = di.reify();

    expect(reified).toContain('Goat = ');
    expect(reified).toContain('`Goat_1');
    expect(reified).not.toContain('`Goat-1');
    expect(reified).not.toMatch(/^Frog =/m);
    expect(reified).not.toMatch(/^Int =/m);
    expect(reified).not.toMatch(/^no no-field-guard$/m);
    expect(reified).not.toMatch(/^custom-field-1 =/m);
    expect(reified).not.toMatch(/^no custom-field-1$/m);
  });
});
