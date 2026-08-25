import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { version } from '../src/index';

/**
 * `version` is the string on the public barrel and on `window.spytialcore`,
 * so a page can report which bundle it loaded. It was a hand-written '1.0.0'
 * literal from 1.0.0 through 5.2.x — wrong for four major releases, and
 * silently so. These tests guard the derivation that replaced it, not a
 * snapshot of the number.
 */
describe('core version', () => {
  const readConfig = (name: string) =>
    readFileSync(join(process.cwd(), name), 'utf8');

  /** Every build that ships the src/index.ts barrel to a consumer. */
  const barrelConfigs = [
    'tsup.browser.config.ts', // CDN IIFE, via src/global.ts
    'tsup.esm.config.ts',     // npm `.` import condition
    'tsup.config.ts',         // dev/watch build of the same entry
  ];

  it.each(barrelConfigs)('%s stamps the version from package.json', (name) => {
    const config = readConfig(name);

    expect(config).toContain(
      "const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))",
    );
    expect(config).toContain('__SPYTIAL_CORE_VERSION__: JSON.stringify(version)');
  });

  it('reads the exported version off that stamp, never off a literal', () => {
    const source = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');

    expect(source).toContain('export const version: string =');
    expect(source).toContain('__SPYTIAL_CORE_VERSION__');
    // The failure this replaced: a literal that nothing forces to move.
    expect(source).not.toMatch(/export const version(: string)? = '\d/);
  });

  it('says "unknown" rather than a stale number when nothing stamped it', () => {
    // This suite runs the barrel from source, where no build has stamped the
    // constant. Published artifacts all carry it — see the configs above.
    expect(version).toBe('unknown');
  });

  it('defaults CndCore config to the same version the barrel reports', async () => {
    const { createCndCore } = await import('../src/index');

    expect(createCndCore().getConfig().version).toBe(version);
    expect(createCndCore({ version: '9.9.9' }).getConfig().version).toBe('9.9.9');
  });
});
