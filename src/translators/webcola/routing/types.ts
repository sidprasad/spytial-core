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
  portAttachment(edge: any, end: 'source' | 'target'): PortAttachment;
  /** Obstacle set for an edge: every node's inflated visible rect except the edge's own endpoints. */
  obstaclesFor(edge: any): ObstacleRect[];
  /** Full obstacle set: every node's inflated visible rect, with node ids. */
  obstacles(): Array<ObstacleRect & { id: string }>;
  /**
   * Fan parallel edges between the same node pair (curvature/offset post-step).
   * No-op for edges without parallel siblings. Obstacle-blind — routers must
   * validate the result against the obstacle set themselves.
   */
  fanParallel(edge: any, route: Point[], scale: number): Point[];
  /** All current layout links (routers filter what they touch). */
  links(): any[];
  /** Live map of computed routes by edge id; finalize passes may rewrite entries. */
  routes: Map<string, Point[]>;
  isAlignmentEdge(edge: any): boolean;
  hasGroupEndpoints(edge: any): boolean;
}

/**
 * A pluggable edge router for the standard pipeline. Routes one node-to-node
 * edge at a time; self-loops and group edges never reach it.
 */
export interface EdgeRouter {
  /**
   * Resolves when the router is ready to route (e.g. WASM init). Undefined
   * means the router is synchronous and always ready.
   */
  readonly ready?: Promise<void>;
  /**
   * Optional batch hook, called once at the start of each routing pass with
   * positions frozen. Routers whose quality comes from routing all edges
   * together (global nudging, crossing minimization) do the work here and
   * serve routeEdge from a cache.
   */
  beginPass?(host: RouterHost): void;
  /** Route one edge. Returns a polyline from source port to target port. */
  routeEdge(edge: any, host: RouterHost): Point[];
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
