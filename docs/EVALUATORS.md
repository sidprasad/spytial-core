# Evaluators Guide

This document explains the different evaluator implementations available in spytial-core, their query syntax, and when to use each one.

## Overview

Evaluators are responsible for querying `IDataInstance` data to select atoms and tuples for layout constraints. All evaluators implement the `IEvaluator` interface but use different query languages.

| Evaluator | Query Language | Best For |
|-----------|---------------|----------|
| `SGraphQueryEvaluator` (SGQ) | Simple Graph Query DSL | Most use cases, simple syntax |
| `ForgeEvaluator` | Forge/Alloy relational logic | Alloy users, complex relational queries |
| `SQLEvaluator` | Standard SQL | SQL-familiar users, complex aggregations |

---

## SGraphQueryEvaluator (SGQ)

The default evaluator using the Simple Graph Query DSL. Designed for intuitive querying of graph-structured data.

### Initialization

```typescript
import { SGraphQueryEvaluator, AlloyDataInstance } from 'spytial-core';

const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: myDataInstance });
```

### Query Syntax

#### Selecting atoms by type
```
Person              // All atoms of type Person
Node                // All atoms of type Node
```

#### Selecting specific atoms
```
Person0             // Atom with id "Person0"
Alice               // Atom with id "Alice"
```

#### Selecting relation tuples
```
friends             // All tuples in the 'friends' relation
parent              // All tuples in the 'parent' relation
```

#### Field access (navigation)
```
Person.friends      // All atoms reachable via 'friends' from Person atoms
Alice.worksAt       // Companies where Alice works
```

#### Filtering with join (binary selectors)
```
Person->friends     // (source, target) pairs from Person via friends
Node->edges->Node   // Edges between nodes
```

### Example Queries

```typescript
// Get all Person atoms
evaluator.evaluate("Person").selectedAtoms();
// → ['Person0', 'Person1', 'Person2']

// Get friend relationships
evaluator.evaluate("friends").selectedTwoples();
// → [['Alice', 'Bob'], ['Bob', 'Charlie']]

// Navigate from a specific atom
evaluator.evaluate("Alice.friends").selectedAtoms();
// → ['Bob']
```

---

## ForgeEvaluator

Uses Forge/Alloy relational logic syntax. Ideal for users familiar with Alloy or Forge.

### Initialization

```typescript
import { ForgeEvaluator } from 'spytial-core';

const evaluator = new ForgeEvaluator();
evaluator.initialize({ sourceData: alloyXmlString }); // Note: takes XML string
```

### Query Syntax

#### Selecting atoms (sigs)
```
Person              // All atoms in Person sig
univ                // All atoms (universe)
none                // Empty set
```

#### Relational operators
```
Person.friends      // Relational join
friends.Person      // Reverse join
^parent             // Transitive closure
*parent             // Reflexive-transitive closure
~friends            // Transpose (reverse relation)
```

#### Set operations
```
Person + Company    // Union
Person & Employee   // Intersection
Person - Manager    // Difference
```

#### Filtering
```
friends & (Person -> Person)   // Friends between persons only
```

### Example Queries

```typescript
// Transitive closure - all ancestors
evaluator.evaluate("^parent").selectedTwoples();

// Symmetric closure - friends in both directions
evaluator.evaluate("friends + ~friends").selectedTwoples();
```

---

## SQLEvaluator

Uses standard SQL syntax with AlaSQL. Best for users comfortable with SQL and for complex aggregations.

### Initialization

```typescript
import { SQLEvaluator, AlloyDataInstance } from 'spytial-core';

const evaluator = new SQLEvaluator();
evaluator.initialize({ sourceData: myDataInstance });
```

### Database Schema

The SQLEvaluator creates tables from your data instance:

#### Built-in Tables

| Table | Columns | Description |
|-------|---------|-------------|
| `atoms` | `id`, `type`, `label` | All atoms (type = most specific type) |
| `atom_types` | `atom_id`, `type` | Junction table: all types per atom (includes inherited) |
| `types` | `id`, `isBuiltin`, `hierarchy` | Type definitions |

#### Relation Tables

For each relation in your data, a table is created:

| Relation Arity | Columns | Example |
|----------------|---------|---------|
| Unary (1) | `atom` | `selected(atom)` |
| Binary (2) | `src`, `tgt` | `friends(src, tgt)` |
| Ternary (3+) | `elem_0`, `elem_1`, ... | `assignment(elem_0, elem_1, elem_2)` |

### Important: Types vs Relations

**Types are NOT tables.** Unlike Forge where `Person` is a queryable set, in SQL:

```sql
-- ❌ This does NOT work
SELECT * FROM Person

-- ✅ This works - query atoms table with type filter
SELECT id FROM atoms WHERE type = 'Person'
```

**Relations ARE tables:**

```sql
-- ✅ This works - 'friends' is a relation table
SELECT * FROM friends
```

### Type Inheritance with `atom_types` Table

The SQLEvaluator handles type inheritance (e.g., `sig Student extends Person`) via the `atom_types` junction table.

**Two tables for atoms:**

| Table | Purpose | Use When |
|-------|---------|----------|
| `atoms` | Each atom with its **most specific** type | You want exact type matches |
| `atom_types` | Each atom with **all** its types (including inherited) | You want type hierarchy queries |

**Example with inheritance:**

Given Alloy model:
```alloy
sig Person {}
sig Student extends Person {}
```

And atoms: `Person0` (type: Person), `Student0` (type: Student)

```sql
-- atoms table: type = most specific only
SELECT id FROM atoms WHERE type = 'Person'
-- Returns: Person0 (NOT Student0!)

SELECT id FROM atoms WHERE type = 'Student'
-- Returns: Student0

-- atom_types table: includes inherited types
SELECT DISTINCT atom_id FROM atom_types WHERE type = 'Person'
-- Returns: Person0, Student0 ✅ (includes Student because Student extends Person)
```

**Best practice for type queries (matching Forge/SGQ behavior):**

```sql
-- Get all atoms that ARE or EXTEND a type
SELECT DISTINCT atom_id FROM atom_types WHERE type = 'Person'

-- With full atom info (join with atoms table)
SELECT DISTINCT a.id, a.label 
FROM atoms a 
JOIN atom_types at ON a.id = at.atom_id 
WHERE at.type = 'Person'
```

### Viewing Available Tables

Use `getTableSchemas()` to see what tables exist:

```typescript
const schemas = evaluator.getTableSchemas();
// [
//   { name: 'atoms', columns: ['id', 'type', 'label'] },
//   { name: 'types', columns: ['id', 'isBuiltin', 'hierarchy'] },
//   { name: 'friends', columns: ['src', 'tgt'] },
//   { name: 'worksAt', columns: ['src', 'tgt'] }
// ]
```

### Query Syntax

Standard SQL with some notes:

```sql
-- Select all atoms of a type
SELECT id FROM atoms WHERE type = 'Person'

-- Select from a relation
SELECT src, tgt FROM friends

-- Join atoms with relations
SELECT a.id, a.label, f.tgt 
FROM atoms a 
JOIN friends f ON a.id = f.src

-- Aggregations
SELECT type, COUNT(*) as count 
FROM atoms 
GROUP BY type

-- Complex filtering
SELECT DISTINCT a.id 
FROM atoms a 
JOIN friends f ON a.id = f.src 
WHERE a.type = 'Person'
```

### Querying by ID vs Label

Atoms have both an `id` (unique identifier) and a `label` (display name). These may differ:

| Field | Purpose | Example |
|-------|---------|---------|
| `id` | Unique identifier, used in relations | `Person0`, `Node$1` |
| `label` | Human-readable display name | `Alice`, `Root Node` |

```sql
-- Find atom by exact ID
SELECT * FROM atoms WHERE id = 'Person0'

-- Find atom by label (display name)
SELECT * FROM atoms WHERE label = 'Alice'

-- Find atoms where label contains a substring
SELECT * FROM atoms WHERE label LIKE '%Manager%'

-- Compare: get all friend pairs with their labels
SELECT a1.label AS person, a2.label AS friend
FROM friends f
JOIN atoms a1 ON f.src = a1.id
JOIN atoms a2 ON f.tgt = a2.id
```

### Building Binary Selectors (Edge Selection)

Binary selectors return pairs of atoms (for edges/arrows). In SQL, this means returning two columns.

**Basic pattern:**
```sql
-- Return (source, target) pairs - the two columns become the binary selector
SELECT src, tgt FROM relation_name
```

**Filtered binary selectors:**

```sql
-- Friends where source is a Person (equivalent to SGQ: Person->friends)
SELECT f.src, f.tgt 
FROM friends f 
JOIN atom_types at ON f.src = at.atom_id 
WHERE at.type = 'Person'

-- Friends between Persons only (equivalent to Forge: friends & (Person -> Person))
SELECT f.src, f.tgt 
FROM friends f
JOIN atom_types src_types ON f.src = src_types.atom_id
JOIN atom_types tgt_types ON f.tgt = tgt_types.atom_id
WHERE src_types.type = 'Person' AND tgt_types.type = 'Person'

-- Self-loops only (where source equals target)
SELECT src, tgt FROM edges WHERE src = tgt

-- Edges from a specific atom
SELECT src, tgt FROM friends WHERE src = 'Alice'
```

**Joining multiple relations:**

```sql
-- Path through two relations: Person -> worksAt -> Company -> locatedIn -> City
-- Returns (person, city) pairs
SELECT w.src AS person, l.tgt AS city
FROM worksAt w
JOIN locatedIn l ON w.tgt = l.src

-- With type filtering
SELECT w.src, l.tgt
FROM worksAt w
JOIN locatedIn l ON w.tgt = l.src
JOIN atom_types at ON w.src = at.atom_id
WHERE at.type = 'Employee'
```

**Creating edges from atom properties:**

```sql
-- Create edges between atoms that share the same type
SELECT a1.id AS src, a2.id AS tgt
FROM atoms a1
JOIN atoms a2 ON a1.type = a2.type AND a1.id < a2.id

-- Edges between atoms with same label prefix
SELECT a1.id, a2.id
FROM atoms a1
JOIN atoms a2 ON SUBSTR(a1.label, 1, 3) = SUBSTR(a2.label, 1, 3)
WHERE a1.id != a2.id
```

### Example Queries

```typescript
// Get all Person atoms
const result = evaluator.evaluate("SELECT id FROM atoms WHERE type = 'Person'");
result.selectedAtoms();
// → ['Alice', 'Bob', 'Charlie']

// Get friend pairs
const result = evaluator.evaluate("SELECT src, tgt FROM friends");
result.selectedTwoples();
// → [['Alice', 'Bob'], ['Bob', 'Charlie']]

// Count atoms by type
const result = evaluator.evaluate("SELECT type, COUNT(*) FROM atoms GROUP BY type");
result.getRawResult();
// → [{ type: 'Person', 'COUNT(*)': 3 }, { type: 'Company', 'COUNT(*)': 1 }]
```

### Reserved Word Handling

SQL reserved words are automatically prefixed to avoid conflicts:

| Original Name | SQL Table Name |
|---------------|----------------|
| `select` | `rel_select` |
| `from` | `rel_from` |
| `order` | `rel_order` |

---

## Comparison: Same Query, Different Evaluators

**Goal: Get all atoms of type "Person"**

| Evaluator | Query |
|-----------|-------|
| SGQ | `Person` |
| Forge | `Person` |
| SQL | `SELECT id FROM atoms WHERE type = 'Person'` |

**Goal: Get all friend relationships**

| Evaluator | Query |
|-----------|-------|
| SGQ | `friends` |
| Forge | `friends` |
| SQL | `SELECT src, tgt FROM friends` |

**Goal: Get friends of Alice**

| Evaluator | Query |
|-----------|-------|
| SGQ | `Alice.friends` |
| Forge | `Alice.friends` |
| SQL | `SELECT tgt FROM friends WHERE src = 'Alice'` |

**Goal: Get all ancestors (transitive parent)**

| Evaluator | Query |
|-----------|-------|
| SGQ | Not directly supported |
| Forge | `^parent` |
| SQL | Requires recursive CTE (complex) |

---

## Choosing an Evaluator

### Use SGQ when:
- You want simple, intuitive syntax
- Your queries are straightforward type/relation selections
- You're building a general-purpose visualization tool

### Use Forge when:
- You're working with Alloy/Forge models
- You need transitive closure (`^`) or transpose (`~`)
- You want full relational algebra support

### Use SQL when:
- You're comfortable with SQL
- You need aggregations (COUNT, SUM, etc.)
- You want to do complex JOINs
- You're building tools for SQL-familiar users

---

## IEvaluatorResult Interface

All evaluators return results implementing `IEvaluatorResult`:

```typescript
interface IEvaluatorResult {
  // Check for errors
  isError(): boolean;
  getError(): { message: string; code?: string } | undefined;
  
  // Check for empty results
  noResult(): boolean;
  
  // Extract atoms (for node selection)
  selectedAtoms(): string[];
  
  // Extract pairs (for edge selection)  
  selectedTwoples(): [string, string][];
  
  // Get raw result for custom processing
  getRawResult(): unknown;
}
```

### Usage Example

```typescript
const result = evaluator.evaluate("Person");

if (result.isError()) {
  console.error(result.getError()?.message);
  return;
}

if (result.noResult()) {
  console.log("No matching atoms");
  return;
}

const atoms = result.selectedAtoms();
console.log(`Found ${atoms.length} Person atoms:`, atoms);
```

---

## Using Evaluators in CND Layout Specifications

Evaluators power the selectors in CND layout specs:

```
// The evaluator interprets these selectors
orient Person above Company     // "Person" and "Company" are evaluated
align left: Person.friends      // "Person.friends" is evaluated
color Person: blue              // "Person" is evaluated
```

The layout system uses whichever evaluator you've configured to interpret these selectors.
