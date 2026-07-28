/**
 * Coverage for the `iconPath` field kind — the built-in icon browser in the
 * No Code builder.
 *
 * The contract the tests defend: the text input stays authoritative (an author
 * can always type a URL, path, or pack reference, and picking never takes that
 * away), the browser only ever offers icons that need no network, and CDN packs
 * are presented as guidance rather than as unpreviewable thumbnails.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FieldRenderer } from '../src/spec-editor/ui/FieldRenderer';
import type { FieldSpec } from '../src/spec-editor/core/types';
import { getDefinitions } from '../src/spec-editor';
import {
    getBundledIconNames,
    getBundledIconSvg,
    getIconPacks,
    getIconPackPrefixes,
    resolveIconPath,
} from '../src/layout/icon-registry';

const iconField: FieldSpec = {
    key: 'path',
    kind: 'iconPath',
    label: 'Icon',
    placeholder: 'e.g. person, bi:person-fill, https://…',
};

const openBrowser = (): void => {
    fireEvent.click(screen.getByRole('button', { name: /browse built-in icons/i }));
};

describe('registry — atomStyle exposes the icon browser', () => {
    it('registers iconStyle.path as an iconPath field, not plain text', () => {
        const atomStyle = getDefinitions('directive').find((d) => d.type === 'atomStyle');
        const iconStyle = atomStyle?.fields.find((f) => f.key === 'iconStyle');
        const path = iconStyle?.children?.find((c) => c.key === 'path');
        expect(path?.kind).toBe('iconPath');
    });

    it('keeps the block sparse — no seeded default on the icon path', () => {
        const atomStyle = getDefinitions('directive').find((d) => d.type === 'atomStyle');
        const iconStyle = atomStyle?.fields.find((f) => f.key === 'iconStyle');
        for (const child of iconStyle?.children ?? []) {
            expect(child.default).toBeUndefined();
        }
    });
});

describe('IconField — typing stays authoritative', () => {
    it('edits freely, so URLs and pack references are unaffected by the picker', () => {
        const onChange = vi.fn();
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'https://example.com/x.svg' } });
        expect(onChange).toHaveBeenCalledWith('path', 'https://example.com/x.svg');
    });

    it('does not open the browser unless asked', () => {
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={vi.fn()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('previews a bundled value inline but not a remote one', () => {
        const { rerender } = render(
            <FieldRenderer fields={[iconField]} values={{ path: 'person' }} onChange={vi.fn()} />,
        );
        // Bundled icons inline as real SVG — no network, and the theme colour
        // reaches them (see the currentColor test below).
        const preview = document.querySelector('.spytial-ed-icon-preview');
        expect(preview?.querySelector('svg')).toBeTruthy();

        // A remote URL would need a round-trip (and would show a broken-image
        // glyph inside the form if it failed), so it is deliberately not drawn.
        rerender(
            <FieldRenderer
                fields={[iconField]}
                values={{ path: 'https://example.com/x.svg' }}
                onChange={vi.fn()}
            />,
        );
        expect(document.querySelector('.spytial-ed-icon-preview')).toBeNull();
    });
});

/**
 * Regression guard for a bug found by sampling rendered pixels in a real
 * browser: bundled glyphs are drawn with `fill="currentColor"`, and inside an
 * `<img>` that resolves against the SVG document (initial colour black), not
 * the page — so thumbnails came out pure black on the dark theme's near-black
 * surface. Inlining the markup is what makes the colour cascade in.
 */
describe('IconField — bundled glyphs inherit the theme colour', () => {
    it('inlines bundled markup rather than using <img>, so currentColor applies', () => {
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={vi.fn()} />);
        openBrowser();
        const cells = document.querySelectorAll('.spytial-ed-icon-cell');
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of Array.from(cells)) {
            expect(cell.querySelector('svg')).toBeTruthy();
            // An <img> here would be the bug: it cannot inherit the theme colour.
            expect(cell.querySelector('img')).toBeNull();
        }
    });

    it('keeps currentColor in the inlined markup for the theme to drive', () => {
        const svg = getBundledIconSvg('person');
        expect(svg).toBeTruthy();
        expect(svg).toContain('currentColor');
        expect(svg!.startsWith('<svg')).toBe(true);
    });

    it('refuses to inline anything it did not author, which is what keeps it safe', () => {
        // The component feeds only this function's output to dangerouslySetInnerHTML,
        // so a value an author typed can never be inlined.
        expect(getBundledIconSvg('https://evil.example/x.svg')).toBeUndefined();
        expect(getBundledIconSvg('<script>alert(1)</script>')).toBeUndefined();
        expect(getBundledIconSvg('bi:person-fill')).toBeUndefined();
    });

    it('round-trips: the inlined markup encodes back to the resolved data URI', () => {
        for (const name of getBundledIconNames()) {
            const svg = getBundledIconSvg(name)!;
            expect(`data:image/svg+xml,${encodeURIComponent(svg)}`).toBe(resolveIconPath(name));
        }
    });
});

describe('IconField — the browser', () => {
    it('offers every bundled icon', () => {
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={vi.fn()} />);
        openBrowser();
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(getBundledIconNames().length);
    });

    it('writes the bundled NAME, not the resolved data URI, so the spec stays readable', () => {
        const onChange = vi.fn();
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={onChange} />);
        openBrowser();
        fireEvent.click(screen.getByRole('option', { name: /(^|\s)person(\s|$)/i }));
        expect(onChange).toHaveBeenCalledWith('path', 'person');
    });

    it('closes after a pick', () => {
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={vi.fn()} />);
        openBrowser();
        fireEvent.click(screen.getAllByRole('option')[0]);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('filters by name and explains an empty result instead of going blank', () => {
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={vi.fn()} />);
        openBrowser();
        const search = screen.getByLabelText(/filter bundled icons/i);

        fireEvent.change(search, { target: { value: 'star' } });
        const names = screen.getAllByRole('option').map((o) => o.getAttribute('title'));
        expect(names.length).toBeGreaterThan(0);
        expect(names.every((n) => n!.includes('star'))).toBe(true);

        fireEvent.change(search, { target: { value: 'zzzznope' } });
        expect(screen.queryAllByRole('option')).toHaveLength(0);
        expect(screen.getByText(/no bundled icon matches/i)).toBeTruthy();
    });

    it('marks the current value as the selected option', () => {
        render(<FieldRenderer fields={[iconField]} values={{ path: 'gear' }} onChange={vi.fn()} />);
        openBrowser();
        const selected = screen.getAllByRole('option').filter(
            (o) => o.getAttribute('aria-selected') === 'true',
        );
        expect(selected).toHaveLength(1);
        expect(selected[0].getAttribute('title')).toBe('gear');
    });

    it('lists CDN packs as guidance, without pretending to preview them', () => {
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={vi.fn()} />);
        openBrowser();
        const packs = document.querySelector('.spytial-ed-icon-packs') as HTMLElement;
        expect(packs).toBeTruthy();
        for (const p of getIconPacks()) {
            expect(within(packs).getByText(`${p.prefix}:`)).toBeTruthy();
        }
        // No thumbnails in the pack section — they'd need a network round-trip.
        expect(packs.querySelectorAll('img')).toHaveLength(0);
    });

    it('closes on Escape', () => {
        render(<FieldRenderer fields={[iconField]} values={{}} onChange={vi.fn()} />);
        openBrowser();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('icon-registry — pack metadata', () => {
    it('labels every pack the resolver knows, so the two cannot drift', () => {
        const described = getIconPacks().map((p) => p.prefix);
        expect(described.sort()).toEqual(getIconPackPrefixes().sort());
        for (const p of getIconPacks()) {
            expect(p.label.length).toBeGreaterThan(0);
            expect(p.label).not.toBe(p.prefix); // a real name, not the fallback
        }
    });

    it('gives each pack an example that resolves to that pack’s CDN', () => {
        for (const p of getIconPacks()) {
            expect(p.example.startsWith(`${p.prefix}:`)).toBe(true);
            expect(resolveIconPath(p.example)).toMatch(/^https:\/\//);
        }
    });
});
