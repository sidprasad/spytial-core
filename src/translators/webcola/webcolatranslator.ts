import { Node, Group, Link, Rectangle } from 'webcola';
import { InstanceLayout, LayoutNode, LayoutEdge, LayoutConstraint, LayoutGroup, LeftConstraint, TopConstraint, AlignmentConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint, isBoundingBoxConstraint, isGroupBoundaryConstraint } from '../../layout/interfaces';
import { LayoutInstance } from '../../layout/layoutinstance';
import * as dagre from 'dagre';

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
  color: string
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
  bidirectional?: boolean // Flag to indicate if this edge represents a bidirectional relationship
};

// Export the types for use in other modules
export type { NodeWithMetadata, EdgeWithMetadata };

// WebCola constraint types
interface ColaConstraint {
  type: string;
  [key: string]: unknown;
}

interface ColaSeparationConstraint extends ColaConstraint {
  type: 'separation';
  axis: 'x' | 'y';
  left: number;
  right: number;
  gap: number;
  equality?: boolean;
}

interface ColaHierarchyConstraint extends ColaConstraint {
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

  constructor(instanceLayout: InstanceLayout, fig_height: number = 800, fig_width: number = 800) {

    this.FIG_HEIGHT = fig_height;
    this.FIG_WIDTH = fig_width;

    this.DEFAULT_X = fig_width / 2;
    this.DEFAULT_Y = fig_height / 2;

    this.instanceLayout = instanceLayout;

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

    this.groupDefinitions = this.determineGroups(instanceLayout.groups);

    this.conflictingConstraints = instanceLayout.conflictingConstraints || [];
    this.overlappingNodesData = instanceLayout.overlappingNodes || [];
    this.colaConstraints = instanceLayout.constraints.map(constraint => this.toColaConstraint(constraint));

    if (this.colaConstraints.length === 0 && this.dagre_graph) {
      this.colaNodes.forEach(node => node.fixed = 1);
    }


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




  private toColaNode(node: LayoutNode): NodeWithMetadata {

    let x = this.DEFAULT_X;
    let y = this.DEFAULT_Y;

    let fixed = 0;

    if (this.dagre_graph) {
      // Get the corresponding node in the DAGRE graph
      let dagre_node = this.dagre_graph.node(node.id);
      x = dagre_node.x;
      y = dagre_node.y;
      //fixed = 1; // THIS REALLY IS NOT GOOD!
    }


    return {
      id: node.id,
      color: node.color,
      attributes: node.attributes || {},
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
   * @returns Promise<WebColaLayout> The translated layout
   */
  async translate(instanceLayout: InstanceLayout, figWidth: number = 800, figHeight: number = 800): Promise<WebColaLayout> {
    return new WebColaLayout(instanceLayout, figHeight, figWidth);
  }
}
