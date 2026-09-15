/**
 * Optional integration check using an existing built Pyret checkout:
 *   node --import tsx scripts/check-pyret-value-fidelity.mjs /path/to/pyret-lang
 *
 * Real runtime values -> working PyretDataInstance -> JSON -> default
 * JSONDataInstance -> cache-free core reifier -> separately compiled Pyret
 * checks of exact torepr equality and reference topology. Declarations are supplied only after
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
import { readFieldId } from '../src/data-instance/pyret/identity.ts';

// Use the checkout's compiled builtins to construct actual Set values, including
// their _output methods. These modules are available only to the test producer;
// the reifier below receives ordinary serialized atoms/relations/types.
async function loadSets(root, rt, requirejs) {
  const compiled = path.join(root, 'build/phaseA/compiled');
  const files = fs.readdirSync(compiled);
  const modules = {}, dependencies = {}, order = [];
  function visit(name) {
    const uri = 'builtin://' + name;
    if (modules[uri]) return;
    const matches = files.filter(f => f.startsWith(name + '-')
      && /^[a-f0-9]{64}(?:-module)?\.js$/.test(f.slice(name.length + 1)));
    if (matches.length !== 1) throw new Error(`Expected one compiled builtin ${name}, found ${matches.length}`);
    // Compiled Pyret modules are JS expressions, as in Pyret's own loader.
    const mod = (0, eval)(fs.readFileSync(path.join(compiled, matches[0]), 'utf8'));
    modules[uri] = mod;
    dependencies[uri] = {};
    for (const dep of mod.requires) {
      if (dep['import-type'] !== 'builtin') throw new Error('Expected builtin dependency');
      visit(dep.name);
      dependencies[uri]['builtin(' + dep.name + ')'] = 'builtin://' + dep.name;
    }
    order.push(uri);
  }
  visit('ffi'); visit('sets');
  const hooks = await new Promise((resolve, reject) =>
    requirejs(['pyret-base/js/post-load-hooks'], resolve, reject));
  const realm = { static: {}, instantiated: {} };
  rt.modules = realm.instantiated;
  await new Promise((resolve, reject) => rt.runThunk(() =>
    rt.runStandalone(modules, realm, dependencies, order, hooks.makeDefaultPostLoadHooks(rt, {})),
  result => rt.isSuccessResult(result) ? resolve(result.result) : reject(result.exn)));
  return rt.getField(rt.getField(realm.instantiated['builtin://sets'], 'provide-plus-types'), 'values');
}
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
      'pyret-base': root + '/build/phaseA',
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
  const sets = await loadSets(root, rt, r);
  const run = thunk => new Promise((resolve, reject) => rt.runThunk(thunk,
    result => rt.isSuccessResult(result) ? resolve(result.result) : reject(result.exn)));
  const makeSet = (kind, values) => run(() => {
    const ctor = rt.getField(sets, kind);
    const optimized = values.length <= 5;
    return rt.getField(ctor, optimized ? 'make' + values.length : 'make').app(...(optimized ? values : [values]));
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
  const ref = (value, ann = rt.Any) => rt.unsafeSetRef(rt.makeRef(ann), value);
  const cell = value => rt.makeDataValue({ next: ref(value) }, { brandCount: 0 },
    'cell', () => {}, 1, [true], { $fieldNames: ['next'] });
  const cyclic = cell(rt.nothing); rt.unsafeSetRef(cyclic.dict.next, cyclic);
  const a = cell(rt.nothing), b = cell(a); rt.unsafeSetRef(a.dict.next, b);
  const innerCycle = cell(rt.nothing); rt.unsafeSetRef(innerCycle.dict.next, innerCycle.dict.next);
  const owner = cell(5), second = cell(5);
  const aliases = object({ owner, left: owner.dict.next, right: owner.dict.next, separate: second.dict.next, second });
  const containerCell = cell(rt.nothing), container = tuple([containerCell, [containerCell]]);
  rt.unsafeSetRef(containerCell.dict.next, container);
  const typed = rt.makeDataValue({ v: ref(5, rt.Number) }, { brandCount: 0 },
    'typed-cell', () => {}, 1, [true], { $fieldNames: ['v'] });
  const named = rt.makeDataValue({ v: ref(5) }, { brandCount: 0 },
    'spytial-value0', () => {}, 1, [true], { $fieldNames: ['v'] });
  const two = rt.makeDataValue({ row: ref(rt.nothing), second: ref(rt.nothing) }, { brandCount: 0 },
    'two', () => {}, 2, [true, true], { $fieldNames: ['row', 'second'] });
  rt.unsafeSetRef(two.dict.row, two); rt.unsafeSetRef(two.dict.second, two);
  fixtures.push(
    ['ref/ref-field', cell(5)], ['cycle/ref-cycle', cyclic],
    ['cycle/two-node', a], ['cycle/reference-root', cyclic.dict.next],
    ['cycle/ref-self-field', innerCycle],
    ['ref/ordinary-field', object({ owner, boxed: box(owner.dict.next) })], ['ref/shared', aliases],
    ['cycle/tuple-array', container], ['ref/typed-acyclic', typed],
    ['ref/constructor-name-collision', named], ['cycle/multiple-mutable-fields', two]
  );
  for (let size = 1; size <= 12; size++) {
    const cells = Array.from({ length: size }, () => cell(rt.nothing));
    cells.forEach((c, i) => rt.unsafeSetRef(c.dict.next, cells[(i + 1) % size]));
    fixtures.push(['cycle/generated-ring-' + size, cells]);
  }
  for (const kind of ['list-set', 'tree-set']) {
    for (let size = 0; size <= 12; size++) {
      const values = Array.from({ length: size }, (_, i) => (i * 7 + 3) % 13);
      fixtures.push([`set/${kind}-${size}`, await makeSet(kind, values)]);
    }
    const pair = await makeSet(kind, [1, 2]);
    const added = await run(() => rt.getField(pair, 'add').app(9));
    const removed = await run(() => rt.getField(added, 'remove').app(1));
    fixtures.push([`skeleton/${kind}`, pair], [`set/${kind}-field`, box(pair)],
      [`set/${kind}-after-add`, added], [`set/${kind}-after-remove`, removed],
      [`set/${kind}-duplicates`, await makeSet(kind, [2, 1, 2, 1, 2, 1])],
      [`set/${kind}-strings`, await makeSet(kind, ['z', 'a', 'é', 'quote"'])],
      [`set/${kind}-numbers`, await makeSet(kind, [nums.fromString('1/3'), nums.fromString('123456789012345678901234567890'), -2])],
      [`set/${kind}-reference-sibling`, object({ owner: cell(pair), set: pair })]);
  }
  const innerListSet = await makeSet('list-set', [2, 1]);
  const innerTreeSet = await makeSet('tree-set', [3, 1]);
  fixtures.push(['set/nested', await makeSet('list-set', [innerListSet, innerTreeSet])],
    ['set/constructor-elements', await makeSet('list-set', [box(innerListSet), box(innerTreeSet)])],
    ['set/array-tuple', tuple([[innerListSet], innerTreeSet])],
    ['set/reference-element', await makeSet('list-set', [cell(5)])]);
  const rows = [];
  for (const [id, value] of fixtures) {
    const A = await run(() => rt.toReprJS(value, rt.ReprMethods._torepr));
    const original = new PyretDataInstance(value);
    const datum = JSON.parse(
      JSON.stringify({
        atoms: original.getAtoms(),
        relations: original.getRelations(),
        types: original.getTypes(),
      })
    );
    const ids = new Map(datum.atoms.map((a, i) => [a.id, 'opaque-' + (datum.atoms.length - i)]));
    datum.atoms.forEach(a => {
      a.id = ids.get(a.id);
      if (a.metadata) a.label = 'display only';
    });
    datum.types.forEach(t => { t.atoms = []; });
    datum.relations.forEach((r, i) => {
      if (!readFieldId(r.id)) r.id = 'unrelated-' + i;
      r.tuples.forEach(t => { t.atoms = t.atoms.map(id => ids.get(id)); });
      r.tuples.reverse();
    });
    datum.atoms.reverse(); datum.relations.reverse();
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
  const sharedSource = rows.find(row => row.id === 'ref/shared').R;
  const cycleSource = rows.find(row => row.id === 'cycle/ref-cycle').R;
  const topologyChecks = [
    '  shared = ' + sharedSource,
    '  identical(shared.left, shared.right) is true',
    '  identical(shared.left, shared.owner.next) is true',
    '  identical(shared.left, shared.separate) is false',
    '  shared!{left: 6}',
    '  ref-get(shared.right) is 6',
    '  shared.owner!next is 6',
    '  ref-get(shared.separate) is 5',
    '  cyclic = ' + cycleSource,
    '  identical(cyclic!next, cyclic) is true',
  ];
  const expectedChecks = rows.length + 7;
  const source =
    'data Box: box(v) end\ndata Cell: cell(ref next) end\n'
    + 'data TypedCell: typed-cell(ref v :: Number) end\n'
    + 'data Two: two(ref row, ref second) end\n'
    + 'data Collision: spytial-value0(ref v) end\ncheck:\n' +
    rows
      .map(
        row =>
          '  torepr(' + row.R + ') is ' + replit(new PyretDataInstance(row.A))
      )
      .join('\n') + '\n' + topologyChecks.join('\n') +
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
  if (!stdout.includes(`all ${expectedChecks} tests passed`)) {
    throw new Error(
      `Pyret inspection checks did not all pass. See ${output}/evaluation.log`
    );
  }
  console.log(
    `All ${rows.length} Pyret inspection checks and 7 reference topology checks passed. Report: ${output}/report.json`
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
