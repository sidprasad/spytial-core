# Examples

This page shows complete examples of Forge models with their Spytial layout specifications.

## Binary Search Tree

A classic binary search tree model where nodes have `left` and `right` children, plus integer keys.

### Forge Model (`source.frg`)

```forge
#lang forge

/*
  Model of binary search trees
*/

sig Node {
  key: one Int,     -- every node has some key 
  left: lone Node,  -- every node has at most one left-child
  right: lone Node  -- every node has at most one right-child
}

fun descendantsOf[ancestor: Node]: set Node {
  ancestor.^(left + right) -- nodes reachable via transitive closure
}

pred binary_tree {
  -- no cycles (modified)
  all n: Node | 
    n not in descendantsOf[n] 
  -- connected via finite chain of left, right, and inverses
  all disj n1, n2: Node | n1 in n2.^(left + right + ~left + ~right)
  -- left+right differ (unless both are empty)
  all n: Node | some n.left => n.left != n.right 
  -- nodes have a unique parent (if any)
  all n: Node | lone parent: Node | n in parent.(left+right)
}

run {binary_tree and (some right) and (some left)} for exactly 5 Node
```

### Layout Spec (`layout.cnd`)

```yaml
constraints:
  - orientation:
      selector: right
      directions:
        - right
        - below
  - orientation:
      selector: left
      directions:
        - left
        - below

directives:
  - attribute:
      field: key
  - flag: hideDisconnectedBuiltIns
```

### What This Layout Does

1. **Orientation constraints**: 
   - Nodes reached via `right` edges appear to the right and below their parent
   - Nodes reached via `left` edges appear to the left and below their parent
   
2. **Directives**:
   - `attribute: key` displays the integer key value as a label on each node
   - `hideDisconnectedBuiltIns` hides built-in atoms (like integers) that aren't connected to the main graph

<div class="spytial-diagram" data-height="380" data-caption="Live: a 5-node BST rendered with the spec above. Keys appear as attributes, integer atoms are hidden.">
<template class="data">
{
  "atoms": [
    {"id": "n0", "type": "Node", "label": "Node0"},
    {"id": "n1", "type": "Node", "label": "Node1"},
    {"id": "n2", "type": "Node", "label": "Node2"},
    {"id": "n3", "type": "Node", "label": "Node3"},
    {"id": "n4", "type": "Node", "label": "Node4"},
    {"id": "k5", "type": "Int",  "label": "5"},
    {"id": "k3", "type": "Int",  "label": "3"},
    {"id": "k8", "type": "Int",  "label": "8"},
    {"id": "k1", "type": "Int",  "label": "1"},
    {"id": "k9", "type": "Int",  "label": "9"}
  ],
  "relations": [
    {"id": "left", "name": "left", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n0", "n1"], "types": ["Node", "Node"]},
       {"atoms": ["n1", "n3"], "types": ["Node", "Node"]}
     ]},
    {"id": "right", "name": "right", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n0", "n2"], "types": ["Node", "Node"]},
       {"atoms": ["n2", "n4"], "types": ["Node", "Node"]}
     ]},
    {"id": "key", "name": "key", "types": ["Node", "Int"],
     "tuples": [
       {"atoms": ["n0", "k5"], "types": ["Node", "Int"]},
       {"atoms": ["n1", "k3"], "types": ["Node", "Int"]},
       {"atoms": ["n2", "k8"], "types": ["Node", "Int"]},
       {"atoms": ["n3", "k1"], "types": ["Node", "Int"]},
       {"atoms": ["n4", "k9"], "types": ["Node", "Int"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: right, directions: [right, below] }
  - orientation: { selector: left,  directions: [left,  below] }
directives:
  - attribute: { field: key }
  - atomColor: { selector: Node, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Tic Tac Toe

A model of a tic-tac-toe grid using cells connected by `down` and `right` relations.

### Forge Model (`ttt.frg`)

```forge
#lang forge

abstract sig Mark {}
one sig X extends Mark {}
one sig O extends Mark {}

// Define the Cell signature with relations to neighboring cells
sig Cell {
    down: lone Cell,
    right: lone Cell,
    mark: lone Mark
} 

pred topLeft[ tl : Cell ] {
    all x: (Cell - tl) | x in tl.^(down + right)

    // Topmost row
    all r : tl.*right | {
        no (down.r)    // Top row has nothing above it
    }

    // Leftmost columm
    all c : (tl.*down) | {
        no right.c   // Left column has nothing to the left of it
    }
}

pred grid {
    one tl: Cell | topLeft[tl]

    // Ensure that down and right are acyclic
    no c: Cell | c in c.^(down + right)

    all c : Cell {
        lone (down.c)
        lone (right.c)
        (some c.right) implies { #(c.^down) = #((c.right).^down) }
        (some c.down) implies { #(c.^right) = #((c.down).^right) }
    }

    // Down and right are disjoint
    no (right & down)
}

pred square_grid {
    grid
    all c : Cell | topLeft[c] => (#(c.^down) = #(c.^right))
}

pred ttt {
    square_grid
}

inst xo {
    X = `X
    O = `O
    Mark = X + O
}

pred owinner_diag {
    ttt
    some c1, c2, c3: Cell | {     
       c1.mark = O and c2.mark = O and c3.mark = O      
       topLeft[c1]
       c2 = c1.right.down
       c3 = c2.right.down
    }
    # ({c : Cell |  c.mark = O}) = #({c : Cell | c.mark = X}) 
}

run {
    ttt
    owinner_diag
} for exactly 9 Cell for xo
```

### Layout Spec (`layout.cnd`)

```yaml
constraints:
  - orientation: {selector: down, directions: [directlyBelow]}
  - orientation: {selector: right, directions: [directlyRight]}

directives:
  - icon: {showLabels: false, selector: '{ x : Cell | (some x.mark) and x.mark in O}', path: tic-o}
  - icon: {showLabels: false, selector: '{ x : Cell | (some x.mark) and x.mark in X}', path: tic-x}
  - hideAtom: {selector: O + X}
  - hideField: {field: down}
  - hideField: {field: right}
  - flag: hideDisconnectedBuiltIns
```

### What This Layout Does

1. **Orientation constraints**:
   - `down` edges position cells directly below their parent (strict vertical alignment)
   - `right` edges position cells directly to the right (strict horizontal alignment)
   - This creates a proper grid layout

2. **Directives**:
   - `icon` replaces cells marked with X or O with tic-tac-toe icons
   - `hideAtom` hides the X and O mark atoms themselves
   - `hideField` hides the structural `down` and `right` edges for a cleaner board view
   - `hideDisconnectedBuiltIns` removes unused built-in types

<div class="spytial-diagram" data-height="380" data-caption="Live: a 3×3 board with O winning the diagonal. down/right constraints place the cells in a grid; icons render X and O.">
<template class="data">
{
  "atoms": [
    {"id": "c00", "type": "Cell", "label": "c00"},
    {"id": "c01", "type": "Cell", "label": "c01"},
    {"id": "c02", "type": "Cell", "label": "c02"},
    {"id": "c10", "type": "Cell", "label": "c10"},
    {"id": "c11", "type": "Cell", "label": "c11"},
    {"id": "c12", "type": "Cell", "label": "c12"},
    {"id": "c20", "type": "Cell", "label": "c20"},
    {"id": "c21", "type": "Cell", "label": "c21"},
    {"id": "c22", "type": "Cell", "label": "c22"},
    {"id": "x",   "type": "X",    "label": "X"},
    {"id": "o",   "type": "O",    "label": "O"}
  ],
  "relations": [
    {"id": "right", "name": "right", "types": ["Cell", "Cell"],
     "tuples": [
       {"atoms": ["c00", "c01"], "types": ["Cell", "Cell"]},
       {"atoms": ["c01", "c02"], "types": ["Cell", "Cell"]},
       {"atoms": ["c10", "c11"], "types": ["Cell", "Cell"]},
       {"atoms": ["c11", "c12"], "types": ["Cell", "Cell"]},
       {"atoms": ["c20", "c21"], "types": ["Cell", "Cell"]},
       {"atoms": ["c21", "c22"], "types": ["Cell", "Cell"]}
     ]},
    {"id": "down", "name": "down", "types": ["Cell", "Cell"],
     "tuples": [
       {"atoms": ["c00", "c10"], "types": ["Cell", "Cell"]},
       {"atoms": ["c10", "c20"], "types": ["Cell", "Cell"]},
       {"atoms": ["c01", "c11"], "types": ["Cell", "Cell"]},
       {"atoms": ["c11", "c21"], "types": ["Cell", "Cell"]},
       {"atoms": ["c02", "c12"], "types": ["Cell", "Cell"]},
       {"atoms": ["c12", "c22"], "types": ["Cell", "Cell"]}
     ]},
    {"id": "mark", "name": "mark", "types": ["Cell", "Mark"],
     "tuples": [
       {"atoms": ["c00", "o"], "types": ["Cell", "O"]},
       {"atoms": ["c11", "o"], "types": ["Cell", "O"]},
       {"atoms": ["c22", "o"], "types": ["Cell", "O"]},
       {"atoms": ["c01", "x"], "types": ["Cell", "X"]},
       {"atoms": ["c12", "x"], "types": ["Cell", "X"]},
       {"atoms": ["c20", "x"], "types": ["Cell", "X"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: down,  directions: [directlyBelow] }
  - orientation: { selector: right, directions: [directlyRight] }
directives:
  - icon: { selector: "{ x : Cell | (some x.mark) and x.mark in O }", path: "tic-o", showLabels: false }
  - icon: { selector: "{ x : Cell | (some x.mark) and x.mark in X }", path: "tic-x", showLabels: false }
  - hideAtom:  { selector: "O + X" }
  - hideField: { field: down }
  - hideField: { field: right }
  - atomColor: { selector: Cell, value: "#f0eada" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>