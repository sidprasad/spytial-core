# Claude Code Skill — `integrate-language`

A downloadable [Claude Code](https://claude.com/claude-code) skill for designing a new Spytial host integration. Use it when you want to connect a language such as Haskell, Clojure, OCaml, or Smalltalk to Spytial and need to decide:

- how values become atoms and relations
- where users write layout annotations
- where diagrams appear
- what adapters are needed when the runtime value leaves information out

The skill **fetches the integration docs over HTTP** from this repo. There is no copied checklist inside the skill to keep in sync.

## When to use it

Trigger phrases the skill listens for:

- "integrate <X> with Spytial"
- "make Spytial work with <X>"
- "build a Spytial frontend / binding / adapter for <X>"
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
2. **Asks about the host** — language, identity model, spec idioms, display surface, target user.
3. **Works through the four subproblems** — Recover, Attach, Present, Gaps — with an artifact for each.
4. **Pre-flight checklist** — the four checkboxes from `integration.md`.
5. **Builds a minimum viable integration** — JSON-emitting relationalizer plus a minimal HTML harness that renders one classical structure end-to-end.

## Plugin distribution

The skill is currently distributed via this repo. For now, copy or symlink it as above.

## See also

- [The Four Subproblems](integration.md) — the design questions the skill follows.
- [Case Studies](case-studies.md) — Python, Rust, Pyret worked examples.
- [Custom Data Instances](custom-data-instance.md) — the JSON-vs-`IDataInstance` decision.
