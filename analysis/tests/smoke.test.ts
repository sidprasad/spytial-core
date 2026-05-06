/**
 * Smoke test: BST trace through stability vs ignore_history.
 *
 * Headline RQ6.2 prediction: positional drift on persisting nodes is
 * (weakly) smaller under `stability` than under `ignore_history`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import { ignoreHistory, stability } from '../runner/policies';
import {
  runHeadlessLayout,
  positionalConsistency,
  JSONDataInstance,
  parseLayoutSpec,
} from '../runner/metrics';

const REPO_DIR = path.resolve(__dirname, '..');
const TRACE_PATH = path.join(REPO_DIR, 'traces', 'out', 'rbtree-default.trace.json');

beforeAll(() => {
  if (!fs.existsSync(TRACE_PATH)) {
    execSync('python3 -m traces.generate --algorithm rbtree', {
      cwd: REPO_DIR,
      stdio: 'inherit',
    });
  }
});

async function replay(policy: typeof stability) {
  const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf-8'));
  const spec = parseLayoutSpec(trace.spec);
  const positionalsByTransition: number[] = [];

  let prevInstance: JSONDataInstance | undefined;
  let prevPositions: any | undefined;

  for (let i = 0; i < trace.frames.length; i++) {
    const currInstance = new JSONDataInstance(trace.frames[i].instance);
    const result = await runHeadlessLayout(spec, currInstance, {
      policy: i > 0 ? policy : undefined,
      prevInstance: i > 0 ? prevInstance : undefined,
      currInstance: i > 0 ? currInstance : undefined,
      priorPositions: i > 0 ? prevPositions : undefined,
    });
    if (i > 0 && prevPositions) {
      positionalsByTransition.push(positionalConsistency(prevPositions, result.positions));
    }
    prevInstance = currInstance;
    prevPositions = result.positions;
  }
  return positionalsByTransition;
}

describe('RB smoke — stability vs ignore_history', () => {
  it('stability is no worse than ignore_history on aggregate', async () => {
    const stab = await replay(stability);
    const ign = await replay(ignoreHistory);
    expect(stab.length).toBe(ign.length);
    expect(stab.length).toBeGreaterThan(0);
    const stabSum = stab.reduce((a, b) => a + b, 0);
    const ignSum = ign.reduce((a, b) => a + b, 0);
    expect(
      stabSum,
      `stability total drift ${stabSum.toFixed(0)} should be <= ignoreHistory total ${ignSum.toFixed(0)}`
    ).toBeLessThanOrEqual(ignSum);
  }, 60_000);
});
