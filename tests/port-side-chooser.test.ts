import { describe, expect, it } from 'vitest';
import {
  choosePortSides,
  naturalExitSide,
  sideCenter,
  type SideRect,
} from '../src/translators/webcola/routing';

// 50x60 nodes on a horizontal line, like a rendered linked list.
const rect = (x: number, y: number): SideRect => ({ minX: x, minY: y, maxX: x + 50, maxY: y + 60 });
// Router obstacles are inflated by the clearance; mirror that here.
const inflate = (r: SideRect, c = 6) => ({ minX: r.minX - c, minY: r.minY - c, maxX: r.maxX + c, maxY: r.maxY + c });

describe('naturalExitSide', () => {
  it('is aspect-ratio aware', () => {
    const r: SideRect = { minX: 0, minY: 0, maxX: 120, maxY: 40 };
    // Shallow up-right ray exits the right edge; the same direction steepened
    // crosses this wide, short rect's top edge first.
    expect(naturalExitSide(r, { x: 180, y: 0 })).toBe('right');
    expect(naturalExitSide(r, { x: 120, y: -50 })).toBe('top');
    expect(naturalExitSide(r, { x: -60, y: 20 })).toBe('left');
    expect(naturalExitSide(r, { x: 60, y: 200 })).toBe('bottom');
  });
});

describe('choosePortSides', () => {
  it('keeps natural sides for an unblocked edge', () => {
    const a = rect(0, 0), b = rect(200, 0);
    const choice = choosePortSides(a, b, []);
    expect(choice).toEqual({ exitSide: 'right', entrySide: 'left', flipped: false });
  });

  it('arcs over a chain: skip edge flips to a matching perpendicular pair', () => {
    // a [gap] B [gap] C [gap] d — edge a->d, straight line blocked by B and C.
    const a = rect(0, 0), B = rect(100, 0), C = rect(200, 0), d = rect(300, 0);
    const choice = choosePortSides(a, d, [inflate(B), inflate(C)]);
    expect(choice.flipped).toBe(true);
    expect(['top', 'bottom']).toContain(choice.exitSide);
    expect(choice.entrySide).toBe(choice.exitSide);
  });

  it('flips a vertical chain to a left/right pair', () => {
    const a = rect(0, 0), B = rect(0, 100), C = rect(0, 200), d = rect(0, 300);
    const choice = choosePortSides(a, d, [inflate(B), inflate(C)]);
    expect(choice.flipped).toBe(true);
    expect(['left', 'right']).toContain(choice.exitSide);
    expect(choice.entrySide).toBe(choice.exitSide);
  });

  it('keeps natural sides when the detour is small', () => {
    // Diagonal edge with one small off-line blocker: hooking around it is far
    // cheaper than a full perpendicular arc, so natural must win.
    const a = rect(0, 0), b = rect(300, 200);
    const blocker = { minX: 160, minY: 110, maxX: 195, maxY: 145 };
    const choice = choosePortSides(a, b, [blocker]);
    expect(choice.flipped).toBe(false);
  });

  it('sideCenter returns midpoints on the perimeter', () => {
    const r = rect(10, 20);
    expect(sideCenter(r, 'top')).toEqual({ x: 35, y: 20 });
    expect(sideCenter(r, 'bottom')).toEqual({ x: 35, y: 80 });
    expect(sideCenter(r, 'left')).toEqual({ x: 10, y: 50 });
    expect(sideCenter(r, 'right')).toEqual({ x: 60, y: 50 });
  });
});
