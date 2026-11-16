/** Given an oracle returning the index of the first infeasible prefix (-1 for
 * feasible), find a largest feasible subset and one IIS of this same input.
 * The oracle must be downward closed and the empty set feasible. */
export function maximumFeasibleSubset(size: number, firstFailure: (subset: number[]) => number):
    { kept: number[]; iis: number[] } {
    const ids = Array.from({ length: size }, (_, i) => i);
    const failedAt = firstFailure(ids);
    const iisOf = (subset: number[], failed: number) => {
        let core = subset.slice(0, failed + 1);
        // Prefer explaining the failure with the earliest input constraints.
        for (let i = failed - 1; i >= 0; i--) {
            const trial = core.filter((_, j) => j !== i);
            if (firstFailure(trial) >= 0) core = trial;
        }
        return core;
    };
    const iis = failedAt < 0 ? [] : iisOf(ids, failedAt);

    // Search by increasing deletion count. Every repair must remove a
    // member of the current conflict. The first feasible leaf is optimal.
    if (!iis.length) return { kept: ids, iis };
    for (let budget = 1; budget <= ids.length; budget++) {
        const pending = [ids];
        const visited = new Set<string>();
        while (pending.length) {
            const candidate = pending.pop()!;
            const key = candidate.join(',');
            if (visited.has(key)) continue;
            visited.add(key);
            const failed = candidate === ids ? failedAt : firstFailure(candidate);
            if (failed < 0) {
                return { kept: candidate, iis };
            }
            if (ids.length - candidate.length === budget) continue;
            const conflict = candidate === ids ? iis : iisOf(candidate, failed);
            for (const omitted of conflict) pending.push(candidate.filter(i => i !== omitted));
        }
    }
    throw new Error("Empty set of positional requirements must be feasible");
}
