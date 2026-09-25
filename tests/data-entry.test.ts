// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

describe('headless data package entry', () => {
  it('imports in a fresh Node process and preserves relation identities', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { JSONDataInstance, relationsByName } from 'spytial-core/data';
      assert.equal(typeof window, 'undefined');
      assert.equal(typeof document, 'undefined');
      const atoms = [{ id: 'a', type: 'Item', label: 'a' }, { id: 'b', type: 'Item', label: 'b' }];
      const instance = new JSONDataInstance({
        atoms,
        types: [{ id: 'Item', types: ['Item'], isBuiltin: false, atoms }],
        relations: [
          { id: 'first', name: 'edge', types: ['Item', 'Item'], tuples: [{ atoms: ['a', 'b'], types: ['Item', 'Item'] }] },
          { id: 'second', name: 'edge', types: ['Item', 'Item'], tuples: [{ atoms: ['b', 'a'], types: ['Item', 'Item'] }] }
        ]
      });
      assert.deepEqual(instance.getErrors(), []);
      assert.equal(instance.getRelations().length, 2);
      assert.equal(relationsByName(instance.getRelations())[0].tuples.length, 2);
      assert.equal(instance.generateGraph().nodeCount(), 2);
      const cjs = createRequire(import.meta.url)('spytial-core/data');
      assert.equal(typeof cjs.JSONDataInstance, 'function');
      console.log('headless data entry passed');
    `], { encoding: 'utf8' });
    expect(output).toContain('headless data entry passed');
  });
});
