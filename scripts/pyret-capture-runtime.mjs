/** Shared real-runtime loader for the capture compatibility check. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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

export async function loadPyret(root) {
  const require = createRequire(path.join(root, 'package.json'));
  const r = require('requirejs');
  globalThis.requirejs = r;
  r.config({ nodeRequire: require, paths: {
    'pyret-base': root + '/build/phaseA', jglr: root + '/build/phaseA/js',
    seedrandom: root + '/node_modules/seedrandom/index',
    'js-sha256': root + '/node_modules/js-sha256/src/sha256',
  } });
  const [runtime, nums] = await new Promise((resolve, reject) => r(
    ['pyret-base/js/runtime', 'pyret-base/js/js-numbers'], (...mods) => resolve(mods), reject));
  const rt = runtime.makeRuntime({ stdout: () => {}, stderr: console.error });
  const collections = await loadCollections(root, rt, r);
  return { rt, nums, ...collections };
}
