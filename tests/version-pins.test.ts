/**
 * Version pins are derived, not typed by hand.
 *
 * The failure this guards: a release moves `package.json` and the pins scattered
 * through the docs stay behind. That is not hypothetical — before
 * `scripts/sync-versions.ts` this repo simultaneously advertised `@2.5.2` in the
 * integration skill, `@v4.2.0` in the spec doc and agent manifest, `@4` on the
 * docs site, and `@5.3.0` in the README. Users copy those lines.
 *
 * Two gates: nothing on the maintained list may drift, and nothing off it may
 * quietly grow a pin the script would never maintain.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PINNED_FILES,
  applyPins,
  findDrift,
  readPackageVersion,
} from '../scripts/sync-versions';

describe('version pins', () => {
  const version = readPackageVersion();

  it('every maintained pin matches package.json', () => {
    // Fix with `npm run sync:versions`.
    expect(findDrift(version)).toEqual([]);
  });

  it('no unmaintained file carries a concrete pin', () => {
    // Tracked files only: dist/ and node_modules carry built copies of these
    // same strings, and neither is a surface anyone edits.
    let matches = '';
    try {
      matches = execFileSync(
        'git',
        ['grep', '-lE', 'spytial-core@v?[0-9]', '--', '.'],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
    } catch (err) {
      // git grep exits 1 on no matches, which is a pass, not a crash.
      if ((err as { status?: number }).status !== 1) throw err;
    }
    const tracked = matches.split('\n').filter(Boolean);

    const unmaintained = tracked.filter(
      (f) =>
        !(PINNED_FILES as readonly string[]).includes(f) &&
        // Generated from package.json already, by build:language.
        f !== 'docs/spytial-language.json' &&
        f !== 'docs/spytial-spec.schema.json' &&
        // The script and this test quote pins to explain them.
        f !== 'scripts/sync-versions.ts' &&
        f !== 'tests/version-pins.test.ts',
    );

    // A new doc with a hand-typed pin lands here: add it to PINNED_FILES.
    expect(unmaintained).toEqual([]);
  });

  it('rewrites full pins, keeping the GitHub tag form distinct from npm', () => {
    expect(applyPins('npm/spytial-core@1.2.3/dist', '9.4.2')).toBe(
      'npm/spytial-core@9.4.2/dist',
    );
    expect(applyPins('gh/sidprasad/spytial-core@v1.2.3/docs', '9.4.2')).toBe(
      'gh/sidprasad/spytial-core@v9.4.2/docs',
    );
  });

  it('keeps a bare-major float floating instead of widening it to a full pin', () => {
    // site/index.html tracks the major so the docs site picks up patches
    // without a commit; pinning it fully would defeat that.
    expect(applyPins('spytial-core@4/dist/browser/x.js', '9.4.2')).toBe(
      'spytial-core@9/dist/browser/x.js',
    );
  });

  it('leaves placeholders alone — they are instructions, not versions', () => {
    for (const placeholder of ['@main', '@<tag>', '@<tag-or-sha>', '@<version>']) {
      const line = `cdn.jsdelivr.net/gh/sidprasad/spytial-core${placeholder}/docs/x.json`;
      expect(applyPins(line, '9.4.2')).toBe(line);
    }
  });

  it('does not touch pins for other packages that share the CDN line', () => {
    const line = '<link href="cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/x.css">';
    expect(applyPins(line, '9.4.2')).toBe(line);
  });

  it('keeps the lockfile on the same version, since npm owns that one', () => {
    const lock = JSON.parse(
      readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'),
    ) as { version?: string; packages?: Record<string, { version?: string }> };

    // Fix with `npm install --package-lock-only`.
    expect(lock.version).toBe(version);
    expect(lock.packages?.['']?.version).toBe(version);
  });
});
