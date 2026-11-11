import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';
import {
    LayoutConstraint, isBoundingBoxConstraint, isLeftConstraint, isTopConstraint,
} from '../src/layout/interfaces';

/**
 * Issue #647. After a restart, the search prunes the disjunctions again. If
 * that prune commits a disjunction that has one valid alternative, the
 * disjunction leaves the list. The next restart must keep the committed
 * constraints. Before the fix it went back to the first checkpoint, so the
 * constraints were gone and the disjunction was not in the list: the search
 * returned SAT with no alternative of that disjunction true.
 *
 * The four disjunctions below make a chain. Each prune pass commits one more:
 *   pass 1 (presolve)       [T <y R | Y <x X]  -> T <y R   (X <x Y is given)
 *   pass 2 (before search)  [Q <y P | R <y T]  -> Q <y P
 *   pass 3 (after restart)  [P <x Q | P <y Q]  -> P <x Q   <- this one was lost
 * The first disjunction, [Q <x P | R <x T], must then use R <x T.
 *
 * The groups and never-groups make the search hard, so that it restarts a
 * minimum of two times. The complete system has a solution.
 */
const CHAIN = 'X <x Y, [Q <x P | R <x T], [P <x Q | P <y Q], [Q <y P | R <y T], [T <y R | Y <x X]';

const HARD_SYSTEM = 'F =y D, D <x B, {G0: C, B}, {G1: D, G}, {G2: A, H}, {!N2: A, H, C}, {!N1: D, C}';

const plain = (cs: LayoutConstraint[]) => cs.filter(c => !isBoundingBoxConstraint(c));
const hasLeft = (cs: LayoutConstraint[], a: string, b: string) =>
    plain(cs).some(c => isLeftConstraint(c) && c.left.id === a && c.right.id === b);
const hasTop = (cs: LayoutConstraint[], a: string, b: string) =>
    plain(cs).some(c => isTopConstraint(c) && c.top.id === a && c.bottom.id === b);

describe('a restart keeps what the prune committed (#647)', () => {
    it('keeps a disjunction that the prune after a restart committed', { timeout: 60_000 }, () => {
        const result = solve(`${CHAIN}, ${HARD_SYSTEM}`);
        expect(result.sat).toBe(true);

        const committed = result.validator.layout.constraints;
        // Pass 2 committed Q above P, so [P <x Q | P <y Q] can only be P <x Q.
        expect(hasTop(committed, 'Q', 'P')).toBe(true);
        expect(hasTop(committed, 'P', 'Q')).toBe(false);
        expect(hasLeft(committed, 'P', 'Q')).toBe(true);
        // The opposite order contradicts it.
        expect(hasLeft(committed, 'Q', 'P')).toBe(false);
        // [Q <x P | R <x T] must then use its second alternative.
        expect(hasLeft(committed, 'R', 'T')).toBe(true);
    });
});
