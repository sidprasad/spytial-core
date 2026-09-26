# Migrating to spytial-core 6.4.0

Core 6.4 removes its Pyret adapter and Pyret-only reconstruction helpers. The
same language-facing code is maintained and tested in
[Spyret](https://github.com/sidprasad/spyret). These exports were present in
Core 6.3. Applications using them must switch imports when moving to 6.4.

| Core 6.3 import or global | Core 6.4 replacement |
| --- | --- |
| `PyretDataInstance`, `PyretEvaluator`, `PyretEvaluationResult` | Import from `spyret` or use `window.Spyret` |
| `reifyToValue`, `ReifiedValue`, `replit`, `canon` | Import from `spyret` or use `window.Spyret` |
| `JSONDataInstance`, `IDataInstance`, evaluators, layout, graph components | Continue using `spytial-core` |

For a live standard-Pyret value, prefer `spyret.prepareDiagram(value, runtime)`.
It returns a portable snapshot, a source preview and an `IDataInstance` that
Core's evaluator and layout APIs can consume directly. In a browser, load
Spyret's `spyret/global` bundle before calling `window.Spyret.prepareDiagram`.

Core no longer ships `src/data-instance/pyret`, the Pyret-only tests, or the
runtime fidelity checker. Spyret runs its own standard-Pyret PBTs, and
Spyret-IDE exercises the diagram path with the published packages. The
serialized `IDataInstance` format and Core's generic graph APIs are unchanged.
