# Claude Code Skill — `integrate-language`

A downloadable [Claude Code](https://claude.com/claude-code) skill that turns the [Four Subproblems](integration.md) recipe into a guided, phased workflow. Run it when you want to integrate a new host language (Haskell, Clojure, OCaml, Smalltalk, …) with Spytial: the agent interrogates your host's identity model, spec-attachment idioms, and display surface, then walks you through a concrete design for all four subproblems before any code is written.

The skill **fetches the canonical recipe over HTTP** from this repo, so it always reflects the latest docs — there's no inlined copy that can drift.

## When to use it

Trigger phrases the skill listens for:

- "integrate <X> with Spytial"
- "make Spytial work with <X>"
- "build a Spytial frontend / binding / adapter for <X>"
- "port spytial / caraspace to <X>"
- "Spytial bindings for <X>"

Or invoke it explicitly: `/integrate-language`.

## Install

### Quick install (single file)

```bash
mkdir -p ~/.claude/skills/integrate-language
curl -fsSL https://raw.githubusercontent.com/sidprasad/spytial-core/main/.claude/skills/integrate-language/SKILL.md \
  -o ~/.claude/skills/integrate-language/SKILL.md
```

Restart Claude Code, then say *"I want to integrate Haskell with Spytial"* (or your language).

### Install via clone

```bash
git clone https://github.com/sidprasad/spytial-core.git
mkdir -p ~/.claude/skills
cp -r spytial-core/.claude/skills/integrate-language ~/.claude/skills/
```

### Symlink (for spytial-core contributors)

If you're hacking on the skill itself, symlink so edits take effect immediately:

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/.claude/skills/integrate-language" ~/.claude/skills/integrate-language
```

## Requirements

- Claude Code with `WebFetch` enabled. The skill pulls `integration.md`, `case-studies.md`, `interfaces.ts`, and a few other files from this repo at runtime. No internet, no skill.
- No checkout of `spytial-core` is required on your machine — the skill works from any directory.

## What it does, briefly

1. **Loads the recipe** — `WebFetch`es `integration.md`, `case-studies.md`, and `interfaces.ts`.
2. **Interrogates the host** — five batched questions about language, identity model, spec idioms, display surface, target user.
3. **Designs the four subproblems** — Recover, Attach, Present, Gaps — each producing a concrete artifact.
4. **Pre-flight checklist** — the four checkboxes from `integration.md`.
5. **Builds a minimum viable integration** — JSON-emitting relationalizer + minimal HTML harness rendering one classical structure end-to-end.

## Plugin distribution

The skill is currently distributed via this repo. A future Claude Code plugin marketplace entry is on the table; for now, copy or symlink as above.

## See also

- [The Four Subproblems](integration.md) — the canonical recipe the skill is built on.
- [Case Studies](case-studies.md) — Python, Rust, Pyret, Lean worked examples.
- [Custom Data Instances](custom-data-instance.md) — the JSON-vs-`IDataInstance` decision.
