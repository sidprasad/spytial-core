import { describe, it, expect } from 'vitest';
import {
    estimateLabelBox,
    estimateTextWidth,
    MAIN_LABEL_FONT_SIZE,
    SECONDARY_FONT_SIZE,
    LABEL_LINE_HEIGHT_RATIO,
} from '../src/layout/text-extent';

describe('font size constants', () => {
    it('exposes a main label font size larger than the secondary size', () => {
        expect(MAIN_LABEL_FONT_SIZE).toBeGreaterThan(SECONDARY_FONT_SIZE);
    });

    it('exposes a sane line-height ratio', () => {
        expect(LABEL_LINE_HEIGHT_RATIO).toBeGreaterThan(1);
        expect(LABEL_LINE_HEIGHT_RATIO).toBeLessThan(2);
    });
});

describe('estimateTextWidth', () => {
    it('returns 0 for empty string', () => {
        expect(estimateTextWidth('', MAIN_LABEL_FONT_SIZE, 0.65)).toBe(0);
    });

    it('grows roughly linearly with character count', () => {
        const w5 = estimateTextWidth('aaaaa', MAIN_LABEL_FONT_SIZE, 0.65);
        const w10 = estimateTextWidth('aaaaaaaaaa', MAIN_LABEL_FONT_SIZE, 0.65);
        expect(w10).toBeCloseTo(w5 * 2, 5);
    });

    it('treats wide capitals as wider than lowercase', () => {
        const lower = estimateTextWidth('xxxxxxxxxx', MAIN_LABEL_FONT_SIZE, 0.65);
        const upper = estimateTextWidth('AAAAAAAAAA', MAIN_LABEL_FONT_SIZE, 0.65);
        expect(upper).toBeGreaterThan(lower);
    });

    it('treats narrow chars as narrower than average', () => {
        const narrow = estimateTextWidth('iiiiiiiiii', MAIN_LABEL_FONT_SIZE, 0.65);
        const avg = estimateTextWidth('xxxxxxxxxx', MAIN_LABEL_FONT_SIZE, 0.65);
        expect(narrow).toBeLessThan(avg);
    });
});

describe('estimateLabelBox', () => {
    const FLOOR = { w: 100, h: 60 };
    const CEIL = { w: 280, h: 140 };

    it('returns the floor for empty input', () => {
        const box = estimateLabelBox('');
        expect(box.width).toBe(FLOOR.w);
        expect(box.height).toBe(FLOOR.h);
    });

    it('keeps short single-character labels at the floor (no shrinking)', () => {
        const box = estimateLabelBox('x');
        expect(box.width).toBe(FLOOR.w);
        expect(box.height).toBe(FLOOR.h);
    });

    it('grows width past the floor for long main labels', () => {
        const box = estimateLabelBox('OverviewMetricsDashboard');
        expect(box.width).toBeGreaterThan(FLOOR.w);
        expect(box.width).toBeLessThanOrEqual(CEIL.w);
    });

    it('clamps width to the ceiling for absurdly long labels', () => {
        const box = estimateLabelBox('x'.repeat(500));
        expect(box.width).toBe(CEIL.w);
    });

    it('measures secondary lines at the smaller secondary font size', () => {
        // A secondary line of the same character count should produce a
        // smaller width contribution than the main label, since secondary
        // text is rendered at SECONDARY_FONT_SIZE.
        const longText = 'OverviewMetricsDashboard';
        const mainOnly = estimateLabelBox(longText);
        const secondaryOnly = estimateLabelBox('x', [longText]);
        expect(secondaryOnly.width).toBeLessThan(mainOnly.width);
    });

    it('grows height with each secondary line', () => {
        const single = estimateLabelBox('label');
        const withTwo = estimateLabelBox('label', ['attr1: value', 'attr2: value']);
        expect(withTwo.height).toBeGreaterThan(single.height);
        expect(withTwo.height).toBeLessThanOrEqual(CEIL.h);
    });

    it('clamps height to the ceiling for many secondary lines', () => {
        const lines = Array.from({ length: 50 }, (_, i) => `attr${i}: v`);
        const box = estimateLabelBox('main', lines);
        expect(box.height).toBe(CEIL.h);
    });

    it('ignores empty secondary lines', () => {
        const a = estimateLabelBox('main', ['', '', '']);
        const b = estimateLabelBox('main');
        expect(a).toEqual(b);
    });

    it('honors a custom floor (used by layoutinstance to set 100×60)', () => {
        const box = estimateLabelBox('x', [], { min: { w: 150, h: 80 } });
        expect(box.width).toBe(150);
        expect(box.height).toBe(80);
    });

    it('produces integer width and height', () => {
        const box = estimateLabelBox('SomeLabel', ['kind: example']);
        expect(Number.isInteger(box.width)).toBe(true);
        expect(Number.isInteger(box.height)).toBe(true);
    });
});
