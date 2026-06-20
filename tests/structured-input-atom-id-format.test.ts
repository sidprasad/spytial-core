// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mirror the lightweight parent-class mock from structured-input-state-sync: the real
// WebColaCnDGraph pulls in the full web-component / layout stack, which is irrelevant
// to atom-id minting.
vi.mock('../src/translators/webcola/webcola-cnd-graph', () => ({
  WebColaCnDGraph: class {
    shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    constructor() {}
    addEventListener() {}
    dispatchEvent() { return true; }
    setAttribute() {}
    async renderLayout() { return Promise.resolve(); }
    protected rerenderGraph() {}
  }
}));

import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';

const FORGE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

describe('StructuredInputGraph.generateAtomId (issue #480 B1)', () => {
  const xml = readFileSync(resolve(__dirname, '../sample/forge/gw/datum.xml'), 'utf8');

  function makeGraph() {
    const di = new AlloyDataInstance(parseAlloyXML(xml).instances[0]);
    const graph = new StructuredInputGraph(di);
    return { di, graph };
  }

  it('mints ids that are valid Forge identifiers with no hyphen', () => {
    const { graph } = makeGraph();
    const id = (graph as any).generateAtomId('Goat');
    expect(id).not.toContain('-');
    expect(id).toMatch(FORGE_IDENTIFIER);
  });

  it('does not collide with existing Alloy atoms of the same sig', () => {
    const { di, graph } = makeGraph();
    const existing = new Set(di.getAtoms().map(a => a.id));
    const id = (graph as any).generateAtomId('Goat');
    expect(existing.has(id)).toBe(false);
  });

  it('a minted id round-trips through reify() as a valid backtick atom literal', () => {
    const { di, graph } = makeGraph();
    const id = (graph as any).generateAtomId('Goat');
    di.addAtom({ id, type: 'Goat' });

    const reified = di.reify();
    // Emitted as `<id> with no stray separator Forge would read as subtraction.
    expect(reified).toContain(`\`${id}`);
    expect(reified).not.toMatch(/`Goat-\d/);
  });
});
