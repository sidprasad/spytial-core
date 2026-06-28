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
    expect(configText).toContain("'simple-graph-query'");
  });
});
