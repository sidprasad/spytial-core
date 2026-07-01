import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { JSONDataInstance as SourceJSONDataInstance } from '../src/data-instance/json-data-instance';
import { JSONDataInstance, SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

describe('evaluator subpath packaging contract', () => {
  it('re-exports JSONDataInstance from the evaluator entrypoint', () => {
    expect(JSONDataInstance).toBe(SourceJSONDataInstance);
    expect(typeof SGraphQueryEvaluator).toBe('function');
  });

  it('publishes ./evaluator in package exports and files', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.exports['./evaluator'].import.default).toBe('./dist/evaluator.mjs');
    expect(packageJson.exports['./evaluator'].require.default).toBe('./dist/evaluator.js');
    expect(packageJson.files).toContain('dist/evaluator.js');
    expect(packageJson.files).toContain('dist/evaluator.mjs');
    expect(packageJson.files).toContain('dist/evaluator.d.ts');
    expect(packageJson.files).toContain('dist/evaluator.d.mts');
  });

  it('defines a dedicated evaluator tsup config', () => {
    const configText = readFileSync(join(process.cwd(), 'tsup.evaluator.config.ts'), 'utf8');

    expect(configText).toContain("entry: { evaluator: 'src/evaluators/data/sgq-evaluator.ts' }");
    expect(configText).toContain("platform: 'node'");
  });

  it('inlines runtime deps so ./evaluator is a self-contained single file', () => {
    // The evaluator entry must bundle its runtime deps (graphlib + lodash,
    // simple-graph-query) rather than externalize them, so downstream consumers
    // (e.g. spytial-py's headless suggest evaluator) can vendor one .js/.mjs with
    // no sibling node_modules. Read the source config, not the gitignored dist.
    const configText = readFileSync(join(process.cwd(), 'tsup.evaluator.config.ts'), 'utf8');

    const noExternal = configText.match(/noExternal:\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(noExternal).toContain("'graphlib'");
    expect(noExternal).toContain("'simple-graph-query'");
    expect(noExternal).toContain("'lodash'");

    // ...and none of those may be re-externalized (which would undo the bundling).
    const external = configText.match(/(?<!no)external:\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(external).not.toContain("'simple-graph-query'");
    expect(external).not.toContain("'graphlib'");
    expect(external).not.toContain("'lodash'");
  });
});
