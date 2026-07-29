/**
 * Generate the release artifacts that describe the Spytial spec language.
 *
 *   npm run build:language
 *
 * Writes, into `docs/`:
 *   - `spytial-language.json`    the language manifest (what a code generator reads)
 *   - `spytial-spec.schema.json` a JSON Schema for a spec document (what a validator reads)
 *
 * Both are checked in, so they are pinnable per tag over jsDelivr and diffable
 * in review — a language change shows up as a diff in these files, which is
 * exactly the signal a consumer wants. `tests/language-manifest.test.ts` fails
 * if what is checked in no longer matches what this script would write.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildJsonSchema } from '../src/language/json-schema';
import { getLanguageManifest } from '../src/language/manifest';

const REPO_ROOT = join(__dirname, '..');
const DOCS_DIR = join(REPO_ROOT, 'docs');

export const MANIFEST_PATH = join(DOCS_DIR, 'spytial-language.json');
export const SCHEMA_PATH = join(DOCS_DIR, 'spytial-spec.schema.json');

/** The package version to stamp on the artifacts. */
export function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

/** The exact bytes each artifact should contain, so the test can compare without writing. */
export function renderArtifacts(version = readPackageVersion()): { manifest: string; schema: string } {
  const manifest = getLanguageManifest(version);
  return {
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    schema: `${JSON.stringify(buildJsonSchema(manifest), null, 2)}\n`,
  };
}

function main(): void {
  const version = readPackageVersion();
  const { manifest, schema } = renderArtifacts(version);

  writeFileSync(MANIFEST_PATH, manifest, 'utf8');
  writeFileSync(SCHEMA_PATH, schema, 'utf8');

  const parsed = JSON.parse(manifest) as { languageVersion: string; items: unknown[] };
  console.log(
    `Wrote docs/spytial-language.json and docs/spytial-spec.schema.json ` +
      `(language ${parsed.languageVersion}, spytial-core ${version}, ${parsed.items.length} items).`,
  );
}

// Only run when invoked directly, so the test can import the helpers above.
if (require.main === module) {
  main();
}
