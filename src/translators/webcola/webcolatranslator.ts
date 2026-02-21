import { Node, Group, Link, Rectangle } from 'webcola';
import { InstanceLayout, LayoutNode, LayoutEdge, LayoutConstraint, LayoutGroup, LeftConstraint, TopConstraint, AlignmentConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint, isBoundingBoxConstraint, isGroupBoundaryConstraint } from '../../layout/interfaces';
import { EdgeStyle } from '../../layout/edge-style';
import { LayoutInstance } from '../../layout/layoutinstance';
import * as dagre from 'dagre';
import type { TemporalPolicyName } from './temporal-policy';

/**
 * WebColaTranslator - Translates InstanceLayout to WebCola format
 * 
 * WebCola is a constraint-based layout library that allows for precise 
 * positioning of nodes using separation and alignment constraints.
 */




/**
 * WebColaTranslator - Translates InstanceLayout to WebCola format
 * 
 * WebCola is a constraint-based layout library that allows for precise 
 * positioning of nodes using separation and alignment constraints.
 */

type NodeWithMetadata = Node & {

  label: string, // This is the label that will be displayed on the node
  id: string,
  attributes: Record<string, string[]>,
  /**
   * Labels from the data instance (e.g., Skolems in Alloy).
   * These are displayed prominently on nodes, styled in the node's color.
   */
  labels?: Record<string, string[]>,
  color: string,
  icon: string,
  mostSpecificType: string,
  showLabels: boolean,
};

type EdgeWithMetadata = Link<NodeWithMetadata> & {
  source: number,
  target: number,
  relName: string, // This is the name of the relation for the edge
  id: string, // Unique identifier for the edge
  label: string, // This is what is displayed on the edge
  color: string,
  style?: EdgeStyle,
  weight?: number,
  showLabel?: boolean, // Whether to show the edge label (default: true)
  bidirectional?: boolean // Flag to indicate if this edge represents a bidirectional relationship
};

// Export the types for use in other modules
export type { NodeWithMetadata, EdgeWithMetadata };

/**
 * Position hint for a node, used to initialize node positions for temporal consistency.
 * When rendering temporal sequences, nodes should start at their previous positions
 * to maintain visual stability across frames.
 * 
 * WebCola uses these positions as initial values when starting the layout algorithm.
 * The positions are respected during the constraint-solving phase, with reduced
 * unconstrained iterations to better preserve them.
 */
export interface NodePositionHint {
  /** Node identifier - matched by id */
  id: string;
  /** X coordinate from previous render */
  x: number;
  /** Y coordinate from previous render */
  y: number;
}

/**
 * Transform information representing zoom/pan state.
 * Used to normalize positions when the viewbox/zoom has changed between renders.
 */
export interface TransformInfo {
  /** Scale factor (zoom level) */
  k: number;
  /** X translation (pan offset) */
  x: number;
  /** Y translation (pan offset) */
  y: number;
}

/**
 * Complete layout state snapshot that can be captured and restored.
 * This bundles node positions with the zoom/pan transform for easy state management.
 * 
 * Use `graph.getLayoutState()` to capture and pass to `renderLayout({ priorState: ... })`
 * 
 * @example
 * ```typescript
 * // Capture current state before navigating
 * const state = graph.getLayoutState();
 * 
 * // Later, restore it when rendering
 * await graph.renderLayout(newLayout, { priorState: state });
 * ```
 */
export interface LayoutState {
  /** Node positions from the layout */
  positions: NodePositionHint[];
  /** Zoom/pan transform at time of capture */
  transform: TransformInfo;
}

/**
 * Options for WebColaLayout configuration.
 * Allows customization of layout behavior, especially for temporal sequences.
 */
export interface WebColaLayoutOptions {
  /**
   * Layout state from a previous render.
   * 
   * Preserves visual continuity between renders by restoring node positions
   * and zoom/pan state. Use `graph.getLayoutState()` to capture this before
   * navigating away, then pass it back when rendering the next layout.
   * 
   * @example
   * ```typescript
   * const state = graph.getLayoutState();
   * await graph.renderLayout(newLayout, { priorState: state });
   * ```
  */
  priorState?: LayoutState;
  /**
   * Temporal realization policy used to derive node initialization hints.
   * This preserves Spytial semantics and only changes solver initialization.
   * Preferred values:
   * - `ignore_history` (default; Dagre/default seeds only)
   * - `stability` (reuse prior raw positions)
   * - `change_emphasis` (continuity for stable nodes, random reflow for changed)
   *
   * Backward-compatible aliases are accepted:
   * - `seed_default` -> `ignore_history`
   * - `seed_continuity_raw` -> `stability`
   * - `seed_continuity_transport` -> `stability`
   * - `baseline` -> `stability`
   * - `transport_pan_zoom` -> `stability`
   * - `seed_change_emphasis` -> `change_emphasis`
   */
  temporalPolicy?: TemporalPolicyName;
  /**
   * Optional changed node IDs used by `change_emphasis` policy.
   * If omitted, changed nodes are approximated as IDs absent from prior positions.
   */
  changedNodeIds?: string[];
}

// WebCola constraint types
export interface ColaConstraint {
  type: string;
  [key: string]: unknown;
}

export interface ColaSeparationConstraint extends ColaConstraint {
  type: 'separation';
  axis: 'x' | 'y';
  left: number;
  right: number;
  gap: number;
  equality?: boolean;
}

export interface ColaHierarchyConstraint extends ColaConstraint {
  type: 'hierarchy';
  parent: number;
  child: number;
  gap: number;
}

// // WebCola group definition
// interface ColaGroupDefinition extends Group {
//   leaves?: NodeWithMetadata[];
//   groups?: ColaGroupDefinition[];
//   padding: number;
//   name: string;
//   keyNode?: number;
//   id?: string;
//   showLabel?: boolean;
// }


export class WebColaLayout {

  private instanceLayout: InstanceLayout;
  readonly colaConstraints: ColaConstraint[];
  readonly colaNodes: NodeWithMetadata[];
  readonly colaEdges: EdgeWithMetadata[];
  readonly groupDefinitions: any;
  readonly conflictingConstraints: LayoutConstraint[];
  readonly overlappingNodesData: LayoutNode[];

  private readonly DEFAULT_X: number;
  private readonly DEFAULT_Y: number;

  private dagre_graph: any;

  public FIG_WIDTH: number;
  public FIG_HEIGHT: number;

  /**
   * Map of node id to prior position hint.
   * Used to initialize nodes at their previous positions for temporal consistency.
   */
  private priorPositionMap: Map<string, NodePositionHint>;

  constructor(instanceLayout: InstanceLayout, fig_height: number = 800, fig_width: number = 800, options?: WebColaLayoutOptions) {

    this.FIG_HEIGHT = fig_height;
    this.FIG_WIDTH = fig_width;

    this.DEFAULT_X = fig_width / 2;
    this.DEFAULT_Y = fig_height / 2;

    this.instanceLayout = instanceLayout;

    // Build a map of prior positions for O(1) lookup
    this.priorPositionMap = new Map();
    
    if (options?.priorState?.positions) {
      for (const hint of options.priorState.positions) {
        this.priorPositionMap.set(hint.id, hint);
      }
      if (typeof console !== 'undefined' && console.log) {
        console.log(`WebColaLayout: Using ${this.priorPositionMap.size} prior positions for temporal consistency`);
      }
    }

    // Can I create a DAGRE graph here.
    try {
      const g = new dagre.graphlib.Graph({ multigraph: true });
      g.setGraph({ nodesep: 50, ranksep: 100, rankdir: 'TB' });
      g.setDefaultEdgeLabel(() => ({}));

      instanceLayout.nodes.forEach(node => {
        g.setNode(node.id, { width: node.width, height: node.height });
      });

      instanceLayout.edges.forEach(edge => {
        g.setEdge(edge.source.id, edge.target.id);
      });
      dagre.layout(g);

      this.dagre_graph = g;
    }
    catch (e) {
      console.log(e);
      this.dagre_graph = null;
    }



    this.colaNodes = instanceLayout.nodes.map(node => this.toColaNode(node));
    this.colaEdges = instanceLayout.edges.map(edge => this.toColaEdge(edge));

    // Collapse symmetric edges with the same label
    this.colaEdges = this.collapseSymmetricEdges(this.colaEdges);

    // Collapse identical nested groups to reduce jitter and constraint conflicts
    const deduplicatedGroups = this.collapseIdenticalGroups(instanceLayout.groups);
    this.groupDefinitions = this.determineGroups(deduplicatedGroups);

    this.conflictingConstraints = instanceLayout.conflictingConstraints || [];
    this.overlappingNodesData = instanceLayout.overlappingNodes || [];
    this.colaConstraints = instanceLayout.constraints.map(constraint => this.toColaConstraint(constraint));

    // Log constraint count for debugging and monitoring
    const originalConstraintCount = this.colaConstraints.length;
    if (typeof console !== 'undefined' && console.log) {
      console.log(`WebColaTranslator: Generated ${originalConstraintCount} constraints for ${this.colaNodes.length} nodes`);
    }

    // Apply transitive reduction optimization if we have many constraints
    // Threshold: optimize when we have more than 100 constraints
    const OPTIMIZATION_THRESHOLD = 100;
    if (originalConstraintCount > OPTIMIZATION_THRESHOLD) {
      if (typeof console !== 'undefined' && console.log) {
        console.log(`WebColaTranslator: Constraint count exceeds threshold (${OPTIMIZATION_THRESHOLD}), applying transitive reduction optimization...`);
      }
      this.colaConstraints = this.optimizeConstraints(this.colaConstraints);
      const optimizedCount = this.colaConstraints.length;
      const reductionPercent = ((originalConstraintCount - optimizedCount) / originalConstraintCount * 100).toFixed(1);
      if (typeof console !== 'undefined' && console.log) {
        console.log(`WebColaTranslator: Reduced constraints from ${originalConstraintCount} to ${optimizedCount} (${reductionPercent}% reduction)`);
      }
    }

    if (this.colaConstraints.length === 0 && this.dagre_graph) {
      this.colaNodes.forEach(node => node.fixed = 1);
    }


  }

  /**
   * Optimizes constraints by applying transitive reduction to remove redundant constraints.
   * 
   * Graph Theory Approach:
   * - Separation constraints (left/right, up/down) form directed acyclic graphs (DAGs)
   * - Transitive reduction removes edges (constraints) that are implied by other paths
   * - Example: If A left-of B, B left-of C, and A left-of C, then A left-of C is redundant
   * 
   * This optimization is crucial for large graphs where constraint counts can explode:
   * - Reduces solver complexity from O(n³) to closer to O(n²) or O(n log n)
   * - Prevents WebCola performance degradation with many constraints
   * - Maintains layout correctness since redundant constraints don't add information
   * 
   * @param constraints Array of WebCola constraints to optimize
   * @returns Optimized array with redundant constraints removed
   */
  private optimizeConstraints(constraints: ColaConstraint[]): ColaConstraint[] {
    // Separate constraints by type for independent optimization
    const xSeparationConstraints: ColaSeparationConstraint[] = [];
    const ySeparationConstraints: ColaSeparationConstraint[] = [];
    const otherConstraints: ColaConstraint[] = [];

    for (const constraint of constraints) {
      if (constraint.type === 'separation') {
        const sepConstraint = constraint as ColaSeparationConstraint;
        if (sepConstraint.axis === 'x' && !sepConstraint.equality) {
          xSeparationConstraints.push(sepConstraint);
        } else if (sepConstraint.axis === 'y' && !sepConstraint.equality) {
          ySeparationConstraints.push(sepConstraint);
        } else {
          // Alignment constraints (equality: true) should not be reduced
          otherConstraints.push(constraint);
        }
      } else {
        otherConstraints.push(constraint);
      }
    }

    // Apply transitive reduction to each axis independently
    const optimizedX = this.transitiveReductionForSeparation(xSeparationConstraints);
    const optimizedY = this.transitiveReductionForSeparation(ySeparationConstraints);

    // Combine optimized constraints
    return [...optimizedX, ...optimizedY, ...otherConstraints];
  }

  /**
   * Performs transitive reduction on separation constraints using Floyd-Warshall-inspired approach.
   * 
   * Algorithm:
   * 1. Build a reachability matrix using the direct constraints
   * 2. Compute transitive closure (all implied relationships)
   * 3. Keep only constraints that are not implied by other paths
   * 
   * Time Complexity: O(n³) where n is the number of nodes
   * Space Complexity: O(n²) for the reachability matrix
   * 
   * This is acceptable because:
   * - Only runs when constraint count is high (threshold-based)
   * - The cost is amortized across the entire layout process
   * - The reduction in constraints saves much more time in WebCola solver
   * 
   * @param constraints Array of separation constraints to optimize
   * @returns Optimized array with redundant constraints removed
   */
  private transitiveReductionForSeparation(constraints: ColaSeparationConstraint[]): ColaSeparationConstraint[] {
    if (constraints.length === 0) {
      return constraints;
    }

    const n = this.colaNodes.length;
    
    // Build adjacency matrix for direct constraints
    // direct[i][j] stores the constraint if there's a direct edge from i to j
    const direct: (ColaSeparationConstraint | null)[][] = Array(n).fill(null).map(() => Array(n).fill(null));
    
    for (const constraint of constraints) {
      // Validate indices to prevent prototype pollution
      // The indices come from constraint objects but we validate they are:
      // 1. Actually numbers (not strings like '__proto__')
      // 2. Integers (not floating point)
      // 3. Within valid array bounds
      // This prevents any prototype pollution attacks
      const left = constraint.left;
      const right = constraint.right;
      
      // Ensure indices are valid numbers within bounds
      if (typeof left === 'number' && typeof right === 'number' && 
          left >= 0 && left < n && right >= 0 && right < n &&
          Number.isInteger(left) && Number.isInteger(right)) {
        direct[left][right] = constraint;
      }
    }

    // Compute transitive closure using Floyd-Warshall
    // reachable[i][j] is true if j is reachable from i through any path
    const reachable: boolean[][] = Array(n).fill(false).map(() => Array(n).fill(false));
    
    // Initialize: direct edges are reachable
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        reachable[i][j] = direct[i][j] !== null;
      }
    }

    // Floyd-Warshall: if i->k and k->j, then i->j is reachable
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (reachable[i][k] && reachable[k][j]) {
            reachable[i][j] = true;
          }
        }
      }
    }

    // Keep only constraints that are not redundant
    // A constraint i->j is redundant if there exists an intermediate node k
    // such that i->k and k->j both exist (or are reachable)
    const nonRedundant: ColaSeparationConstraint[] = [];
    
    for (const constraint of constraints) {
      const i = constraint.left;
      const j = constraint.right;
      let isRedundant = false;

      // Check if there's an alternative path from i to j through any intermediate node k
      for (let k = 0; k < n; k++) {
        if (k !== i && k !== j) {
          // If both i->k and k->j exist as direct constraints, then i->j is redundant
          if (direct[i][k] !== null && direct[k][j] !== null) {
            isRedundant = true;
            break;
          }
        }
      }

      if (!isRedundant) {
        nonRedundant.push(constraint);
      }
    }

    return nonRedundant;
  }

  private getNodeIndex(nodeId: string) {
    return this.colaNodes.findIndex(node => node.id === nodeId);
  }

  /**
   * Computes adaptive horizontal separation between two nodes using their actual dimensions
   */
  private computeHorizontalSeparation(node1: NodeWithMetadata, node2: NodeWithMetadata, minDistance: number): number {
    // Use actual node widths
    const node1Width = node1.width || 100;
    const node2Width = node2.width || 100;
    
    // Base separation: half-widths + minimum distance
    const baseSeparation = (node1Width / 2) + (node2Width / 2) + minDistance;
    
    // Add adaptive padding based on larger nodes (they likely have more content)
    const maxWidth = Math.max(node1Width, node2Width);
    const adaptivePadding = Math.min(maxWidth * 0.1, 20); // up to 20px extra for large nodes
    
    return baseSeparation + adaptivePadding;
  }

  /**
   * Computes adaptive vertical separation between two nodes using their actual dimensions
   */
  private computeVerticalSeparation(node1: NodeWithMetadata, node2: NodeWithMetadata, minDistance: number): number {
    // Use actual node heights
    const node1Height = node1.height || 60;
    const node2Height = node2.height || 60;
    
    // Base separation: half-heights + minimum distance
    const baseSeparation = (node1Height / 2) + (node2Height / 2) + minDistance;
    
    // Add adaptive padding based on larger nodes (they likely have more content)
    const maxHeight = Math.max(node1Height, node2Height);
    const adaptivePadding = Math.min(maxHeight * 0.1, 15); // up to 15px extra for tall nodes
    
    return baseSeparation + adaptivePadding;
  }



  private leftConstraint(leftNode: number, rightNode: number, sep: number) {
    // Define a separation constraint to place node A to the left of node B




    const separationConstraint = {
      type: "separation",
      axis: 'x',
      left: leftNode,
      right: rightNode,
      gap: sep,
    };
    return separationConstraint;
  }


  private topConstraint(topNode: number, bottomNode: number, sep: number) {
    // Define a separation constraint to place node A above node B
    const separationConstraint = {
      type: "separation",
      axis: 'y',
      left: topNode,
      right: bottomNode,
      gap: sep,
    };
    return separationConstraint;
  }

  private heirarchyConstraint(parentNodeIndex: number, childNodeIndex: number, sep: number) {

    const heirarchyConstraint = {
      type: 'hierarchy',
      parent: parentNodeIndex,
      child: childNodeIndex,
      gap: sep,
    };
    return heirarchyConstraint;
  }




  /**
   * Converts a LayoutNode to a NodeWithMetadata for WebCola.
   * 
   * Position initialization priority:
   * 1. Prior positions (if available via WebColaLayoutOptions.priorPositions)
   * 2. DAGRE-computed positions (if DAGRE graph is available)
   * 3. Default center position (DEFAULT_X, DEFAULT_Y)
   * 
   * Note: When using prior positions, we don't set fixed=1 because we want
   * the layout to still optimize positions while using prior positions as
   * initial values. This allows the layout engine to make adjustments as needed
   * while starting from a known good position.
   * 
   * @param node - The LayoutNode to convert
   * @returns NodeWithMetadata for WebCola
   */
  private toColaNode(node: LayoutNode): NodeWithMetadata {

    let x = this.DEFAULT_X;
    let y = this.DEFAULT_Y;

    let fixed = 0;

    // Priority 1: Use prior position if available (for temporal consistency)
    const priorPosition = this.priorPositionMap.get(node.id);
    if (priorPosition) {
      x = priorPosition.x;
      y = priorPosition.y;
      //console.log(`Node ${node.id}: Using prior position (${x.toFixed(2)}, ${y.toFixed(2)})`);
    } else if (this.priorPositionMap.size > 0) {
      // We have prior positions but this node wasn't found - log for debugging
      console.log(`Node ${node.id}: No prior position found (available: ${Array.from(this.priorPositionMap.keys()).join(', ')})`);
      if (this.dagre_graph) {
        const dagre_node = this.dagre_graph.node(node.id);
        if (dagre_node) {
          x = dagre_node.x;
          y = dagre_node.y;
        }
      }
    } else if (this.dagre_graph) {
      // Priority 2: Use DAGRE-computed position for new nodes
      const dagre_node = this.dagre_graph.node(node.id);
      if (dagre_node) {
        x = dagre_node.x;
        y = dagre_node.y;
      }
    }


    return {
      id: node.id,
      color: node.color,
      attributes: node.attributes || {},
      labels: node.labels,
      width: node.width,
      height: node.height,
      x: x,
      y: y,
      icon: node.icon || '',
      fixed: fixed,
      mostSpecificType: node.mostSpecificType,
      showLabels: node.showLabels,
      label : node.label
    }
  }

  private toColaEdge(edge: LayoutEdge): EdgeWithMetadata {

    let sourceIndex = this.getNodeIndex(edge.source.id);
    let targetIndex = this.getNodeIndex(edge.target.id);



    return {
      source: sourceIndex,
      target: targetIndex,
      relName: edge.relationName,
      id: edge.id,
      label: edge.label,
      color: edge.color,
      style: edge.style,
      weight: edge.weight,
      showLabel: edge.showLabel,
    }
  }

  /**
   * Collapses symmetric edges with the same label into bidirectional edges.
   * If two nodes have edges between them with the same label (A->B and B->A),
   * they should be collapsed into a single bidirectional edge.
   * Edges with different labels should NOT be collapsed.
   * 
   * @param edges - Array of edges to process
   * @returns Array of edges with symmetric edges collapsed
   */
  private collapseSymmetricEdges(edges: EdgeWithMetadata[]): EdgeWithMetadata[] {
    const edgeMap = new Map<string, EdgeWithMetadata>();
    const processed = new Set<string>();

    for (const edge of edges) {
      // Skip if already processed
      if (processed.has(edge.id)) {
        continue;
      }

      // Create a key for the edge pair (always use lower source/target index first for consistency)
      const minIndex = Math.min(edge.source, edge.target);
      const maxIndex = Math.max(edge.source, edge.target);
      const pairKey = `${minIndex}-${maxIndex}-${edge.label}`;

      // Look for the reverse edge with the same label
      const reverseEdge = edges.find(e => 
        e.source === edge.target && 
        e.target === edge.source && 
        e.label === edge.label &&
        !processed.has(e.id)
      );

      if (reverseEdge) {
        // Found a symmetric pair with the same label - collapse them
        // Keep the edge with the lower source index as the canonical direction
        const canonicalEdge = edge.source < edge.target ? edge : reverseEdge;
        
        edgeMap.set(pairKey, {
          ...canonicalEdge,
          bidirectional: true
        });

        // Mark both edges as processed
        processed.add(edge.id);
        processed.add(reverseEdge.id);
      } else {
        // No matching reverse edge - keep as unidirectional
        edgeMap.set(edge.id, edge);
        processed.add(edge.id);
      }
    }

    return Array.from(edgeMap.values());
  }

  private toColaConstraint(constraint: LayoutConstraint): ColaConstraint {

    // Switch on the type of constraint
    if (isLeftConstraint(constraint)) {

      // Get the two nodes that are being constrained
      let node1 = this.colaNodes[this.getNodeIndex(constraint.left.id)];
      let node2 = this.colaNodes[this.getNodeIndex(constraint.right.id)];
      //      // Set fixed to 0 here.
      node1.fixed = 0;
      node2.fixed = 0;

      // Use improved horizontal separation calculation based on actual node dimensions
      let distance = this.computeHorizontalSeparation(node1, node2, constraint.minDistance);

      return this.leftConstraint(this.getNodeIndex(constraint.left.id), this.getNodeIndex(constraint.right.id), distance);
    }

    if (isTopConstraint(constraint)) {

      // Get the two nodes that are being constrained
      let node1 = this.colaNodes[this.getNodeIndex(constraint.top.id)];
      let node2 = this.colaNodes[this.getNodeIndex(constraint.bottom.id)];
      //      // Set fixed to 0 here.
      node1.fixed = 0;
      node2.fixed = 0;
      
      // Use improved vertical separation calculation based on actual node dimensions
      let distance = this.computeVerticalSeparation(node1, node2, constraint.minDistance);

      return this.topConstraint(this.getNodeIndex(constraint.top.id), this.getNodeIndex(constraint.bottom.id), distance);
    }

    if (isAlignmentConstraint(constraint)) {

      let gap = Math.floor(Math.random() * 2); // a random number between 0 and 1
      // This is a hack to potentially ameliorate cola stability issues
      // causing nodes to be placed on top of each other.


      // Is this right or do I have to switch axes. Check.
      const alignmentConstraint = {
        type: "separation",
        axis: constraint.axis,
        left: this.getNodeIndex(constraint.node1.id),
        right: this.getNodeIndex(constraint.node2.id),
        gap: 0,
        'equality': true
      }

      // FInd the two cola nodes that are being aligned
      let node1 = this.colaNodes[this.getNodeIndex(constraint.node1.id)];
      let node2 = this.colaNodes[this.getNodeIndex(constraint.node2.id)];
      //      // Set fixed to 0 here.
      node1.fixed = 0;
      node2.fixed = 0;

      return alignmentConstraint;

    }

    if(isBoundingBoxConstraint(constraint)) {
      // Log and ignore for now
      console.log("BoundingBoxConstraint detected.");
      // We should return a null constraint or something here
      return { type: "noop" };
    }
    if(isGroupBoundaryConstraint(constraint)) {
      // Log and ignore for now
      console.log("GroupBoundaryConstraint detected.");
      // We should return a null constraint or something here
      return { type: "noop" };
    }

    throw new Error("Constraint type not recognized");
  }

  /**
   * Collapses identical nested groups to reduce jitter and constraint conflicts.
   * When multiple groups contain exactly the same set of nodes, they are merged
   * into a single group with combined labels.
   * 
   * This addresses WebCola jitter issues where identical groups create conflicting
   * constraints that cause the layout to oscillate rather than converge.
   * 
   * @param groups - Array of layout groups to deduplicate
   * @returns Array of groups with duplicates collapsed
   */
  private collapseIdenticalGroups(groups: LayoutGroup[]): LayoutGroup[] {
    if (groups.length === 0) return groups;

    // Group by node set signature (sorted node IDs as string)
    const groupsByNodes = new Map<string, LayoutGroup[]>();
    
    for (const group of groups) {
      // Create a canonical key from sorted node IDs
      const nodeKey = [...group.nodeIds].sort().join(',');
      if (!groupsByNodes.has(nodeKey)) {
        groupsByNodes.set(nodeKey, []);
      }
      groupsByNodes.get(nodeKey)!.push(group);
    }
    
    const collapsed: LayoutGroup[] = [];
    let deduplicationCount = 0;
    
    for (const [nodeKey, duplicateGroups] of groupsByNodes) {
      if (duplicateGroups.length === 1) {
        // No duplicates, keep as-is
        collapsed.push(duplicateGroups[0]);
      } else {
        // Found duplicates - merge them
        deduplicationCount += duplicateGroups.length - 1;
        
        // Merge groups: preserve first group's structure but combine labels
        const mergedGroup: LayoutGroup = {
          ...duplicateGroups[0],
          // Combine names with separator for clarity
          name: duplicateGroups.map(g => g.name).join(' / '),
          // Show label if ANY of the duplicate groups wanted to show it
          showLabel: duplicateGroups.some(g => g.showLabel)
        };
        
        collapsed.push(mergedGroup);
      }
    }
    
    // Log deduplication results
    if (deduplicationCount > 0 && typeof console !== 'undefined' && console.log) {
      console.log(`WebColaTranslator: Collapsed ${deduplicationCount} duplicate group(s) from ${groups.length} to ${collapsed.length}`);
    }
    
    return collapsed;
  }


  private determineGroups(groups: LayoutGroup[]): { leaves: number[], padding: number, name: string, groups: number[] }[] {


      // Do we actually have to do this? Can we just use the groups as they are?

      // No we actually have to break this down into subgroups


      let groupsAsRecord: Record<string, string[]> = {};
      groups.forEach(group => {
        groupsAsRecord[group.name] = group.nodeIds;
      });

      let groupsAndSubgroups = this.determineGroupsAndSubgroups(groupsAsRecord);

      groupsAndSubgroups.forEach((group) => {


        let grp: LayoutGroup = groups.find(g => g.name === group.name);
        let keyNode = grp.keyNodeId;
        let keyIndex = this.getNodeIndex(keyNode);
        group['keyNode'] = keyIndex;
        group['id'] = grp.name;
        group['showLabel'] = grp.showLabel;
      });

      return groupsAndSubgroups;

    }


  // Returns true if group1 is a subgroup of group2
  private isSubGroup(group1: string[], group2: string[]) {
    return group1.every((node) => group2.includes(node));
  }



  private determineGroupsAndSubgroups(groupDefinitions: Record<string, string[]>) {
    let subgroups: Record<string, string[]> = {};


    Object.entries(groupDefinitions).forEach(([key1, value1]) => {
      Object.entries(groupDefinitions).forEach(([key2, value2]) => {

        const avoidContainmentCycle =
          key1 !== key2 // Group is not a subgroup of itself
          && (!subgroups[key2] || !subgroups[key2].includes(key1)) // Group is not a subgroup of a subgroup of itself
        const shouldAddSubgroup = avoidContainmentCycle && this.isSubGroup(value2, value1);


        if (shouldAddSubgroup) {

          if (subgroups[key1]) {
            subgroups[key1].push(key2);
          } else {
            subgroups[key1] = [key2];
          }
        }
      })
    });



    // TODO: But there may be groups that intersect with each other, but are not subgroups of each other.
    // WebCola struggles with this, so need to find a way to handle this.
    // Similarly, two webcola groups cannot share a subgroup.

    //Now modify groupDefinitions to be in the format that WebCola expects (ie indexed by node)

    const colaGroupsBeforeSubgrouping = Object.entries(groupDefinitions).map(([key, value]) => {


      const defaultPadding = 10;
      const disconnectedNodePadding = 30;
      const disconnectedNodeMarker = LayoutInstance.DISCONNECTED_PREFIX;

      // FIXME: The 'leaves' array is expected to contain node indices for WebCola, but in some cases it contains node objects instead.
      // This issue occurs when the mapping from node IDs to indices is not consistent, possibly due to changes in the node data structure or the getNodeIndex method.
      // To resolve this, ensure that 'leaves' always contains node indices before passing to WebCola. Refactor the code to handle cases where node objects are present, or update the mapping logic to guarantee indices.
      let leaves = value.map((nodeId) => this.getNodeIndex(nodeId));  
      let name = key;

      let padding = name.startsWith(disconnectedNodeMarker) ? disconnectedNodePadding : defaultPadding;

      return { leaves, padding, name };
    });

    const colaGroups = Object.entries(colaGroupsBeforeSubgrouping).map(([key, value]) => {

      let leaves = value.leaves;
      let padding = value.padding;
      let name = value.name;


      // if the group has no subgroups, return it as is
      if (!subgroups[name]) {
        return { leaves, padding, name, groups: [] };
      }

      let groups = subgroups[name].map((subgroupName) => {
        // Get the index of the subgroup
        let subgroupIndex = colaGroupsBeforeSubgrouping.findIndex((group) => group.name === subgroupName);
        return subgroupIndex;
      });


      // Remove leaves in the subgroups from the leaves in the group
      groups.forEach((groupIndex) => {
        let group = colaGroupsBeforeSubgrouping[groupIndex];
        leaves = leaves.filter((leaf) => !group.leaves.includes(leaf));
      });

      return { leaves, padding, name, groups };
    });

    return colaGroups;
  }


  // Public getters for accessing layout data
  get nodes(): NodeWithMetadata[] {
    return this.colaNodes;
  }

  get links(): EdgeWithMetadata[] {
    return this.colaEdges;
  }

  get constraints(): ColaConstraint[] {
    return this.colaConstraints;
  }

  get groups(): any {
    // TODO: Make sure the leaves and 
    // groups are well defined here (i.e. not defined by index by object?)
    return this.groupDefinitions;
  }

  get conflictingNodes(): LayoutNode[] {
    const conflictingNodes: LayoutNode[] = [];
    this.conflictingConstraints.forEach(constraint => {
      if (isLeftConstraint(constraint)) {
        conflictingNodes.push(constraint.left);
        conflictingNodes.push(constraint.right);
      } else if (isTopConstraint(constraint)) {
        conflictingNodes.push(constraint.top);
        conflictingNodes.push(constraint.bottom);
      } else if (isAlignmentConstraint(constraint)) {
        conflictingNodes.push(constraint.node1);
        conflictingNodes.push(constraint.node2);
      }
    });
    return conflictingNodes;
  }

  get overlappingNodes(): LayoutNode[] {
    return this.overlappingNodesData;
  }

  get overlappingGroups(): any {
    if (this.overlappingNodesData.length === 0) {
      return [];
    }

    const uniqueGroups = new Set<any>();

    this.groupDefinitions.forEach((g: any) => {
      const hasOverlappingNode = g.leaves.some((leaf: any) => this.overlappingNodesData.some((node: LayoutNode) => node.id === leaf.id));
      if (hasOverlappingNode) {
        uniqueGroups.add(g);
      }
    });

    return Array.from(uniqueGroups);
  }

  /**
   * Disposes of resources to help with garbage collection.
   * Clears the dagre_graph reference which can hold significant memory.
   */
  public dispose(): void {
    // Clear the dagre graph which can be memory-intensive
    if (this.dagre_graph) {
      this.dagre_graph = null;
    }
  }

  /**
   * Returns memory usage statistics for this layout.
   * Useful for monitoring and debugging memory consumption.
   * 
   * @returns Object containing memory-related metrics
   */
  public getMemoryStats(): {
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
    constraintCount: number;
    hasDagreGraph: boolean;
  } {
    return {
      nodeCount: this.colaNodes?.length || 0,
      edgeCount: this.colaEdges?.length || 0,
      groupCount: this.groupDefinitions?.length || 0,
      constraintCount: this.colaConstraints?.length || 0,
      hasDagreGraph: !!this.dagre_graph
    };
  }
}

/**
 * WebColaTranslator - Main translator class for converting InstanceLayout to WebCola format
 */
export class WebColaTranslator {

  /**
   * Translate an InstanceLayout to WebColaLayout
   * @param instanceLayout The layout to translate
   * @param figWidth Optional figure width (default: 800)
   * @param figHeight Optional figure height (default: 800)
   * @param options Optional layout options including prior positions for temporal consistency
   * @returns Promise<WebColaLayout> The translated layout
   */
  async translate(
    instanceLayout: InstanceLayout, 
    figWidth: number = 800, 
    figHeight: number = 800,
    options?: WebColaLayoutOptions
  ): Promise<WebColaLayout> {
    return new WebColaLayout(instanceLayout, figHeight, figWidth, options);
  }
}
