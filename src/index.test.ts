import { describe, it, expect } from 'vitest';
import { CndCore, createCndCore, version } from './index';

describe('CndCore', () => {
  it('should create an instance with default config', () => {
    const core = new CndCore();
    const config = core.getConfig();
    
    expect(config.debug).toBe(false);
    expect(config.version).toBe('1.0.0');
  });

  it('should create an instance with custom config', () => {
    const core = new CndCore({ debug: true, version: '2.0.0' });
    const config = core.getConfig();
    
    expect(config.debug).toBe(true);
    expect(config.version).toBe('2.0.0');
  });

  it('should update config', () => {
    const core = new CndCore();
    core.updateConfig({ debug: true });
    
    const config = core.getConfig();
    expect(config.debug).toBe(true);
  });

  it('should initialize without errors', () => {
    const core = new CndCore();
    expect(() => core.init()).not.toThrow();
  });
});

describe('createCndCore factory function', () => {
  it('should create a CndCore instance', () => {
    const core = createCndCore();
    expect(core).toBeInstanceOf(CndCore);
  });

  it('should pass config to CndCore constructor', () => {
    const core = createCndCore({ debug: true });
    const config = core.getConfig();
    expect(config.debug).toBe(true);
  });
});

describe('version export', () => {
  it('should export version string', () => {
    expect(version).toBe('1.0.0');
    expect(typeof version).toBe('string');
  });
});
