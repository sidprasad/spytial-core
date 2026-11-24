// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareCyclicCoordinates } from '../src/layout/cyclic-coordinate';

describe('cyclic unit-circle coordinates', () => {
    it('aligns within the absolute tolerance', () => {
        expect(compareCyclicCoordinates(Math.sin(0), Math.sin(Math.PI))).toBe(0);
        expect(compareCyclicCoordinates(1e-12, 0)).toBe(0);
        expect(compareCyclicCoordinates(0, 1e-12)).toBe(0);
        expect(compareCyclicCoordinates(2e-12, 0)).toBe(1);
        expect(compareCyclicCoordinates(0, 2e-12)).toBe(-1);
    });

    it('orders close distinct coordinates near the extrema of large templates', () => {
        const step500 = 2 * Math.PI / 500;
        const step499 = 2 * Math.PI / 499;
        // Near the extrema, adjacent vertices can differ by only O(1/n²) on one axis.
        const xAtPeak = Math.cos(0);
        const xBesidePeak = Math.cos(step500);
        const yNearPeak = Math.sin(125 * step499);
        const yBesidePeak = Math.sin(124 * step499);
        expect(compareCyclicCoordinates(xAtPeak, xBesidePeak)).toBe(1);
        expect(compareCyclicCoordinates(xBesidePeak, xAtPeak)).toBe(-1);
        expect(compareCyclicCoordinates(yNearPeak, yBesidePeak)).toBe(1);
        expect(compareCyclicCoordinates(yBesidePeak, yNearPeak)).toBe(-1);
    });
});
