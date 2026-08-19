/**
 * Bundled icons must be *inlined* into the diagram, not referenced through an
 * SVG `<image>`.
 *
 * The glyphs are drawn with `currentColor`, and `currentColor` inside an SVG
 * loaded through `<image>`/`<img>` resolves against the *referenced* document —
 * whose initial `color` is black — so nothing the host page sets can reach it.
 * The icon therefore tracked the browser's color scheme instead of the diagram's
 * theme, and went invisible on a dark canvas (issue #527). Inlined, `color`
 * cascades normally and the `.node-icon` rule points it at the label slot.
 *
 * Two things need pinning, and neither is visible in a screenshot (the browser's
 * own color handling made the old black glyphs *look* right):
 *  1. the registry only ever hands back markup this package authored, and
 *  2. the renderer inlines exactly that set, keeps `<image>` for everything
 *     else, and gives both the same geometry, class and tooltip.
 *
 * Renderer internals are exercised by prototype injection, the codebase idiom
 * (see atom-style-render.test.ts), over a real jsdom SVG.
 */
import { describe, it, expect, vi } from 'vitest';
import * as d3 from 'd3';
import {
    FALLBACK_ICON,
    getBundledIconNames,
    getInlinableIconSvg,
    resolveIconPath,
} from '../src/layout/icon-registry';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { stylesheetHost } from './helpers/renderer-stubs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const proto = WebColaCnDGraph.prototype as any;

describe('getInlinableIconSvg', () => {
    it('returns markup for a bundled name and for the path it resolves to', () => {
        // The renderer only ever sees the resolved form: resolveIconPath runs
        // while the spec is parsed, so the bundled name is gone by then.
        const byName = getInlinableIconSvg('person');
        const byPath = getInlinableIconSvg(resolveIconPath('person'));
        expect(byName).toBeDefined();
        expect(byPath).toBe(byName);
        expect(byName).toContain('currentColor');
    });

    it('covers every bundled icon', () => {
        for (const name of getBundledIconNames()) {
            expect(getInlinableIconSvg(resolveIconPath(name)), name).toContain('<svg');
        }
    });

    it('covers the fallback icon, which is drawn with currentColor too', () => {
        expect(getInlinableIconSvg(FALLBACK_ICON)).toContain('currentColor');
    });

    it('returns undefined for anything this package did not author', () => {
        // The safety property: only compile-time markup is ever eligible for
        // inlining, so an author-supplied path can never be injected as markup.
        expect(getInlinableIconSvg('')).toBeUndefined();
        expect(getInlinableIconSvg('https://evil.example/x.svg')).toBeUndefined();
        expect(getInlinableIconSvg('/assets/local.png')).toBeUndefined();
        expect(getInlinableIconSvg('bi:person-fill')).toBeUndefined();
        expect(getInlinableIconSvg('<svg onload="alert(1)"></svg>')).toBeUndefined();
        expect(
            getInlinableIconSvg('data:image/svg+xml,%3Csvg%20onload%3D%22alert(1)%22%3E%3C/svg%3E')
        ).toBeUndefined();
    });
});

describe('buildIconElement', () => {
    const build = (icon: string): SVGElement => proto.buildIconElement.call({}, icon);

    it('inlines a bundled icon as a nested <svg> that keeps currentColor', () => {
        const el = build(resolveIconPath('tic-x'));
        expect(el.namespaceURI).toBe(SVG_NS);
        expect(el.tagName).toBe('svg');
        // A nested <svg> scales its viewBox into the x/y/width/height box the
        // same way <image> did, so the icon* geometry helpers still apply.
        expect(el.getAttribute('viewBox')).toBe('0 0 16 16');
        expect(el.getAttribute('stroke')).toBe('currentColor');
    });

    it('draws an author-supplied URL through <image>, which cannot be inlined', () => {
        const el = build('https://example.com/icon.svg');
        expect(el.tagName).toBe('image');
        expect(el.getAttributeNS(XLINK_NS, 'href')).toBe('https://example.com/icon.svg');
    });

    it('hands out independent copies, not one shared template', () => {
        const a = build(resolveIconPath('person'));
        const b = build(resolveIconPath('person'));
        expect(a).not.toBe(b);
        a.setAttribute('fill', 'red');
        expect(b.getAttribute('fill')).toBe('currentColor');
    });
});

describe('setupNodeIcons', () => {
    // The real geometry helpers — the point is that an inlined <svg> takes the
    // same numbers <image> did, so stubbing them would test the stub.
    const host = {
        buildIconElement: proto.buildIconElement,
        iconTitle: proto.iconTitle,
        isBadgeIcon: proto.isBadgeIcon,
        iconWidth: proto.iconWidth,
        iconHeight: proto.iconHeight,
        iconX: proto.iconX,
        iconY: proto.iconY,
    };

    /** Render `nodes` through setupNodeIcons and return their <g> elements. */
    const render = (nodes: any[]): SVGGElement[] => {
        const svg = document.createElementNS(SVG_NS, 'svg');
        document.body.appendChild(svg);
        const selection = d3
            .select(svg)
            .selectAll('g.node')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node') as any;
        proto.setupNodeIcons.call(host, selection);
        return Array.from(svg.querySelectorAll('g.node'));
    };

    const bundledNode = {
        id: 'n1',
        label: 'n1',
        icon: resolveIconPath('tic-x'),
        iconPlacement: 'full',
        x: 100,
        y: 60,
        width: 40,
        height: 20,
    };

    it('classes both kinds .node-icon so every tick path positions them alike', () => {
        const [bundled, external] = render([
            bundledNode,
            { ...bundledNode, id: 'n2', icon: 'https://example.com/icon.svg' },
        ]);
        expect(bundled.querySelector('.node-icon')?.tagName).toBe('svg');
        expect(external.querySelector('.node-icon')?.tagName).toBe('image');
    });

    it('gives an inlined icon the geometry, opacity and tooltip <image> had', () => {
        const [g] = render([{ ...bundledNode, iconOpacity: 0.4 }]);
        const icon = g.querySelector('.node-icon')!;
        // full placement: the icon spans the box, whose center is (x, y).
        expect(icon.getAttribute('width')).toBe('40');
        expect(icon.getAttribute('height')).toBe('20');
        expect(icon.getAttribute('x')).toBe('80');
        expect(icon.getAttribute('y')).toBe('50');
        expect(icon.getAttribute('opacity')).toBe('0.4');
        expect(icon.querySelector('title')?.textContent).toBe('n1');
    });

    it('sizes a badge icon down and pins it to the top-right, as before', () => {
        const [g] = render([{ ...bundledNode, iconPlacement: 'badge' }]);
        const icon = g.querySelector('.node-icon')!;
        expect(Number(icon.getAttribute('width'))).toBeCloseTo(12);
        expect(Number(icon.getAttribute('height'))).toBeCloseTo(6);
    });

    it('replaces a failed <image> with the inlined fallback, so it is themed too', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const [g] = render([{ ...bundledNode, id: 'n3', icon: 'https://example.com/missing.svg' }]);

        const image = g.querySelector('.node-icon')!;
        image.dispatchEvent(new Event('error'));

        const fallback = g.querySelector('.node-icon')!;
        expect(fallback.tagName).toBe('svg');
        expect(fallback.getAttribute('stroke')).toBe('currentColor');
        // Same geometry as the <image> it stood in for — an icon-only atom has a
        // transparent box and no label, so a mispositioned fallback is nothing.
        expect(fallback.getAttribute('width')).toBe('40');
        expect(fallback.getAttribute('x')).toBe('80');
        expect(fallback.querySelector('title')?.textContent).toBe('n1');
        expect(consoleError).toHaveBeenCalledOnce();
        consoleError.mockRestore();
    });
});

describe('tick paths keep the icon on its node', () => {
    // `setupNodeIcons` writes the .node-icon class and all three tick paths read
    // it. Renaming one side leaves icons stranded at their first position while
    // everything else still moves — nothing else in the suite would notice, so
    // these drive the real functions.
    //
    // Each node <g> here holds only its icon, so every other selection those
    // functions make matches nothing and drops out. That keeps the scaffolding
    // to real (if empty) d3 selections rather than stubs standing in for the
    // behaviour under test.
    const geometry = {
        isBadgeIcon: proto.isBadgeIcon,
        iconWidth: proto.iconWidth,
        iconHeight: proto.iconHeight,
        iconX: proto.iconX,
        iconY: proto.iconY,
    };

    const mount = () => {
        const svg = document.createElementNS(SVG_NS, 'svg');
        document.body.appendChild(svg);
        const datum: any = {
            id: 'n1',
            label: 'n1',
            icon: resolveIconPath('tic-x'),
            iconPlacement: 'full',
            x: 100,
            y: 60,
            width: 40,
            height: 20,
        };
        const svgNodes = d3
            .select(svg)
            .selectAll('g.node')
            .data([datum])
            .enter()
            .append('g')
            .attr('class', 'node') as any;
        proto.setupNodeIcons.call(
            { ...geometry, buildIconElement: proto.buildIconElement, iconTitle: proto.iconTitle },
            svgNodes
        );
        const icon = (): Element => svg.querySelector('.node-icon')!;
        // The starting position, so a test that asserts movement cannot pass on
        // an icon that never moved.
        expect([icon().getAttribute('x'), icon().getAttribute('y')]).toEqual(['80', '50']);
        return { svg, datum, svgNodes, icon };
    };

    it('follows the node while the solver runs (updateNodePositionsOnly)', () => {
        const { datum, svgNodes, icon } = mount();
        datum.x = 300;
        datum.y = 200;

        proto.updateNodePositionsOnly.call({ ...geometry, svgNodes });

        expect(icon().getAttribute('x')).toBe('280');
        expect(icon().getAttribute('y')).toBe('190');
    });

    it('follows the node on every tick (updatePositions)', () => {
        const { svg, datum, svgNodes, icon } = mount();
        const empty = d3.select(svg).selectAll('.not-in-this-fixture');
        datum.x = 300;
        datum.y = 200;

        proto.updatePositions.call({
            ...geometry,
            svgNodes,
            svgGroups: empty,
            svgLinkGroups: empty,
            svgGroupLabels: empty,
            svgGroupLabelBgs: undefined,
            // The real one: it returns early on a detached element.
            onPositionsUpdated: () => {},
        });

        expect(icon().getAttribute('x')).toBe('280');
        expect(icon().getAttribute('y')).toBe('190');
    });

    it('tracks the WebCola bounds in grid mode (gridUpdatePositions)', () => {
        const { svg, datum, icon } = mount();
        // Grid mode registers a full-bleed icon with the bounds its rect is
        // drawn from, not with the visual box.
        datum.bounds = { x: 12, y: 34 };

        proto.gridUpdatePositions.call({
            ...geometry,
            container: d3.select(svg),
            ensureNodeBounds: () => undefined,
            // The real one, as above: it returns early on a detached element.
            onPositionsUpdated: () => {},
        });

        expect(icon().getAttribute('x')).toBe('12');
        expect(icon().getAttribute('y')).toBe('34');
    });
});

describe('themed glyph color', () => {
    it('points the inlined glyph at the label slot, black under the light baseline', () => {
        // `currentColor` is only half the fix — this rule is what it resolves
        // against. Light keeps the historical pure black; a dark canvas sets
        // --cnd-label-text and the glyph follows the labels.
        const css: string = proto.getCSS.call(stylesheetHost());
        expect(css).toMatch(/\.node-icon\s*\{[^}]*color:\s*var\(--cnd-label-text,\s*#000\)/);
    });
});
