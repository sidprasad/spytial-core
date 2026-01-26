import { describe, it, expect } from 'vitest';
import { 
  resolveIconPath, 
  getBundledIconNames, 
  getIconPackPrefixes,
  isBundledIcon,
  usesIconPack
} from '../src/layout/icon-registry';

describe('Icon Registry', () => {
  describe('getBundledIconNames', () => {
    it('should return an array of bundled icon names', () => {
      const names = getBundledIconNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('person');
      expect(names).toContain('tic-x');
      expect(names).toContain('tic-o');
    });
  });

  describe('getIconPackPrefixes', () => {
    it('should return available icon pack prefixes', () => {
      const prefixes = getIconPackPrefixes();
      expect(prefixes).toContain('bi');
      expect(prefixes).toContain('fa');
      expect(prefixes).toContain('lucide');
    });
  });

  describe('resolveIconPath', () => {
    it('should return empty string for empty input', () => {
      expect(resolveIconPath('')).toBe('');
    });

    it('should return URLs unchanged', () => {
      const url = 'https://example.com/icon.svg';
      expect(resolveIconPath(url)).toBe(url);
    });

    it('should return data URIs unchanged', () => {
      const dataUri = 'data:image/svg+xml,<svg></svg>';
      expect(resolveIconPath(dataUri)).toBe(dataUri);
    });

    it('should return absolute paths unchanged', () => {
      expect(resolveIconPath('/path/to/icon.png')).toBe('/path/to/icon.png');
    });

    it('should return relative paths unchanged', () => {
      expect(resolveIconPath('./icon.png')).toBe('./icon.png');
      expect(resolveIconPath('../icon.png')).toBe('../icon.png');
    });

    it('should resolve bundled icons to data URIs', () => {
      const resolved = resolveIconPath('person');
      expect(resolved).toMatch(/^data:image\/svg\+xml,/);
    });

    it('should resolve tic-x to a data URI', () => {
      const resolved = resolveIconPath('tic-x');
      expect(resolved).toMatch(/^data:image\/svg\+xml,/);
      expect(resolved).toContain('line');
    });

    it('should resolve tic-o to a data URI', () => {
      const resolved = resolveIconPath('tic-o');
      expect(resolved).toMatch(/^data:image\/svg\+xml,/);
      expect(resolved).toContain('circle');
    });

    it('should resolve icon pack references to CDN URLs', () => {
      const resolved = resolveIconPath('bi:person-fill');
      expect(resolved).toContain('cdn.jsdelivr.net');
      expect(resolved).toContain('bootstrap-icons');
      expect(resolved).toContain('person-fill.svg');
    });

    it('should resolve FontAwesome icons', () => {
      const resolved = resolveIconPath('fa:user');
      expect(resolved).toContain('cdn.jsdelivr.net');
      expect(resolved).toContain('fontawesome');
      expect(resolved).toContain('user.svg');
    });

    it('should return unknown icon names unchanged (as relative paths)', () => {
      expect(resolveIconPath('unknown-icon')).toBe('unknown-icon');
    });
  });

  describe('isBundledIcon', () => {
    it('should return true for bundled icons', () => {
      expect(isBundledIcon('person')).toBe(true);
      expect(isBundledIcon('tic-x')).toBe(true);
      expect(isBundledIcon('tic-o')).toBe(true);
    });

    it('should return false for non-bundled icons', () => {
      expect(isBundledIcon('unknown')).toBe(false);
      expect(isBundledIcon('bi:person')).toBe(false);
    });
  });

  describe('usesIconPack', () => {
    it('should return true for icon pack references', () => {
      expect(usesIconPack('bi:person')).toBe(true);
      expect(usesIconPack('fa:user')).toBe(true);
      expect(usesIconPack('lucide:home')).toBe(true);
    });

    it('should return false for non-pack references', () => {
      expect(usesIconPack('person')).toBe(false);
      expect(usesIconPack('/path/to/icon.png')).toBe(false);
      expect(usesIconPack('unknown:icon')).toBe(false); // unknown pack
    });
  });
});
