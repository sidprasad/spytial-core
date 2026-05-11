# Transcript: Spytial-for-Rust integration session

## Order of operations

1. **Read the skill file** at `/Users/siddharthaprasad/Desktop/spytial-org/spytial-core/.claude/skills/integrate-language/SKILL.md` end-to-end before doing anything else (per the skill's explicit instruction "Read it FIRST — do not skim").
2. **Phase 0.5 — load canonical recipe.** The skill mandates fetching three sources before any user interaction. I batched all three in parallel:
   - `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/integration.md` — four subproblems, contract rules, pre-flight checklist.
   - `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/case-studies.md` — Python/Rust/Pyret/Lean worked examples; I focused on the Rust/Caraspace section and the cross-cutting "patterns across all" anti-patterns.
   - `https://raw.githubusercontent.com/sidprasad/spytial-core/main/src/data-instance/interfaces.ts` — `IAtom`, `ITuple`, `IType`, `IRelation`, `IDataInstance` shapes.
3. **Phase 1 — interrogate the host.** The skill says batch five questions in one message. The user had already answered #1 (Rust), #3 (proc macros), and #5 (the two example structures). For a single-shot response I stated reasonable assumptions for the remaining slots (identity = pointer address, surface = explicit `diagram()` call writing `out.html`, target user = library authors first) and called them out as load-bearing so the user can push back.
4. **Phase 2 — design.** Worked through Recover / Attach / Present / Gaps. To do Phase 2 properly I fetched three additional sources the skill marks "on demand":
   - `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/yaml-reference.md` — needed for §2.2 to give concrete directive names (`orientation`, `align`, `group`, `atomColor`, `tag`, `flag: hideDisconnectedBuiltIns`).
   - `https://raw.githubusercontent.com/sidprasad/spytial-core/main/README.md` — needed for §2.3 to embed the canonical five-line browser skeleton verbatim.
   - `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/custom-data-instance.md` — needed for §2.1 to confirm "emit JSON, wrap in `JSONDataInstance`" is the recommended path and not deviate without measured cause.
5. **Phase 3 — pre-flight checklist.** Walked the four-checkbox list verbatim from `integration.md`, confirmed each against the Phase 2 design.
6. **Phase 4 — hand-off.** Sketched the minimum viable build (two crates: `spytial-runtime` and `spytial-derive`; one HTML template; one end-to-end test) without writing code, per the skill's instruction not to scaffold a host-specific framework.

## What the skill made me do that I wouldn't have otherwise

- **Fetch live docs instead of relying on memory.** The skill is explicit that it does not bundle the recipe; the four-subproblem frame and the JSON shape come from HTTP, not training data.
- **Distinguish atoms-emit-JSON (Path A) from implementing `IDataInstance` directly (Path B).** Without the `custom-data-instance.md` fetch I'd have hand-waved this; the doc made the decision crisp.
- **Call out the three anti-patterns explicitly** (don't fake order, don't silently dedupe, don't skip identity-aware reflection) at the bottom of the design doc — these are the failure modes the case studies say bit every previous integration.
- **Treat the identity-model question (Q2) as load-bearing** rather than rolling it together with the others. Rust's lack of GC means address-based identity with `Rc`/`Box` pointee delegation is the only correct answer; getting it wrong silently breaks sharing.
- **Pin the CDN version.** The skill's case studies note that pinning is part of the Present subproblem, not a polish step.

## Artifacts produced

- `/Users/siddharthaprasad/Desktop/spytial-org/spytial-core/.claude/skills/integrate-language-workspace/iteration-1/eval-rust-backtest/with_skill/outputs/response.md` — the user-facing design document.
- This transcript.

No code was written, no files in `spytial-core` were modified, and no sibling repos (caraspace, etc.) were visited.
