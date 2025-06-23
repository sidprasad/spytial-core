/**
 * Alloy Graph module for handling graph structures and operations
 */

export interface GraphNode {
  id: string;
  label?: string;
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphConfig {
  directed?: boolean;
  allowSelfLoops?: boolean;
  allowMultipleEdges?: boolean;
}

/**
 * Main AlloyGraph class for graph operations
 */
export class AlloyGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private config: GraphConfig;

  constructor(config: GraphConfig = {}) {
    this.config = {
      directed: true,
      allowSelfLoops: false,
      allowMultipleEdges: false,
      ...config,
    };
  }

  /**
   * Add a node to the graph
   */
  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edge: GraphEdge): void {
    if (!this.config.allowSelfLoops && edge.source === edge.target) {
      throw new Error('Self-loops are not allowed');
    }

    if (!this.config.allowMultipleEdges && this.hasEdge(edge.source, edge.target)) {
      throw new Error('Multiple edges between same nodes are not allowed');
    }

    this.edges.set(edge.id, edge);
  }

  /**
   * Check if an edge exists between two nodes
   */
  hasEdge(source: string, target: string): boolean {
    return Array.from(this.edges.values()).some(
      edge => edge.source === source && edge.target === target
    );
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get all nodes
   */
  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string): GraphNode[] {
    const neighbors: GraphNode[] = [];
    
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId) {
        const neighbor = this.nodes.get(edge.target);
        if (neighbor) neighbors.push(neighbor);
      }
      
      if (!this.config.directed && edge.target === nodeId) {
        const neighbor = this.nodes.get(edge.source);
        if (neighbor) neighbors.push(neighbor);
      }
    }
    
    return neighbors;
  }

  /**
   * Export graph data
   */
  toData(): GraphData {
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
    };
  }

  /**
   * Load graph from data
   */
  fromData(data: GraphData): void {
    this.nodes.clear();
    this.edges.clear();
    
    data.nodes.forEach(node => this.addNode(node));
    data.edges.forEach(edge => this.addEdge(edge));
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      isDirected: this.config.directed,
    };
  }
}

/**
 * Factory function to create an AlloyGraph instance
 */
export const createAlloyGraph = (config?: GraphConfig): AlloyGraph => {
  return new AlloyGraph(config);
};

// Utility functions
export const isValidNode = (node: GraphNode): boolean => {
  return typeof node.id === 'string' && node.id.length > 0;
};

export const isValidEdge = (edge: GraphEdge): boolean => {
  return (
    typeof edge.id === 'string' &&
    edge.id.length > 0 &&
    typeof edge.source === 'string' &&
    edge.source.length > 0 &&
    typeof edge.target === 'string' &&
    edge.target.length > 0
  );
};
