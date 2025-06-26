import { Node, Group, Link, Rectangle } from 'webcola';
import { InstanceLayout, LayoutNode, LayoutEdge, LayoutConstraint, LayoutGroup, LeftConstraint, TopConstraint, AlignmentConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint } from '../../layout/interfaces';
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

type NodeWithMetadata = Node &
{
  id: string,
  attributes: Record<string, string[]>,
  color: string
  icon: string,
  mostSpecificType: string,
  showLabels: boolean,
  innerBounds: Rectangle,
};

type EdgeWithMetadata = Link<NodeWithMetadata> & {
  source: number,
  target: number,
  relName: string, // This is the name of the relation for the edge
  id: string, // Unique identifier for the edge
  label: string // This is what is displayed on the edge
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

// WebCola group definition
interface ColaGroupDefinition extends Group {
  leaves?: NodeWithMetadata[];
  groups?: ColaGroupDefinition[];
  padding: number;
  name: string;
  keyNode?: number;
  id?: string;
  showLabel?: boolean;
}

// Export group definition type
export type { ColaGroupDefinition };


export class WebColaLayout {

  private instanceLayout: InstanceLayout;
  readonly colaConstraints: ColaConstraint[];
  readonly colaNodes: NodeWithMetadata[];
  readonly colaEdges: EdgeWithMetadata[];
  readonly groupDefinitions: ColaGroupDefinition[];

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


    this.groupDefinitions = this.determineGroups(instanceLayout.groups);


    this.colaConstraints = instanceLayout.constraints.map(constraint => this.toColaConstraint(constraint));

    if (this.colaConstraints.length === 0 && this.dagre_graph) {
      this.colaNodes.forEach(node => node.fixed = 1);
    }


  }


  private getNodeIndex(nodeId: string) {
    return this.colaNodes.findIndex(node => node.id === nodeId);
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
      label: edge.label
    }
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

      let distance = constraint.minDistance + ((node1.width || 100) / 2) + ((node2.width || 100) / 2);

      return this.leftConstraint(this.getNodeIndex(constraint.left.id), this.getNodeIndex(constraint.right.id), distance);
    }

    if (isTopConstraint(constraint)) {


      // Get the two nodes that are being constrained
      let node1 = this.colaNodes[this.getNodeIndex(constraint.top.id)];
      let node2 = this.colaNodes[this.getNodeIndex(constraint.bottom.id)];
      //      // Set fixed to 0 here.
      node1.fixed = 0;
      node2.fixed = 0;
      let distance = constraint.minDistance + ((node1.height || 60) / 2) + ((node2.height || 60) / 2);


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
    throw new Error("Constraint type not recognized");
  }


  private determineGroups(groups: LayoutGroup[]): ColaGroupDefinition[] {
    // Convert groups to the format expected by determineGroupsAndSubgroups
    const groupsAsRecord: Record<string, string[]> = {};
    groups.forEach(group => {
      groupsAsRecord[group.name] = group.nodeIds;
    });

    const groupsAndSubgroups = this.determineGroupsAndSubgroups(groupsAsRecord);

    // Now we need to add metadata from the original LayoutGroup objects
    const enrichedGroups = groupsAndSubgroups.map(colaGroup => {
      const originalGroup = groups.find(g => g.name === colaGroup.name);

      if (originalGroup?.keyNodeId) {
        const keyIndex = this.getNodeIndex(originalGroup.keyNodeId);
        if (keyIndex !== -1) {
          colaGroup.keyNode = keyIndex;
        }
      }

      if (originalGroup) {
        colaGroup.id = originalGroup.name;
        colaGroup.showLabel = originalGroup.showLabel;
      }

      return colaGroup;
    });

    return enrichedGroups;
  }


  // Returns true if group1 is a subgroup of group2
  private isSubGroup(group1: string[], group2: string[]) {
    return group1.every((node) => group2.includes(node));
  }



  /**
   * Determines groups and their subgroup relationships for WebCola layout.
   * 
   * This method processes group definitions to create a hierarchical structure
   * where subgroups are properly nested within their parent groups, and ensures
   * no node appears in both a parent group's leaves and its subgroups.
   * 
   * @param groupDefinitions - Record mapping group names to arrays of node IDs
   * @returns Array of ColaGroupDefinition objects with proper hierarchy
   */
  private determineGroupsAndSubgroups(groupDefinitions: Record<string, string[]>): ColaGroupDefinition[] {
    const subgroups: Record<string, string[]> = {};

    // Identify subgroup relationships by checking containment
    Object.entries(groupDefinitions).forEach(([parentKey, parentNodes]) => {
      Object.entries(groupDefinitions).forEach(([childKey, childNodes]) => {
        if (parentKey !== childKey && this.isSubGroup(childNodes, parentNodes)) {
          if (!subgroups[parentKey]) {
            subgroups[parentKey] = [];
          }
          subgroups[parentKey].push(childKey);
        }
      });
    });

    // Create initial group definitions with all leaves as Node objects
    const colaGroupsBeforeSubgrouping = Object.entries(groupDefinitions).map(([key, nodeIds]) => {
      const defaultPadding = 10;
      const disconnectedNodePadding = 30;
      const disconnectedNodeMarker = LayoutInstance.DISCONNECTED_PREFIX;

      // Convert node IDs to actual Node objects from colaNodes
      const leaves = nodeIds
        .map((nodeId) => {
          const index = this.getNodeIndex(nodeId);
          return index !== -1 ? this.colaNodes[index] : null;
        })
        .filter((node): node is NodeWithMetadata => node !== null);

      const name = key;
      const padding = name.startsWith(disconnectedNodeMarker)
        ? disconnectedNodePadding
        : defaultPadding;

      return { leaves, padding, name };
    });

    // Create a map for efficient group lookup
    const groupMap = new Map<string, ColaGroupDefinition>();

    // First pass: create all groups without subgroup relationships
    colaGroupsBeforeSubgrouping.forEach(group => {
      const colaGroup: ColaGroupDefinition = {
        leaves: group.leaves,
        groups: [],
        padding: group.padding,
        name: group.name
      };
      groupMap.set(group.name, colaGroup);
    });

    // Second pass: establish subgroup relationships and adjust leaves
    Object.entries(subgroups).forEach(([parentName, subgroupNames]) => {
      const parentGroup = groupMap.get(parentName);
      if (!parentGroup) return;

      // Get subgroup objects
      const subgroupObjects = subgroupNames
        .map(name => groupMap.get(name))
        .filter((group): group is ColaGroupDefinition => group !== undefined);

      parentGroup.groups = subgroupObjects;

      // Remove leaves that are contained in subgroups from parent's direct leaves
      const subgroupLeafIds = new Set(
        subgroupObjects.flatMap(subgroup =>
          subgroup.leaves?.map(leaf => leaf.id) || []
        )
      );

      parentGroup.leaves = parentGroup.leaves?.filter(
        leaf => !subgroupLeafIds.has(leaf.id)
      ) || [];
    });

    return Array.from(groupMap.values());
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

  get groups(): ColaGroupDefinition[] {
    // TODO: Make sure the leaves and 
    // groups are well defined here (i.e. not defined by index by object?)

    return this.groupDefinitions;
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
