# Spytial Core

Spytial Core owns shared layout and interaction behavior across integrations.

## Dragging behavior

- Use preferred edge lengths and other soft attraction to compute the initial
  default layout.
- After that layout settles, do not introduce **springy dragging**: moving a
  node or group must not pull other nodes merely to preserve preferred edge
  lengths, relative distances, or group compactness.
- During dragging, continue enforcing authored spatial constraints, group
  containment, and non-overlap. Other nodes may move when those constraints
  require it. Do not pin every other node as a workaround.
- Releasing a drag must not restore attraction or snap the arrangement back.
  An explicitly regenerated layout may use the initial layout objective again.
- Keep regression coverage for both phases: useful initial spacing and
  constraint-preserving dragging without attraction, including group drags.

## Verification

Run the relevant regression tests, `npm run typecheck`, and `npm run build:all`
for renderer changes. Smoke-test a downstream integration when shared rendering
behavior changes.
