import { Graph } from 'graphlib';
import { IDataInstance, IAtom, IRelation, ITuple, IType } from '../interfaces';

/**
 * Pyret Lists and Tables are going to be really tricky here.
 * What about images, or other Pyret representations?
 */


export function generateEdgeId(
    relation: IRelation,
    tuple: ITuple
): string {

    const relationId = relation.id;
    const atoms = tuple.atoms;
    return `${relationId}:${atoms.join('->')}`;
}

/**
 * Pyret data instance implementation for parsing Pyret runtime objects
 * 
 * Handles Pyret's object representation where:
 * - Objects have a `dict` property containing field values
 * - Objects have a `brands` property indicating their type
 * - All dict entries are treated as relations
 * - Cycles are handled gracefully without infinite recursion
 * 
 * @example
 * ```typescript
 * const pyretData = {
 *   dict: { value: 11, left: {...}, right: {...} },
 *   brands: { "$brandtnode989": true }
 * };
 * const instance = new PyretDataInstance(pyretData);
 * ```
 */
export class PyretDataInstance implements IDataInstance {
  private atoms = new Map<string, IAtom>();
  private relations = new Map<string, IRelation>();
  private types = new Map<string, IType>();
  private objectToAtomId = new WeakMap<object, string>();
  private atomCounter = 0;

  /** Map to keep track of label counts per type */
  private typeLabelCounters = new Map<string, number>();

  /**
   * Creates a PyretDataInstance from a Pyret runtime object
   * 
   * @param pyretData - The root Pyret object to parse
   */
  constructor(pyretData: PyretObject) {
    this.initializeBuiltinTypes();
    this.parseObjectIteratively(pyretData);
  }

  /**
   * Parses Pyret objects iteratively to avoid stack overflow and handle cycles
   */
  private parseObjectIteratively(rootObject: PyretObject): void {
    const processingQueue: Array<{ obj: PyretObject; parentInfo?: { parentId: string; relationName: string } }> = [
      { obj: rootObject }
    ];

    while (processingQueue.length > 0) {
      const { obj, parentInfo } = processingQueue.shift()!;

      // Skip if we've already processed this object (cycle detection)
      if (this.objectToAtomId.has(obj)) {
        if (parentInfo) {
          const existingAtomId = this.objectToAtomId.get(obj)!;
          this.addRelationTuple(parentInfo.relationName, parentInfo.parentId, existingAtomId);
        }
        continue;
      }

      const atomId = this.createAtomFromObject(obj);

      // Add relation from parent if this is not the root object
      if (parentInfo) {
        this.addRelationTuple(parentInfo.relationName, parentInfo.parentId, atomId);
      }

      // Process all dict entries as relations
      if (obj.dict && typeof obj.dict === 'object') {
        Object.entries(obj.dict).forEach(([relationName, fieldValue]) => {
          if (this.isAtomicValue(fieldValue)) {
            const valueAtomId = this.createAtomFromPrimitive(fieldValue);
            this.addRelationTuple(relationName, atomId, valueAtomId);
          } else if (this.isPyretObject(fieldValue)) {
            processingQueue.push({
              obj: fieldValue,
              parentInfo: { parentId: atomId, relationName }
            });
          }
        });
      }
    }
  }

  /**
   * Creates an atom from a Pyret object and stores the mapping
   */
  private createAtomFromObject(obj: PyretObject): string {
    const type = this.extractType(obj);
    const atomId = this.generateAtomId(type);
    
    const atom: IAtom = {
      id: atomId,
      type,
      label: this.extractLabel(obj)
    };

    this.atoms.set(atomId, atom);
    this.objectToAtomId.set(obj, atomId);
    this.ensureTypeExists(type);

    return atomId;
  }

  /**
   * Creates an atom from a primitive value, reusing existing atoms for the same value
   */
  private createAtomFromPrimitive(value: string | number | boolean): string {
    const type = this.mapPrimitiveType(value);
    const label = String(value);
    
    // Check if we already have an atom for this value
    const existingAtom = Array.from(this.atoms.values())
      .find(atom => atom.label === label && atom.type === type);
    
    if (existingAtom) {
      return existingAtom.id;
    }

    const atomId = this.generateAtomId(type);
    const atom: IAtom = {
      id: atomId,
      type,
      label
    };

    this.atoms.set(atomId, atom);
    this.ensureTypeExists(type);

    return atomId;
  }

  /**
   * Maps JavaScript primitive types to Pyret-appropriate type names
   */
  private mapPrimitiveType(value: string | number | boolean): string {
    switch (typeof value) {
      case 'number': return 'Number';
      case 'string': return 'String';
      case 'boolean': return 'Boolean';
      default: return 'Value';
    }
  }


  /**
   * Extracts the most specific brand name from a Pyret brands object.
   * Returns the brand with the highest trailing number, with prefix and number removed.
   *
   * @param brands - The brands object from a Pyret object
   * @returns The most specific brand name (without $brand and trailing number), or undefined if none found
   */
  private extractMostSpecificBrand(brands: Record<string, boolean>): string | undefined {
    let maxNum = -1;
    let result: string | undefined = undefined;

    for (const brand of Object.keys(brands)) {
      const match = /^\$brand([a-zA-Z_]+)(\d+)$/.exec(brand);
      if (match) {
        const [, name, numStr] = match;
        const num = parseInt(numStr, 10);
        if (num > maxNum) {
          maxNum = num;
          result = name;
        }
      }
    }
    return result;
  }

  /**
   * Extracts the type name from a Pyret object
   */
  private extractType(obj: PyretObject): string {
    // Check for explicit name first
    if (obj.$name && typeof obj.$name === 'string') {
      return obj.$name;
    }

    // Extract from brands
    if (obj.brands && typeof obj.brands === 'object') {
      const brand = this.extractMostSpecificBrand(obj.brands);
      if (brand) {
        return brand;
      }
    }

    return 'PyretObject';
  }

  /**
   * Extracts a display label from a Pyret object, using a per-type counter.
   * Labels will be of the form Type$<num>
   */
  private extractLabel(obj: PyretObject): string {
    if (obj.$name && typeof obj.$name === 'string') {
      return obj.$name;
    }

    const type = this.extractType(obj);

    // Increment the counter for this type
    const current = this.typeLabelCounters.get(type) ?? 0;
    const next = current + 1;
    this.typeLabelCounters.set(type, next);

    return `${type}$${next}`;
  }

  /**
   * Adds a tuple to a relation, creating the relation if it doesn't exist
   */
  private addRelationTuple(relationName: string, sourceId: string, targetId: string): void {
    const sourceAtom = this.atoms.get(sourceId);
    const targetAtom = this.atoms.get(targetId);
    
    if (!sourceAtom || !targetAtom) {
      console.warn(`Cannot create relation ${relationName}: missing atoms ${sourceId} or ${targetId}`);
      return;
    }

    let relation = this.relations.get(relationName);
    if (!relation) {
      relation = {
        id: relationName,
        name: relationName,
        types: [sourceAtom.type, targetAtom.type],
        tuples: []
      };
      this.relations.set(relationName, relation);
    }

    // Check for duplicate tuples
    const isDuplicate = relation.tuples.some(tuple => 
      tuple.atoms[0] === sourceId && tuple.atoms[1] === targetId
    );

    if (!isDuplicate) {
      const tuple: ITuple = {
        atoms: [sourceId, targetId],
        types: [sourceAtom.type, targetAtom.type]
      };
      relation.tuples.push(tuple);
    }
  }

  /**
   * Ensures a type exists in the types map
   */
  private ensureTypeExists(typeName: string): void {
    if (!this.types.has(typeName)) {
      const type: IType = {
        id: typeName,
        types: ['PyretObject'], // All types inherit from PyretObject
        atoms: [],
        isBuiltin: this.isBuiltinType(typeName)
      };
      this.types.set(typeName, type);
    }
  }

  /**
   * Initializes common builtin types
   */
  private initializeBuiltinTypes(): void {
    const builtinTypes = ['Number', 'String', 'Boolean', 'PyretObject'];
    
    builtinTypes.forEach(typeName => {
      const type: IType = {
        id: typeName,
        types: typeName === 'PyretObject' ? [] : ['PyretObject'],
        atoms: [],
        isBuiltin: true
      };
      this.types.set(typeName, type);
    });
  }

  /**
   * Checks if a type is a builtin type
   */
  private isBuiltinType(typeName: string): boolean {
    return ['Number', 'String', 'Boolean', 'PyretObject'].includes(typeName);
  }

  /**
   * Type guard for atomic values
   */
  private isAtomicValue(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || 
           typeof value === 'number' || 
           typeof value === 'boolean';
  }

  /**
   * Type guard for Pyret objects
   */
  private isPyretObject(obj: unknown): obj is PyretObject {
    return typeof obj === 'object' && 
           obj !== null && 
           ('dict' in obj || 'brands' in obj || '$name' in obj);
  }

  /**
   * Generates a unique atom ID
   */
  private generateAtomId(type?: string): string {
    const prefix = type ? type.toLowerCase().substring(0, 3) : 'atom';
    return `${prefix}_${++this.atomCounter}`;
  }

  // IDataInstance implementation

  getAtoms(): readonly IAtom[] {
    return Array.from(this.atoms.values());
  }

  getRelations(): readonly IRelation[] {
    
    const values = this.relations.values();
    return Array.from(values);
    
    //return Array.from(this.relations.values());

  }

  getTypes(): readonly IType[] {
    // Update type atoms based on current atoms
    this.types.forEach(type => {
      type.atoms = this.getAtoms().filter(atom => atom.type === type.id);
    });
    
    return Array.from(this.types.values());
  }

  getAtomType(atomId: string): IType {
    const atom = this.atoms.get(atomId);
    if (!atom) {
      throw new Error(`Atom with id '${atomId}' not found`);
    }
    
    const type = this.types.get(atom.type);
    if (!type) {
      // Create the type on demand if it doesn't exist
      this.ensureTypeExists(atom.type);
      return this.types.get(atom.type)!;
    }
    
    return type;
  }

  generateGraph(hideDisconnected = false, hideDisconnectedBuiltIns = false): Graph {
    const graph = new Graph({ directed: true, multigraph: true });
    
    // Add all atoms as nodes
    this.getAtoms().forEach(atom => {
      graph.setNode(atom.id, atom.label);
    });
    
    // Add all relation tuples as edges
    this.getRelations().forEach(relation => {
      relation.tuples.forEach(tuple => {
        if (tuple.atoms.length >= 2) {
          const sourceId = tuple.atoms[0];
          const targetId = tuple.atoms[tuple.atoms.length - 1];
          
          // Include middle atoms in edge label if present
          const middleAtoms = tuple.atoms.slice(1, -1);
          const edgeLabel = middleAtoms.length > 0
            ? `${relation.name}[${middleAtoms.join(', ')}]`
            : relation.name;

            // Generate a unique edge ID
            const edgeId = generateEdgeId(relation, tuple);

          graph.setEdge(sourceId, targetId,  edgeLabel, edgeId );
        }
      });
    });
    
    // Handle disconnected node filtering
    if (hideDisconnected || hideDisconnectedBuiltIns) {
      const nodesToRemove: string[] = [];
      
      graph.nodes().forEach(nodeId => {
        const inEdges = graph.inEdges(nodeId) || [];
        const outEdges = graph.outEdges(nodeId) || [];
        const isDisconnected = inEdges.length === 0 && outEdges.length === 0;
        
        if (isDisconnected) {
          const atom = this.atoms.get(nodeId);
          if (atom) {
            const atomType = this.getAtomType(nodeId);
            const isBuiltin = atomType.isBuiltin;
            
            if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
              nodesToRemove.push(nodeId);
            }
          }
        }
      });
      
      nodesToRemove.forEach(nodeId => graph.removeNode(nodeId));
    }
    
    return graph;
  }

  /**
   * Applies projections to filter the data instance
   */
  applyProjections(atomIds: string[]): IDataInstance {
    if (atomIds.length === 0) {
      return this;
    }

    // Create a new instance with filtered data
    const projected = Object.create(PyretDataInstance.prototype) as PyretDataInstance;
    projected.atoms = new Map([...this.atoms].filter(([id]) => atomIds.includes(id)));
    projected.relations = new Map();
    projected.types = new Map();
    projected.atomCounter = projected.atoms.size;

    // Filter relations to only include tuples where all atoms are in the projection
    this.relations.forEach((relation, name) => {
      const filteredTuples = relation.tuples.filter(tuple =>
        tuple.atoms.every(atomId => atomIds.includes(atomId))
      );
      if (filteredTuples.length > 0) {
        projected.relations.set(name, {
          ...relation,
          tuples: filteredTuples
        });
      }
    });

    // Filter types to only include atoms in the projection
    this.types.forEach((type, typeName) => {
      const filteredAtoms = type.atoms.filter(atom => atomIds.includes(atom.id));
      if (filteredAtoms.length > 0) {
        projected.types.set(typeName, {
          ...type,
          atoms: filteredAtoms
        });
      }
    });

    return projected;
  }
}

/**
 * Type definitions for Pyret runtime objects
 */
export interface PyretObject {
  dict?: Record<string, unknown>;
  brands?: Record<string, boolean>;
  $name?: string;
  $loc?: unknown[];
  $mut_fields_mask?: unknown[];
  $arity?: number;
  $constructor?: unknown;
  [key: string]: unknown;
}

/**
 * Factory function to create PyretDataInstance from JSON string
 * 
 * @param jsonString - JSON representation of a Pyret object
 * @returns New PyretDataInstance
 * 
 * @example
 * ```typescript
 * const jsonData = '{"dict": {"value": 42}, "brands": {"$brandleaf": true}}';
 * const instance = createPyretDataInstance(jsonData);
 * ```
 */
export const createPyretDataInstance = (jsonString: string): PyretDataInstance => {
  try {
    const pyretData = JSON.parse(jsonString) as PyretObject;
    return new PyretDataInstance(pyretData);
  } catch (error) {
    throw new Error(`Failed to parse Pyret JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Type guard to check if an IDataInstance is a PyretDataInstance
 * 
 * @param instance - IDataInstance to check
 * @returns True if the instance is a PyretDataInstance
 */
export const isPyretDataInstance = (instance: IDataInstance): instance is PyretDataInstance => {
  return instance instanceof PyretDataInstance;
};