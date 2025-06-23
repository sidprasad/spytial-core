/**
 * @fileoverview
 * DOT data instance implementation using graphlib-dot parser.
 * Implements IDataInstance interface for DOT graphs with minimal custom parsing.
 */

import type { IDataInstance, IAtom, IType, IRelation, ITuple } from '../interfaces';
import { Graph } from 'graphlib';
// Note: You'll need to install graphlib-dot
// npm install graphlib-dot @types/graphlib-dot

/**
 * Configuration for DOT graph processing
 */
export interface DotConfig {
  /** Default type name for nodes */
  readonly defaultNodeType: string;
  
  /** Default relation name for edges */
  readonly defaultEdgeRelation: string;
  
  /** Whether to create types from node shapes */
  readonly createTypesFromShapes: boolean;
  
  /** Attribute that defines node type */
  readonly nodeTypeAttribute: string;
  
  /** Whether to include node attributes as relations */
  readonly includeNodeAttributes: boolean;
  
  /** Whether to include edge attributes as relations */
  readonly includeEdgeAttributes: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_DOT_CONFIG: DotConfig = {
  defaultNodeType: 'Node',
  defaultEdgeRelation: 'edge',
  createTypesFromShapes: true,
  nodeTypeAttribute: 'type',
  includeNodeAttributes: false,
  includeEdgeAttributes: false
} as const;

/**
 * DOT data instance implementation using graphlib-dot
 */
export class DotDataInstance implements IDataInstance {
  private readonly graph: Graph;
  private readonly config: DotConfig;
  
  // Caches
  private readonly typeCache = new Map<string, IType>();
  private readonly atomCache = new Map<string, IAtom>();
  private readonly relationCache = new Map<string, IRelation>();
  private readonly tupleCache: ITuple[] = [];

  /**
   * Create DOT data instance from graphlib Graph
   * 
   * @param graph - Parsed graphlib Graph (from graphlib-dot)
   * @param config - Optional configuration
   */
  constructor(graph: Graph, config: Partial<DotConfig> = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_DOT_CONFIG, ...config };
    this.initializeCaches();
  }

  /**
   * Get type information for a specific atom
   */
  public getAtomType(atomId: string): IType | undefined {
    const atom = this.atomCache.get(atomId);
    if (!atom) return undefined;
    return this.typeCache.get(atom.type);
  }

  /**
   * Get all types defined in this instance
   */
  public getTypes(): readonly IType[] {
    return Array.from(this.typeCache.values());
  }

  /**
   * Get all atoms in this instance
   */
  public getAtoms(): readonly IAtom[] {
    return Array.from(this.atomCache.values());
  }

  /**
   * Get all relations in this instance
   */
  public getRelations(): readonly IRelation[] {
    return Array.from(this.relationCache.values());
  }

  /**
   * Get all tuples in this instance
   */
  public getTuples(): readonly ITuple[] {
    return [...this.tupleCache];
  }

  /**
   * Apply projections to filter the instance
   */
  public applyProjections(atomIds: string[]): IDataInstance {
    const atomIdSet = new Set(atomIds);
    
    // Create filtered graph
    const filteredGraph = new Graph({ 
      directed: this.graph.isDirected(),
      multigraph: this.graph.isMultigraph()
    });
    
    // Copy nodes that are in projection
    for (const nodeId of this.graph.nodes()) {
      if (atomIdSet.has(nodeId)) {
        filteredGraph.setNode(nodeId, this.graph.node(nodeId));
      }
    }
    
    // Copy edges between projected nodes
    for (const edge of this.graph.edges()) {
      if (atomIdSet.has(edge.v) && atomIdSet.has(edge.w)) {
        filteredGraph.setEdge(edge.v, edge.w, this.graph.edge(edge));
      }
    }
    
    return new DotDataInstance(filteredGraph, this.config);
  }

  /**
   * Generate graph representation (returns the internal graph)
   */
  public generateGraph(
    hideDisconnected: boolean = false, 
    hideDisconnectedBuiltIns: boolean = false
  ): Graph {
    if (!hideDisconnected && !hideDisconnectedBuiltIns) {
      return this.graph;
    }
    
    // Create copy and filter if needed
    const filteredGraph = new Graph({
      directed: this.graph.isDirected(),
      multigraph: this.graph.isMultigraph()
    });
    
    // Copy all nodes and edges first
    for (const nodeId of this.graph.nodes()) {
      filteredGraph.setNode(nodeId, this.graph.node(nodeId));
    }
    
    for (const edge of this.graph.edges()) {
      filteredGraph.setEdge(edge.v, edge.w, this.graph.edge(edge));
    }
    
    // Filter disconnected nodes if requested
    if (hideDisconnected || hideDisconnectedBuiltIns) {
      this.filterDisconnectedNodes(filteredGraph, hideDisconnected, hideDisconnectedBuiltIns);
    }
    
    return filteredGraph;
  }

  /**
   * Initialize caches from the graphlib Graph
   */
  private initializeCaches(): void {
    this.addDefaultTypes();
    this.processNodes();
    this.processEdges();
    
    if (this.config.includeNodeAttributes || this.config.includeEdgeAttributes) {
      this.createAttributeRelations();
    }
  }

  /**
   * Add default and shape-based types
   */
  private addDefaultTypes(): void {
    // Add default node type
    this.typeCache.set(this.config.defaultNodeType, {
      name: this.config.defaultNodeType,
      isBuiltin: false
    });
    
    // Add types from node shapes if configured
    if (this.config.createTypesFromShapes) {
      const shapes = new Set<string>();
      
      for (const nodeId of this.graph.nodes()) {
        const nodeData = this.graph.node(nodeId);
        const shape = nodeData?.shape;
        
        if (shape && !shapes.has(shape)) {
          shapes.add(shape);
          this.typeCache.set(shape, {
            name: shape,
            isBuiltin: false,
            parentType: this.config.defaultNodeType
          });
        }
      }
    }
  }

  /**
   * Process all nodes to create atoms
   */
  private processNodes(): void {
    for (const nodeId of this.graph.nodes()) {
      const nodeData = this.graph.node(nodeId) || {};
      
      // Determine node type
      let nodeType = this.config.defaultNodeType;
      
      // Check for explicit type
      const explicitType = nodeData[this.config.nodeTypeAttribute];
      if (explicitType && this.typeCache.has(explicitType)) {
        nodeType = explicitType;
      }
      // Check for shape-based type
      else if (this.config.createTypesFromShapes && nodeData.shape) {
        const shape = nodeData.shape;
        if (this.typeCache.has(shape)) {
          nodeType = shape;
        }
      }
      
      this.atomCache.set(nodeId, {
        id: nodeId,
        type: nodeType
      });
    }
  }

  /**
   * Process all edges to create relations and tuples
   */
  private processEdges(): void {
    // Create default edge relation
    const edgeRelationName = this.config.defaultEdgeRelation;
    
    if (!this.relationCache.has(edgeRelationName)) {
      this.relationCache.set(edgeRelationName, {
        name: edgeRelationName,
        arity: 2,
        types: [this.config.defaultNodeType, this.config.defaultNodeType]
      });
    }
    
    // Create tuples for each edge
    for (const edge of this.graph.edges()) {
      const edgeData = this.graph.edge(edge) || {};
      
      // Determine relation name
      let relationName = edgeRelationName;
      const edgeType = edgeData.type || edgeData.label;
      
      if (edgeType) {
        relationName = edgeType;
        
        // Create relation if it doesn't exist
        if (!this.relationCache.has(relationName)) {
          this.relationCache.set(relationName, {
            name: relationName,
            arity: 2,
            types: [this.config.defaultNodeType, this.config.defaultNodeType]
          });
        }
      }
      
      this.tupleCache.push({
        relation: relationName,
        atoms: [edge.v, edge.w]
      });
    }
  }

  /**
   * Create attribute relations if configured
   */
  private createAttributeRelations(): void {
    // Node attributes
    if (this.config.includeNodeAttributes) {
      const nodeAttributes = new Set<string>();
      
      for (const nodeId of this.graph.nodes()) {
        const nodeData = this.graph.node(nodeId) || {};
        Object.keys(nodeData).forEach(attr => nodeAttributes.add(attr));
      }
      
      for (const attr of nodeAttributes) {
        if (attr === this.config.nodeTypeAttribute) continue; // Skip type attribute
        
        const relationName = `node_${attr}`;
        
        this.relationCache.set(relationName, {
          name: relationName,
          arity: 2,
          types: [this.config.defaultNodeType, 'String']
        });
        
        for (const nodeId of this.graph.nodes()) {
          const nodeData = this.graph.node(nodeId) || {};
          const value = nodeData[attr];
          
          if (value !== undefined) {
            this.tupleCache.push({
              relation: relationName,
              atoms: [nodeId, String(value)]
            });
          }
        }
      }
    }
    
    // Edge attributes
    if (this.config.includeEdgeAttributes) {
      const edgeAttributes = new Set<string>();
      
      for (const edge of this.graph.edges()) {
        const edgeData = this.graph.edge(edge) || {};
        Object.keys(edgeData).forEach(attr => edgeAttributes.add(attr));
      }
      
      for (const attr of edgeAttributes) {
        if (attr === 'type' || attr === 'label') continue; // Skip relation-defining attributes
        
        const relationName = `edge_${attr}`;
        
        this.relationCache.set(relationName, {
          name: relationName,
          arity: 3,
          types: [this.config.defaultNodeType, this.config.defaultNodeType, 'String']
        });
        
        for (const edge of this.graph.edges()) {
          const edgeData = this.graph.edge(edge) || {};
          const value = edgeData[attr];
          
          if (value !== undefined) {
            this.tupleCache.push({
              relation: relationName,
              atoms: [edge.v, edge.w, String(value)]
            });
          }
        }
      }
    }
  }

  /**
   * Filter disconnected nodes from graph
   */
  private filterDisconnectedNodes(
    graph: Graph, 
    hideDisconnected: boolean, 
    hideDisconnectedBuiltIns: boolean
  ): void {
    const nodesToRemove: string[] = [];
    
    for (const nodeId of graph.nodes()) {
      const nodeData = graph.node(nodeId) || {};
      const inEdges = graph.inEdges(nodeId);
      const outEdges = graph.outEdges(nodeId);
      const isDisconnected = (!inEdges || inEdges.length === 0) && 
                            (!outEdges || outEdges.length === 0);
      
      if (isDisconnected) {
        const isBuiltin = this.isBuiltinNode(nodeData);
        
        if (hideDisconnected || (hideDisconnectedBuiltIns && isBuiltin)) {
          nodesToRemove.push(nodeId);
        }
      }
    }
    
    for (const nodeId of nodesToRemove) {
      graph.removeNode(nodeId);
    }
  }

  /**
   * Check if node is built-in
   */
  private isBuiltinNode(nodeData: any): boolean {
    const builtinShapes = new Set(['record', 'plaintext', 'none']);
    return builtinShapes.has(nodeData.shape);
  }
}

/**
 * Create DOT data instance from DOT text using graphlib-dot
 * 
 * @param dotText - DOT graph as string
 * @param config - Optional configuration
 * @returns DOT data instance implementing IDataInstance
 * 
 * @example
 * ```typescript
 * import { read } from 'graphlib-dot';
 * 
 * const dotText = `digraph { A -> B; }`;
 * const dataInstance = createDotDataInstance(dotText);
 * ```
 */
export function createDotDataInstance(
  dotText: string, 
  config?: Partial<DotConfig>
): IDataInstance {
  // This requires graphlib-dot to be installed
  // For now, we'll provide a placeholder that shows the intended usage
  
  try {
    // This would be the actual implementation with graphlib-dot:
    // const graph = read(dotText);
    // return new DotDataInstance(graph, config);
    
    throw new Error(
      'graphlib-dot is required. Install with: npm install graphlib-dot @types/graphlib-dot'
    );
  } catch (error) {
    throw new Error(`Failed to parse DOT graph: ${(error as Error).message}`);
  }
}

/**
 * Create DOT data instance from pre-parsed graphlib Graph
 * 
 * @param graph - Graphlib Graph (from graphlib-dot or manual creation)
 * @param config - Optional configuration
 * @returns DOT data instance implementing IDataInstance
 */
export function createDotDataInstanceFromGraph(
  graph: Graph,
  config?: Partial<DotConfig>
): IDataInstance {
  return new DotDataInstance(graph, config);
}

/**
 * Create example DOT graph for testing
 */
export function createExampleDotGraph(): Graph {
  const graph = new Graph({ directed: true });
  
  // Add nodes with attributes
  graph.setNode('A', { label: 'Node A', shape: 'box', type: 'Entity' });
  graph.setNode('B', { label: 'Node B', shape: 'ellipse', type: 'Entity' });
  graph.setNode('C', { label: 'Node C', shape: 'diamond', type: 'Relation' });
  
  // Add edges with attributes
  graph.setEdge('A', 'B', { label: 'connects', weight: 1.0 });
  graph.setEdge('B', 'C', { label: 'belongs_to', weight: 2.0 });
  
  return graph;
}

/**
 * Type guard to check if instance is DOT data instance
 */
export function isDotDataInstance(instance: IDataInstance): instance is DotDataInstance {
  return instance instanceof DotDataInstance;
}