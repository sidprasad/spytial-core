/**
 * Rewrite every hand-maintained version pin in the docs from package.json.
 *
 *   npm run sync:versions           rewrite the pins in place
 *   npm run sync:versions -- --check  fail if any pin has drifted
 *
 * Wired into the `version` lifecycle script in package.json, so
 * `npm version <bump>` runs this (and `build:language`) after the bump and
 * stages the result — the derived files land in the release commit itself.
 *
 * A release used to mean editing the same number into a README example, two
 * site pages, a spec doc, an agent manifest and a skill file — which is why
 * those drifted three minors apart (`@2.5.2`, `@v4.2.0`, `@5.3.0` all live at
 * once). Now `package.json` moves and this derives the rest, the same way
 * `build:language` already derives `docs/spytial-language.json`.
 *
 * `tests/version-pins.test.ts` fails if a pin is stale, and also if a file
 * outside PINNED_FILES grows a concrete pin this script would not maintain.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');

/**
 * Every file carrying a concrete `spytial-core@<version>` pin. Placeholder
 * pins (`@main`, `@<tag>`, `@<tag-or-sha>`) are deliberately not versions and
 * are left alone wherever they appear — see PIN_PATTERN.
 */
export const PINNED_FILES = [
  'README.md',
  'docs/YAML_SPECIFICATION.md',
  'docs/agent-manifest.json',
  'site/api-reference.md',
  'site/new-language-integration.md',
  'site/index.html',
  '.claude/skills/integrate-language/SKILL.md',
] as const;

/**
 * `spytial-core@` followed by an optional `v` (the GitHub-tag form used by the
 * `cdn.jsdelivr.net/gh/` URLs) and either a full semver or a bare major.
 *
 * A bare major is a deliberate float — `site/index.html` tracks `@4` so the
 * docs site picks up patches without a commit — so it is rewritten to the
 * current major only, never widened to a full pin. Anything that is not a
 * digit after the `@` (`main`, `<tag>`, `<version>`) fails `\d` and is skipped.
 */
const PIN_PATTERN = /(spytial-core@)(v?)(\d+)(\.\d+\.\d+)?/g;

export function readPackageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { version: string };
  return pkg.version;
}

/** The pin text a file should contain, given the released version. */
export function applyPins(source: string, version: string): string {
  const major = version.split('.')[0];
  return source.replace(
    PIN_PATTERN,
    (_match, prefix: string, v: string, _maj: string, patch?: string) =>
      `${prefix}${v}${patch ? version : major}`,
  );
}

export interface PinDrift {
  file: string;
  from: string;
  to: string;
}

/** Every pin that does not match `version`, without writing anything. */
export function findDrift(version = readPackageVersion()): PinDrift[] {
  const drift: PinDrift[] = [];

  for (const file of PINNED_FILES) {
    const source = readFileSync(join(REPO_ROOT, file), 'utf8');
    const wanted = applyPins(source, version);
    if (source === wanted) continue;

    // Report the pins themselves, not a whole-file diff: the pin is what a
    // reader has to fix, and there are only ever a handful per file.
    const before = source.match(PIN_PATTERN) ?? [];
    const after = wanted.match(PIN_PATTERN) ?? [];
    before.forEach((from, i) => {
      if (from !== after[i]) drift.push({ file, from, to: after[i] });
    });
  }

  return drift;
}

function main(): void {
  const check = process.argv.includes('--check');
  const version = readPackageVersion();
  const drift = findDrift(version);

  // The lockfile is the one surface this script cannot own — npm writes it —
  // but it is the one that drifted first after 4.4.0, so say so out loud.
  const lock = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'),
  ) as { version?: string; packages?: Record<string, { version?: string }> };
  const lockStale =
    lock.version !== version || lock.packages?.['']?.version !== version;

  if (drift.length === 0 && !lockStale) {
    console.log(`Version pins are in sync with package.json (${version}).`);
    return;
  }

  if (check) {
    for (const { file, from, to } of drift) {
      console.error(`${file}: ${from} should be ${to}`);
    }
    if (lockStale) {
      console.error(
        `package-lock.json: ${lock.version} should be ${version} — run \`npm install --package-lock-only\``,
      );
    }
    console.error('\nRun `npm run sync:versions` to fix the doc pins.');
    process.exit(1);
  }

  for (const file of PINNED_FILES) {
    const path = join(REPO_ROOT, file);
    const source = readFileSync(path, 'utf8');
    const wanted = applyPins(source, version);
    if (source !== wanted) writeFileSync(path, wanted);
  }
  for (const { file, from, to } of drift) {
    console.log(`${file}: ${from} -> ${to}`);
  }
  if (lockStale) {
    console.warn(
      `\npackage-lock.json still says ${lock.version} — run \`npm install --package-lock-only\`.`,
    );
  }
}

if (require.main === module) main();
