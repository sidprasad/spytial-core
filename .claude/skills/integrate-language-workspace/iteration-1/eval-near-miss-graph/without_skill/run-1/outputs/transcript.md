# Transcript: investigating "flip arrow direction in spytial-py"

## Goal
User says spytial-py is rendering `child -> parent` arrows but they want `parent -> child`. Find the right way to flip.

## Steps

1. **Initial web searches** for `spytial-py`, `spytial python pypi`, `sPyTial Forge`, `spytial-py github visualization annotation orientation`. Generic results only — no direct hit on the library. Not surprising; it appears to be a niche academic-adjacent tool.

2. **Searched for connection to Brown PLT / Forge**: `"spytial" Forge Alloy diagrammer Brown university`. Confirmed Forge / Alloy / Sterling context (the visual modeling family sPyTial seems to belong to), but no direct sPyTial doc.

3. **Tried PyPI page** `https://pypi.org/project/spytial/` — page failed to render content via WebFetch (site error, not a 404).

4. **Tried GitHub guesses**:
   - `https://github.com/spytial-org/spytial-py` — 404.
   - `https://github.com/sidprasad/spytial` — hit. README pointed at full docs site.

5. **Followed docs site** `https://sidprasad.github.io/spytial/` — 301 to `https://www.siddharthaprasad.com/spytial/`. Top page only had install/quickstart, no API specifics.

6. **Operations page** `https://www.siddharthaprasad.com/spytial/operations/` — gold. Got the full list of constraints and directives:
   - Constraints: `orientation`, `align`, `cyclic`, `group`
   - Directives: `atomColor`, `edgeColor`, `attribute`, `tag`, `inferredEdge`, `icon`, `hideField`, `hideAtom`, `size`
   - `orientation` example uses `selector="children"` and `directions=["below"]`.

7. **Read raw `annotations.py`** from GitHub to confirm parameter names and check for any `reverse`/`flip` arg I might have missed. Confirmed: there is **no** built-in flip/reverse parameter on any annotation. `orientation` controls layout position, not arrow direction. `inferredEdge` exists and takes a selector — that's the escape hatch for synthesizing a reverse edge.

## Reasoning for the answer

- Diagnosis: in sPyTial (and the underlying Forge/Alloy-style relational model), edges are drawn from the holder of a field to the field's value. So a `Child.parent = X` reference renders as `child -> parent`. That perfectly matches the user's symptom.
- Two pragmatic fixes:
  1. **Restructure** so the parent owns a `children` collection — the natural and recommended fix when the user controls the model. Pair with `@orientation(selector="children", directions=["below"])` to lay it out as a top-down tree.
  2. **Hide + infer**: `@hideField(field="parent")` plus `@inferredEdge(...)` walking the relation the other way. Useful when the user can't restructure.
- Explicitly called out what does NOT work (no `reverse=True` on `orientation`, `edgeColor` only restyles), to keep the user from chasing dead ends.
- Hedged on `inferredEdge` selector syntax because the exact grammar wasn't fully documented on the page I read; pointed them at the API reference for confirmation.

## Sources consulted
- https://www.siddharthaprasad.com/spytial/ (docs landing)
- https://www.siddharthaprasad.com/spytial/operations/ (constraints & directives — primary source)
- https://github.com/sidprasad/spytial (repo, including raw `spytial/annotations.py`)
- Background: Brown PLT Forge blog and OOPSLA 2024 Forge paper (for context, not cited in answer)
