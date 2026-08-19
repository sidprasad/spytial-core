/**
 * Shared types for the pluggable edge-routing layer.
 *
 * The component (webcola-cnd-graph) owns everything that encodes Spytial
 * semantics — port distribution, group boundary snapping, self-loop petals,
 * parallel-edge fanning. A router only answers "how do I get from A to B
 * around these boxes". That split is what lets a router be swapped without
 * changing how diagrams mean what they mean.
 */

export interface Point {
  x: number;
  y: number;
}

/** One side of an axis-aligned rectangle. */
export type RectSide = 'top' | 'bottom' | 'left' | 'right';

/** Axis-aligned obstacle rectangle, already inflated by the router clearance. */
export interface ObstacleRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rectangle in {x, y, width(), height()} form (the component's bounds shape). */
export interface BoundsRect {
  x: number;
  y: number;
  width: () => number;
  height: () => number;
}

/**
 * A rectangle in WebCola's `Rectangle` shape: corner fields AND the accessor
 * methods. Both forms circulate through the renderer — WebCola hands back
 * `Rectangle` instances, while the visible-rectangle helpers build plain
 * objects — so one type covers both and satisfies {@link BoundsRect} too.
 */
export interface VisibleRect extends BoundsRect {
  cx: () => number;
  cy: () => number;
  /** Right edge (WebCola's name for it). */
  X: number;
  /** Bottom edge (WebCola's name for it). */
  Y: number;
}

/**
 * The parts of a node or group that rectangle derivation reads. Plain nodes
 * carry visualWidth/visualHeight; group containers carry leaves/groups and a
 * bounds rectangle. Everything is optional because both shapes flow through
 * the same helpers, and because bounds only exist after the first tick.
 */
export interface RoutableNode {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Rendered width, before WebCola's collision padding. */
  visualWidth?: number;
  /** Rendered height, before WebCola's collision padding. */
  visualHeight?: number;
  bounds?: Partial<VisibleRect>;
  /** {@link bounds} inflated by -1 — WebCola's inner rectangle. */
  innerBounds?: VisibleRect;
  leaves?: unknown[];
  groups?: unknown[];
}

/**
 * The side and port slot the component stamps on an edge before a routing
 * pass. Absent outside a pass (grid pipeline, direct unit-test calls), in which
 * case endpoints fall back to the centre-to-centre direction.
 */
export interface PortStamps {
  _exitSide?: RectSide;
  _entrySide?: RectSide;
  _sourcePortIndex?: number;
  _sourcePortCount?: number;
  _targetPortIndex?: number;
  _targetPortCount?: number;
}

/**
 * An edge endpoint inside a routing pass. The id is required here, unlike on
 * {@link RoutableNode} generally: routers only ever see node-to-node edges —
 * self-loops and group-attached edges are routed by the component — and every
 * plain node is keyed by id in the obstacle set.
 */
export type RoutedEndpoint = RoutableNode & { id: string };

/**
 * An edge as the routing layer sees it: an id, two endpoints, and whatever
 * port stamps this pass has put on it. The renderer's own edge type carries a
 * great deal more (labels, colours, group provenance) — none of it reaches a
 * router, and a router must not depend on it.
 */
export interface RoutedEdge extends PortStamps {
  id: string;
  source: RoutedEndpoint;
  target: RoutedEndpoint;
}

/**
 * An edge endpoint on a node's visible perimeter: the attachment point plus
 * the outward unit normal of the side it lands on (used to force perpendicular
 * exits and orient arrowheads).
 */
export interface PortAttachment {
  point: Point;
  normal: Point;
}

/**
 * Callbacks the component provides to routers. Everything Spytial-specific
 * stays behind this interface so routers stay interchangeable.
 */
export interface RouterHost {
  /** Port-distributed endpoint for one end of an edge. */
  portAttachment(edge: RoutedEdge, end: 'source' | 'target'): PortAttachment;
  /** Obstacle set for an edge: every node's inflated visible rect except the edge's own endpoints. */
  obstaclesFor(edge: RoutedEdge): ObstacleRect[];
  /** Full obstacle set: every node's inflated visible rect, with node ids. */
  obstacles(): Array<ObstacleRect & { id: string }>;
  /**
   * Fan parallel edges between the same node pair (curvature/offset post-step).
   * No-op for edges without parallel siblings. Obstacle-blind — routers must
   * validate the result against the obstacle set themselves.
   */
  fanParallel(edge: RoutedEdge, route: Point[], scale: number): Point[];
  /**
   * The edges the router owns: every current link except the special cases
   * the component routes itself (alignment edges, self-loops, group-attached
   * edges). Exactly these edges reach routeEdge during a pass.
   */
  routerEdges(): RoutedEdge[];
  /** Live map of computed routes by edge id; finalize passes may rewrite entries. */
  routes: Map<string, Point[]>;
}

/**
 * A pluggable edge router for the standard pipeline. Routes one node-to-node
 * edge at a time; self-loops and group edges never reach it.
 *
 * Routers must be ready to route synchronously from the moment their mode is
 * registered — the routing pass never awaits. Routers with asynchronous setup
 * (e.g. WASM init) must finish it BEFORE calling registerRoutingMode, the way
 * the libavoid entry does.
 */
export interface EdgeRouter {
  /**
   * Optional batch hook, called once at the start of each routing pass with
   * positions frozen. Routers whose quality comes from routing all edges
   * together (global nudging, crossing minimization) do the work here and
   * serve routeEdge from a cache.
   */
  beginPass?(host: RouterHost): void;
  /** Route one edge. Returns a polyline from source port to target port. */
  routeEdge(edge: RoutedEdge, host: RouterHost): Point[];
  /** Optional post-pass over all routes (e.g. corridor separation). */
  finalize?(host: RouterHost): void;
}

/**
 * Which orchestration drives a routing mode:
 * - 'standard': the shared pipeline (routeEdges) using an EdgeRouter.
 * - 'grid': the bespoke orthogonal pipeline (WebCola GridRouter / gridify).
 */
export type RoutingPipeline = 'standard' | 'grid';

/** One entry in the routing-mode registry (one option in the Routing dropdown). */
export interface RoutingModeDefinition {
  /** The layoutFormat attribute value that selects this mode. */
  id: string;
  /** Text shown in the Routing dropdown. */
  label: string;
  pipeline: RoutingPipeline;
  /** Router factory for 'standard' modes. Unused for 'grid'. */
  createRouter?: () => EdgeRouter;
}
