import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

describe('clipLineToRectExit', () => {
  const proto = WebColaCnDGraph.prototype as any;

  const rect = (x: number, y: number, w: number, h: number) => ({
    x, y, width: () => w, height: () => h,
  });

  it('clips a horizontal line to the right edge', () => {
    const r = rect(0, 0, 50, 30);
    const inside = { x: 25, y: 15 }; // center
    const outside = { x: 100, y: 15 };
    const exit = proto.clipLineToRectExit.call({}, inside, outside, r);
    expect(exit.x).toBeCloseTo(50, 5);
    expect(exit.y).toBeCloseTo(15, 5);
  });

  it('clips a vertical line to the bottom edge', () => {
    const r = rect(0, 0, 50, 30);
    const inside = { x: 25, y: 15 };
    const outside = { x: 25, y: 100 };
    const exit = proto.clipLineToRectExit.call({}, inside, outside, r);
    expect(exit.x).toBeCloseTo(25, 5);
    expect(exit.y).toBeCloseTo(30, 5);
  });

  it('clips a diagonal line to the correct edge (whichever it hits first)', () => {
    // 50x30 rect with center (25,15). Going SE at 45° hits bottom (y=30) at
    // parametric t = 15/dy. Going SE at a shallower angle hits right (x=50) first.
    const r = rect(0, 0, 50, 30);
    const inside = { x: 25, y: 15 };
    // Shallow angle: dx = 50, dy = 10 → t for right = 25/50 = 0.5, t for bottom = 15/10 = 1.5
    // Right wins.
    const outside = { x: 75, y: 25 };
    const exit = proto.clipLineToRectExit.call({}, inside, outside, r);
    expect(exit.x).toBeCloseTo(50, 5);
    expect(exit.y).toBeCloseTo(20, 5);
  });
});
