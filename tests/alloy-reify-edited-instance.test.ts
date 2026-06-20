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

  it('drops tuples on a declared field that reference atoms of a dropped sig (no dangling ref)', () => {
    const inst = parseAlloyXML(xml).instances[0];
    const di = new AlloyDataInstance(inst);

    // `gw` is a declared field (GWPosition -> GWAnimal). Wire it to an atom of the
    // undeclared sig `Frog`: the sig is dropped, so the tuple must be dropped too —
    // otherwise the inst dangles (`...->`Frog_9` with no `Frog = ...`).
    di.addAtom({ id: 'Frog-9', type: 'Frog' });
    di.addRelationTuple('gw', {
      atoms: ['GWNear0', 'Frog-9'],
      types: ['GWPosition', 'Frog']
    });

    const reified = di.reify();

    // No Frog sig declaration, and crucially no reference to a Frog atom anywhere.
    expect(reified).not.toMatch(/^Frog\s*=/m);
    expect(reified).not.toContain('Frog');
    // Every emitted backtick atom literal must have a sig that declares it.
    const declared = new Set<string>();
    for (const line of reified.split('\n')) {
      const m = line.match(/^[^=]+=\s*(.*)$/);
      if (!m) continue;
      // collect LHS declarations of the form `Sig = `atom+`atom...`
      if (!/->/.test(line) && /^[A-Za-z]/.test(line)) {
        for (const a of m[1].matchAll(/`([A-Za-z0-9_$]+)/g)) declared.add(a[1]);
      }
    }
    // Pull every atom referenced inside relation tuples and assert it's declared.
    for (const line of reified.split('\n')) {
      if (!/->/.test(line)) continue;
      for (const a of line.matchAll(/`([A-Za-z0-9_$]+)/g)) {
        expect(declared.has(a[1])).toBe(true);
      }
    }
  });
});
