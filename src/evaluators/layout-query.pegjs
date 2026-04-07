// Layout Query Grammar — PEG grammar for spatial & affordance queries.
// Generates SpatialQuery AST nodes consumed by LayoutEvaluator.
//
// Composite:  union(expr, expr, ...)  inter(expr, expr, ...)  not(expr)
// Atomic:     must.leftOf(A)  can.aligned.x(B)  nodes()  node(A)  edges(A, B)  ...

{{
// Type imports are not available in Peggy actions, so we construct plain objects
// matching the SpatialQuery type defined in layout-evaluator.ts.
}}

// ─── Entry ──────────────────────────────────────────────────────────

Expression
  = _ expr:Composite _ { return expr; }

Composite
  = Union
  / Intersection
  / Negation
  / AtomicQuery

// ─── Set operations ─────────────────────────────────────────────────

Union
  = "union(" _ head:Composite tail:(_ "," _ Composite)+ _ ")" {
      const operands = [head, ...tail.map((t: any) => t[3])];
      return { kind: 'union', operands };
    }

Intersection
  = "inter(" _ head:Composite tail:(_ "," _ Composite)+ _ ")" {
      const operands = [head, ...tail.map((t: any) => t[3])];
      return { kind: 'intersection', operands };
    }

Negation
  = "not(" _ expr:Composite _ ")" {
      return { kind: 'negation', operand: expr };
    }

// ─── Atomic queries ─────────────────────────────────────────────────

AtomicQuery
  = ModalAligned
  / ModalDirectional
  / Reachable
  / AlignedWith
  / NodeInfo
  / EdgesBetween
  / EdgesOf
  / AllNodes
  / AllGroups
  / GroupedTogether
  / Grouped
  / Contains

// modality.aligned.axis(nodeId)
ModalAligned
  = modality:Modality ".aligned." axis:Axis "(" nodeId:Identifier ")" {
      return { kind: 'aligned', modality, axis, nodeId };
    }

// modality.relation(nodeId)
ModalDirectional
  = modality:Modality "." relation:Direction "(" nodeId:Identifier ")" {
      return { kind: 'directional', modality, relation, nodeId };
    }

// reachable.relation(nodeId)
Reachable
  = "reachable." relation:Direction "(" nodeId:Identifier ")" {
      return { kind: 'reachable', relation, nodeId };
    }

// alignedWith.axis(nodeId)
AlignedWith
  = "alignedWith." axis:Axis "(" nodeId:Identifier ")" {
      return { kind: 'alignedWith', axis, nodeId };
    }

// node(nodeId)
NodeInfo
  = "node(" nodeId:Identifier ")" {
      return { kind: 'nodeInfo', nodeId };
    }

// edges(A, B)  — must come before EdgesOf so the 2-arg form matches first
EdgesBetween
  = "edges(" _ a:Identifier _ "," _ b:Identifier _ ")" {
      return { kind: 'edgesBetween', nodeIdA: a, nodeIdB: b };
    }

// edges(A)
EdgesOf
  = "edges(" _ nodeId:Identifier _ ")" {
      return { kind: 'edgesOf', nodeId };
    }

// nodes()
AllNodes
  = "nodes()" { return { kind: 'allNodes' }; }

// groups()
AllGroups
  = "groups()" { return { kind: 'allGroups' }; }

// grouped(A, B, ...)  — must come before single Grouped
GroupedTogether
  = "grouped(" _ head:Identifier tail:(_ "," _ Identifier)+ _ ")" {
      const nodeIds = [head, ...tail.map((t: any) => t[3])];
      return { kind: 'groupedTogether', nodeIds };
    }

// grouped(A)
Grouped
  = "grouped(" _ nodeId:Identifier _ ")" {
      return { kind: 'grouped', nodeId };
    }

// contains(groupName)
Contains
  = "contains(" _ name:Identifier _ ")" {
      return { kind: 'contains', groupName: name };
    }

// ─── Terminals ──────────────────────────────────────────────────────

Modality
  = "must" { return 'must'; }
  / "cannot" { return 'cannot'; }
  / "can" { return 'can'; }

Direction
  = "leftOf" { return 'leftOf'; }
  / "rightOf" { return 'rightOf'; }
  / "above" { return 'above'; }
  / "below" { return 'below'; }

Axis
  = "x" { return 'x'; }
  / "y" { return 'y'; }

Identifier
  = chars:$[a-zA-Z0-9_$]+ { return chars; }

_ "whitespace"
  = [ \t\n\r]*
