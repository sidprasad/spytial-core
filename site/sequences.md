# Sequences of States

Most diagrams are static — one value, one diagram. But many useful host scenarios are sequential: an Alloy trace, a Pyret reactor's state stream, a debugger stepping through frames, a proof-state evolution in Lean.

`spytial-core` supports rendering an ordered sequence of `IDataInstance`s with **inter-step continuity**: nodes that survive between frames stay roughly where they were; nodes that change get visually emphasised; layout doesn't shuffle randomly when the data barely changes.

This page is the integrator's reference for that mechanism.

---

## The contract

Continuity is mediated by a `SequencePolicy`. A policy is a pure function over (prior layout state, previous instance, current instance, layout spec) → (effective prior state, iteration hint).

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

You don't usually call `apply` yourself. You pass the policy to `renderLayout` along with the previous and current instances; the engine threads continuity through automatically.

---

## Built-in policies

| Object             | Name string             | Behavior                                                                                                  |
|--------------------|-------------------------|-----------------------------------------------------------------------------------------------------------|
| `ignoreHistory`    | `'ignore_history'`      | Default. Each frame is laid out from scratch.                                                             |
| `stability`        | `'stability'`           | Surviving nodes keep prior positions. Briefly-disappearing nodes are remembered for a few frames so they reappear in place. |
| `changeEmphasis`   | `'change_emphasis'`     | Diffs `prevInstance` vs `currInstance`. Stable nodes are pinned; changed nodes get deterministic visible jitter (clamped to viewport bounds), with stronger emphasis when neighbors disappear. |
| `randomPositioning`| `'random_positioning'`  | Re-randomises every node within viewport bounds — useful for showing that the layout *can* change shape.   |

Look up by name (handy when the policy comes from a UI dropdown or a host-side string):

```typescript
import { getSequencePolicy } from 'spytial-core';

const policy = getSequencePolicy('stability'); // unrecognised → ignoreHistory
```

---

## Rendering a sequence

The pattern every host uses:

```typescript
import {
  JSONDataInstance,
  parseLayoutSpec,
  SGraphQueryEvaluator,
  LayoutInstance,
  getSequencePolicy,
} from 'spytial-core';

const layoutSpec = parseLayoutSpec(yamlSpec);
const policy = getSequencePolicy('stability');
const graphEl = document.querySelector('webcola-cnd-graph');

let prevInstance = null;

for (const json of sequenceOfFrames) {
  const instance  = new JSONDataInstance(json);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const layout = new LayoutInstance(layoutSpec, evaluator).generateLayout(instance);

  const options = prevInstance
    ? { policy, prevInstance, currInstance: instance }
    : {};

  await graphEl.renderLayout(layout, options);
  prevInstance = instance;
}
```

`renderLayout` captures the current layout state automatically before applying the policy. If you want to inject explicit prior positions (e.g. you saved them between sessions), pass `priorPositions` in the options.

A higher-level convenience also exists on the custom element: `generateSequenceLayouts({ instances, spytialSpec, mode })` lays out an entire sequence in one call.

---

## Writing a custom policy

Register your own and use it like a built-in:

```typescript
import { registerSequencePolicy } from 'spytial-core';
import type { SequencePolicy } from 'spytial-core';

const pinRoots: SequencePolicy = {
  name: 'pin_roots',
  apply: ({ priorState, prevInstance, currInstance, spec }) => {
    // Custom logic: keep prior positions for atoms whose type is 'Root'
    return { effectivePriorState: priorState, useReducedIterations: true };
  },
};

registerSequencePolicy(pinRoots);
```

After registration, `getSequencePolicy('pin_roots')` returns it.

When you'd write one:

- The host has structural information that the diff-based policies miss (e.g. Lean's hash-cons tells you exactly which `Expr` survived).
- You want a host-specific cadence — pin during a sub-sequence, randomise on phase change, freeze during animations.
- You want to drive the iteration count from a frame-rate budget instead of a boolean.

---

## What changes between frames vs. what survives

The diff that the built-in policies use compares `prevInstance` and `currInstance` by atom `id`. This is why getting [identity right in the relationalizer](custom-data-instance.md#identity-sharing-cycles) matters: a frame where the host rebuilds the value tree from scratch (new IDs every time) will look like "every node disappeared and reappeared" to the policy. That's almost never the visualisation you want.

If your host does rebuild, give your relationalizer an **identity hook**: a host-provided function from value → stable ID. (sPyTial calls this `identity=lambda obj: obj.id`.) Use it to override the default `id()`-based identity when stable IDs live somewhere meaningful in the source.

---

## Further reading

- [docs/SEQUENCE_LAYOUT_API.md](https://github.com/sidprasad/spytial-core/blob/main/docs/SEQUENCE_LAYOUT_API.md) — implementation-level reference, including `LayoutState` capture and the `WebColaLayoutOptions` shape.
- [API Reference: Sequence Policies](api-reference.md#sequence-policies) — exported types and functions.
