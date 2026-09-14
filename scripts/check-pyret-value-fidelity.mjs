/**
 * Optional integration check using an existing built Pyret checkout:
 *   node --import tsx scripts/check-pyret-value-fidelity.mjs /path/to/pyret-lang
 *
 * Real runtime values -> working PyretDataInstance -> JSON -> default
 * JSONDataInstance -> cache-free core reifier -> separately compiled Pyret
 * checks of exact torepr equality. Declarations are supplied only after
 * reification. This supplements the IDE's expression-driven acceptance harness;
 * it does not require an IDE adapter or replace that harness.
 * Outputs and compiler caches go to a temporary directory; the Pyret checkout
 * and its source are not changed. No runtime or compiler is bundled into core.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance.ts';
import { JSONDataInstance } from '../src/data-instance/json-data-instance.ts';
import { replit } from '../src/data-instance/pyret/replit.ts';
async function main() {
  if (!process.argv[2])
    throw new Error(
      'Usage: node --import tsx scripts/check-pyret-value-fidelity.mjs /path/to/built/pyret-lang'
    );
  const root = path.resolve(process.argv[2]);
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), 'spytial-pyret-fidelity-')
  );
  const require = createRequire(root + '/package.json');
  const r = require('requirejs');
  globalThis.requirejs = r;
  r.config({
    nodeRequire: require,
    paths: {
      'pyret-base': root + '/build/phase0',
      jglr: root + '/build/phaseA/js',
      seedrandom: root + '/node_modules/seedrandom/index',
      'js-sha256': root + '/node_modules/js-sha256/src/sha256',
    },
  });
  const [runtime, nums, tokenizer, parser] = await new Promise(
    (resolve, reject) =>
      r(
        [
          'pyret-base/js/runtime',
          'pyret-base/js/js-numbers',
          'pyret-base/js/pyret-tokenizer',
          'pyret-base/js/pyret-parser',
        ],
        (...mods) => resolve(mods),
        reject
      )
  );
  const rt = runtime.makeRuntime({
    stdout: console.log,
    stderr: console.error,
  });
  const box = v =>
    rt.makeDataValue({ v }, { brandCount: 0 }, 'box', () => {}, 1, [false], {
      $fieldNames: ['v'],
    });
  const object = d => rt.makeObject(d);
  const tuple = a => rt.makeTuple(a);
  const shared = object({ z: 1 });
  const fixtures = [];
  for (const literal of [
    '0',
    '5',
    '1/3',
    '0.5',
    '~3.14',
    '~1.5',
    '123456789012345678901234567890',
    '-9007199254740993',
    '123456789012345678901234567891/9007199254740993',
  ]) {
    const value = nums.fromString(literal);
    fixtures.push([literal, value], ['box(' + literal + ')', box(value)]);
  }
  fixtures.push(
    ['nothing', rt.nothing],
    ['box(nothing)', box(rt.nothing)],
    ['{}', object({})],
    ['object', object({ z: 1, a: 2 })],
    ['object nesting', box(object({ x: box(2) }))],
    ['inherited', object({ z: 1 }).extendWith({ a: 2 })],
    [
      'unusual names',
      object({ row: 1, block: 2, source: 3, 'a--b': 4, constructor: 5 }),
    ],
    ['shared object', object({ a: shared, b: shared })],
    ['array empty', []],
    ['array singleton', [1]],
    ['array duplicates', [1, 1]],
    ['array field', box([1, 1])],
    ['tuple', tuple([1, 2])],
    ['tuple singleton', tuple([1])],
    ['tuple field', box(tuple([1, 2]))],
    ['tuple shared', tuple([shared, shared])],
    ['nested', tuple([[rt.nothing, object({})], box([1, 1])])]
  );
  for (let i = 0; i < 40; i++) {
    const value = [
      i % 3,
      i % 3,
      tuple([
        nums.fromString(`${i + 1}/${i + 3}`),
        object({ row: rt.nothing }),
      ]),
    ];
    fixtures.push(['generated-' + i, box(value)]);
  }
  const rows = [];
  for (const [id, value] of fixtures) {
    const A = rt.toReprJS(value, rt.ReprMethods._torepr);
    const original = new PyretDataInstance(value);
    const datum = JSON.parse(
      JSON.stringify({
        atoms: original.getAtoms(),
        relations: original.getRelations(),
        types: original.getTypes(),
      })
    );
    datum.relations.reverse();
    datum.relations.forEach(r => r.tuples.reverse());
    PyretDataInstance.clearGlobalConstructorCache();
    const R = replit(new JSONDataInstance(datum));
    tokenizer.Tokenizer.tokenizeFrom(R);
    if (!parser.PyretGrammar.parse(tokenizer.Tokenizer))
      throw new Error('Invalid generated Pyret: ' + R);
    rows.push({ id, A, R });
  }
  fs.writeFileSync(
    path.join(output, 'report.json'),
    JSON.stringify(rows, null, 2)
  );
  const source =
    'data Box: box(v) end\ncheck:\n' +
    rows
      .map(
        row =>
          '  torepr(' + row.R + ') is ' + replit(new PyretDataInstance(row.A))
      )
      .join('\n') +
    '\nend\n';
  fs.writeFileSync(path.join(output, 'checks.arr'), source);
  console.log(
    'Generated ' +
      rows.length +
      ' checks from real runtime values through default JSON normalization and core reification; all emitted sources parsed.'
  );

  const stdout = execFileSync(
    process.execPath,
    [
      'build/phaseA/pyret.jarr',
      '--run',
      path.join(output, 'checks.arr'),
      '--builtin-js-dir',
      'src/js/trove',
      '--builtin-arr-dir',
      'src/arr/trove',
      '--compiled-dir',
      path.join(output, 'compiled'),
      '--require-config',
      'src/scripts/standalone-configA.json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  fs.writeFileSync(path.join(output, 'evaluation.log'), stdout);
  if (!stdout.includes(`all ${rows.length} tests passed`)) {
    throw new Error(
      `Pyret inspection checks did not all pass. See ${output}/evaluation.log`
    );
  }
  console.log(
    `All ${rows.length} Pyret inspection checks passed. Report: ${output}/report.json`
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
