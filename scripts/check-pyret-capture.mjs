/** node scripts/check-pyret-capture.mjs /path/to/built/pyret/lang [report.json] */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadPyret } from './pyret-capture-runtime.mjs';
import { capturePyret, createPyretRuntimeAdapter, importPyretCapture, readConstructorTypeId, PyretCaptureError } from '../dist/pyret-capture.mjs';

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Supply a built Pyret language checkout');
const { rt, nums, sets, dictionaries, tableRuntime } = await loadPyret(root);
const adapter = createPyretRuntimeAdapter(rt);
const run = thunk => new Promise((resolve, reject) => rt.runThunk(thunk,
  result => rt.isSuccessResult(result) ? resolve(result.result) : reject(result.exn)));
const makeDictionary = (entries, mutable = false) => run(() => rt.getField(
  rt.getField(dictionaries, mutable ? 'mutable-string-dict' : 'string-dict'), 'make').app(entries.flat()));
const makeSet = (kind, values) => run(() => rt.getField(rt.getField(sets, kind), 'make').app(values));
const makeConstructor = (name, fields, mutable = [], arity = fields.length) => {
  const identity = { $fieldNames: fields };
  const brander = rt.namedBrander('CaptureTest-' + name, ['capture-test']);
  return (...values) => rt.makeDataValue(Object.fromEntries(fields.map((f, i) => [f, values[i]])),
    { brandCount: 1, [brander._brand]: true }, name, () => {}, arity,
    fields.map((_, i) => mutable.includes(i)), identity);
};
const sameA = makeConstructor('same', ['zebra', 'alpha']);
const sameB = makeConstructor('same', ['alpha', 'zebra']);
const sameC = makeConstructor('same', ['zebra', 'alpha']);
const shared = sameA(1, 2);
const array = [rt.makeNumberFromString('1/3'), rt.makeNumberFromString('123456789012345678901234567890'), rt.makeNumberFromString('~1'), 1];
const cell = makeConstructor('cell', ['next'], [0]);
const ref = rt.makeUnsafeSetRef(rt.Any, rt.nothing);
const cyclic = cell(ref); rt.unsafeSetRef(ref, cyclic);
const rawCycle = []; rawCycle.push(rawCycle);
const hidden = makeConstructor('hidden', ['visible', 'secret'])(1, 999);
hidden.dict._output = rt.makeMethod(() => { throw new Error('Printer invoked'); }, () => { throw new Error('Printer invoked'); });
const dictionary = await makeDictionary([['a', array], ['b', array]]);
const mutableDictionary = await makeDictionary([], true);
await run(() => rt.getField(mutableDictionary, 'set-now').app('self', mutableDictionary));
const table = tableRuntime.makeTable(['zebra', 'alpha'], [[array, shared], [array, shared]]);
const roots = [
  ['a', shared], ['alias', shared], ['equal', sameA(1, 2)],
  ['different-order', sameB(3, 4)], ['different-identity', sameC(1, 2)],
  ['builtin-name', makeConstructor('Number', ['n'])(42)],
  ['numbers', array], ['nothing', rt.nothing], ['object', rt.makeObject({ x: array })],
  ['tuple', rt.makeTuple([shared, shared])], ['cycle', cyclic], ['direct-ref', ref],
  ['raw-cycle', rawCycle], ['hidden', hidden], ['dictionary', dictionary],
  ['mutable-dictionary', mutableDictionary], ['table', table],
  ['singleton', makeConstructor('empty', [], [], -1)()], ['nullary', makeConstructor('empty', [])()],
  ['list-set', await makeSet('list-set', [1, 2])], ['tree-set', await makeSet('tree-set', [1, 2])],
  ['string', 'é\n"\\\0'], ['boolean', false],
].map(([name, value]) => ({ name, value, observation: { label: name } }));

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const runtimeSha256 = createHash('sha256').update(fs.readFileSync(path.join(root, 'build/phaseA/js/runtime.js'))).digest('hex');
const snapshot = capturePyret(roots, adapter, { revision, runtimeSha256 });
// Poison live printers and remove the global loader; the consumer uses only the
// published headless bundle and JSON. A second process independently imports it.
const consumer = `
import assert from 'node:assert/strict';
import { importPyretCapture, readConstructorTypeId } from ${JSON.stringify(new URL('../dist/pyret-capture.mjs', import.meta.url).href)};
let text = ''; for await (const chunk of process.stdin) text += chunk;
const s = JSON.parse(text); s.datum.atoms.reverse(); s.datum.relations.reverse();
const { values: v, snapshot } = importPyretCapture(s);
assert.equal(typeof window, 'undefined'); assert.equal(typeof globalThis.requirejs, 'undefined');
assert.equal(v.get('a'), v.get('alias')); assert.notEqual(v.get('a'), v.get('equal'));
assert.equal(v.get('a').$name, v.get('equal').$name);
assert.notEqual(v.get('a').$name, v.get('different-identity').$name);
assert.notEqual(v.get('a').$name, v.get('different-order').$name);
assert.deepEqual({ ...v.get('different-order').dict }, { alpha: 3, zebra: 4 });
assert.deepEqual(Object.keys(v.get('different-order').dict), ['alpha', 'zebra']);
assert.equal(readConstructorTypeId(v.get('builtin-name').$name).name, 'Number');
assert.equal(v.get('builtin-name').dict.n, 42);
assert.equal(v.get('cycle').dict.next, v.get('direct-ref'));
assert.equal(v.get('direct-ref').value, v.get('cycle'));
assert.equal(v.get('raw-cycle')[0], v.get('raw-cycle'));
assert.equal(v.get('hidden').dict.secret, 999);
assert.equal(v.get('tuple').vals[0], v.get('a')); assert.equal(v.get('tuple').vals[1], v.get('a'));
assert.equal(v.get('object').dict.x, v.get('numbers'));
assert.equal(v.get('dictionary').entries[0][1], v.get('numbers'));
assert.equal(v.get('dictionary').entries[1][1], v.get('numbers'));
assert.equal(v.get('mutable-dictionary').entries[0][1], v.get('mutable-dictionary'));
assert.deepEqual(v.get('table').dict['_header-raw-array'], ['zebra', 'alpha']);
assert.equal(v.get('table').dict['_rows-raw-array'][1][0], v.get('numbers'));
assert.equal(v.get('singleton').$arity, -1); assert.equal(v.get('nullary').$arity, 0);
assert.equal(v.get('nothing').$pyretValue.kind, 'nothing');
assert.equal(v.get('boolean'), false);
const numbers = v.get('numbers');
assert.equal(numbers[0].$pyretNumber.numerator, '1'); assert.equal(numbers[0].$pyretNumber.denominator, '3');
assert.equal(numbers[1].$pyretNumber.value, '123456789012345678901234567890');
assert.equal(numbers[2].$pyretNumber.kind, 'roughnum'); assert.equal(numbers[3], 1);
assert.equal(snapshot.roots.length, 23); assert.equal(snapshot.roots[0].observation.label, 'a');
console.log('Fresh headless consumer: structural assertions passed');
`;
const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', consumer],
  { input: JSON.stringify(snapshot), encoding: 'utf8' });
const rejects = [
  ['function', rt.makeFunction(x => x)], ['nested-function', rt.makeObject({ f: rt.makeFunction(x => x) })],
  ['tuple-function', rt.makeTuple([rt.makeFunction(x => x)])], ['array-function', [rt.makeFunction(x => x)]],
  ['constructor-function', sameA(1, rt.makeFunction(x => x))],
  ['dictionary-function', await makeDictionary([['f', rt.makeFunction(x => x)]])],
  ['table-function', tableRuntime.makeTable(['f'], [[rt.makeFunction(x => x)]])],
  ['opaque', rt.makeOpaque({ secret: 1 })], ['unset-ref', rt.makeRef(rt.Any)],
  ['typed-ref', rt.makeUnsafeSetRef(rt.Number, 1)],
];
const diagnostics = rejects.map(([name, value]) => {
  try { capturePyret([{ name, value }], adapter); throw new Error('Expected rejection: ' + name); }
  catch (e) { assert.ok(e instanceof PyretCaptureError, String(e)); return { name, path: e.path, reason: e.reason }; }
});
// A mutation after capture cannot change the portable snapshot.
array[0] = 99;
assert.equal(importPyretCapture(snapshot).values.get('numbers')[0].$pyretNumber.denominator, '3');
const report = { revision, runtimeSha256, node: process.version, roots: roots.length, diagnostics, snapshot,
  freshConsumerPassed: stdout.includes('structural assertions passed') };
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(stdout.trim());
console.log(`Pyret ${revision}: ${roots.length} roots preserved; ${diagnostics.length} explicit unsupported-value diagnostics`);
