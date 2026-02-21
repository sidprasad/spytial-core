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
│    • calls policy.apply() per step               │
│    • passes only { priorState } to renderLayout  │
│    ↓                                             │
│  WebColaCnDGraph.renderLayout()                  │
│    • receives priorState (or nothing)            │
│    • knows nothing about sequence policies       │
│    • tunes solver iterations when priorState     │
│      is present                                  │
└──────────────────────────────────────────────────┘
```

**Key design principle:** `WebColaCnDGraph` and `WebColaLayoutOptions` are
unaware of sequence policies. They only know about `priorState` — a bag of node
positions and a zoom transform captured from a previous render. The decision of
*how* to compute that prior state is entirely the responsibility of the
`SequencePolicy` implementation.

This keeps the graph component's API surface minimal and avoids coupling the
rendering layer to sequence-specific concerns.

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
| `stability` | `'stability'` | Prior node positions are passed through as-is; solver uses reduced iterations. |
| `changeEmphasis` | `'change_emphasis'` | Diffs prev/curr instances. Stable nodes keep positions; changed nodes are omitted so the solver re-places them. |

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
  generateSequenceLayouts,
  getSequencePolicy,
  ignoreHistory,
  stability,
  changeEmphasis,
  registerSequencePolicy,
} from 'spytial-core';

import type {
  SequencePolicy,
  SequencePolicyContext,
  SequencePolicyResult,
  SequenceLayoutOptions,
} from 'spytial-core';
```

## API Reference

### `generateSequenceLayouts(options)`

Generate layouts for a sequence of data instances, threading layout state
between steps via the chosen policy.

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
| `policy` | `SequencePolicy` | No | Inter-step policy (default: `ignoreHistory`) |
| `projectionsByStep` | `Array<Record<string, string> \| undefined>` | No | Per-step projection overrides |

**Example:**

```typescript
const elements = await generateSequenceLayouts({
  instances: [instance0, instance1, instance2],
  spytialSpec: myCndYaml,
  policy: stability,
});

elements.forEach((el, i) => {
  document.getElementById(`step-${i}`)?.appendChild(el);
});
```

### `getSequencePolicy(name)`

Look up a built-in policy by its string name. Returns `ignoreHistory` for
unrecognized names. Useful when the policy name comes from a UI dropdown.

```typescript
function getSequencePolicy(name: string): SequencePolicy
```

### Direct policy usage (manual rendering)

If you are calling `renderLayout()` yourself rather than going through
`generateSequenceLayouts`, use a policy directly:

```typescript
import { stability } from 'spytial-core';

const priorState = graphElement.getLayoutState();

const { effectivePriorState } = stability.apply({
  priorState,
  prevInstance: prevInst,
  currInstance: currInst,
  spec: parsedSpec,
});

await graphElement.renderLayout(nextLayout, {
  priorState: effectivePriorState,
});
```

## `WebColaLayoutOptions` (Graph Component)

The graph component's options interface is intentionally minimal:

```typescript
interface WebColaLayoutOptions {
  priorState?: LayoutState;
}
```

There are **no** policy-related fields. Policy logic is the caller's
responsibility — either via `generateSequenceLayouts` or direct `policy.apply()`.

## File Layout

```
src/translators/webcola/
  sequence-policy.ts      — SequencePolicy interface, built-in policies, registry
  temporal-sequence.ts    — SequenceLayoutOptions, generateSequenceLayouts()
  webcola-cnd-graph.ts    — WebColaCnDGraph (unchanged; no policy knowledge)
  webcolatranslator.ts    — WebColaLayoutOptions (priorState only)
```

## Tests

```
tests/
  sequence-policy.test.ts     — 17 tests: ignoreHistory, stability, changeEmphasis,
                                  getSequencePolicy, registerSequencePolicy
  temporal-sequence.test.ts   — 2 tests: built-in policy names and interface checks
```

Run with:

```bash
npx vitest run tests/sequence-policy.test.ts tests/temporal-sequence.test.ts
```
