const UNIT_CIRCLE_TOLERANCE = 1e-12;

/** Compare coordinates on one axis of the unit-circle template. */
export function compareCyclicCoordinates(first: number, second: number): number {
    const difference = first - second;
    // Trigonometric roundoff can separate mathematically equal coordinates.
    return Math.abs(difference) <= UNIT_CIRCLE_TOLERANCE ? 0 : Math.sign(difference);
}
