# Troubleshooting Guide

## Common Errors and Solutions

### 1. Node Overlap Error

**Error:**
```
PositionalConstraintError: Alignment constraints force NodeA and NodeB to occupy the same position

Minimal conflicting set:
  - NodeA must be horizontally aligned with NodeB
  - NodeA must be vertically aligned with NodeB
```

**Cause:** Two nodes are both horizontally AND vertically aligned, forcing them to the same (x, y) position.

**Solution:**
```yaml
# BAD: Both alignments
- align: {selector: "{x, y : Node | ...}", direction: horizontal}
- align: {selector: "{x, y : Node | ...}", direction: vertical}

# GOOD: Choose one
- align: {selector: "{x, y : Node | ...}", direction: horizontal}
```

**Or refine selector:**
```yaml
# Different selectors for each direction
- align: {selector: "{x, y : Node | x.sameRow = y}", direction: horizontal}
- align: {selector: "{x, y : Node | x.sameCol = y}", direction: vertical}
```

---

### 2. Cyclic Constraint Error

**Error:**
```
PositionalConstraintError: Constraint "A must be left of B" conflicts with existing constraints

Minimal conflicting set:
  - A must be left of B
  - B must be left of C  
  - C must be left of A
```

**Cause:** Circular dependency in orientation constraints.

**How System Handles:**
- Detects cycles automatically
- Creates disjunctive constraints with perturbations
- One constraint in cycle is "relaxed"

**Solutions:**

**Option 1: Let system handle (automatic)**
```yaml
# System detects cycle and perturbs
- orientation: {selector: "{x, y : State | x.next = y}", directions: [directlyRight]}
```

**Option 2: Break cycle explicitly**
```yaml
# Exclude one edge to break cycle
- orientation:
    selector: "{x, y : State | x.next = y and not (y.id = 'start')}"
    directions: [directlyRight]
```

**Option 3: Use different direction for cycle-closing edge**
```yaml
- orientation: {selector: "{x, y : State | x.next = y and not x.isLast}", directions: [directlyRight]}
- orientation: {selector: "{x, y : State | x.next = y and x.isLast}", directions: [directlyBelow]}
```

---

### 3. Group Overlap Error

**Error:**
```
GroupOverlapError: Groups "GroupA" and "GroupB" overlap with nodes: Node1, Node2
```

**Cause:** Two groups have common members and no subsumption.

**Solution:**

**Option 1: Use subsumption (one group contains other)**
```yaml
# Make GroupA a subgroup of GroupB
- group: {selector: bigCategory, name: "GroupB"}
- group: {selector: smallCategory, name: "GroupA"}
# If all smallCategory ⊆ bigCategory, allowed
```

**Option 2: Make groups disjoint**
```yaml
# Separate selectors
- group: {selector: "{x : Item | x.type = 'A' and no x.sharedProp}", name: "GroupA"}
- group: {selector: "{x : Item | x.type = 'B' and no x.sharedProp}", name: "GroupB"}
```

**Option 3: Combine into one group**
```yaml
# Instead of two overlapping groups, use one
- group: {selector: "{x : Item | some x.commonProp}", name: "Combined"}
```

---

### 4. Layout Generation Failed (Generic)

**Error:**
```
Layout generation failed: [generic error]
```

**Debugging Steps:**

**1. Check selector syntax**
```typescript
// Test selector in evaluator
const result = evaluator.evaluateSGraphQuery(
  "{x, y : Node | x.edge = y}",
  dataInstance
);
console.log('Matches:', result.tuples.length);
```

**2. Validate data instance**
```typescript
const atoms = dataInstance.getAtoms();
const relations = dataInstance.getRelations();
console.log('Atoms:', atoms.length);
console.log('Relations:', relations.length);
```

**3. Test constraints incrementally**
```yaml
# Start with no constraints
constraints: []

# Add one at a time
constraints:
  - orientation: {selector: "...", directions: [directlyLeft]}

# Keep adding until error appears
```

**4. Check for missing nodes**
```yaml
# Ensure referenced nodes exist
- orientation:
    selector: "{x, y : Node | x.edge = y}"
    directions: [directlyLeft]
# All nodes in selector must exist in data
```

---

### 5. Selector Returns No Matches

**Error:**
```
Generated 0 orientation constraints
```

**Cause:** Selector doesn't match any data.

**Debugging:**

**1. Test selector syntax**
```typescript
const result = evaluator.evaluateSGraphQuery(selector, data);
console.log('Tuples:', result.tuples);
```

**2. Check relation names**
```yaml
# Wrong:
selector: "{x, y : Node | x.edges = y}"  # relation is 'edge' not 'edges'

# Right:
selector: "{x, y : Node | x.edge = y}"
```

**3. Verify types**
```yaml
# Wrong:
selector: "{x, y : Nodes | x.edge = y}"  # type is 'Node' not 'Nodes'

# Right:
selector: "{x, y : Node | x.edge = y}"
```

**4. Check quantifiers**
```yaml
# Returns nothing:
selector: "{x, y : Node | all x.edge = y}"  # all rarely correct

# Use some:
selector: "{x, y : Node | some x.edge}"
```

---

### 6. Too Many Disjunctions (Performance)

**Error:**
```
Layout generation slow or hangs
```

**Cause:** Exponential backtracking from many disjunctions.

**Solutions:**

**1. Use field-based grouping instead of selector**
```yaml
# Slow: Creates disjunction per non-member
- group: {selector: "{x : Node | some x.prop}", name: "Group"}

# Fast: Field-based grouping
- group: {selector: fieldName, name: "By Field"}
```

**2. Reduce non-member nodes**
```yaml
# Hide nodes that don't need group constraints
directives:
  - hideatom: {selector: "{x : Node | no x.relevantProp}"}
```

**3. Limit group size**
```yaml
# Don't group entire graph
- group:
    selector: "{x : Node | some x.prop and x.size < 20}"
    name: "Limited Group"
```

---

### 7. Incorrect Node Positions

**Symptom:** Layout generated but nodes in wrong places.

**Causes:**

**1. Missing alignment**
```yaml
# Nodes not aligned as expected
# Add alignment constraint:
- align: {selector: "{x, y : Node | x.category = y.category}", direction: horizontal}
```

**2. Wrong direction**
```yaml
# Changed from left-to-right to right-to-left
# Fix direction:
- orientation: {selector: "...", directions: [directlyRight]}  # was directlyLeft
```

**3. Selector too broad**
```yaml
# Constraint applying to unintended nodes
# Refine selector:
- orientation:
    selector: "{x, y : Node | x.edge = y and x.type = 'A'}"
    directions: [directlyLeft]
```

---

### 8. Directives Not Applied

**Symptom:** Icons, colors not showing.

**Causes:**

**1. Selector doesn't match**
```yaml
# Check type name exactly
- icon: {selector: Node, path: icon.png}  # Case-sensitive
```

**2. Directive overridden**
```yaml
# Later directive wins
- color: {selector: Node, color: blue}
- color: {selector: Node, color: red}  # This one applies
```

**3. Icon path invalid**
```yaml
# Use full URL
- icon: {selector: Node, path: https://example.com/icon.png}
```

**4. Hidden by hideAtom**
```yaml
# Node is hidden completely
- hideatom: {selector: Node}
# Remove or refine selector
```

---

### 9. TypeScript Errors

**Error:**
```
Cannot find name 'LayoutInstance'
```

**Solution:**
```typescript
// Import from correct path
import { LayoutInstance } from 'spytial-core/layout';
// Not: import { LayoutInstance } from 'spytial-core';
```

**Error:**
```
Property 'minimalConflictingSet' does not exist
```

**Solution:**
```typescript
// Use type guard
import { isPositionalConstraintError } from 'spytial-core/layout';

if (isPositionalConstraintError(error)) {
  // Now TypeScript knows the type
  console.log(error.minimalConflictingSet);
}
```

---

## Performance Issues

### Symptom: Slow Layout Generation

**1. Check disjunction count**
```typescript
const disjunctions = layout.disjunctiveConstraints?.length || 0;
console.log('Disjunctions:', disjunctions);
// If > 50, consider optimization
```

**2. Profile constraint solving**
```typescript
console.time('constraint-solving');
const result = layoutInstance.generateLayout(data, {});
console.timeEnd('constraint-solving');
```

**3. Reduce groups**
```yaml
# Use fewer, larger groups instead of many small ones
```

### Symptom: High Memory Usage

**1. Dispose validator**
```typescript
const validator = new ConstraintValidator(layout);
// ... use validator
validator.dispose();  // Clean up caches
```

**2. Check for memory leaks**
```typescript
// Don't keep references to old layouts
let result = layoutInstance.generateLayout(data, {});
// ... use result
result = null;  // Allow GC
```

---

## Debugging Tips

### 1. Enable Verbose Logging

```typescript
// Check generated constraints
const result = layoutInstance.generateLayout(data, {});
console.log('Generated constraints:', result.layout.constraints.length);
```

### 2. Inspect Minimal Conflicting Set

```typescript
if (isPositionalConstraintError(error)) {
  for (const [source, constraints] of error.minimalConflictingSet) {
    console.log('Source:', source.toHTML());
    console.log('Constraints:', constraints.map(orientationConstraintToString));
  }
}
```

### 3. Test Selectors Independently

```typescript
const tuples = evaluator.evaluateSGraphQuery(selector, data);
console.log('Selector matches:', tuples.tuples.length);
tuples.tuples.forEach(([x, y]) => {
  console.log(`  ${x.id} -> ${y.id}`);
});
```

### 4. Validate Data Structure

```typescript
const graph = data.generateGraph(false, false);
console.log('Nodes:', graph.nodes().length);
console.log('Edges:', graph.edges().length);
graph.edges().forEach(e => {
  console.log(`  ${e.v} -> ${e.w}`);
});
```

---

## Getting Help

If you're stuck:

1. **Simplify** - Remove constraints until it works, add back one at a time
2. **Check examples** - See [common-patterns.md](./common-patterns.md)
3. **Validate syntax** - Use [constraint-syntax.md](./constraint-syntax.md)
4. **Test data** - Ensure data structure is correct
5. **Check logs** - Look for console messages about constraint generation

**Common mistake checklist:**
- [ ] Selector syntax correct?
- [ ] Type names match data?
- [ ] Relation names match data?
- [ ] Not aligning both horizontally and vertically?
- [ ] Groups don't overlap (unless nested)?
- [ ] Cycles are handled?
- [ ] Directives use correct selectors?
