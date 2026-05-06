# UML evolution traces — third evaluation context

A new family of trace data for the realization-policies evaluation. Each
trace is a sequence of UML/architecture diagrams from a real
open-source project, captured at successive commits. **Change driver:
human edits**, in contrast to the spec-driven (Forge) and
operation-driven (CLRS algorithms) families.

## Why this dataset

The realization-policy evaluation needs three trace families with
meaningfully different change drivers:

| Family | Change driver | Spec source | Frame source |
|---|---|---|---|
| Forge / Alloy | next-state under temporal logic | spec module | model checker |
| CLRS algorithms | imperative operation | invariants | algorithm step |
| **UML evolution** | **human commit / refactor** | **UML metamodel** | **developer edit** |

Each family is a recognized source of structurally-related diagram
sequences in its own community. The three together test the policies
against three meaningfully different inter-frame change patterns.

## Original target dataset (offline)

The natural starting point was the **Lindholmen / Ho-Quang UML-in-
GitHub corpus**:

- Ho-Quang, Chaudron, Robles, Hebig, Gonzalez-Barahona, Fernández-
  Ramil. *"An Extensive Dataset of UML Models in GitHub."* MSR 2017.
- Hebig, Ho-Quang, Chaudron, Robles, Fernández. *"The Quest for Open
  Source Projects that Use UML: Mining GitHub."* MoDELS 2016.

The associated bulk archive was hosted at `oss.models-db.com` /
`gsyc.urjc.es`. Both URLs return 502 / under-construction pages as of
the date of writing (2026-05-04). The Zenodo mirror that some
follow-up papers cite is no longer findable through the Zenodo search
API.

If a working mirror surfaces by the May 13 GD submission deadline, the
mining pipeline below is unnecessary and the bulk archive should be
preferred. A working URL belongs in `dataset_url` of `repos.json`.

## Fallback approach: direct mining

In the absence of the curated corpus, we mine PlantUML diagrams from
a small set of well-known open-source repositories. PlantUML is the
right substrate because:

- It is **text-based** (`.puml`, `.plantuml` extensions), so git
  preserves a clean history of every revision without binary diffs.
- It is **widely adopted** in OSS architecture documentation, and
  many popular projects keep PlantUML diagrams in `docs/` or
  `architecture/` directories.
- It has a **regular, parseable grammar** for class, component, and
  sequence diagrams; we can extract the box-and-arrow structure
  directly without rendering.

**Trade-off acknowledged.** PlantUML diagrams are a strict subset of
"UML in OSS"; the full Hebig corpus also includes XMI, Visio, and
hand-drawn images that we cannot parse here. We document this in the
paper's Limitations section. The contribution remains: mining +
policy evaluation on a real, reproducible, public source of human-
edited diagram sequences.

## Layout

```
traces/uml_evolution/
├── README.md       this file
├── repos.json      list of target OSS repos with PlantUML diagrams
├── mine.py         clone repo, walk git history, extract per-commit
│                   PlantUML files, parse to graph structure, emit
│                   trace.json in the same schema as CLRS traces
├── parsers/
│   └── plantuml.py PlantUML grammar (subset) → typed graph
└── cache/          per-repo git clones + per-commit extracted graphs
                    (gitignored; regenerate on demand)
```

Output traces follow the same schema as
`traces/out/<algorithm>-default.trace.json`, so the existing harness
(`runner/run.ts`, `runner/aggregate.ts`,
`runner/derived_metrics.py`, `runner/bootstrap_cis.py`) consumes them
without modification.

## Initial repo set

Five repositories chosen for paradigm coverage of UML use:

| Slot | Repo | Why |
|---|---|---|
| 1 | `spring-projects/spring-framework` | popular Java; architectural docs in `framework-docs/` use PlantUML class diagrams |
| 2 | `apache/kafka` | distributed-systems architecture docs include PlantUML component diagrams |
| 3 | `eclipse/microprofile-config` | PlantUML interface and sequence diagrams maintained alongside spec evolution |
| 4 | `nestjs/nest` | TypeScript / Node project with PlantUML class hierarchy in `docs/` |
| 5 | `puppeteer/puppeteer` | API surface diagrams in PlantUML, frequent revisions |

These are placeholders pending verification (see `repos.json` for the
mining script's actual entry points and per-repo `puml_glob` paths).

## How a single trace is built

For each repo:

1. Shallow-clone into `cache/<repo>/`.
2. `git log --follow` on every PlantUML file matching the repo's
   configured glob.
3. For each commit that modifies any matching `.puml` file, check
   out the file content and parse it to a typed graph
   (nodes = classes/components, edges = associations / inheritance
   / composition / dependency, properties = stereotypes).
4. Emit one frame per commit; transitions are the diff between
   consecutive commits' graphs (added nodes, removed nodes,
   added/removed/retyped edges).
5. Persist to `traces/out/uml-<repo>.trace.json` in the existing
   trace schema.

## Build status

| Component | Status | Notes |
|---|---|---|
| `parsers/plantuml.py` | ✅ done | Class + component subset; smoke-tested. |
| `uml.py` (spytial-annotated data classes) | ✅ done | UMLNode + UMLEdge + UMLDiagram with stable identity registry. |
| `mine.py` (clone + walk + parse + emit) | ✅ done | CLI loads; pipeline runs end-to-end; cleanly errors when a glob matches no files. |
| Verified repos in `repos.json` | ⚠️ **pending** | Initial entries were speculative. Smoke test on `eclipse/microprofile-config` returned "no .puml files at configured glob" — the pipeline correctly identifies the gap, the gap itself is the next blocker. |
| First real trace produced | ⚠️ pending | Blocked on repo verification. |
| Wired into `runner/run.ts` sweep | ⚠️ pending | Trace JSON matches the algorithm-trace schema, so `--all-traces` should pick it up the moment a `uml-*.trace.json` exists. |

## TODOs before May 13

In priority order:

- [ ] **Replace `repos.json` with verified repos.** For each candidate:
      `git clone --depth 1 git@github.com:<slug>.git` then
      `git ls-files | grep -E '\.(puml|plantuml)$'` to confirm
      non-empty. Starting points worth checking:
      - GitHub topics: `plantuml`, `software-architecture`,
        `architecture-decision-record`.
      - Apache Foundation repos with `docs/architecture/` directories.
      - The Spring Framework's `framework-docs/` (the path may have
        moved between major versions; use
        `git log --all --diff-filter=A -- '*.puml'`).
- [ ] **Run a 30–50-commit slice on each verified repo.**
      `--max-commits 50` keeps total transitions per repo bounded;
      three verified repos at this cap give ~150 transitions, matching
      the algorithm-trace scale.
- [ ] **Sanity-check `traces/out/uml-*.trace.json`**: every frame
      must have non-zero `nodes`; consecutive frames must share
      atom identity for at least some node (otherwise the
      partial-consistency framework degenerates exactly the way the
      DSU snapshot bug did — see `../../README.md` "Trace-data
      hazard").
- [ ] **If the Lindholmen / Ho-Quang mirror surfaces** before the
      May 13 paper deadline, set `dataset_url` in `repos.json` and
      bypass mining. The curated corpus has stronger citation
      authority than ad-hoc mining.
