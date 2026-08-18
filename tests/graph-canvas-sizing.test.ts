/**
 * The canvas must fit *inside* the host element, not overhang it.
 *
 * The toolbar and the canvas are stacked in the same host, and the canvas used
 * to ask for `height: 100%` of that host — which ignores the toolbar above it.
 * The canvas therefore ran past the bottom of the host by the toolbar's height
 * (~53px), so the bottom of every diagram was cut off however far you zoomed
 * out: the fit centres content in the canvas, and the bottom strip of that
 * canvas was outside the host's box.
 *
 * jsdom does no layout, so these are structural pins rather than measurements
 * (that check was done in a real browser). What they catch is a revert: the
 * wrapper disappearing, or `height: 100%` coming back on the canvas.
 */
import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { stylesheetHost } from './helpers/renderer-stubs';

const proto = WebColaCnDGraph.prototype as any;

const cssFor = (): string => proto.getCSS.call(stylesheetHost());

/** Body of the first rule matching `selector` (an id) in the shadow stylesheet. */
const rule = (css: string, selector: string): string => {
    const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
};

describe('graph shell', () => {
    const shadow = (): HTMLElement => {
        const root = document.createElement('div');
        proto.initializeDOM.call({ root, getCSS: () => '' });
        return root;
    };

    it('stacks the toolbar and the canvas inside one wrapper', () => {
        const shell = shadow().querySelector('#graph-shell')!;
        expect(shell).toBeTruthy();
        expect(shell.querySelector('#graph-toolbar')).toBeTruthy();
        expect(shell.querySelector('#svg-container')).toBeTruthy();
        expect(shell.querySelector('#svg')).toBeTruthy();
    });

    it('divides the height in the wrapper, not on :host', () => {
        // A host page's own rule for the element outranks anything :host says,
        // so putting the column on :host would let a stylesheet outside the
        // component collapse the canvas. Nothing outside can reach the wrapper.
        const css = cssFor();
        const shell = rule(css, '#graph-shell');
        expect(shell).toMatch(/display:\s*flex/);
        expect(shell).toMatch(/flex-direction:\s*column/);
        expect(shell).toMatch(/height:\s*100%/);
    });

    it('gives the canvas what the toolbar leaves, never the whole host', () => {
        const container = rule(cssFor(), '#svg-container');
        expect(container).toMatch(/flex:\s*1 1 auto/);
        // Without this a flex item floors at its content height, which is how
        // the overflow would come back.
        expect(container).toMatch(/min-height:\s*0/);
        expect(container).not.toMatch(/height:\s*100%/);
    });

    it('keeps the toolbar at its natural height', () => {
        expect(rule(cssFor(), '#graph-toolbar')).toMatch(/flex:\s*0 0 auto/);
    });
});
