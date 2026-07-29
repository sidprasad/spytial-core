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
export const VERSION_PATH = join(REPO_ROOT, 'src', 'language', 'version.ts');

/** The package version, which is also the language version. */
export function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

/**
 * The version constant, as a source file.
 *
 * The language version IS the package version, and the library needs it at
 * runtime — but `src/` cannot import `package.json` (it sits outside the
 * declaration build's `rootDir`, and bundling it would drag the whole file into
 * the browser build). So the version is generated into `src/`, committed, and
 * kept honest by the same staleness gate as the JSON artifacts: bump
 * `package.json` without re-running this and CI says so.
 */
export function renderVersionModule(version = readPackageVersion()): string {
  return `/**
 * GENERATED FILE — do not edit. Run \`npm run build:language\` to refresh.
 *
 * The spec language ships with the engine and is versioned with it, so this is
 * \`package.json\`'s version. See \`LANGUAGE_VERSIONING\` in ./manifest.
 */

export const LANGUAGE_VERSION = '${version}';
`;
}

/** The exact bytes each artifact should contain, so the test can compare without writing. */
export function renderArtifacts(version = readPackageVersion()): {
  manifest: string;
  schema: string;
  versionModule: string;
} {
  const manifest = getLanguageManifest(version);
  return {
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    schema: `${JSON.stringify(buildJsonSchema(manifest), null, 2)}\n`,
    versionModule: renderVersionModule(version),
  };
}

function main(): void {
  const version = readPackageVersion();
  const { manifest, schema, versionModule } = renderArtifacts(version);

  writeFileSync(VERSION_PATH, versionModule, 'utf8');
  writeFileSync(MANIFEST_PATH, manifest, 'utf8');
  writeFileSync(SCHEMA_PATH, schema, 'utf8');

  const parsed = JSON.parse(manifest) as { languageVersion: string; items: unknown[] };
  console.log(
    `Wrote src/language/version.ts, docs/spytial-language.json and docs/spytial-spec.schema.json ` +
      `(spec language ${parsed.languageVersion}, ${parsed.items.length} items).`,
  );
}

// Only run when invoked directly, so the test can import the helpers above.
if (require.main === module) {
  main();
}
