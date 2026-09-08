/**
 * Every button in the graph toolbar shares one style, and a button added
 * through the public `addToolbarControl()` gets it too.
 *
 * Before, the look was declared twice, once as `#zoom-controls button` and
 * once as `#screenshot-btn`, and nothing matched a button appended to the
 * toolbar root, which is exactly where `addToolbarControl()` puts it. The
 * advertised way to add a control gave you an unstyled button, and the only
 * way to get a styled one was to reach into a shadow child by id.
 *
 * The shared rule is written `:where(#graph-toolbar) button` so its
 * specificity is that of a bare `button`: a subclass can still restyle its own
 * buttons with a single class (structured-input-graph's `.si-tb-btn` relies on
 * that). jsdom does no layout, so these pin the stylesheet text and the DOM
 * shape rather than measure anything.
 */
import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

const proto = WebColaCnDGraph.prototype as any;

const cssFor = (): string =>
    proto.getCSS.call({
        getFontImports: () => '',
        getFontFamily: () => 'sans-serif',
        getCanvasBackground: () => '#fffff8',
    });

/** Body of the first rule whose selector is exactly `selector`. */
const rule = (css: string, selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
};

const shadow = (): HTMLElement => {
    const root = document.createElement('div');
    proto.initializeDOM.call({ root, getCSS: () => '' });
    return root;
};

describe('toolbar button style', () => {
    it('declares one shared rule at bare-element specificity', () => {
        const shared = rule(cssFor(), ':where(#graph-toolbar) button');
        expect(shared).toMatch(/border:\s*1px solid/);
        expect(shared).toMatch(/border-radius/);
        expect(shared).toMatch(/height:\s*26px/);
        // min-width, not width: a text label may be wider than a glyph.
        expect(shared).toMatch(/min-width:\s*26px/);
        expect(shared).not.toMatch(/(^|[^-])width:\s*\d/);
    });

    it('no longer repeats the look per group', () => {
        const css = cssFor();
        expect(rule(css, '#zoom-controls button')).toBe('');
        expect(rule(css, '#screenshot-btn')).toBe('');
        // The group's layout rule stays; only the duplicated button look went.
        expect(rule(css, '#screenshot-control')).not.toBe('');
    });

    it('addToolbarControl() puts a bare button where the shared rule reaches it', () => {
        const root = shadow();
        const button = document.createElement('button');
        button.textContent = 'Full screen';
        proto.addToolbarControl.call({ shadowRoot: root }, button);

        const toolbar = root.querySelector('#graph-toolbar')!;
        expect(button.parentElement).toBe(toolbar);
        // A descendant of #graph-toolbar is all `:where(#graph-toolbar) button` asks for.
        expect(button.closest('#graph-toolbar')).toBe(toolbar);
    });

    it('labels fit-to-view with a word, not a full-screen lookalike glyph', () => {
        const fit = shadow().querySelector('#zoom-fit')!;
        expect(fit.textContent?.trim()).toBe('Fit');
        expect(fit.getAttribute('aria-label')).toBeTruthy();
    });
});
