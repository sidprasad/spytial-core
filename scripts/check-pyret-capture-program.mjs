/** Compile and run real Pyret source, including same-named imported constructors. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { importPyretCapture, readConstructorTypeId } from '../dist/pyret-capture.mjs';

if (!process.argv[2]) throw new Error('Supply a built Pyret language checkout');
const root = path.resolve(process.argv[2]);
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pyret-capture-program-'));
try {
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'dir');
  const builtins = path.join(output, 'builtins'); fs.mkdirSync(builtins);
  for (const name of fs.readdirSync(path.join(root, 'src/js/trove'))) {
    fs.symlinkSync(path.join(root, 'src/js/trove', name), path.join(builtins, name));
  }
  const destination = path.join(output, 'capture.json');
  const bundle = fileURLToPath(new URL('../dist/pyret-capture.js', import.meta.url));
  fs.writeFileSync(path.join(builtins, 'capture-test.js'), `({
    requires: [], nativeRequires: [${JSON.stringify(bundle)}, "fs"],
    provides: { values: { capture: ["arrow", ["Any"], "Nothing"] } },
    theModule: function(runtime, namespace, uri, library, fs) {
      return runtime.makeModuleReturn({ capture: runtime.makeFunction(function(value) {
        var snapshot = library.capturePyret([{name: "program", value: value}], library.createPyretRuntimeAdapter(runtime));
        fs.writeFileSync(${JSON.stringify(destination)}, JSON.stringify(snapshot));
        return runtime.nothing;
      }) }, {});
    }
  })`);
  const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
  for (const name of ['left.arr', 'right.arr', 'pyret-capture.arr']) fs.copyFileSync(path.join(fixtures, name), path.join(output, name));
  const executable = path.join(output, 'program.jarr');
  execFileSync(process.execPath, ['build/phaseA/pyret.jarr', '--outfile', path.relative(root, executable), '--build-runnable', path.join(output, 'pyret-capture.arr'),
    '--builtin-js-dir', builtins, '--builtin-arr-dir', 'src/arr/trove', '--compiled-dir', path.join(output, 'compiled'),
    '--deps-file', 'build/phaseA/bundled-node-deps.js', '-no-check-mode',
    '--require-config', 'src/scripts/standalone-configA.json'], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
  execFileSync(process.execPath, [executable], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  const s = JSON.parse(fs.readFileSync(destination, 'utf8'));
  const v = importPyretCapture(s).values.get('program').dict;
  assert.equal(v.left, v['shared-value']); assert.notEqual(v.left, v.equal);
  assert.notEqual(v.left.$name, v.right.$name);
  assert.equal(readConstructorTypeId(v.left.$name).name, 'same');
  assert.equal(readConstructorTypeId(v.right.$name).name, 'same');
  assert.deepEqual(Object.keys(v.left.dict), ['zebra', 'alpha']);
  assert.deepEqual(Object.keys(v.right.dict), ['alpha', 'zebra']);
  assert.equal(v.hidden.dict.secret, 999);
  assert.equal(v.cycle.dict.next.value, v.cycle);
  assert.equal(v.dictionary.entries[0][1], v.numbers);
  assert.equal(v.dictionary.entries[1][1], v.numbers);
  assert.equal(v['table-value'].dict['_rows-raw-array'][1][0], v.numbers);
  assert.equal(v.numbers[0].$pyretNumber.denominator, '3');
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ compiledProgramPassed: true, snapshot: s }, null, 2) + '\n');
  console.log('Compiled Pyret program: imported constructor identities, sharing, cycles, hidden fields and exact numbers preserved');
} finally { fs.rmSync(output, { recursive: true, force: true }); }
