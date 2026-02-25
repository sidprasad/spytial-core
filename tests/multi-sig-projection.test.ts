import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { applyProjectionTransform } from '../src/data-instance/projection-transform';

const xml = fs.readFileSync(path.resolve(__dirname, '../sample/forge/datum.xml'), 'utf8');

describe('multi-sig projection with datum.xml', () => {
  const datum = parseAlloyXML(xml);
  const inst = new AlloyDataInstance(datum.instances[0]);

  it('lists types correctly', () => {
    const types = inst.getTypes();
    const typeNames = types.map(t => t.id);
    console.log('Types:', types.map(t => `${t.id} (${t.atoms.length} atoms, builtin=${t.isBuiltin})`));
    expect(typeNames).toContain('Node');
  });

  it('projects over Node alone', () => {
    const sels: Record<string, string> = {};
    const result = applyProjectionTransform(inst, [{ sig: 'Node' }], sels);
    console.log('Project Node choices:', result.choices);
    console.log('  atoms left:', result.instance.getAtoms().map(a => a.id));
    console.log('  relations:', result.instance.getRelations().map(r => `${r.name} (${r.tuples.length} tuples)`));
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].type).toBe('Node');
  });

  it('projects over Int alone', () => {
    const sels: Record<string, string> = {};
    const result = applyProjectionTransform(inst, [{ sig: 'Int' }], sels);
    console.log('Project Int choices:', result.choices);
    console.log('  atoms left:', result.instance.getAtoms().map(a => a.id));
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].type).toBe('Int');
  });

  it('projects over Node + Int simultaneously', () => {
    const sels: Record<string, string> = {};
    const result = applyProjectionTransform(inst, [{ sig: 'Node' }, { sig: 'Int' }], sels);
    console.log('Project Node+Int choices:', result.choices);
    console.log('  selections:', sels);
    console.log('  atoms left:', result.instance.getAtoms().map(a => a.id));
    console.log('  relations:', result.instance.getRelations().map(r => `${r.name} (${r.tuples.length} tuples)`));
    expect(result.choices).toHaveLength(2);

    // Try generating a graph from the projected instance
    const graph = result.instance.generateGraph(false, false);
    console.log('  graph nodes:', graph.nodes().length);
    console.log('  graph edges:', graph.edges().length);
  });
});
