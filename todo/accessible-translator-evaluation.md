# Evaluating the Accessible Translator: An Affordance-Based Framework

The AccessibleTranslator compiles `InstanceLayout` to a non-visual representation. The central evaluation question is not "can users complete tasks" but **what does this representation afford that alternatives do not?**

We borrow from Gibson's ecological affordances (what actions does the environment make possible?) and Norman's perceived affordances (what actions does the user *perceive* as possible?). A diagram representation is good not when it passes a checklist, but when it affords the right actions for comprehension.

## 1. Affordance Inventory

Before testing users, we need to be precise about what affordances each representation offers and what it doesn't.

### AccessibleTranslator (semantic HTML + spatial nav + table)

| Affordance | Mechanism | What it enables |
|---|---|---|
| **Spatial traversal** | `data-nav-*` + arrow keys | Moving through the diagram in directions that mirror the layout's constraint structure |
| **Structural traversal** | ARIA tree + expand/collapse | Moving through groups hierarchically, entering/exiting containers |
| **Relational lookup** | Relationships table (`<table>`) | Answering "what connects to X?" without navigating the whole graph |
| **Overview-first orientation** | Overview section, type counts | Grasping diagram scope before engaging with detail |
| **Local context** | Node descriptions (type, attributes, edges) | Understanding a node's role without leaving it |
| **Spatial reasoning** | Spatial layout section, `kindToPhrase` descriptions | Understanding *why* nodes are positioned relative to each other |

### Flat text description (alt text only)

| Affordance | Mechanism | What it enables |
|---|---|---|
| **Passive overview** | Linear text | Quick gist of what the diagram contains |
| ~~Traversal~~ | — | None. The user cannot navigate *within* the diagram |
| ~~Local context~~ | — | No way to inspect a single node without reading everything |
| ~~Spatial reasoning~~ | — | Mentioned in text but not actionable |

### Visual SVG (for sighted comparison)

| Affordance | Mechanism | What it enables |
|---|---|---|
| **Preattentive grouping** | Spatial proximity, color, containment | Instant perception of clusters and hierarchy |
| **Spatial reasoning** | Position on screen | "Left child" is literally to the left |
| **Path tracing** | Edge lines | Following connections visually |
| ~~Programmatic access~~ | — | Not screen-reader accessible without additional work |

The key claim of the AccessibleTranslator is that it **recovers affordances 1-6 from the first table without requiring vision**, by compiling constraints to navigation and description structures. The evaluation must test this claim.

## 2. Automated Compliance (CI baseline)

Structural correctness is a precondition for affordances — if the ARIA tree is malformed, the traversal affordance is broken regardless of design quality.

- [x] axe-core integration test on generated HTML (`tests/accessible-translator-axe.test.ts`)
- [ ] Add to CI so regressions are caught automatically

This layer answers: *are the affordances structurally available?* It cannot answer whether they are perceived or useful.

## 3. Affordance Perception Study (Manual)

### Goal
Determine which affordances users **discover and use** unprompted, and which remain invisible.

### Method: Think-aloud with affordance coding

Open `webcola-demo/accessible-demo.html` in Safari + VoiceOver. Have participants explore freely for 5 minutes, then attempt directed tasks. The evaluator codes each action against the affordance inventory.

### Affordance discovery (unprompted exploration)

Track which affordances participants discover without prompting:

| Affordance | Discovery signal | Discovered? |
|---|---|---|
| Spatial traversal | User presses arrow keys and moves between nodes directionally | |
| Structural traversal | User expands/collapses a group in the tree | |
| Relational lookup | User navigates to and reads the relationships table | |
| Overview orientation | User reads the overview section first | |
| Local context | User pauses on a node and reads its attributes/edges | |
| Spatial reasoning | User reads or references the spatial layout section | |

**This is the most important measurement.** An affordance that exists but is never discovered is a *failed* affordance — the representation affords the action but the user doesn't perceive it. That's a design problem, not a user problem.

### Affordance utilization (directed tasks)

After free exploration, give tasks that *require* specific affordances. This separates "didn't discover" from "can't use even when directed."

| Task | Required affordance | Notes |
|---|---|---|
| "What is the left child of the root?" | Spatial traversal OR relational lookup | Can be answered two ways — which do they choose? |
| "How many nodes are in this diagram?" | Overview orientation | Do they go to overview or count manually? |
| "Navigate from Node(10) to Node(3)" | Spatial traversal | Must use directional nav, not tab-through |
| "What type is Node(7)? What is its value?" | Local context | Can they get attributes without leaving the node? |
| "Which nodes are in the BST Nodes group?" | Structural traversal | Requires entering a group |
| "Why is Node(5) to the left of Node(10)?" | Spatial reasoning | Can they find and interpret constraint descriptions? |
| "List all `left` relationships" | Relational lookup | Table affords this directly; tree does not |

For each task, record:
- **Which affordance(s) the user attempted** (not just whether they succeeded)
- **Whether the affordance worked as expected** (correct result via that path)
- **Time to first correct answer**
- **Errors and recovery** (tried wrong affordance, switched to correct one)

### Comparison conditions (within-subjects)

Present the same diagram (7-node BST) in three representations. After using each, ask:

> "What actions did this representation let you take? What could you do with it?"

This is an open-ended affordance elicitation — not "which did you prefer" but "what did each one make possible for you."

Conditions:
- **(A)** AccessibleTranslator full output (spatial nav + tree + table)
- **(B)** Alt text only (from `toAltText()`)
- **(C)** Flat HTML list of nodes and edges (no ARIA tree, no spatial nav, no table)

The comparison tests the central thesis: (A) should afford actions that (B) and (C) do not. Specifically, spatial traversal and relational lookup should be unique to (A). If users report the same perceived affordances for (A) and (C), the spatial navigation design has failed.

## 4. Participants

3-5 screen reader users. Recruit via:
- University disability services
- Accessibility communities (NFB tech division, A11y Slack)
- AccessWorks (https://access-works.com)

Critical: participants must be proficient with their screen reader. We are evaluating representation affordances, not screen reader learnability.

## 5. Open Design Questions (Framed as Affordance Trade-offs)

These are not implementation details — they are questions about which affordances to prioritize when they conflict.

### Spatial vs. structural traversal
Arrow-left currently means "spatially to the left" (from constraints). For a BST, this happens to align with "left child" (structural). For other diagrams, spatial and structural directions may conflict. **Which affordance should arrow keys provide?** This determines whether the primary navigation affords spatial reasoning or structural reasoning.

### Overview-first vs. node-first
The current order is: overview → tree → table. This prioritizes the *orientation* affordance. But if users skip straight to the tree, the overview affords nothing — it's just in the way. **Does the overview affordance justify its position, or should traversal be first?**

### Relational lookup: table vs. inline
Relationships are available in two places: the table (relational lookup affordance) and inline on each node (local context affordance). If users only ever use one, the other is wasted structure. **Which is actually used? Should one be removed, or do they serve different tasks?**

### Spatial navigation at scale
Four directions work for small diagrams. For dense graphs with many constraints, the spatial traversal affordance may break down — too many neighbors in each direction, unclear "nearest." **At what complexity does spatial traversal stop affording useful navigation?** This determines whether we need a complementary "follow edge" affordance.

### Group navigation model
Groups can be navigated as tree expand/collapse (structural traversal) or as a flat list with group annotations. **Which model better affords understanding of containment?**

## 6. Success Criteria

The evaluation succeeds not when task completion is high, but when:

1. **Affordance discovery rate > 80%** — at least 4 of 6 affordances discovered unprompted by most participants
2. **Affordance differentiation** — participants report more available actions for condition (A) than (B) or (C)
3. **Affordance-task alignment** — for each task, participants attempt the *intended* affordance (spatial traversal for navigation tasks, table for lookup tasks), indicating the design signals are legible
4. **No false affordances** — participants don't attempt actions the representation appears to offer but doesn't actually support (e.g., trying to edit nodes, expecting bidirectional links)
