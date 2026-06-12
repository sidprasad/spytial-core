/**
 * WP3 — theme tokens & presets.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  lightTheme,
  darkTheme,
  themeToCssVars,
  type SpecEditorTheme,
} from '../src/spec-editor/ui/theme';

// Every key the presets must populate. Kept here so the test fails loudly if a
// token is added to the interface but missed in a preset.
const ALL_TOKENS: Array<keyof SpecEditorTheme> = [
  'accent',
  'accentText',
  'surface',
  'surfaceRaised',
  'border',
  'text',
  'textMuted',
  'danger',
  'warning',
  'success',
  'fontFamily',
  'monoFontFamily',
  'fontSize',
  'radius',
  'spacing',
  'synKeyword',
  'synType',
  'synRelation',
  'synOperator',
  'synString',
  'synComment',
];

describe('theme presets', () => {
  it('lightTheme defines every token', () => {
    for (const key of ALL_TOKENS) {
      expect(lightTheme[key], `lightTheme.${key}`).toBeTypeOf('string');
      expect(lightTheme[key].length, `lightTheme.${key} non-empty`).toBeGreaterThan(0);
    }
  });

  it('darkTheme defines every token', () => {
    for (const key of ALL_TOKENS) {
      expect(darkTheme[key], `darkTheme.${key}`).toBeTypeOf('string');
      expect(darkTheme[key].length, `darkTheme.${key} non-empty`).toBeGreaterThan(0);
    }
  });

  it('light and dark differ on surface/text (not identical presets)', () => {
    expect(lightTheme.surface).not.toBe(darkTheme.surface);
    expect(lightTheme.text).not.toBe(darkTheme.text);
  });
});

describe('themeToCssVars', () => {
  it('maps camelCase tokens to kebab-case --spytial-ed-* vars', () => {
    const vars = themeToCssVars({
      accent: '#123456',
      accentText: '#ffffff',
      synKeyword: '#abcdef',
      surfaceRaised: '#eeeeee',
    });
    expect(vars['--spytial-ed-accent']).toBe('#123456');
    expect(vars['--spytial-ed-accent-text']).toBe('#ffffff');
    expect(vars['--spytial-ed-syn-keyword']).toBe('#abcdef');
    expect(vars['--spytial-ed-surface-raised']).toBe('#eeeeee');
  });

  it('only emits provided tokens (partial themes leave others as CSS fallbacks)', () => {
    const vars = themeToCssVars({ accent: '#000' });
    expect(Object.keys(vars)).toEqual(['--spytial-ed-accent']);
  });

  it('maps a full preset to all 21 vars', () => {
    const vars = themeToCssVars(lightTheme);
    expect(Object.keys(vars)).toHaveLength(ALL_TOKENS.length);
    expect(vars['--spytial-ed-mono-font-family']).toBe(lightTheme.monoFontFamily);
    expect(vars['--spytial-ed-font-size']).toBe(lightTheme.fontSize);
    expect(vars['--spytial-ed-syn-comment']).toBe(lightTheme.synComment);
  });

  it('ignores undefined token values', () => {
    const partial: SpecEditorTheme = { accent: '#111', surface: undefined };
    const vars = themeToCssVars(partial);
    expect(vars['--spytial-ed-accent']).toBe('#111');
    expect(vars['--spytial-ed-surface']).toBeUndefined();
  });
});
