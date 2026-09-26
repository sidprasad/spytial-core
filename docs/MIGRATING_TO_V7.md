# Migrating to spytial-core 7.0

Core 7 removes its Pyret adapter and Pyret-only reconstruction helpers. The
same language-facing code is maintained and tested in
[Spyret](https://github.com/sidprasad/spyret). This is a major release because
Core 6 exported those symbols from its default entry and browser bundle.

| Core 6 import or global | Core 7 replacement |
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
