# Initial layout responsiveness (#634)

Build and serve from the repository root:

```sh
npm run build:browser
python3 -m http.server 8080
```

Open <http://localhost:8080/analysis/browser/initial-layout.html>. Choose 31,
63, or 127 nodes, click **Render tree**, and click **Test host input** while
the solver is running. The tree uses the issue's default layout options,
ordinary node labels, and authored below-left / below-right constraints.

For hidden-pane coverage, open
<http://localhost:8080/analysis/browser/initial-layout.html?n=127&hidden&no-raf>.
This hides the graph and disables animation frames **before** loading the
engine. It must still finish, report one completion, and allow host input.

To compare another built checkout served from the same origin, pass its bundle
path, for example `?n=127&bundle=/baseline/dist/browser/spytial-core-complete.global.js`.
The wrappers support both the original synchronous solver and the cooperative
solver. Expand the coordinate disclosure to compare every final position.

## Measurements

The report separates layout generation, initial solver phases, decay ticks,
routing, renderer wall time, and total wall time including generation. CPU
measurements exclude host yields. Routing is nested in the last tick and is
subtracted from decay CPU time to avoid double counting. The 16 ms heartbeat
starts immediately before `renderLayout`, separately from layout generation,
matching the issue's watchdog. `maxHeartbeatAtMs` locates its worst gap relative
to renderer start. `maxStartStepMs` is unavailable (zero) on the old API.

These are local browser samples from 2026-10-22 using Node 24.19.0 builds.
Baseline is main `5ecbe4b9c152c7ce804c659834db5323535d000b` (the measured
snapshot's relevant renderer/solver sources are identical). Times vary with
JIT warmup, machine load, browser, and viewport; they are not CI thresholds.

| Nodes | Driver | Generation | Initial CPU | Decay CPU | Routing CPU | Render wall | Max heartbeat gap |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 31 | Synchronous | 2.4 | 121.3 | 206.1 | 4.4 | 346.6 | 353.9 |
| 31 | Cooperative | 26.1 | 130.7 | 220.7 | 9.2 | 389.3 | 40.6 |
| 63 | Synchronous | 3.8 | 247.6 | 550.9 | 8.2 | 832.0 | 840.5 |
| 63 | Cooperative | 4.1 | 254.5 | 560.4 | 8.0 | 885.4 | 39.4 |
| 127 | Synchronous | 29.2 | 558.4 | 2166.1 | 55.6 | 2821.9 | 2872.4 |
| 127 | Cooperative | 31.8 | 582.7 | 2263.5 | 56.3 | 3077.2 | 104.8 |

All three sizes produced **exactly identical final coordinates**, identical
decay tick counts (415 / 403 / 501), no directional constraint violations,
and no node rectangle overlaps. The 127-node input click was processed during
cooperative solving; the synchronous baseline could only process it afterward.

The cooperative driver targets 12 ms slices and yields before the first slice
so render setup does not share its task budget. Each solver iteration remains
atomic. At 127 nodes the largest measured initial step was 12.3 ms. The last
tick, which still includes final DOM updates, routing, and completion, took
74.4 ms; the worst heartbeat gap occurred at the end and included browser
painting and timer scheduling. This explains the remaining 104.8 ms gap.
The change improves responsiveness, with a modest wall-time overhead; it does
not reduce iterations or claim a faster solver. Very large individual solver
steps and final routing can still exceed the target budget.

The hidden, animation-frame-disabled 127-node run completed in 2950.2 ms with
a 56.8 ms maximum heartbeat gap, one completion, no errors, and host input
processed during solving. Constraint checks passed there too; visible runs
provide the meaningful SVG overlap/readability comparison.

The fixture uses pass-through wrappers around private renderer methods and
vendored solver iterators solely for profiling. It is not shipped in the npm
package and adds no production instrumentation.

## Regression coverage

- `tests/cooperative-layout.test.ts`: task yielding, cancellation, timer
  fallback, the decay cap, and synchronous/cooperative equivalence with nested
  groups and authored constraints.
- `tests/webcola-cooperative-render.test.ts`: hidden rendering, host work,
  superseding renders, clear/dispose, routing changes during solving, and error
  cleanup through the real renderer and solver.
- `tests/webcola-initial-spacing.test.ts`: initial attraction, settled node and
  group dragging without attraction, containment, non-overlap, and authored
  constraints.

The final CI test gate passed 2,474 tests (excluding the two Z3 equivalence
suites, which CI runs separately), with successful `npm run typecheck` and
`npm run build:all`. The downstream `spytial-gdl/test/presentation-fixtures.html`
passed all five checks using the rebuilt core bundle, covering direct APIs,
editable graphs, controls, and source reapplication.
