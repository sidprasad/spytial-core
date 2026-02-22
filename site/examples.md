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