# Sequence Layout API

This document describes the **sequence layout layer** — a thin orchestration API that generates layouts for an ordered sequence of data instances (e.g., Alloy trace steps) with configurable inter-step continuity.

## Architecture

The sequence layer sits **above** the core rendering component and is deliberately separated from it:

```
┌──────────────────────────────────────────────────┐
│  Caller code (demo, app, test harness)           │
│    ↓                                             │
│  generateSequenceLayouts()                       │
│    • parses spec                                 │
│    • iterates over instances                     │
│    • calls applyTemporalPolicy() per step        │
│    • passes only { priorState } to renderLayout  │
│    ↓                                             │
│  WebColaCnDGraph.renderLayout()                  │
│    • receives priorState (or nothing)            │
│    • knows nothing about temporal modes          │
│    • tunes solver iterations when priorState     │
│      is present                                  │
└──────────────────────────────────────────────────┘
```

**Key design principle:** `WebColaCnDGraph` and `WebColaLayoutOptions` are
unaware of temporal modes. They only know about `priorState` — a bag of node
positions and a zoom transform captured from a previous render. The decision of
*how* to compute that prior state from a temporal mode is entirely the
responsibility of the caller (or `generateSequenceLayouts`).

This keeps the graph component's API surface minimal and avoids coupling the
rendering layer to sequence-specific concerns.

## Public Exports

All exports are available from the top-level `spytial-core` package:

```typescript
import {
  generateSequenceLayouts,
  applyTemporalPolicy,
} from 'spytial-core';

import type {
  SequenceLayoutOptions,
  TemporalMode,
} from 'spytial-core';
```

## API Reference

### `generateSequenceLayouts(options)`

Generate layouts for a sequence of data instances, threading layout state
between steps.

```typescript
async function generateSequenceLayouts(
  options: SequenceLayoutOptions
): Promise<WebColaCnDGraph[]>
```

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `instances` | `IInputDataInstance[]` | Yes | Ordered list of data instances |
| `spytialSpec` | `string` | Yes | CnD (Spytial) spec YAML string |
| `mode` | `TemporalMode` | No | Inter-step policy (default: `'ignore_history'`) |
| `changedNodeIdsByStep` | `Array<ReadonlyArray<string> \| undefined>` | No | Per-step changed node IDs for `change_emphasis` |
| `projectionsByStep` | `Array<Record<string, string> \| undefined>` | No | Per-step projection overrides |

**Returns:** Array of `WebColaCnDGraph` elements (one per instance). The caller
is responsible for inserting them into the DOM.

**Example:**

```typescript
const elements = await generateSequenceLayouts({
  instances: [instance0, instance1, instance2],
  spytialSpec: myCndYaml,
  mode: 'stability',
});

elements.forEach((el, i) => {
  document.getElementById(`step-${i}`)?.appendChild(el);
});
```

### `applyTemporalPolicy(priorState, mode, changedNodeIds?)`

Pure function that computes an effective prior state from a raw prior state and
a temporal mode. Use this directly if you are calling `renderLayout()` yourself
rather than going through `generateSequenceLayouts`.

```typescript
function applyTemporalPolicy(
  priorState: LayoutState | undefined,
  mode?: TemporalMode,       // default: 'ignore_history'
  changedNodeIds?: string[]
): TemporalPolicyResult
```

**Returns:**

```typescript
interface TemporalPolicyResult {
  /** Effective prior state to pass to renderLayout, or undefined for fresh layout */
  effectivePriorState: LayoutState | undefined;
  /** Whether the caller should expect reduced iterations (informational) */
  useReducedIterations: boolean;
}
```

**Example (manual single-step rendering):**

```typescript
import { applyTemporalPolicy } from 'spytial-core';

const priorState = graphElement.getLayoutState();

const { effectivePriorState } = applyTemporalPolicy(
  priorState,
  'stability'
);

await graphElement.renderLayout(nextLayout, {
  priorState: effectivePriorState,
});
```

### `TemporalMode`

```typescript
type TemporalMode = 'ignore_history' | 'stability' | 'change_emphasis';
```

| Mode | Behavior |
|---|---|
| `ignore_history` | Fresh layout — prior state is discarded. (default) |
| `stability` | Prior node positions are passed through as-is, solver uses reduced iterations to preserve them. |
| `change_emphasis` | Stable nodes keep their positions; changed nodes are jittered around the centroid of stable nodes to draw visual attention. |

## `WebColaLayoutOptions` (Graph Component)

The graph component's options interface is intentionally minimal:

```typescript
interface WebColaLayoutOptions {
  /**
   * Layout state from a previous render.
   * Preserves visual continuity by restoring node positions and zoom/pan.
   */
  priorState?: LayoutState;
}
```

There are **no** `temporalMode` or `changedNodeIds` fields on this interface.
Temporal policy is the caller's responsibility — either via
`generateSequenceLayouts` or a manual call to `applyTemporalPolicy`.

When `priorState` is provided, the graph component automatically:
- Restores the zoom/pan transform
- Seeds WebCola nodes at their prior positions (via dagre hint seeding)
- Reduces solver iterations to preserve positions
- Uses a higher convergence threshold for faster stabilization

## Migration from previous API

If you were previously passing `temporalMode` or `changedNodeIds` on `WebColaLayoutOptions`:

### Before (old API)

```typescript
await graphElement.renderLayout(layout, {
  temporalMode: 'stability',
  priorState: previousState,
  changedNodeIds: ['Node1', 'Node2'],
});
```

### After (new API)

```typescript
import { applyTemporalPolicy } from 'spytial-core';

const { effectivePriorState } = applyTemporalPolicy(
  previousState,
  'stability',
  // changedNodeIds only needed for 'change_emphasis' mode
);

await graphElement.renderLayout(layout, {
  priorState: effectivePriorState,
});
```

### Renamed exports

| Old name | New name |
|---|---|
| `renderTemporalSequence` | `generateSequenceLayouts` |
| `RenderTemporalSequenceOptions` | `SequenceLayoutOptions` |

The `TemporalMode` type and `applyTemporalPolicy` function are unchanged.

## File Layout

```
src/translators/webcola/
  temporal-policy.ts      — TemporalMode type, applyTemporalPolicy() pure function
  temporal-sequence.ts    — SequenceLayoutOptions, generateSequenceLayouts()
  webcola-cnd-graph.ts    — WebColaCnDGraph (unchanged from main; no temporal knowledge)
  webcolatranslator.ts    — WebColaLayoutOptions (priorState only)
```

## Tests

```
tests/
  temporal-policy.test.ts     — 7 unit tests for applyTemporalPolicy
  temporal-sequence.test.ts   — Type-level test for TemporalMode
```

Run with:

```bash
npx vitest run tests/temporal-policy.test.ts tests/temporal-sequence.test.ts
```
