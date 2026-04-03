# Evaluating the Accessible Translator

The AccessibleTranslator compiles `InstanceLayout` to a non-visual representation (spatial navigation, semantic HTML, alt text). Automated tools check structural compliance; only user testing can tell us if the representation is actually useful.

## 1. Automated compliance (CI baseline)

- [x] axe-core integration test on generated HTML (see `tests/accessible-translator-axe.test.ts`)
- [ ] Add to CI so regressions are caught automatically

## 2. Manual screen reader walkthrough

Open `webcola-demo/accessible-demo.html` in Safari, enable VoiceOver (`Cmd+F5`), and check:

- [ ] Tab into the tree — VoiceOver announces "diagram, tree" and first node as "diagram node"
- [ ] Arrow through nodes — `data-nav-*` spatial directions feel right for the BST
- [ ] Read the relationships table — `VO+arrows` through the table makes left/right structure clear
- [ ] Listen to alt text — if this were an `alt` on an `<img>`, would you understand the diagram?

Estimate: 30 minutes. Will surface obvious AT parsing issues.

## 3. Task-based user study

### Participants
3-5 screen reader users. Recruit via:
- University disability services
- Accessibility communities (e.g., NFB tech division, A11y Slack)
- Platforms like AccessWorks (https://access-works.com)

### Material
2-3 diagrams of varying complexity:
- **BST** (structural/hierarchical) — the current demo example
- **State machine** (cyclic constraints)
- **Grouped diagram** (teams/departments with group constraints)

### Tasks

**Comprehension:**
- "How many nodes are in this BST?"
- "What is the left child of the root?"
- "Which nodes are leaves?"

**Navigation:**
- "Starting at the root, navigate to Node(3)."
- "Find all nodes at the same level as Node(5)."

**Structural reasoning:**
- "Is this a valid BST? Why or why not?"
- "Describe the overall shape of this diagram."

**Comparison (within-subjects):**
Show the same diagram as:
  (a) AccessibleTranslator semantic HTML (spatial nav + tree + table)
  (b) Flat text description only
  (c) Alt text only
"Which helped you understand the diagram fastest? Which would you prefer?"

### Metrics
- Task completion rate (binary per task)
- Time on task (seconds)
- Subjective preference ranking (a/b/c)
- Think-aloud notes (where did they get confused?)

## 4. Open design questions user testing should resolve

- **Spatial vs. structural navigation**: For a BST, should arrow-left mean "left child" (structural) or "spatially to the left" (current)? These may differ for non-tree diagrams.

- **Description verbosity**: Is "Node(5) is to the left of Node(10)" helpful, or is "Node(10) has left child Node(5)" clearer? We use constraint vocabulary; users might want relational vocabulary.

- **Overview-first vs. node-first**: Currently: overview -> tree -> table. Should the tree (primary interaction) come first?

- **When spatial metaphor breaks down**: Four directions works for simple diagrams. For complex graphs with many constraints, do we need "follow edge" as a navigation action alongside spatial arrows?

- **Group navigation**: Is entering/exiting groups (tree expand/collapse) intuitive, or do users prefer a flat list with group annotations?
