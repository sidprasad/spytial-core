# JSONDataInstance Format

This document describes the JSON shape accepted by `JSONDataInstance` and provides a full, real-world example.

## Required fields

- `atoms`: Array of atoms (nodes). Each atom must have `id`, `type`, and `label`. Optional `labels` can be used for extra display metadata.
- `relations`: Array of relations (edges). Each relation must have `id`, `name`, `types`, and `tuples`.

## Optional fields

- `types`: Explicit type definitions. If omitted, `JSONDataInstance` will infer types from `atoms`.

Each type object includes:

- `id`: The type name.
- `types`: The type hierarchy from most-specific to most-general (self first).
- `atoms`: The atoms belonging to this type (same shape as the top-level `atoms`).
- `isBuiltin`: Whether the type should be treated as built-in.

## Notes

- Atom IDs should be unique strings. Relation tuples reference atoms by ID.
- Supertypes in a type hierarchy (e.g., `object`) do not need their own entries unless they have atoms.
- Extra fields are preserved but ignored by the core logic; only the fields above are required.

## Example: Order Statistic Tree instance

```typescript
const jsonData: IJsonDataInstance = {
  atoms: [
    { id: "\"black\"", type: "str", label: "black" },
    { id: "26", type: "int", label: "26" },
    { id: "\"red\"", type: "str", label: "red" },
    { id: "17", type: "int", label: "17" },
    { id: "14", type: "int", label: "14" },
    { id: "None", type: "NoneType", label: "None" },
    { id: "0", type: "int", label: "0" },
    { id: "n4", type: "RBNode", label: "NIL" },
    { id: "16", type: "int", label: "16" },
    { id: "1", type: "int", label: "1" },
    { id: "n5", type: "OSNode", label: "n5" },
    { id: "2", type: "int", label: "2" },
    { id: "n3", type: "OSNode", label: "n3" },
    { id: "21", type: "int", label: "21" },
    { id: "19", type: "int", label: "19" },
    { id: "n7", type: "OSNode", label: "n7" },
    { id: "n6", type: "OSNode", label: "n6" },
    { id: "5", type: "int", label: "5" },
    { id: "n2", type: "OSNode", label: "n2" },
    { id: "41", type: "int", label: "41" },
    { id: "n8", type: "OSNode", label: "n8" },
    { id: "7", type: "int", label: "7" },
    { id: "n1", type: "OSNode", label: "n1" },
    { id: "n0", type: "OSTree", label: "t" }
  ],
  relations: [
    {
      id: "color",
      name: "color",
      types: ["object", "object"],
      tuples: [
        { atoms: ["n4", "\"black\""], types: ["RBNode", "str"] },
        { atoms: ["n5", "\"red\""], types: ["OSNode", "str"] },
        { atoms: ["n3", "\"black\""], types: ["OSNode", "str"] },
        { atoms: ["n7", "\"red\""], types: ["OSNode", "str"] },
        { atoms: ["n6", "\"black\""], types: ["OSNode", "str"] },
        { atoms: ["n2", "\"red\""], types: ["OSNode", "str"] },
        { atoms: ["n8", "\"black\""], types: ["OSNode", "str"] },
        { atoms: ["n1", "\"black\""], types: ["OSNode", "str"] }
      ]
    },
    {
      id: "key",
      name: "key",
      types: ["object", "object"],
      tuples: [
        { atoms: ["n4", "None"], types: ["RBNode", "NoneType"] },
        { atoms: ["n5", "16"], types: ["OSNode", "int"] },
        { atoms: ["n3", "14"], types: ["OSNode", "int"] },
        { atoms: ["n7", "19"], types: ["OSNode", "int"] },
        { atoms: ["n6", "21"], types: ["OSNode", "int"] },
        { atoms: ["n2", "17"], types: ["OSNode", "int"] },
        { atoms: ["n8", "41"], types: ["OSNode", "int"] },
        { atoms: ["n1", "26"], types: ["OSNode", "int"] }
      ]
    },
    {
      id: "left",
      name: "left",
      types: ["object", "object"],
      tuples: [
        { atoms: ["n4", "n4"], types: ["RBNode", "RBNode"] },
        { atoms: ["n5", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n3", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n7", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n6", "n7"], types: ["OSNode", "OSNode"] },
        { atoms: ["n2", "n3"], types: ["OSNode", "OSNode"] },
        { atoms: ["n8", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n1", "n2"], types: ["OSNode", "OSNode"] }
      ]
    },
    {
      id: "parent",
      name: "parent",
      types: ["object", "object"],
      tuples: [
        { atoms: ["n4", "n4"], types: ["RBNode", "RBNode"] },
        { atoms: ["n5", "n3"], types: ["OSNode", "OSNode"] },
        { atoms: ["n3", "n2"], types: ["OSNode", "OSNode"] },
        { atoms: ["n7", "n6"], types: ["OSNode", "OSNode"] },
        { atoms: ["n6", "n2"], types: ["OSNode", "OSNode"] },
        { atoms: ["n2", "n1"], types: ["OSNode", "OSNode"] },
        { atoms: ["n8", "n1"], types: ["OSNode", "OSNode"] },
        { atoms: ["n1", "n4"], types: ["OSNode", "RBNode"] }
      ]
    },
    {
      id: "right",
      name: "right",
      types: ["object", "object"],
      tuples: [
        { atoms: ["n4", "n4"], types: ["RBNode", "RBNode"] },
        { atoms: ["n5", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n3", "n5"], types: ["OSNode", "OSNode"] },
        { atoms: ["n7", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n6", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n2", "n6"], types: ["OSNode", "OSNode"] },
        { atoms: ["n8", "n4"], types: ["OSNode", "RBNode"] },
        { atoms: ["n1", "n8"], types: ["OSNode", "OSNode"] }
      ]
    },
    {
      id: "size",
      name: "size",
      types: ["object", "object"],
      tuples: [
        { atoms: ["n4", "0"], types: ["RBNode", "int"] },
        { atoms: ["n5", "1"], types: ["OSNode", "int"] },
        { atoms: ["n3", "2"], types: ["OSNode", "int"] },
        { atoms: ["n7", "1"], types: ["OSNode", "int"] },
        { atoms: ["n6", "2"], types: ["OSNode", "int"] },
        { atoms: ["n2", "5"], types: ["OSNode", "int"] },
        { atoms: ["n8", "1"], types: ["OSNode", "int"] },
        { atoms: ["n1", "7"], types: ["OSNode", "int"] }
      ]
    },
    {
      id: "root",
      name: "root",
      types: ["object", "object"],
      tuples: [
        { atoms: ["n0", "n1"], types: ["OSTree", "OSNode"] }
      ]
    }
  ],
  types: [
    {
      id: "str",
      types: ["str", "object"],
      atoms: [
        { id: "\"black\"", type: "str", label: "black" },
        { id: "\"red\"", type: "str", label: "red" }
      ],
      isBuiltin: true
    },
    {
      id: "int",
      types: ["int", "object"],
      atoms: [
        { id: "26", type: "int", label: "26" },
        { id: "17", type: "int", label: "17" },
        { id: "14", type: "int", label: "14" },
        { id: "0", type: "int", label: "0" },
        { id: "16", type: "int", label: "16" },
        { id: "1", type: "int", label: "1" },
        { id: "2", type: "int", label: "2" },
        { id: "21", type: "int", label: "21" },
        { id: "19", type: "int", label: "19" },
        { id: "5", type: "int", label: "5" },
        { id: "41", type: "int", label: "41" },
        { id: "7", type: "int", label: "7" }
      ],
      isBuiltin: true
    },
    {
      id: "NoneType",
      types: ["NoneType", "object"],
      atoms: [
        { id: "None", type: "NoneType", label: "None" }
      ],
      isBuiltin: true
    },
    {
      id: "RBNode",
      types: ["RBNode", "object"],
      atoms: [
        { id: "n4", type: "RBNode", label: "NIL" }
      ],
      isBuiltin: false
    },
    {
      id: "OSNode",
      types: ["OSNode", "RBNode", "object"],
      atoms: [
        { id: "n5", type: "OSNode", label: "n5" },
        { id: "n3", type: "OSNode", label: "n3" },
        { id: "n7", type: "OSNode", label: "n7" },
        { id: "n6", type: "OSNode", label: "n6" },
        { id: "n2", type: "OSNode", label: "n2" },
        { id: "n8", type: "OSNode", label: "n8" },
        { id: "n1", type: "OSNode", label: "n1" }
      ],
      isBuiltin: false
    },
    {
      id: "OSTree",
      types: ["OSTree", "RBTree", "object"],
      atoms: [
        { id: "n0", type: "OSTree", label: "t" }
      ],
      isBuiltin: false
    }
  ]
};
```
