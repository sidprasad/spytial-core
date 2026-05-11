# Transcript

## Skill decision

**Did NOT invoke the `integrate-language` skill.**

Reason: I read the skill's frontmatter and Phase 0 section. The skill's stated scope is *building a new host-language integration* (Haskell, Clojure, OCaml, etc. — phrases like "integrate X with Spytial", "build a Spytial frontend for X"). It walks the user through the four subproblems (Recover / Attach / Present / Gaps) and produces a design doc before any code.

The user's situation is the opposite: they are a downstream *consumer* of an already-built integration (`spytial-py`) asking a usage question about edge orientation in a rendered diagram. Engaging the phased walkthrough would be wildly inappropriate — they don't want to design an integration, they want one arrow flipped.

So I answered directly from knowledge of Spytial's model.

## Web fetches

None. Did not fetch the spytial-py docs or the integration recipe — the question is about the general Spytial mental model (relations are tuples, edges go field-1 → field-2; orientation/hide annotations on the host class control layout vs. data) which is invariant across hosts. Bringing up the integration internals would be off-target for a user just trying to flip an arrow.

## Response shape

Two-option answer:
1. **Fix the data model** — store `children` on parent rather than `parent` on child, since Spytial's edge direction follows the tuple direction recovered from the object graph.
2. **Annotate the class** — `@hide_field` to suppress the unwanted relation, and `@orientation(field=..., direction=...)` to control layout direction (which is often what "wrong way" really means for tree-shaped diagrams).

Closed by offering to look at their actual class definition for a one-line fix, since the right answer depends on which attribute is producing the edge.

## Files written

- `outputs/response.md` — user-facing answer
- `outputs/transcript.md` — this file
