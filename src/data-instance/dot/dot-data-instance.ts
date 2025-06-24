import type { Graph } from 'graphlib';
import parse from 'graphlib-dot';
import type { IDataInstance, IAtom, IType, IRelation } from '../interfaces';

/**
 * Simple DOT data instance implementation
 * Converts DOT graphs to the IDataInstance interface with proper type handling
 * Leverages type information from DOT annotations and builtin type detection
 */
export class DotDataInstance implements IDataInstance {
  private readonly graph: Graph;
  private readonly atoms: IAtom[] = [];
  private readonly types: IType[] = [];
  private readonly relations: IRelation[] = [];
  private readonly typeMap = new Map<string, IType>();

  constructor(dotSpec: string) {
    this.graph = parse.read(dotSpec) as Graph;
    this.buildDataStructures();
  }

  /**
   * Build atoms, types, and relations from the DOT graph
   * Uses type information from DOT annotations and proper builtin detection
   */
  private buildDataStructures(): void {
    // Always create builtin types first (matching dot-to-alloy-xml structure)
    this.createBuiltinTypes();
    
    // Collect unique user-defined types from DOT nodes
    const userTypeNames = new Set<string>();
    
    for (const nodeId of this.graph.nodes()) {
      const nodeData = this.graph.node(nodeId) || {};
      const typeName = nodeData.type ? String(nodeData.type) : 'univ';
      
      // Only collect non-builtin types
      if (!this.isBuiltinType(typeName)) {
        userTypeNames.add(typeName);
      }
    }

    // Create user-defined types
    for (const typeName of userTypeNames) {
      const type: IType = {
        id: typeName,
        types: new Set(),
        atoms: new Set(),
        isBuiltin: false
      };
      this.types.push(type);
      this.typeMap.set(typeName, type);
    }

    // Create atoms with proper type assignment
    for (const nodeId of this.graph.nodes()) {
      const nodeData = this.graph.node(nodeId) || {};
      const typeName = nodeData.type ? String(nodeData.type) : 'univ';
      const nodeType = this.typeMap.get(typeName)!;
      
      const atom: IAtom = { 
        id: nodeId, 
        type: nodeType 
      };
      
      this.atoms.push(atom);
      nodeType.atoms.add(atom);
    }

    // Create edge relations (grouped by label, defaulting to 'edges')
    this.createEdgeRelations();
  }

  /**
   * Create builtin types following the same structure as dot-to-alloy-xml
   * Ensures compatibility with Alloy infrastructure
   */
  private createBuiltinTypes(): void {
    const builtinTypes = [
      { id: 'seq/Int', isBuiltin: true },
      { id: 'Int', isBuiltin: true },
      { id: 'univ', isBuiltin: true }
    ];

    for (const { id, isBuiltin } of builtinTypes) {
      const type: IType = {
        id,
        types: new Set(),
        atoms: new Set(),
        isBuiltin
      };
      this.types.push(type);
      this.typeMap.set(id, type);
    }
  }

  /**
   * Check if a type name is a builtin type
   * Matches the builtin detection logic from dot-to-alloy-xml
   * 
   * @param typeName - Type name to check
   * @returns True if the type is builtin
   */
  private isBuiltinType(typeName: string): boolean {
    return typeName === 'seq/Int' || typeName === 'Int' || typeName === 'univ';
  }

  /**
   * Create edge relations grouped by label
   * Follows the same edge grouping logic as dot-to-alloy-xml
   */
  private createEdgeRelations(): void {
    const univType = this.typeMap.get('univ')!;
    const edgeGroups = new Map<string, Array<{ source: string; target: string }>>();

    // Group edges by label (same logic as dot-to-alloy-xml)
    for (const edge of this.graph.edges()) {
      const edgeData = this.graph.edge(edge) || {};
      const label = (edgeData.label && String(edgeData.label).trim()) || 'edges';
      
      if (!edgeGroups.has(label)) {
        edgeGroups.set(label, []);
      }
      
      edgeGroups.get(label)!.push({
        source: edge.v,
        target: edge.w
      });
    }

    // Create relation for each edge group
    for (const [fieldName, edgeList] of edgeGroups) {
      const relation: IRelation = {
        id: fieldName,
        name: fieldName,
        types: [univType, univType], // Binary relation univ -> univ
        tuples: new Set()
      };

      // Add tuples for each edge in this group
      for (const edge of edgeList) {
        const sourceAtom = this.atoms.find(a => a.id === edge.source);
        const targetAtom = this.atoms.find(a => a.id === edge.target);
        
        if (sourceAtom && targetAtom) {
          relation.tuples.add({
            relation,
            atoms: [sourceAtom, targetAtom]
          });
        }
      }

      this.relations.push(relation);
    }
  }

  getAtomType(atomId: string): IType | undefined {
    return this.atoms.find(a => a.id === atomId)?.type;
  }

  getTypes(): readonly IType[] {
    return this.types;
  }

  getAtoms(): readonly IAtom[] {
    return this.atoms;
  }

  getRelations(): readonly IRelation[] {
    return this.relations;
  }

  applyProjections(atomIds: string[]): IDataInstance {
    const atomSet = new Set(atomIds);
    
    // Create filtered DOT string preserving type annotations
    let filteredDot = this.graph.isDirected() ? 'digraph {\n' : 'graph {\n';
    
    // Add nodes with their type attributes preserved
    for (const nodeId of this.graph.nodes()) {
      if (atomSet.has(nodeId)) {
        const nodeData = this.graph.node(nodeId) || {};
        let nodeDecl = `  "${nodeId}"`;
        
        // Preserve type and label attributes
        const attrs: string[] = [];
        if (nodeData.type) attrs.push(`type="${nodeData.type}"`);
        if (nodeData.label) attrs.push(`label="${nodeData.label}"`);
        
        if (attrs.length > 0) {
          nodeDecl += ` [${attrs.join(', ')}]`;
        }
        
        filteredDot += nodeDecl + ';\n';
      }
    }
    
    // Add edges with their label attributes preserved
    const connector = this.graph.isDirected() ? '->' : '--';
    for (const edge of this.graph.edges()) {
      if (atomSet.has(edge.v) && atomSet.has(edge.w)) {
        const edgeData = this.graph.edge(edge) || {};
        let edgeDecl = `  "${edge.v}" ${connector} "${edge.w}"`;
        
        // Preserve edge label if present
        if (edgeData.label) {
          edgeDecl += ` [label="${edgeData.label}"]`;
        }
        
        filteredDot += edgeDecl + ';\n';
      }
    }
    
    filteredDot += '}\n';
    
    return new DotDataInstance(filteredDot);
  }

  generateGraph(): Graph {
    return this.graph;
  }

  /**
   * Get the display label for a node
   * Uses label attribute if available, otherwise falls back to node ID
   * 
   * @param nodeId - Node identifier
   * @returns Display label for the node
   */
  getNodeLabel(nodeId: string): string {
    const nodeData = this.graph.node(nodeId) || {};
    return nodeData.label ? String(nodeData.label) : nodeId;
  }

  /**
   * Get all user-defined (non-builtin) type names
   * Excludes builtin types like univ, Int, seq/Int
   * 
   * @returns Array of user-defined type names
   */
  getUserTypeNames(): readonly string[] {
    return this.types
      .filter(type => !type.isBuiltin)
      .map(type => type.id);
  }

  /**
   * Get all builtin type names
   * 
   * @returns Array of builtin type names
   */
  getBuiltinTypeNames(): readonly string[] {
    return this.types
      .filter(type => type.isBuiltin)
      .map(type => type.id);
  }
}

/**
 * Create DOT data instance from DOT specification
 * Properly handles type annotations and builtin type detection
 * Compatible with dot-to-alloy-xml type structure
 * 
 * @param dotSpec - DOT graph specification as string
 * @returns IDataInstance implementation for DOT graphs
 * 
 * @example
 * ```typescript
 * const dotGraph = `digraph {
 *   A [type="Entity", label="Node A"];
 *   B [type="Process"];
 *   C; // defaults to type="univ"
 *   A -> B [label="processes"];
 * }`;
 * const instance = createDotDataInstance(dotGraph);
 * console.log(instance.getBuiltinTypeNames()); // ['seq/Int', 'Int', 'univ']
 * console.log(instance.getUserTypeNames()); // ['Entity', 'Process']
 * ```
 */
export function createDotDataInstance(dotSpec: string): IDataInstance {
  return new DotDataInstance(dotSpec);
}

/**
 * Configuration options for DOT data instance creation
 */
export interface DotConfig {
  /** Default type for nodes without explicit type annotation */
  readonly defaultType?: string;
  /** Whether to preserve node labels in projections */
  readonly preserveLabels?: boolean;
  /** Whether to include builtin types in output */
  readonly includeBuiltins?: boolean;
}

/**
 * Create DOT data instance with configuration options
 * 
 * @param dotSpec - DOT graph specification as string  
 * @param config - Configuration options
 * @returns IDataInstance implementation for DOT graphs
 */
export function createDotDataInstanceWithConfig(
  dotSpec: string,
  config: DotConfig = {}
): IDataInstance {
  // Future enhancement: could modify behavior based on config
  // For now, use standard implementation
  return new DotDataInstance(dotSpec);
}