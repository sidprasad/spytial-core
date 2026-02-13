# JSON Data Format

If you're providing data to Spytial as JSON (rather than Alloy XML or another format), this page describes the expected shape.

---

## Structure

```json
{
  "atoms": [ ... ],
  "relations": [ ... ],
  "types": [ ... ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `atoms` | Yes | Array of nodes in the graph |
| `relations` | Yes | Array of edges / relationships |
| `types` | No | Explicit type hierarchy. If omitted, types are inferred from atoms. |

---

## Atoms

Each atom (node) has three required fields:

```json
{
  "id": "alice",
  "type": "Person",
  "label": "Alice"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the atom |
| `type` | string | The atom's type (used by selectors like `Person`) |
| `label` | string | Display label shown in the visualization |

---

## Relations

Each relation defines a set of edges between atoms:

```json
{
  "id": "parent",
  "name": "parent",
  "types": ["Person", "Person"],
  "tuples": [
    { "atoms": ["alice", "bob"], "types": ["Person", "Person"] },
    { "atoms": ["alice", "carol"], "types": ["Person", "Person"] }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the relation |
| `name` | string | Display name (used in selectors like `parent`) |
| `types` | string[] | The general types for each column of the relation |
| `tuples` | array | The actual edges |

Each **tuple** has:

| Field | Type | Description |
|-------|------|-------------|
| `atoms` | string[] | Atom IDs in order (e.g., `["source", "target"]`) |
| `types` | string[] | The specific type of each atom in this tuple |

### Arity

Relations can have any arity:

- **Binary** (arity 2): The most common — `["source", "target"]`
- **Ternary** (arity 3): `["person", "course", "grade"]`
- **Higher arity**: any number of columns

---

## Types (Optional)

If you need to define a **type hierarchy** (e.g., `Student extends Person`), provide the `types` array:

```json
{
  "id": "Student",
  "types": ["Student", "Person", "object"],
  "atoms": [
    { "id": "alice", "type": "Student", "label": "Alice" }
  ],
  "isBuiltin": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | The type name |
| `types` | string[] | Type hierarchy, most-specific first (e.g., `["Student", "Person", "object"]`) |
| `atoms` | array | Atoms belonging to this type |
| `isBuiltin` | boolean | Whether this is a built-in type (like `Int`, `String`) — used by `hideDisconnectedBuiltIns` |

If `types` is omitted, Spytial infers types from the `type` field of each atom. You only need explicit types when you have **inheritance** that selectors should respect.

---

## Complete Example

A small family tree with ages:

```json
{
  "atoms": [
    { "id": "alice", "type": "Person", "label": "Alice" },
    { "id": "bob", "type": "Person", "label": "Bob" },
    { "id": "carol", "type": "Person", "label": "Carol" },
    { "id": "35", "type": "Int", "label": "35" },
    { "id": "10", "type": "Int", "label": "10" },
    { "id": "8", "type": "Int", "label": "8" }
  ],
  "relations": [
    {
      "id": "parent",
      "name": "parent",
      "types": ["Person", "Person"],
      "tuples": [
        { "atoms": ["bob", "alice"], "types": ["Person", "Person"] },
        { "atoms": ["carol", "alice"], "types": ["Person", "Person"] }
      ]
    },
    {
      "id": "age",
      "name": "age",
      "types": ["Person", "Int"],
      "tuples": [
        { "atoms": ["alice", "35"], "types": ["Person", "Int"] },
        { "atoms": ["bob", "10"], "types": ["Person", "Int"] },
        { "atoms": ["carol", "8"], "types": ["Person", "Int"] }
      ]
    }
  ]
}
```

Paired with this spec:

```yaml
constraints:
  - orientation:
      selector: parent
      directions: [above]

directives:
  - attribute:
      field: age
  - atomColor:
      selector: Person
      value: "#4a90d9"
  - flag: hideDisconnectedBuiltIns
```

This produces a tree with Alice at the top (parent of Bob and Carol), ages displayed as labels, and integer atoms hidden.

---

## Tips

- **Atom IDs must be unique** across the entire dataset.
- **Relation tuples reference atoms by ID** — make sure the IDs match.
- **Supertypes** in a hierarchy (like `object`) don't need their own type entry unless they have atoms.
- Mark built-in types as `isBuiltin: true` so `hideDisconnectedBuiltIns` can clean them up.
