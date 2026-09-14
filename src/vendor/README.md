# Vendored runtime patches

`cola.js` is the WebCola runtime used by the browser and headless evaluation.
The npm `webcola` dependency is a separate copy; changing it does not update
this file. Preserve local patches when replacing the vendored runtime.

## Exact alignment and group overlap (#585)

The overlap sweep can defer X separation to Y based on penetration distance,
even when exact same-Y alignment makes Y separation impossible. The local patch:

- Derives transitive zero-gap equality classes from the projection's normalized
  constraints, including WebCola's native alignment syntax.
- Propagates class membership through nested groups. A single aligned member
  pair in disjoint groups is enough to rule out separation on that axis.
- Generates X separation when exact Y alignment requires it, and suppresses
  temporary separation constraints on a blocked axis. The ordinary Y sweep
  already handles rectangles whose X intervals intersect.
- Keeps distinct rectangles with equal centres in alignment-aware scanlines.
- Registers parent membership for object-valued leaves/subgroups as well as
  numeric indices, so contained objects are not also treated as root siblings.

The chosen separation direction follows the geometry of each projection; this
patch does not append permanent ordering constraints to the user's input.
Shared membership and containment are excluded from the alignment-based
separation rule. Membership comparisons are cached for the projection lifetime.
Nonzero equality offsets are not merged into same-coordinate classes. This is
not a general feasibility search over arbitrary separation inequalities.

Regression coverage is in `tests/webcola-aligned-group-overlap.test.ts` and
`tests/webcola-alignment-projection.test.ts`, using `requireCola()` to exercise
this vendored file. `tests/preserved-group-ordering.test.ts` checks integration
with Spytial's explicit group ordering.
