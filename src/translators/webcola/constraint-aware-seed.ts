/**
 * Constraint-aware symmetric seeding for WebCola initial positions.
 *
 * PROTOTYPE for issue #427 (soft symmetry preference in layout).
 *
 * Computes initial node positions that (a) already satisfy the spec's
 * separation/alignment constraints and (b) spend the remaining degrees of
 * freedom on displayed symmetry — mirroring structurally identical sibling
 * subtrees around a vertical axis, centering parents over children.
 *
 * Why seeding (and not forces or extra constraints): force-directed descent
 * preserves symmetries present in the initial configuration (Eades & Lin,
 * "Spring algorithms and symmetry", TCS 2000), and WebCola's constraint
 * phases are projections that only move nodes whose constraints are
 * violated. A seed that satisfies the constraints therefore survives the
 * solve largely intact — while remaining purely soft: nothing here adds
 * links, constraints, or fixed flags, so user drag and user constraints
 * always win by construction.
 *
 * Mechanism per axis (x from LeftConstraints, y from TopConstraints,
 * alignments merge nodes into one class):
 *   1. Union-find alignment classes, build the DAG of separation
 *      constraints between classes, longest-path -> exact coordinates
 *      ("pinned" nodes). Cycles/contradictions -> bail (caller falls back
 *      to the DAGRE seed).
 *   2. Build a spanning forest over the data edges, canonically hash
 *      subtrees (AHU), and assign the free coordinates with a tidy-tree
 *      pass that orders isomorphic siblings palindromically (organ-pipe)
 *      so mirror pairs land symmetrically around their parent's axis.
 *   3. Rigidly translate each pinned constraint component to sit as close
 *      as possible to its tree position (mean offset), keeping constraint
 *      satisfaction exact while anchoring to the symmetric arrangement.
 */

import {
  InstanceLayout,
  LayoutNode,
  LayoutConstraint,
  isTopConstraint,
  isLeftConstraint,
  isAlignmentConstraint,
} from '../../layout/interfaces';

export interface SeedPosition {
  x: number;
  y: number;
}

/** Vertical distance between tree ranks in the seed. */
const SEED_RANK_STEP = 130;
/** Horizontal gap between adjacent sibling subtrees in the seed. */
const SEED_SIBLING_GAP = 40;
/** Two pinned coordinates closer than this are treated as equal. */
const PIN_EPSILON = 0.5;

/** Map-based union-find over node ids. */
class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    let root = this.parent.get(x) ?? x;
    while (root !== (this.parent.get(root) ?? root)) {
      root = this.parent.get(root) ?? root;
    }
    // Path compression
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur) ?? cur;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(ra, rb);
    }
  }
}

interface SeparationPair {
  /** Node id whose coordinate must be smaller. */
  before: string;
  /** Node id whose coordinate must be larger. */
  after: string;
  /** Minimum coordinate difference. */
  gap: number;
}

interface AxisSolution {
  /** Longest-path coordinate for every node touched by a constraint on this axis. */
  raw: Map<string, number>;
  /** Connected-component id (over the undirected constraint graph) per pinned node. */
  component: Map<string, number>;
}

/**
 * Solves one axis's separation + alignment constraints via longest path
 * over the constraint DAG. Returns null when the system is cyclic or
 * self-contradictory (aligned nodes also separated).
 */
function solveAxis(
  separations: SeparationPair[],
  alignments: Array<[string, string]>
): AxisSolution | null {
  const uf = new UnionFind();
  for (const [a, b] of alignments) {
    uf.union(a, b);
  }

  // Collect every node mentioned on this axis.
  const mentioned = new Set<string>();
  for (const s of separations) {
    mentioned.add(s.before);
    mentioned.add(s.after);
  }
  for (const [a, b] of alignments) {
    mentioned.add(a);
    mentioned.add(b);
  }
  if (mentioned.size === 0) {
    return { raw: new Map(), component: new Map() };
  }

  // Build the class-level digraph.
  const adjacency = new Map<string, Array<{ to: string; gap: number }>>();
  const indegree = new Map<string, number>();
  const classes = new Set<string>();
  for (const id of mentioned) {
    classes.add(uf.find(id));
  }
  for (const rep of classes) {
    adjacency.set(rep, []);
    indegree.set(rep, 0);
  }
  for (const s of separations) {
    const from = uf.find(s.before);
    const to = uf.find(s.after);
    if (from === to) {
      // Aligned nodes cannot also be separated — contradictory system.
      return null;
    }
    adjacency.get(from)!.push({ to, gap: s.gap });
    indegree.set(to, indegree.get(to)! + 1);
  }

  // Kahn's algorithm: topological order + cycle detection.
  const queue: string[] = [];
  for (const [rep, deg] of indegree) {
    if (deg === 0) queue.push(rep);
  }
  const coordinate = new Map<string, number>();
  for (const rep of classes) {
    coordinate.set(rep, 0);
  }
  let processed = 0;
  while (queue.length > 0) {
    const rep = queue.shift()!;
    processed++;
    const base = coordinate.get(rep)!;
    for (const { to, gap } of adjacency.get(rep)!) {
      coordinate.set(to, Math.max(coordinate.get(to)!, base + gap));
      const remaining = indegree.get(to)! - 1;
      indegree.set(to, remaining);
      if (remaining === 0) queue.push(to);
    }
  }
  if (processed < classes.size) {
    // Cycle — the solver's conflict handling deals with it; no seed here.
    return null;
  }

  // Undirected components: nodes linked by any constraint share a rigid frame.
  const componentUf = new UnionFind();
  for (const s of separations) {
    componentUf.union(s.before, s.after);
  }
  for (const [a, b] of alignments) {
    componentUf.union(a, b);
  }
  const componentIds = new Map<string, number>();
  let nextComponent = 0;
  const raw = new Map<string, number>();
  const component = new Map<string, number>();
  for (const id of mentioned) {
    raw.set(id, coordinate.get(uf.find(id))!);
    const compRep = componentUf.find(id);
    if (!componentIds.has(compRep)) {
      componentIds.set(compRep, nextComponent++);
    }
    component.set(id, componentIds.get(compRep)!);
  }
  return { raw, component };
}

/**
 * Mirrors computeHorizontalSeparation/computeVerticalSeparation in
 * webcolatranslator.ts: half-extents + minDistance + adaptive padding.
 * Exact agreement with the solver's (later scaled) gaps is not required —
 * near-satisfaction keeps the constraint projection phases near-no-ops.
 */
function separationGap(a: LayoutNode, b: LayoutNode, minDistance: number, axis: 'x' | 'y'): number {
  const extentA = (axis === 'x' ? a.width : a.height) ?? 100;
  const extentB = (axis === 'x' ? b.width : b.height) ?? 100;
  const base = extentA / 2 + extentB / 2 + minDistance;
  const adaptive = Math.min(Math.max(extentA, extentB) * 0.1, 20);
  return base + adaptive;
}

/** Organ-pipe arrangement: sorted input -> palindromic output, so equal
 *  elements land mirrored around the center (A,A,B,B -> A,B,B,A). */
function organPipe<T>(sorted: T[]): T[] {
  const left: T[] = [];
  const right: T[] = [];
  sorted.forEach((item, i) => (i % 2 === 0 ? left : right).push(item));
  right.reverse();
  return [...left, ...right];
}

interface TreeInfo {
  children: Map<string, string[]>;
  roots: string[];
  /** AHU canonical hash id of the subtree rooted at each node. */
  hash: Map<string, number>;
  /** Number of nodes in the subtree rooted at each node. */
  size: Map<string, number>;
  /** Horizontal extent of the subtree rooted at each node. */
  width: Map<string, number>;
}

/**
 * Builds a spanning forest over the data edges (BFS from in-degree-0 roots,
 * extra edges ignored) and computes AHU subtree hashes, sizes, and widths.
 */
function buildForest(nodes: LayoutNode[], edgePairs: Array<[string, string]>): TreeInfo {
  const nodeIds = nodes.map(n => n.id);
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of nodeIds) {
    adjacency.set(id, []);
    indegree.set(id, 0);
  }
  const seenEdges = new Set<string>();
  for (const [source, target] of edgePairs) {
    if (source === target) continue;
    if (!adjacency.has(source) || !adjacency.has(target)) continue;
    const key = `${source} ${target}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    adjacency.get(source)!.push(target);
    indegree.set(target, indegree.get(target)! + 1);
  }

  // Roots: in-degree-0 nodes first; any nodes left unvisited (cycles) get
  // their own BFS from the first unvisited node in input order.
  const children = new Map<string, string[]>();
  for (const id of nodeIds) {
    children.set(id, []);
  }
  const visited = new Set<string>();
  const roots: string[] = [];
  const bfs = (root: string) => {
    visited.add(root);
    roots.push(root);
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current)!) {
        if (visited.has(next)) continue;
        visited.add(next);
        children.get(current)!.push(next);
        queue.push(next);
      }
    }
  };
  for (const id of nodeIds) {
    if ((indegree.get(id) ?? 0) === 0 && !visited.has(id)) {
      bfs(id);
    }
  }
  for (const id of nodeIds) {
    if (!visited.has(id)) {
      bfs(id);
    }
  }

  // Iterative post-order for AHU hashes, subtree sizes, and widths.
  const hash = new Map<string, number>();
  const size = new Map<string, number>();
  const width = new Map<string, number>();
  const internTable = new Map<string, number>();
  const intern = (key: string): number => {
    let id = internTable.get(key);
    if (id === undefined) {
      id = internTable.size;
      internTable.set(key, id);
    }
    return id;
  };
  for (const root of roots) {
    const stack: Array<{ id: string; childIndex: number }> = [{ id: root, childIndex: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const kids = children.get(frame.id)!;
      if (frame.childIndex < kids.length) {
        stack.push({ id: kids[frame.childIndex], childIndex: 0 });
        frame.childIndex++;
        continue;
      }
      stack.pop();
      const childHashes = kids.map(k => hash.get(k)!).sort((a, b) => a - b);
      const type = nodeById.get(frame.id)?.mostSpecificType ?? '';
      hash.set(frame.id, intern(`${type}(${childHashes.join(',')})`));
      size.set(frame.id, kids.reduce((acc, k) => acc + size.get(k)!, 1));
      const ownWidth = nodeById.get(frame.id)?.width ?? 100;
      const kidsWidth =
        kids.reduce((acc, k) => acc + width.get(k)!, 0) +
        SEED_SIBLING_GAP * Math.max(0, kids.length - 1);
      width.set(frame.id, Math.max(ownWidth, kidsWidth));
    }
  }
  return { children, roots, hash, size, width };
}

/**
 * Computes a constraint-satisfying, symmetry-biased seed position for every
 * node, or null when the constraint system is cyclic/contradictory (caller
 * falls back to the DAGRE seed).
 */
export function computeConstraintAwareSeed(
  instanceLayout: InstanceLayout,
  figWidth: number,
  figHeight: number
): Map<string, SeedPosition> | null {
  const nodes = instanceLayout.nodes;
  if (nodes.length === 0) {
    return null;
  }
  // ── 1. Solve each axis's constraint system exactly ──────────────────
  const xSeparations: SeparationPair[] = [];
  const ySeparations: SeparationPair[] = [];
  const xAlignments: Array<[string, string]> = [];
  const yAlignments: Array<[string, string]> = [];
  for (const constraint of instanceLayout.constraints as LayoutConstraint[]) {
    if (isLeftConstraint(constraint)) {
      xSeparations.push({
        before: constraint.left.id,
        after: constraint.right.id,
        gap: separationGap(constraint.left, constraint.right, constraint.minDistance, 'x'),
      });
    } else if (isTopConstraint(constraint)) {
      ySeparations.push({
        before: constraint.top.id,
        after: constraint.bottom.id,
        gap: separationGap(constraint.top, constraint.bottom, constraint.minDistance, 'y'),
      });
    } else if (isAlignmentConstraint(constraint)) {
      // Cola semantics: separation with equality on `axis`, i.e. the nodes
      // share that coordinate.
      if (constraint.axis === 'x') {
        xAlignments.push([constraint.node1.id, constraint.node2.id]);
      } else {
        yAlignments.push([constraint.node1.id, constraint.node2.id]);
      }
    }
    // Bounding-box / group-boundary constraints are ignored here, matching
    // toColaConstraint which maps them to noops.
  }

  const xAxis = solveAxis(xSeparations, xAlignments);
  const yAxis = solveAxis(ySeparations, yAlignments);
  if (xAxis === null || yAxis === null) {
    return null;
  }

  // ── 2. Tidy-tree pass over the data edges for the free coordinates ──
  const edgePairs: Array<[string, string]> = instanceLayout.edges.map(e => [
    e.source.id,
    e.target.id,
  ]);
  const forest = buildForest(nodes, edgePairs);

  const treeX = new Map<string, number>();
  const treeY = new Map<string, number>();

  // Sibling order: x-pinned children keep their constrained relative order;
  // free children are organ-piped so isomorphic subtrees mirror.
  const orderChildren = (kids: string[]): string[] => {
    const pinned = kids.filter(k => xAxis.raw.has(k));
    const free = kids.filter(k => !xAxis.raw.has(k));
    pinned.sort((a, b) => xAxis.raw.get(a)! - xAxis.raw.get(b)!);
    free.sort((a, b) => {
      const byHash = forest.hash.get(a)! - forest.hash.get(b)!;
      if (byHash !== 0) return byHash;
      const bySize = forest.size.get(b)! - forest.size.get(a)!;
      if (bySize !== 0) return bySize;
      return a < b ? -1 : 1;
    });
    return [...pinned, ...organPipe(free)];
  };

  // A parent→child pair whose x offset is already dictated by constraints
  // (e.g. a left-to-right list) should not also advance a tree rank — the
  // edge is "explained" horizontally, so the child stays on the parent's row.
  // Raw coordinates are only comparable within one constraint component
  // (each component has its own zero origin), so nodes pinned by unrelated
  // constraints never count as explained.
  const xExplained = (parent: string, child: string): boolean => {
    const px = xAxis.raw.get(parent);
    const cx = xAxis.raw.get(child);
    return (
      px !== undefined &&
      cx !== undefined &&
      xAxis.component.get(parent) === xAxis.component.get(child) &&
      Math.abs(px - cx) > PIN_EPSILON
    );
  };

  let cursorX = 0;
  for (const root of forest.roots) {
    const rootWidth = forest.width.get(root)!;
    const rootCenter = cursorX + rootWidth / 2;
    cursorX += rootWidth + SEED_SIBLING_GAP * 2;
    const stack: Array<{ id: string; centerX: number; y: number }> = [
      { id: root, centerX: rootCenter, y: 0 },
    ];
    while (stack.length > 0) {
      const { id, centerX, y } = stack.pop()!;
      treeX.set(id, centerX);
      treeY.set(id, y);
      const kids = orderChildren(forest.children.get(id)!);
      if (kids.length === 0) continue;
      const total =
        kids.reduce((acc, k) => acc + forest.width.get(k)!, 0) +
        SEED_SIBLING_GAP * Math.max(0, kids.length - 1);
      let childCursor = centerX - total / 2;
      for (const kid of kids) {
        const kidWidth = forest.width.get(kid)!;
        stack.push({
          id: kid,
          centerX: childCursor + kidWidth / 2,
          y: y + (xExplained(id, kid) ? 0 : SEED_RANK_STEP),
        });
        childCursor += kidWidth + SEED_SIBLING_GAP;
      }
    }
  }

  // ── 3. Anchor pinned constraint components to the tree positions ────
  // Each component's longest-path frame is rigid; translate it by the mean
  // offset to its members' tree positions. Constraint satisfaction within
  // the component stays exact.
  const anchorAxis = (
    axis: AxisSolution,
    tree: Map<string, number>
  ): Map<string, number> => {
    const sums = new Map<number, { delta: number; count: number }>();
    for (const [id, rawCoord] of axis.raw) {
      const comp = axis.component.get(id)!;
      const entry = sums.get(comp) ?? { delta: 0, count: 0 };
      entry.delta += (tree.get(id) ?? 0) - rawCoord;
      entry.count += 1;
      sums.set(comp, entry);
    }
    const final = new Map<string, number>();
    for (const [id, rawCoord] of axis.raw) {
      const { delta, count } = sums.get(axis.component.get(id)!)!;
      final.set(id, rawCoord + delta / count);
    }
    return final;
  };
  const pinnedX = anchorAxis(xAxis, treeX);
  const pinnedY = anchorAxis(yAxis, treeY);

  // ── 4. Assemble and recenter on the figure ──────────────────────────
  const seed = new Map<string, SeedPosition>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const x = pinnedX.get(node.id) ?? treeX.get(node.id) ?? 0;
    const y = pinnedY.get(node.id) ?? treeY.get(node.id) ?? 0;
    seed.set(node.id, { x, y });
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const offsetX = figWidth / 2 - (minX + maxX) / 2;
  const offsetY = figHeight / 2 - (minY + maxY) / 2;
  for (const position of seed.values()) {
    position.x += offsetX;
    position.y += offsetY;
  }
  return seed;
}

/**
 * True when the layout has at least one constraint the seeder understands —
 * the gate for using the constraint-aware seed instead of DAGRE.
 */
export function hasSeedableConstraints(instanceLayout: InstanceLayout): boolean {
  return (instanceLayout.constraints as LayoutConstraint[]).some(
    c => isLeftConstraint(c) || isTopConstraint(c) || isAlignmentConstraint(c)
  );
}
