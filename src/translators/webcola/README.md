# WebCola Translator Notes

`webcola-cnd-graph` supports configurable frame transitions for re-renders.

## Transition Modes

- `morph` (default): cross-fade old/new frames and warm-start from current
  positions when possible.
- `replace`: clear old frame and redraw immediately (legacy behavior).

## Configuration

Set a default mode on the custom element:

```html
<webcola-cnd-graph transition-mode="morph"></webcola-cnd-graph>
```

Override per render call:

```typescript
await graph.renderLayout(layout, { transitionMode: 'replace' });
```

Programmatic default:

```typescript
graph.setTransitionMode('morph');
```

For full sequence/policy details, see `docs/SEQUENCE_LAYOUT_API.md`.
