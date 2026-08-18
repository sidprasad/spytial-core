/**
 * Coverage for the graph's theme resolution, which had none before it was a
 * unit you could reach: every decision lived on WebColaCnDGraph, so testing a
 * color rule meant standing up an element or hand-copying the rule into a fake
 * `this`. ThemeController is DOM-free, so the rules can be checked directly.
 *
 * The load-bearing property throughout is that the light baseline is *identity*:
 * an unthemed graph must paint exactly what it painted before theming existed.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ThemeController,
  DARK_THEME,
  DEFAULT_CANVAS_BG,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_IMPORT
} from '../src/translators/webcola/theming';
import { ColorSource } from '../src/layout/interfaces';
import { setLabLightness } from '../src/layout/colorpicker';

/** A controller over a host with the given display attributes set. */
const controller = (attributes: Record<string, string> = {}) =>
  new ThemeController({ attribute: name => attributes[name] ?? null });

describe('ThemeController — registry', () => {
  it('ships light and dark, in that order', () => {
    expect(controller().names()).toEqual(['light', 'dark']);
  });

  it('starts on light', () => {
    expect(controller().name).toBe('light');
  });

  it('appends registered themes after the built-ins', () => {
    const c = controller();
    c.register([{ name: 'sepia', slots: { '--cnd-canvas-bg': '#f4ecd8' } }]);
    expect(c.names()).toEqual(['light', 'dark', 'sepia']);
  });

  it('lets a registered theme replace a built-in of the same name, keeping its slot', () => {
    const c = controller();
    c.register([{ name: 'dark', label: 'Midnight', slots: { '--cnd-canvas-bg': '#000' } }]);
    expect(c.names()).toEqual(['light', 'dark']);
    expect(c.labelFor('dark')).toBe('Midnight');
  });

  it('skips a nameless theme with a warning rather than corrupting the registry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = controller();
    c.register([{ name: '' } as never, { name: 'ok' }]);
    expect(c.names()).toEqual(['light', 'dark', 'ok']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('copies a registered theme, so a later caller mutation cannot reach the registry', () => {
    const c = controller();
    const theme = { name: 'sepia', label: 'Sepia' };
    c.register([theme]);
    theme.label = 'Changed';
    expect(c.labelFor('sepia')).toBe('Sepia');
  });

  it('title-cases a name that carries no explicit label', () => {
    const c = controller();
    c.register([{ name: 'solarized' }]);
    expect(c.labelFor('solarized')).toBe('Solarized');
    expect(c.labelFor('light')).toBe('Light');
  });
});

describe('ThemeController — selecting a theme', () => {
  it('falls back to light for an unknown name', () => {
    const c = controller();
    c.select('nope');
    expect(c.name).toBe('light');
    expect(c.resolvedSlots()).toEqual({});
  });

  it('replaces the override layers rather than merging them', () => {
    const c = controller();
    c.select('dark', { '--cnd-edge-color': '#fff' }, { lightness: 80 });
    c.select('dark');
    expect(c.overrides).toEqual({});
    expect(c.nodeColors).toEqual({});
  });
});

describe('ThemeController — slots', () => {
  it('sets nothing under light, so the stylesheet literals stand', () => {
    expect(controller().resolvedSlots()).toEqual({});
  });

  it('sets the full dark palette under dark', () => {
    const c = controller();
    c.select('dark');
    expect(c.resolvedSlots()).toEqual(DARK_THEME);
  });

  it('treats the background attribute as canvas sugar over either base theme', () => {
    expect(controller({ background: '#eee' }).resolvedSlots()).toEqual({ '--cnd-canvas-bg': '#eee' });
    const dark = controller({ background: '#eee' });
    dark.select('dark');
    expect(dark.resolvedSlots()['--cnd-canvas-bg']).toBe('#eee');
  });

  it('lets an explicit override beat both the theme and the background attribute', () => {
    const c = controller({ background: '#eee' });
    c.select('dark', { '--cnd-canvas-bg': '#101010' });
    expect(c.resolvedSlots()['--cnd-canvas-bg']).toBe('#101010');
  });

  it('ignores an empty override instead of clearing the layer beneath it', () => {
    const c = controller();
    c.select('dark', { '--cnd-canvas-bg': '' });
    expect(c.resolvedSlots()['--cnd-canvas-bg']).toBe(DARK_THEME['--cnd-canvas-bg']);
  });

  it('reports every slot any registered theme can set, so a switch clears them all', () => {
    const c = controller();
    c.register([{ name: 'sepia', slots: { '--cnd-paper-grain': 'url(#g)' } }]);
    const keys = c.allSlotKeys();
    expect(keys.has('--cnd-paper-grain')).toBe(true);
    for (const key of Object.keys(DARK_THEME)) expect(keys.has(key)).toBe(true);
  });
});

describe('ThemeController — canvas background', () => {
  it('is the warm-white default with no theme and no attribute', () => {
    expect(controller().canvasBackground()).toBe(DEFAULT_CANVAS_BG);
  });

  it('resolves override over attribute over theme over default', () => {
    expect(controller({ background: '#eee' }).canvasBackground()).toBe('#eee');

    const dark = controller();
    dark.select('dark');
    expect(dark.canvasBackground()).toBe(DARK_THEME['--cnd-canvas-bg']);

    const attributeBeatsTheme = controller({ background: '#eee' });
    attributeBeatsTheme.select('dark');
    expect(attributeBeatsTheme.canvasBackground()).toBe('#eee');

    const overrideBeatsAttribute = controller({ background: '#eee' });
    overrideBeatsAttribute.select('dark', { '--cnd-canvas-bg': '#101010' });
    expect(overrideBeatsAttribute.canvasBackground()).toBe('#101010');
  });

  it('follows the host attribute as it changes, because it reads it live', () => {
    const attributes: Record<string, string> = {};
    const c = new ThemeController({ attribute: name => attributes[name] ?? null });
    expect(c.canvasBackground()).toBe(DEFAULT_CANVAS_BG);
    attributes.background = '#123456';
    expect(c.canvasBackground()).toBe('#123456');
  });
});

describe('ThemeController — fonts', () => {
  it('defaults to the Atkinson Hyperlegible stack and pays for its import', () => {
    const c = controller();
    expect(c.fontFamily()).toBe(DEFAULT_FONT_FAMILY);
    expect(c.fontImports()).toBe(DEFAULT_FONT_IMPORT);
  });

  it('takes the host font stack and skips the unused download', () => {
    const c = controller({ 'font-family': 'Comic Sans MS, cursive' });
    expect(c.fontFamily()).toBe('Comic Sans MS, cursive');
    expect(c.fontImports()).toBe('');
  });

  it('treats an empty font-family as set — the host asked for the browser default', () => {
    const c = controller({ 'font-family': '' });
    expect(c.fontFamily()).toBe('');
    expect(c.fontImports()).toBe('');
  });
});

describe('ThemeController — data-driven colors', () => {
  it('passes a chosen color through untouched under every theme', () => {
    const light = controller();
    expect(light.dataColor('#e63946', '--cnd-edge-color', null)).toBe('#e63946');
    const dark = controller();
    dark.select('dark');
    expect(dark.dataColor('#e63946', '--cnd-edge-color', null)).toBe('#e63946');
  });

  it('uses the light fallback for the implicit default when no slot is themed', () => {
    const c = controller();
    expect(c.dataColor('black', '--cnd-node-border', 'black')).toBe('black');
    expect(c.dataColor(undefined, '--cnd-edge-color', null)).toBeNull();
  });

  it('swaps the theme slot in for every spelling of the implicit black default', () => {
    const c = controller();
    c.select('dark');
    for (const implicit of [undefined, null, '', 'black', '#000', '#000000']) {
      expect(c.dataColor(implicit, '--cnd-edge-color', null)).toBe(DARK_THEME['--cnd-edge-color']);
    }
  });

  it('lets a slot override stand in for the theme value', () => {
    const c = controller();
    c.select('dark', { '--cnd-edge-color': '#ff00ff' });
    expect(c.dataColor('black', '--cnd-edge-color', null)).toBe('#ff00ff');
  });
});

describe('ThemeController — node colors', () => {
  const palette = '#4c72b0';

  it('is identity under light, preserving the historical look exactly', () => {
    const c = controller();
    expect(c.nodeColor(palette, ColorSource.DefaultPalette, '--cnd-node-border', 'black')).toBe(palette);
  });

  it('re-tints an algorithm-assigned color to the theme lightness', () => {
    const c = controller();
    c.select('dark');
    expect(c.nodeColor(palette, ColorSource.DefaultPalette, '--cnd-node-border', 'black'))
      .toBe(setLabLightness(palette, 74));
  });

  it('leaves a user color directive alone even on a dark canvas', () => {
    const c = controller();
    c.select('dark');
    expect(c.nodeColor(palette, ColorSource.Directive, '--cnd-node-border', 'black')).toBe(palette);
  });

  it('treats a missing source as the default palette, for back-compatibility', () => {
    const c = controller();
    c.select('dark');
    expect(c.nodeColor(palette, undefined, '--cnd-node-border', 'black'))
      .toBe(setLabLightness(palette, 74));
  });

  it('sends the implicit black default to the theme slot rather than re-tinting it', () => {
    const c = controller();
    c.select('dark');
    expect(c.nodeColor('black', ColorSource.DefaultPalette, '--cnd-node-border', 'black'))
      .toBe(DARK_THEME['--cnd-node-border']);
  });

  it('honours a per-call lightness override on top of the theme', () => {
    const c = controller();
    c.select('dark', undefined, { lightness: 90 });
    expect(c.nodeColor(palette, ColorSource.DefaultPalette, '--cnd-node-border', 'black'))
      .toBe(setLabLightness(palette, 90));
  });
});
