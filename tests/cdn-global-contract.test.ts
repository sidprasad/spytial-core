import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { exposeComponentBundleGlobals } from '../src/cdn-globals';

describe('CDN global contract', () => {
  it('keeps the runtime global intact when the components bundle loads later', () => {
    class JSONDataInstance {}

    const runtimeCore = {
      JSONDataInstance,
      parseLayoutSpec: () => ({ ok: true }),
    };
    const componentApi = {
      mountCndLayoutInterface: () => 'mounted',
    };
    const globalWindow: any = {
      spytialcore: runtimeCore,
      CnDCore: runtimeCore,
      CndCore: runtimeCore,
    };

    const mergedCore = exposeComponentBundleGlobals(globalWindow, componentApi);

    expect(mergedCore).toBe(runtimeCore);
    expect(globalWindow.spytialcore).toBe(runtimeCore);
    expect(globalWindow.CnDCore).toBe(runtimeCore);
    expect(globalWindow.CndCore).toBe(runtimeCore);
    expect(globalWindow.spytialComponents).toBe(componentApi);
    expect(globalWindow.CnDComponents).toBe(componentApi);
    expect(globalWindow.CndComponents).toBe(componentApi);
    expect(globalWindow.spytialcore.JSONDataInstance).toBe(JSONDataInstance);
    expect(globalWindow.spytialcore.mountCndLayoutInterface).toBe(
      componentApi.mountCndLayoutInterface,
    );
  });

  it('publishes the components bundle separately when the runtime bundle is absent', () => {
    const componentApi = {
      mountCndLayoutInterface: () => 'mounted',
    };
    const globalWindow: any = {};

    const mergedCore = exposeComponentBundleGlobals(globalWindow, componentApi);

    expect(mergedCore).toBeUndefined();
    expect(globalWindow.spytialcore).toBeUndefined();
    expect(globalWindow.CnDCore).toBeUndefined();
    expect(globalWindow.CndCore).toBeUndefined();
    expect(globalWindow.spytialComponents).toBe(componentApi);
    expect(globalWindow.CnDComponents).toBe(componentApi);
    expect(globalWindow.CndComponents).toBe(componentApi);
  });

  it('configures the browser bundle footer to merge preloaded component globals', () => {
    const configText = readFileSync(
      join(process.cwd(), 'tsup.browser.config.ts'),
      'utf8',
    );

    expect(configText).toContain('window.spytialComponents');
    expect(configText).toContain('Object.assign(window.spytialcore,componentApi)');
    expect(configText).toContain('window.CndCore=window.spytialcore');
    expect(configText).toContain('window.CnDCore=window.spytialcore');
  });
});
