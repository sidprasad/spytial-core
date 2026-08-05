# Testing an Integration

> A Spytial spec does not describe a picture. It describes a set of spatial relationships. Testing an integration means checking those relationships — not pixels, not coordinates, not a saved image.

This matters more than it might first appear.

A spec that says a list runs left to right is satisfied by infinitely many drawings. Move every node 40 pixels right, stretch the spacing, let the force simulation settle differently on a machine with a different CPU — all still correct. Nothing in the spec picked one of those arrangements over another.

So an integration that tests by comparing rendered images, or by asserting `node.x == 312`, is testing the renderer, not itself. Those tests fail when nothing is wrong, and pass when something is. They also need a browser, which most integrations do not otherwise need.

What an integration is actually responsible for is narrower and much easier to check:

1. **The datum it produced** — did the relationalizer turn the host value into a well-formed graph?
2. **The spec it emitted** — does that spec *entail* the spatial facts its author meant it to?

Both are answerable without rendering anything. The constraint solver has already worked out what the spec entails by the time layout generation finishes; you can just ask it. That is what this harness does.

---

## The shape of a test

A **case** is a datum, a spec, and the facts that should follow:

```yaml
name: linked list runs left to right
datum:
  atoms:
    - { id: n1, type: Node, label: "1" }
    - { id: n2, type: Node, label: "2" }
    - { id: n3, type: Node, label: "3" }
  relations:
    - id: next
      name: next
      types: [Node, Node]
      tuples:
        - { atoms: [n1, n2], types: [Node, Node] }
        - { atoms: [n2, n3], types: [Node, Node] }
spec: |
  constraints:
    - orientation:
        selector: "{x, y : Node | y in x.next}"
        directions: [right]
assertions:
  - query: must.rightOf(n1)
    equals: [n2, n3]
    because: orientation is transitive, so the tail is all to the right of the head
  - query: must.above(n1)
    empty: true
    because: the spec orders horizontally only
```

Note the second assertion. It pins down what the spec *does not* say, which is usually where integration bugs hide.

Run it:

```bash
npx spytial-check cases/linked-list.yaml
```

Case files are JSON or YAML, and may hold one case, a list of cases, or `{"cases": [...]}`. Point the command at files or at a directory.

---

## Running it from your host language

Most integrations are not JavaScript. They test by running `spytial-check` as a subprocess: write cases as JSON, read the verdict as JSON.

The contract is deliberately small:

| | |
|---|---|
| **stdin / arguments** | case documents, as JSON or YAML |
| **stdout** | a single JSON `RunResult` — nothing else ever goes here |
| **stderr** | engine chatter, warnings, usage errors |
| **exit 0** | every case passed |
| **exit 1** | at least one case failed |
| **exit 2** | bad usage, or input that could not be read |
| **exit 3** | the run took longer than `--timeout` |

The split that matters is **0/1 against 2/3**, not zero against non-zero. On 0 and 1 the harness reached a verdict and stdout holds a `RunResult`. On 2 and 3 it never got that far: stdout is empty and the reason is on stderr. A host that treats every non-zero code as "some cases failed" will report a typo in a file path as a spec that does not hold.

Because stdout carries only the result, you can pipe it straight into a parser.

A run gives up after 300 seconds by default. Cases normally resolve in well under a second, so this only fires on something pathological — a selector that does not terminate on a particular datum, say — and it exists so a stuck case fails your CI job rather than hanging it. Raise it with `--timeout <seconds>` for a very large suite, or switch it off with `--timeout 0`.

```python
import json, subprocess

def check(case):
    result = subprocess.run(
        ["spytial-check", "-"],
        input=json.dumps(case),
        capture_output=True,
        text=True,
    )
    # 0 and 1 mean the harness has an answer for you; 2 and 3 mean it does not,
    # and stdout is empty. Branch on that before parsing.
    if result.returncode >= 2:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def test_linked_list():
    run = check({
        "name": "linked list runs left to right",
        "datum": relationalize(my_list),      # your relationalizer
        "spec": collect_spec(my_list),        # your decorators, macros, ...
        "assertions": [
            {"query": "must.rightOf(n1)", "equals": ["n2", "n3"]},
        ],
    })
    case = run["cases"][0]
    assert case["ok"], case["errors"] + [a for a in case["assertions"] if not a["ok"]]
```

`RunResult` carries a `formatVersion`. Refuse a version you do not recognize rather than guessing at the shape.

Vendoring is fine: `dist/cli/spytial-check.js` is a single self-contained file that any Node can run, with no `node_modules` beside it.

---

## Asking about a layout

A query names a spatial question; the assertion checks the atoms that come back.

### Modality

Directional and alignment queries take one of three modalities. This is the part that makes the harness independent of any particular drawing:

| Modality | Means |
|---|---|
| `must` | true in **every** layout the spec permits |
| `cannot` | true in **no** layout the spec permits |
| `can` | true in **at least one** — the complement of `cannot` |

`must.rightOf(a)` is not "b happens to be right of a in the drawing I got". It is "the spec forces b to the right of a, always". That is a fact about the spec, so it is stable across renders, machines, and releases.

### Query forms

| Query | Returns |
|---|---|
| `must.leftOf(A)` / `.rightOf` / `.above` / `.below` | atoms forced to that side of `A` |
| `can.leftOf(A)`, `cannot.leftOf(A)`, … | same four directions, other two modalities |
| `must.aligned.x(A)` / `.y(A)` | atoms forced onto `A`'s axis (`can`/`cannot` too) |
| `reachable.rightOf(A)` | atoms reachable from `A` through right-of constraints |
| `alignedWith.x(A)` | atoms sharing `A`'s x alignment |
| `nodes()` | every atom in the layout |
| `groups()` | every group |
| `grouped(A)` | the groups `A` belongs to |
| `grouped(A, B, ...)` | groups holding **all** the named atoms |
| `contains(G)` | members of group `G` |
| `hidden()` | atoms a `hideAtom` constraint removed |
| `sized(100, 60)` | atoms whose box is exactly that width × height |
| `cyclic(A)` | atoms in a cycle with `A`, including `A` |
| `node(A)` | `A`'s attributes |
| `edges(A)` / `edges(A, B)` | edges touching `A`, or running between the pair |
| `union(q, ...)`, `inter(q, ...)`, `not(q)` | set operations over any of the above |

Group queries take no modality — membership is settled, not something the solver reasons about. The same goes for `hidden()`, `sized`, and `cyclic`.

Three of these deserve a word on what they do *not* say:

- `hidden()` reports only atoms a `hideAtom` selector removed. An atom can be missing from `nodes()` for other reasons — it was never in the datum, or an `attribute` directive folded it into its owner — and those never appear in `hidden()`.
- `sized(W, H)` matches the exact numbers a `size` constraint asked for. An atom no `size` constraint touched can land on those numbers by accident, so point it at atoms you sized on purpose.
- `cyclic(A)` reports membership, not order — which rotation of the cycle gets drawn is not entailed by the spec. A fragment of two or fewer atoms entails no arrangement, so its atoms report empty. A negated cyclic constraint asserts the *absence* of a cycle and never contributes members.

### Checks

Every check on an assertion must hold; combine them freely.

| Check | Passes when |
|---|---|
| `equals: [ids]` | the result is exactly this set (order and duplicates ignored) |
| `contains: [ids]` | the result includes all of these |
| `excludes: [ids]` | the result includes none of these |
| `empty: true` | the result is empty |
| `nonEmpty: true` | the result has at least one member |
| `count: n` | the result has exactly `n` members |

`empty` and `nonEmpty` are honoured in both directions — `empty: false` asserts the result is *not* empty, which is what a host generating cases programmatically will produce. Giving both the same value is a contradiction and is rejected.

`because` is free text, echoed back on failure. Use it — a red test that explains its own intent is worth writing.

A query that cannot be evaluated — an unknown atom id, a syntax slip — **fails** its assertion rather than quietly returning nothing.

> Group names built from a binary selector include the key, as in `team[Team A:teamA]`. Those characters are outside what a query identifier accepts, so `contains(...)` cannot name such a group. Use `grouped(A)`, `grouped(A, B)`, and `groups()` instead.

---

## Checking the datum

Every case checks the raw datum before it lays anything out, unless you set `skipDatumCheck: true`.

This runs on the JSON your relationalizer produced, *before* it becomes a data instance — which is the whole point. The data instance normalizes as it loads: it dedupes atoms and treats reference validation as a repair step. A datum with a duplicated id lays out fine and quietly loses a value. Checking the raw form is what turns that into a visible failure, pointing at `atoms[3]` rather than leaving you to notice a missing box.

Errors stop the case, because assertions over a graph you did not mean to describe answer nothing:

| Code | Meaning |
|---|---|
| `datum/not-an-object` | the datum is not a JSON object |
| `datum/atoms-not-an-array`, `datum/relations-not-an-array` | a required top-level field is missing or the wrong type — use `[]` for none |
| `datum/no-atoms` | the walker produced nothing |
| `datum/atom-missing-id`, `datum/atom-missing-type` | an atom cannot be identified or selected |
| `datum/duplicate-atom-id` | two atoms share an id, so one would be dropped |
| `datum/dangling-tuple-atom` | a tuple names an atom that is not in `atoms` |
| `datum/relation-missing-name`, `datum/relation-missing-tuples` | a relation is unusable |
| `datum/tuple-empty`, `datum/tuple-missing-atoms` | a tuple has no atoms |

One consequence worth knowing: `datum/no-atoms` is an error, so a case cannot assert about a *deliberately* empty datum — the assertions never run. If you want to test that an empty collection produces an empty diagram, set `skipDatumCheck: true` on that one case and assert `nodes()` is empty yourself.

Warnings are reported but do not fail a case:

| Code | Meaning |
|---|---|
| `datum/atom-missing-label` | the node will render without readable text |
| `datum/empty-relation` | selectors over it will match nothing |
| `datum/ragged-relation` | one relation mixes tuple arities |
| `datum/tuple-type-arity-mismatch` | a tuple's `types` and `atoms` are different lengths |
| `layout/warning` | the engine's own advisories — an unresolved name, a deprecated form |

That last one deserves attention. A selector naming something absent evaluates to the empty relation rather than raising, so a spec with a typo lays out fine and constrains nothing. The warning is often the only sign.

### Identity is the check worth writing first

The most common relationalizer bug is losing sharing. When a host value is reachable by two paths, the walker has to emit it once, under one id. A walker that recurses without tracking identity emits it twice and silently redraws a DAG as a tree.

No datum check can catch this — both versions are well-formed graphs. An assertion can:

```yaml
- query: nodes()
  count: 4
  because: the shared value is reachable two ways but is still one atom
```

See [`shared-substructure.yaml`](https://github.com/sidprasad/spytial-core/blob/main/tests/conformance/cases/shared-substructure.yaml).

---

## Worked examples

Four seed cases ship in [`tests/conformance/cases/`](https://github.com/sidprasad/spytial-core/tree/main/tests/conformance/cases). They are meant to be copied.

| Case | Shows |
|---|---|
| `linked-list.yaml` | one relation, one constraint, transitivity |
| `binary-search-tree.yaml` | two ordering relations, and a fact the spec turns out **not** to entail |
| `shared-substructure.yaml` | identity preserved across a DAG |
| `grouping.yaml` | group-by-selector, and why the selector must be genuinely binary |

The BST case is the one to read closely. It is natural to assume that in

```yaml
- orientation: { selector: "{x, y : Node | y in x.left}",  directions: [left, below] }
- orientation: { selector: "{x, y : Node | y in x.right}", directions: [right, below] }
```

the whole left subtree ends up left of the root. It does not. A right-child grandchild is constrained relative to its parent and to nothing else, so the spec permits it landing right of the root. The drawing you happen to get may hide that; `must.leftOf` does not.

This is the harness earning its keep. The bug is not in the renderer or the engine — it is a spec that means less than its author thought, and only a question about entailment surfaces it.

---

## From JavaScript

JavaScript integrations, and spytial-core's own tests, can skip the subprocess:

```js
import { runCases, checkDatum } from 'spytial-core/conformance';

const run = runCases([myCase]);
if (!run.ok) throw new Error(JSON.stringify(run.cases, null, 2));
```

`runCase` never throws — every failure comes back as a diagnostic, so one bad case does not hide the rest. `checkDatum(datum)` can also be used on its own to check a relationalizer without writing a spec.

---

## What this does not cover

**Rendered geometry.** Whether the force simulation honors the solved constraints is spytial-core's responsibility, not yours, and checking it needs a browser. If you have reason to doubt it, that is a core bug worth reporting rather than something to assert in an integration's suite.

**Visual quality.** Crossing edges, cramped spacing, unfortunate colors — real concerns, but not entailment. No query answers them.

**Whether the spec is the one users want.** The harness checks that a spec means what you think. Whether that meaning makes a good diagram is a design question.

---

## See also

- [New Language Integration](new-language-integration.md) — the four subproblems every integration answers
- [Constraints](constraints.md) — what each constraint means
- [Selectors](selectors.md) — writing the selectors a spec is built from
