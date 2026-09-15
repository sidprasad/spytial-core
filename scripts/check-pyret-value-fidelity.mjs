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

// Use the checkout's compiled builtins to construct actual collection values, including
// their _output methods. These modules are available only to the test producer;
// the reifier below receives ordinary serialized atoms/relations/types.
async function loadCollections(root, rt, requirejs) {
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
  visit('ffi'); visit('sets'); visit('string-dict'); visit('tables');
  const hooks = await new Promise((resolve, reject) =>
    requirejs(['pyret-base/js/post-load-hooks'], resolve, reject));
  const realm = { static: {}, instantiated: {} };
  rt.modules = realm.instantiated;
  await new Promise((resolve, reject) => rt.runThunk(() =>
    rt.runStandalone(modules, realm, dependencies, order, hooks.makeDefaultPostLoadHooks(rt, {})),
  result => rt.isSuccessResult(result) ? resolve(result.result) : reject(result.exn)));
  const values = name => rt.getField(rt.getField(realm.instantiated['builtin://' + name], 'provide-plus-types'), 'values');
  return { sets: values('sets'), dictionaries: values('string-dict'),
    tableRuntime: rt.getField(realm.instantiated['builtin://table'], 'provide-plus-types').dict.internal };
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
  const { sets, dictionaries, tableRuntime } = await loadCollections(root, rt, r);
  const run = thunk => new Promise((resolve, reject) => rt.runThunk(thunk,
    result => rt.isSuccessResult(result) ? resolve(result.result) : reject(result.exn)));
  const makeSet = (kind, values) => run(() => {
    const ctor = rt.getField(sets, kind);
    const optimized = values.length <= 5;
    return rt.getField(ctor, optimized ? 'make' + values.length : 'make').app(...(optimized ? values : [values]));
  });
  const makeDictionary = (entries, mutable = false) => run(() => rt.getField(
    rt.getField(dictionaries, mutable ? 'mutable-string-dict' : 'string-dict'), 'make').app(entries.flat()));
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
  const dictionary = await makeDictionary([['a', 1]]);
  fixtures.push(['skeleton/string-dict', dictionary], ['dictionary/value-kinds', await makeDictionary([
    ['nothing', rt.nothing], ['rational', nums.fromString('1/3')], ['rough', nums.fromString('~1.5')],
    ['big', nums.fromString('123456789012345678901234567890')], ['boolean', true]])]);
  for (const mutable of [false, true]) {
    const kind = mutable ? 'mutable-string-dict' : 'string-dict';
    for (const size of [0, 1, 2, 3, 5, 8, 9, 12, 20, 40]) {
      const entries = Array.from({ length: size }, (_, i) => ['key-' + ((i * 7) % 41), i]);
      fixtures.push([`dictionary/${kind}-${size}`, await makeDictionary(entries, mutable)]);
    }
    const strangeKeys = ['', '"\\\n', 'é', '\uFAAA', 'e\u0301', '__proto__', 'constructor', '10', '2', 'toString'];
    fixtures.push([`dictionary/${kind}-keys`, await makeDictionary(strangeKeys.map((key, i) => [key, i]), mutable)],
      [`dictionary/${kind}-nested`, await makeDictionary([['a', dictionary], ['b', innerListSet]], mutable)],
      [`dictionary/${kind}-field`, box(await makeDictionary([['a', [box(1), tuple([2, 2])]]], mutable))],
      [`dictionary/${kind}-ref`, await makeDictionary([['a', cell(5)]], mutable)]);
    // These strings share the JVM-style string hash used by Pyret's HAMT.
    const collisions = Array.from({ length: 16 }, (_, i) =>
      Array.from({ length: 4 }, (_, bit) => i & (1 << bit) ? 'Aa' : 'BB').join(''));
    for (const size of [8, 9, 10, 16]) fixtures.push([
      `dictionary/${kind}-collisions-${size}`, await makeDictionary(collisions.slice(0, size).map((key, i) => [key, i]), mutable)]);
  }
  const mutableDictionary = await makeDictionary([['a', 1]], true);
  await run(() => rt.getField(mutableDictionary, 'set-now').app('self', mutableDictionary));
  fixtures.push(['dictionary/mutable-self-cycle', mutableDictionary]);
  const firstDictionary = await makeDictionary([['a', 1]], true);
  const secondDictionary = await makeDictionary([['a', 2]], true);
  const dictionarySet = await makeSet('list-set', [firstDictionary, secondDictionary]);
  fixtures.push(['dictionary/shared-set-elements', object({ set: dictionarySet, dictionary: firstDictionary })]);
  fixtures.push(['dictionary/sealed', await run(() => rt.getField(firstDictionary, 'seal').app())]);
  const sealedCycle = await makeDictionary([], true);
  const sealedView = await run(() => rt.getField(sealedCycle, 'seal').app());
  await run(() => rt.getField(sealedCycle, 'set-now').app('self', sealedView));
  fixtures.push(['dictionary/sealed-self-cycle', sealedView]);
  for (let n = 0; n < 30; n++) {
    let value = await makeDictionary(Array.from({ length: n }, (_, i) => ['k-' + ((i * 17 + n) % 47), i]));
    for (let j = 0; j < n; j++) {
      const key = 'k-' + ((j * 17 + n) % 47);
      value = await run(() => rt.getField(value, j % 3 === 0 ? 'remove' : 'set').app(...(j % 3 === 0 ? [key] : [key, -j])));
    }
    fixtures.push(['dictionary/history-' + n, value]);
  }
  // Edit only the public relational datum. Expected values are built separately
  // in Pyret, so these checks cannot pass by replaying an unedited snapshot.
  for (const literal of ['7', '9007199254740993', '1/3', '~7.25']) {
    fixtures.push([`edit/number-${literal}`, box(5), datum => {
      datum.atoms.find(a => a.type === 'Number').label = literal;
    }, box(nums.fromString(literal))]);
  }
  fixtures.push(['edit/object-name', object({ x: 5 }), datum => {
    datum.relations.find(r => r.name === 'x').name = 'renamed';
  }, object({ renamed: 5 })]);
  fixtures.push(['edit/object-order', object({ z: 1, a: 2 }), datum => {
    for (const atom of datum.atoms.filter(a => a.type === 'Index')) atom.label = String(1 - Number(atom.label));
  }, object({ a: 2, z: 1 })]);
  for (const type of ['RawArray', 'Tuple']) {
    const wrap = values => type === 'Tuple' ? tuple(values) : values;
    fixtures.push([`edit/${type}-append`, wrap([5]), datum => {
      datum.atoms.push({ id: 'added-a', type: 'Index', label: '1' });
      const relation = datum.relations.find(r => r.name === 'element');
      const [container, , value] = relation.tuples[0].atoms;
      relation.tuples.push({ atoms: [container, 'added-a', value], types: relation.types });
    }, wrap([5, 5])]);
    fixtures.push([`edit/${type}-remove`, wrap([5, 7]), datum => {
      const removed = datum.atoms.find(a => a.type === 'Index' && a.label === '1').id;
      datum.relations.find(r => r.name === 'element').tuples = datum.relations
        .find(r => r.name === 'element').tuples.filter(t => t.atoms[1] !== removed);
    }, wrap([5])]);
  }
  fixtures.push(['edit/dictionary-append', dictionary, datum => {
    datum.atoms.push({ id: 'added-a', type: 'Index', label: '1' }, { id: 'added-b', type: 'String', label: 'b' });
    const relation = datum.relations.find(r => r.name === 'entry');
    const [container, , , value] = relation.tuples[0].atoms;
    relation.tuples.push({ atoms: [container, 'added-a', 'added-b', value], types: relation.types });
  }, await makeDictionary([['a', 1], ['b', 1]])]);
  fixtures.push(['edit/dictionary-remove', dictionary, datum => {
    datum.relations.find(r => r.name === 'entry').tuples = [];
  }, await makeDictionary([])]);
  fixtures.push(['edit/dictionary-key', dictionary, datum => {
    datum.atoms.find(a => a.type === 'String').label = 'renamed';
  }, await makeDictionary([['renamed', 1]])]);
  fixtures.push(['edit/dictionary-mutable', dictionary, datum => {
    datum.atoms.find(a => a.type === 'StringDict').type = 'MutableStringDict';
  }, await makeDictionary([['a', 1]], true)]);
  fixtures.push(['edit/dictionary-sealed', firstDictionary, datum => {
    const id = datum.atoms.find(a => a.type === 'MutableStringDict').id;
    datum.relations.push({ id: 'added-a', name: 'sealed', types: ['MutableStringDict'],
      tuples: [{ atoms: [id], types: ['MutableStringDict'] }] });
  }, await run(() => rt.getField(firstDictionary, 'seal').app())]);
  fixtures.push(['edit/reference-cycle', cell(5), datum => {
    datum.relations.find(r => r.name === 'target').tuples[0].atoms[1] = datum.atoms.find(a => a.type === 'cell').id;
  }, cyclic]);
  fixtures.push(['edit/reference-target', cyclic, datum => {
    datum.atoms.push({ id: 'added-a', type: 'Number', label: '7' });
    datum.relations.find(r => r.name === 'target').tuples[0].atoms[1] = 'added-a';
  }, cell(7)]);
  fixtures.push(['edit/set-element', await makeSet('list-set', [1, 2]), datum => {
    datum.atoms.find(a => a.type === 'Number' && a.label === '1').label = '7';
  }, await makeSet('list-set', [7, 2])]);

  const makeTable = (headers, rows) => run(() => tableRuntime.makeTable(headers, rows));
  const basicTable = await makeTable(['name', 'score'], [['Ada', 7], ['Ada', 7]]);
  const nestedTable = await makeTable(['inner'], [[await makeTable(['x'], [[1], [2]])]]);
  const sharedTableArray = [1, 2];
  const arrayTable = await makeTable(['a', 'b'], [[sharedTableArray, sharedTableArray]]);
  const tableCell = cell(rt.nothing);
  const cyclicTable = await makeTable(['x'], [[tableCell]]);
  rt.unsafeSetRef(tableCell.dict.next, cyclicTable);
  const tableDict = await makeDictionary([], true);
  const dictionaryTable = await makeTable(['x'], [[tableDict]]);
  await run(() => rt.getField(tableDict, 'set-now').app('table', dictionaryTable));
  fixtures.push(['skeleton/table', await makeTable(['a', 'b'], [[1, 2]])],
    ['table/duplicates', basicTable], ['table/empty', await makeTable(['z', 'a'], [])],
    ['table/zero-columns', await makeTable([], [[], []])], ['table/empty-zero-columns', await makeTable([], [])],
    ['table/nested', nestedTable], ['table/shared-array', arrayTable], ['table/reference-cycle', cyclicTable],
    ['table/dictionary-cycle', dictionaryTable],
    ['table/field', box(basicTable)],
    ['table/multiple-widths', tuple([basicTable, nestedTable])],
    ['table/mixed', await makeTable(['value'], [[1], ['one'], [true], [rt.nothing], [box(2)], [tuple([3, 3])],
      [nums.fromString('1/3')], [nums.fromString('~1.5')], [nums.fromString('123456789012345678901234567890')],
      [innerListSet], [dictionary]])],
    ['table/beyond-display-limit', await makeTable(['n'], Array.from({ length: 1002 }, (_, i) => [i]))]);
  fixtures.push(['table/large-zero-columns', await makeTable([], Array.from({ length: 1002 }, () => []))]);
  fixtures.push(['table/after-drop-last-column', await run(() =>
    rt.getField(rt.getField(basicTable, 'drop').app('score'), 'drop').app('name'))]);
  fixtures.push(['edit/table-author', await makeTable([], []), datum => {
    const root = datum.atoms[0].id;
    datum.atoms = [{ id: root, type: 'Table', label: 'authored' }, { id: 'i', type: 'Index', label: '0' },
      { id: 'j', type: 'Index', label: '1' }, { id: 'h', type: 'String', label: 'input column' },
      { id: 'v', type: 'Number', label: '1/3' }];
    datum.types = [];
    datum.relations = [
      { id: 'c', name: 'column', types: ['Table', 'Index', 'String'], tuples: [{ atoms: [root, 'i', 'h'], types: [] }] },
      { id: 'r', name: 'row', types: ['Table', 'Index', 'Number'],
        tuples: [{ atoms: [root, 'j', 'v'], types: [] }, { atoms: [root, 'i', 'v'], types: [] }] },
    ];
  }, await makeTable(['input column'], [[nums.fromString('1/3')], [nums.fromString('1/3')]])]);
  for (const headers of [['row', 'table', 'source', 'a--b'], ['', 'end', 'first name', '__proto__', 'constructor'],
    ['quote"', 'slash\\', 'line\n', '\uFAAA', 'e\u0301']]) {
    fixtures.push(['table/headers-' + fixtures.length, await makeTable(headers, [headers.map((_, i) => i)])]);
    fixtures.push(['table/empty-headers-' + fixtures.length, await makeTable(headers, [])]);
  }
  for (const [id, edit, expected] of [
    ['header', datum => { datum.atoms.find(a => a.type === 'String' && a.label === 'name').label = 'first name'; },
      await makeTable(['first name', 'score'], [['Ada', 7], ['Ada', 7]])],
    ['value', datum => { datum.atoms.find(a => a.type === 'Number').label = '9'; },
      await makeTable(['name', 'score'], [['Ada', 9], ['Ada', 9]])],
    ['remove-row', datum => { datum.relations.find(r => r.name === 'row').tuples.pop(); },
      await makeTable(['name', 'score'], [['Ada', 7]])],
    ['append-row', datum => {
      datum.atoms.push({ id: 'new-index', type: 'Index', label: '2' });
      const r = datum.relations.find(r => r.name === 'row');
      const [t, , a, n] = r.tuples[0].atoms;
      r.tuples.push({ atoms: [t, 'new-index', n, a], types: r.types });
    }, await makeTable(['name', 'score'], [['Ada', 7], ['Ada', 7], [7, 'Ada']])],
    ['reorder-rows', datum => {
      const r = datum.relations.find(r => r.name === 'row');
      const [t, i, a, n] = r.tuples[0].atoms, j = r.tuples[1].atoms[1];
      r.tuples[0].atoms = [t, j, n, a]; r.tuples[1].atoms = [t, i, a, n];
    }, await makeTable(['name', 'score'], [['Ada', 7], [7, 'Ada']])],
    ['reorder-columns', datum => {
      const c = datum.relations.find(r => r.name === 'column');
      [c.tuples[0].atoms[1], c.tuples[1].atoms[1]] = [c.tuples[1].atoms[1], c.tuples[0].atoms[1]];
      for (const t of datum.relations.find(r => r.name === 'row').tuples) [t.atoms[2], t.atoms[3]] = [t.atoms[3], t.atoms[2]];
    }, await makeTable(['score', 'name'], [[7, 'Ada'], [7, 'Ada']])],
    ['remove-columns', datum => {
      datum.relations.find(r => r.name === 'column').tuples = [];
      const r = datum.relations.find(r => r.name === 'row'); r.types = ['Table', 'Index'];
      for (const t of r.tuples) { t.atoms = t.atoms.slice(0, 2); t.types = r.types; }
    }, await makeTable([], [[], []])],
    ['remove-all-rows', datum => { datum.relations.find(r => r.name === 'row').tuples = []; },
      await makeTable(['name', 'score'], [])],
  ]) fixtures.push(['edit/table-' + id, basicTable, edit, expected]);

  // This structural oracle is computed from live expected contents separately
  // from the reifier. The Pyret checks below use public row/column accessors.
  const tableSnapshot = v => tableRuntime.isTable(v) ? tuple([
    rt.ffi.makeList(v.dict['_header-raw-array']),
    rt.ffi.makeList(v.dict['_rows-raw-array'].map(row => rt.ffi.makeList(row.map(tableSnapshot)))),
  ]) : v;

  const rows = [];
  for (const [id, value, edit, expected = value] of fixtures) {
    const A = await run(() => rt.toReprJS(expected, rt.ReprMethods._torepr));
    const original = new PyretDataInstance(value);
    const datum = JSON.parse(
      JSON.stringify({
        atoms: original.getAtoms(),
        relations: original.getRelations(),
        types: original.getTypes(),
      })
    );
    edit?.(datum);
    const ids = new Map(datum.atoms.map((a, i) => [a.id, 'opaque-' + (datum.atoms.length - i)]));
    const rootId = ids.get(original.getAtoms()[0].id);
    datum.atoms.forEach(a => {
      a.id = ids.get(a.id);
      if ('metadata' in a) throw new Error('Non-relational Pyret payload');
      if (!['Number', 'String', 'Boolean', 'Index'].includes(a.type)) a.label = 'display only';
    });
    datum.types.forEach(t => { t.atoms = []; });
    datum.relations.forEach((r, i) => {
      if (!readFieldId(r.id)) r.id = 'unrelated-' + i;
      r.tuples.forEach(t => { t.atoms = t.atoms.map(id => ids.get(id)); });
      r.tuples.reverse();
    });
    datum.atoms.reverse(); datum.relations.reverse();
    PyretDataInstance.clearGlobalConstructorCache();
    const R = replit(new JSONDataInstance(datum), rootId);
    tokenizer.Tokenizer.tokenizeFrom(R);
    if (!parser.PyretGrammar.parse(tokenizer.Tokenizer))
      throw new Error('Invalid generated Pyret: ' + R);
    const snapshot = tableRuntime.isTable(expected)
      ? await run(() => rt.toReprJS(tableSnapshot(expected), rt.ReprMethods._torepr)) : undefined;
    rows.push({ id, A, R, tableSnapshot: snapshot });
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
    '  dictionary-cycle = ' + rows.find(row => row.id === 'dictionary/mutable-self-cycle').R,
    '  identical(dictionary-cycle.get-value-now("self"), dictionary-cycle) is true',
    '  dictionary-aliases = ' + rows.find(row => row.id === 'dictionary/shared-set-elements').R,
    '  dictionary-aliases.dictionary.set-now("a", 9)',
    '  dictionary-aliases.set.member([mutable-string-dict: "a", 9]) is true',
    '  sealed-dictionary = ' + rows.find(row => row.id === 'dictionary/sealed-self-cycle').R,
    '  identical(sealed-dictionary.get-value-now("self"), sealed-dictionary) is true',
    '  sealed-dictionary.set-now("a", 1) raises "Cannot modify sealed string dict"',
    '  edited-seal = ' + rows.find(row => row.id === 'edit/dictionary-sealed').R,
    '  edited-seal.set-now("a", 2) raises "Cannot modify sealed string dict"',
    '  edited-cycle = ' + rows.find(row => row.id === 'edit/reference-cycle').R,
    '  identical(edited-cycle!next, edited-cycle) is true',
  ];
  const tableSource = id => rows.find(row => row.id === id).R;
  const tableChecks = [
    ...rows.filter(row => row.tableSnapshot !== undefined).map(row =>
      '  torepr(table-snapshot(' + row.R + ')) is ' + replit(new PyretDataInstance(row.tableSnapshot))),
    '  table-aliases = ' + tableSource('table/shared-array'),
    '  identical(table-aliases.row-n(0).get-value("a"), table-aliases.row-n(0).get-value("b")) is true',
    '  raw-array-set(table-aliases.row-n(0).get-value("a"), 0, 9)',
    '  raw-array-get(table-aliases.row-n(0).get-value("b"), 0) is 9',
    '  table-cycle = ' + tableSource('table/reference-cycle'),
    '  table-owner = table-cycle.row-n(0).get-value("x")',
    '  identical(table-owner!next, table-cycle) is true',
    '  table-dict-cycle = ' + tableSource('table/dictionary-cycle'),
    '  identical(table-dict-cycle.row-n(0).get-value("x").get-value-now("table"), table-dict-cycle) is true',
    '  table-operations = ' + tableSource('table/duplicates'),
    '  table-operations.add-row(table-operations.row("Grace", 9)).length() is 3',
    '  table-operations.drop("score").column-names() is [list: "name"]',
    '  table-operations.length() is 2',
  ];
  const tableCheckCount = rows.filter(row => row.tableSnapshot !== undefined).length + 7;
  const expectedChecks = rows.length + 13 + tableCheckCount;
  const source =
    'include string-dict\ninclude tables\ndata Box: box(v) end\ndata Cell: cell(ref next) end\n'
    + 'data TypedCell: typed-cell(ref v :: Number) end\n'
    + 'data Two: two(ref row, ref second) end\n'
    + 'data Collision: spytial-value0(ref v) end\n'
    + 'fun table-snapshot(v):\n  if is-table(v):\n    {v.column-names(); for map(r from v.all-rows()):\n'
    + '      for map(c from v.column-names()): table-snapshot(r.get-value(c)) end\n    end}\n  else: v end\nend\n'
    + 'check "value inspection and reference behavior":\n' +
    rows
      .map(
        row =>
          '  torepr(' + row.R + ') is ' + replit(new PyretDataInstance(row.A))
      )
      .join('\n') + '\n' + topologyChecks.join('\n') + '\nend\ncheck "table contents and behavior":\n' + tableChecks.join('\n') +
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
    `All ${rows.length} Pyret inspection checks, 13 reference/dictionary behavior checks, and ${tableCheckCount} table structural/behavior checks passed. Report: ${output}/report.json`
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
