# Sequence Layout API

This document describes the **sequence layout layer** — the mechanism for rendering an ordered sequence of data instances (e.g., Alloy trace steps) with configurable inter-step continuity.

## Architecture

Sequence continuity is handled **inside** `renderLayout()`. When you pass a `policy`, `prevInstance`, and `currInstance` as options, `renderLayout` automatically:

1. Captures the current layout state (or uses the explicit `priorPositions` you provide)
2. Calls `policy.apply()` with the prior state and instance pair
3. Passes the resolved positions to the translator

```
┌──────────────────────────────────────────────────┐
│  Caller code (demo, app, test harness)           │
│    ↓                                             │
│  WebColaCnDGraph.renderLayout(layout, {          │
│    policy,                                       │
│    prevInstance,                                  │
│    currInstance,                                  │
│    priorPositions   (optional override)           │
│  })                                              │
│    ↓                                             │
│    • calls policy.apply() internally             │
│    • passes resolved positions to translator     │
│    • tunes solver iterations when positions      │
│      are present                                 │
└──────────────────────────────────────────────────┘
```

**Key design principle:** The policy is the sole gateway to continuity.
Without a policy, `renderLayout()` produces a fresh layout. With a policy,
it threads position hints between steps automatically.

## SequencePolicy Interface

All policies implement the same interface. They are pairwise — they receive the
prior layout state plus the previous and current data instances, and return the
effective state that the solver should use.

```typescript
interface SequencePolicy {
  readonly name: string;
  apply(context: SequencePolicyContext): SequencePolicyResult;
}

interface SequencePolicyContext {
  priorState: LayoutState;
  prevInstance: IDataInstance;
  currInstance: IDataInstance;
  spec: LayoutSpec;
}

interface SequencePolicyResult {
  effectivePriorState: LayoutState | undefined;
  useReducedIterations: boolean;
}
```

### Built-in Policies

| Policy object | Name string | Behavior |
|---|---|---|
| `ignoreHistory` | `'ignore_history'` | Fresh layout — prior state is discarded. (default) |
| `stability` | `'stability'` | Pairwise continuity only: prior positions are preserved for nodes present in the current step; reappearing nodes are treated as new. |
| `changeEmphasis` | `'change_emphasis'` | Diffs prev/curr instances. Stable nodes stay fixed; changed nodes get deterministic visible jitter clamped to viewport bounds, with stronger emphasis when neighbors disappear. |
| `randomPositioning` | `'random_positioning'` | Fully randomize all current-node positions within viewport bounds. |

For id-based reappearance continuity with **per-sequence isolated memory**, use `createStabilityMemoryPolicy()` to create a dedicated policy instance for each sequence/graph.

### Adding a custom policy

```typescript
import { registerSequencePolicy } from 'spytial-core';
import type { SequencePolicy } from 'spytial-core';

const myPolicy: SequencePolicy = {
  name: 'my_custom',
  apply: ({ priorState, prevInstance, currInstance, spec }) => {
    // Custom logic here
    return { effectivePriorState: priorState, useReducedIterations: true };
  },
};

registerSequencePolicy(myPolicy);
```

## Public Exports

All exports are available from the top-level `spytial-core` package:

```typescript
import {
  getSequencePolicy,
  ignoreHistory,
  stability,
  createStabilityMemoryPolicy,
  changeEmphasis,
  randomPositioning,
  registerSequencePolicy,
} from 'spytial-core';

import type {
  SequencePolicy,
  SequencePolicyContext,
  SequencePolicyResult,
  WebColaLayoutOptions,
} from 'spytial-core';
```

## API Reference

### `renderLayout(layout, options?)`

Render a layout, optionally threading continuity from a previous step via a policy.

```typescript
async renderLayout(
  layout: Layout,
  options?: WebColaLayoutOptions
): Promise<void>
```

**`WebColaLayoutOptions`:**

| Field | Type | Required | Description |
|---|---|---|---|
| `policy` | `SequencePolicy` | No | Inter-step policy to resolve prior positions |
| `prevInstance` | `IDataInstance` | No | Previous step's data instance (required if `policy` is set) |
| `currInstance` | `IDataInstance` | No | Current step's data instance (required if `policy` is set) |
| `priorPositions` | `LayoutState` | No | Explicit prior positions override; if omitted, `getLayoutState()` is used |

When `policy`, `prevInstance`, and `currInstance` are all provided, `renderLayout` calls `policy.apply()` internally and passes the resolved positions to the translator. When no policy is provided, a fresh layout is produced.

**Example — stepping through instances:**

```typescript
import { getSequencePolicy } from 'spytial-core';

let prevInstance = null;

for (const instance of instances) {
  const layout = generateLayoutForInstance(instance);
  const options = {};

  if (prevInstance) {
    options.policy = getSequencePolicy('stability');
    options.prevInstance = prevInstance;
    options.currInstance = instance;
  }

  await graphElement.renderLayout(layout, options);
  prevInstance = instance;
}
```

### `getSequencePolicy(name)`

Look up a built-in policy by its string name. Returns `ignoreHistory` for
unrecognized names. Useful when the policy name comes from a UI dropdown.

```typescript
function getSequencePolicy(name: string): SequencePolicy
```

### `getLayoutState()`

Capture the current layout's node positions and zoom transform. This is called
automatically by `renderLayout` when a policy is present, but can also be used
to supply explicit `priorPositions`.

```typescript
getLayoutState(): LayoutState | undefined
```

## File Layout

```
src/translators/webcola/
  sequence-policy.ts      — SequencePolicy interface, built-in policies, registry
  webcola-cnd-graph.ts    — WebColaCnDGraph with renderLayout (policy-aware)
  webcolatranslator.ts    — WebColaLayoutOptions, WebColaLayout, translator
```

## Tests

```
tests/
  sequence-policy.test.ts                — ignoreHistory, stability, changeEmphasis, randomPositioning,
                                            getSequencePolicy, registerSequencePolicy
  temporal-layout-consistency.test.ts    — 7 tests: position hint passthrough at translator level
```

Run with:

```bash
npx vitest run tests/sequence-policy.test.ts tests/temporal-layout-consistency.test.ts
```
