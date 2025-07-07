/**
 * 
 * {
    "dict": {
        "value": 11,
        "left": {
            "dict": {
                "_output": {
                    "name": "_output"
                },
                "_match": {
                    "name": "leaf"
                }
            },
            "brands": {
                "$brandTree988": true,
                "$brandleaf990": true
            },
            "$name": "leaf",
            "$loc": [
                "definitions://",
                10,
                2,
                157,
                10,
                8,
                163
            ],
            "$mut_fields_mask": [],
            "$arity": -1,
            "$constructor": {
                "_output": {
                    "name": "_output"
                },
                "_match": {
                    "name": "leaf"
                }
            }
        },
        "right": {
            "dict": {
                "value": -1,
                "left": {
                    "dict": {
                        "value": 1,
                        "left": {
                            "dict": {
                                "_output": {
                                    "name": "_output"
                                },
                                "_match": {
                                    "name": "leaf"
                                }
                            },
                            "brands": {
                                "$brandTree988": true,
                                "$brandleaf990": true
                            },
                            "$name": "leaf",
                            "$loc": [
                                "definitions://",
                                10,
                                2,
                                157,
                                10,
                                8,
                                163
                            ],
                            "$mut_fields_mask": [],
                            "$arity": -1,
                            "$constructor": {
                                "_output": {
                                    "name": "_output"
                                },
                                "_match": {
                                    "name": "leaf"
                                }
                            }
                        },
                        "right": {
                            "dict": {
                                "_output": {
                                    "name": "_output"
                                },
                                "_match": {
                                    "name": "leaf"
                                }
                            },
                            "brands": {
                                "$brandTree988": true,
                                "$brandleaf990": true
                            },
                            "$name": "leaf",
                            "$loc": [
                                "definitions://",
                                10,
                                2,
                                157,
                                10,
                                8,
                                163
                            ],
                            "$mut_fields_mask": [],
                            "$arity": -1,
                            "$constructor": {
                                "_output": {
                                    "name": "_output"
                                },
                                "_match": {
                                    "name": "leaf"
                                }
                            }
                        }
                    },
                    "brands": {
                        "$brandTree988": true,
                        "$brandtnode989": true
                    }
                },
                "right": {
                    "dict": {
                        "_output": {
                            "name": "_output"
                        },
                        "_match": {
                            "name": "leaf"
                        }
                    },
                    "brands": {
                        "$brandTree988": true,
                        "$brandleaf990": true
                    },
                    "$name": "leaf",
                    "$loc": [
                        "definitions://",
                        10,
                        2,
                        157,
                        10,
                        8,
                        163
                    ],
                    "$mut_fields_mask": [],
                    "$arity": -1,
                    "$constructor": {
                        "_output": {
                            "name": "_output"
                        },
                        "_match": {
                            "name": "leaf"
                        }
                    }
                }
            },
            "brands": {
                "$brandTree988": true,
                "$brandtnode989": true
            }
        }
    },
    "brands": {
        "$brandTree988": true,
        "$brandtnode989": true
    }
}
 * 
 * 
 */

import { Graph } from 'graphlib';
import { IDataInstance, IAtom, IRelation, ITuple, IType } from '../interfaces';

/**
 * Pyret data instance implementation for parsing Pyret runtime objects
 * 
 * Handles Pyret's object representation where:
 * - Objects have a `dict` property containing field values
 * - Objects have a `brands` property indicating their type
 * - Objects may have special metadata like `$name`, `$constructor`, etc.
 */
export class PyretDataInstance implements IDataInstance {
  private atoms: Map<string, IAtom> = new Map();
  private relations: Map<string, IRelation> = new Map();
  private types: Map<string, IType> = new Map();
  private atomCounter = 0;

  /**
   * Returns a new PyretDataInstance containing only the atoms with the given IDs and their related relations/types.
   * @param atomIds - Array of atom IDs to project.
   * @returns A new PyretDataInstance with the projection applied.
   */
  applyProjections(atomIds: string[]): IDataInstance {

    if (atomIds.length === 0) {
      // If no atoms are selected, return the current instance as is.
      return this;
    }


    // Create a shallow copy of the instance with only the selected atoms and their relations/types.
    const projected = Object.create(PyretDataInstance.prototype) as PyretDataInstance;
    projected.atoms = new Map([...this.atoms].filter(([id]) => atomIds.includes(id)));
    projected.relations = new Map();
    projected.types = new Map();

    // Filter relations to only include tuples where both atoms are in the projection.
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

    // Filter types to only include atoms in the projection.
    this.types.forEach((type, typeName) => {
      const filteredAtoms = type.atoms.filter(atom => atomIds.includes(atom.id));
      if (filteredAtoms.length > 0) {
        projected.types.set(typeName, {
          ...type,
          atoms: filteredAtoms
        });
      }
    });

    projected.atomCounter = projected.atoms.size;
    return projected;
  }

  /**
   * Creates a PyretDataInstance from a Pyret runtime object
   * 
   * @param pyretData - The root Pyret object to parse
   * @example
   * ```typescript
   * const instance = new PyretDataInstance(pyretTreeData);
   * console.log(instance.getAtoms()); // All atoms found in the tree
   * ```
   */
  constructor(pyretData: PyretObject) {
    this.parseTypes();
    this.parseObject(pyretData);
  }

  /**
   * Recursively parses a Pyret object and extracts atoms and relations
   */
  private parseObject(obj: PyretObject, parentId?: string): string {
    const atomId = this.generateAtomId();
    const type = this.extractType(obj);
    
    // Create atom for this object
    const atom: IAtom = {
      id: atomId,
      type: type,
      label: this.extractLabel(obj)
    };
    
    this.atoms.set(atomId, atom);

    // Parse dict fields as relations
    if (obj.dict) {
      Object.entries(obj.dict).forEach(([fieldName, fieldValue]) => {
        if (this.isAtomicValue(fieldValue)) {
          // Handle primitive values (numbers, strings, etc.)
          this.addValueRelation(fieldName, atomId, fieldValue);
        } else if (this.isPyretObject(fieldValue)) {
          // Handle nested Pyret objects
          const targetId = this.parseObject(fieldValue, atomId);
          this.addObjectRelation(fieldName, atomId, targetId);
        }
      });
    }

    return atomId;
  }

  /**
   * Extracts the type name from a Pyret object's brands
   */
  private extractType(obj: PyretObject): string {
    if (obj.$name) {
      return obj.$name;
    }
    
    if (obj.brands) {
      // Find the most specific brand (usually the last one alphabetically)
      const brandNames = Object.keys(obj.brands)
        .filter(brand => obj.brands[brand])
        .map(brand => brand.replace(/^\$brand/, ''))
        .filter(name => !name.match(/\d+$/)); // Remove numbered brands
      
      if (brandNames.length > 0) {
        return brandNames[brandNames.length - 1];
      }
    }

    return 'PyretObject';
  }

  /**
   * Extracts a display label from a Pyret object
   */
  private extractLabel(obj: PyretObject): string {
    if (obj.$name) {
      return obj.$name;
    }
    
    if (obj.dict?.value !== undefined) {
      return `${this.extractType(obj)}(${obj.dict.value})`;
    }
    
    return this.extractType(obj);
  }

  /**
   * Checks if a value is an atomic (primitive) value
   */
  private isAtomicValue(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || 
           typeof value === 'number' || 
           typeof value === 'boolean';
  }

  /**
   * Checks if an object is a Pyret object (has dict or brands)
   */
  private isPyretObject(obj: unknown): obj is PyretObject {
    return typeof obj === 'object' && 
           obj !== null && 
           ('dict' in obj || 'brands' in obj);
  }

  /**
   * Adds a relation from an atom to a primitive value
   */
  private addValueRelation(relationName: string, sourceId: string, value: string | number | boolean): void {
    const valueId = this.createValueAtom(value);
    this.addRelationTuple(relationName, sourceId, valueId);
  }

  /**
   * Adds a relation between two object atoms
   */
  private addObjectRelation(relationName: string, sourceId: string, targetId: string): void {
    this.addRelationTuple(relationName, sourceId, targetId);
  }

  /**
   * Creates an atom for a primitive value
   */
  private createValueAtom(value: string | number | boolean): string {
    const valueString = String(value);
    const existingAtom = Array.from(this.atoms.values())
      .find(atom => atom.label === valueString && atom.type === 'Value');
    
    if (existingAtom) {
      return existingAtom.id;
    }

    const atomId = this.generateAtomId();
    const atom: IAtom = {
      id: atomId,
      type: 'Value',
      label: valueString
    };
    
    this.atoms.set(atomId, atom);
    return atomId;
  }

  /**
   * Adds a tuple to a relation, creating the relation if it doesn't exist
   */
  private addRelationTuple(relationName: string, sourceId: string, targetId: string): void {
    const sourceAtom = this.atoms.get(sourceId);
    const targetAtom = this.atoms.get(targetId);
    
    if (!sourceAtom || !targetAtom) {
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

    const tuple: ITuple = {
      atoms: [sourceId, targetId],
      types: [sourceAtom.type, targetAtom.type]
    };

    relation.tuples.push(tuple);
  }

  /**
   * Initializes common Pyret types
   */
  private parseTypes(): void {
    const commonTypes = ['leaf', 'tnode', 'PyretObject', 'Value'];
    
    commonTypes.forEach(typeName => {
      const type: IType = {
        id: typeName,
        types: ['PyretObject'], // All inherit from PyretObject
        atoms: [],
        isBuiltin: typeName === 'PyretObject' || typeName === 'Value'
      };
      this.types.set(typeName, type);
    });
  }

  /**
   * Generates a unique atom ID
   */
  private generateAtomId(): string {
    return `atom_${++this.atomCounter}`;
  }

  // IDataInstance implementation
  getAtoms(): readonly IAtom[] {
    return Array.from(this.atoms.values());
  }

  getRelations(): readonly IRelation[] {
    return Array.from(this.relations.values());
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
      throw new Error(`Type '${atom.type}' not found`);
    }
    
    return type;
  }

  generateGraph(hideDisconnected: boolean = false, hideDisconnectedBuiltIns: boolean = false): Graph {
    const graph = new Graph({ directed: true, multigraph: true });
    
    // Add all atoms as nodes
    this.getAtoms().forEach(atom => {
      graph.setNode(atom.id, { 
        label: atom.label, 
        type: atom.type 
      });
    });
    
    // Add all relation tuples as edges
    this.getRelations().forEach(relation => {
      relation.tuples.forEach(tuple => {
        if (tuple.atoms.length === 2) {
          graph.setEdge(
            tuple.atoms[0], 
            tuple.atoms[1], 
            { label: relation.name }
          );
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
          const isBuiltin = atom && this.getAtomType(nodeId).isBuiltin;
          
          if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
            nodesToRemove.push(nodeId);
          }
        }
      });
      
      nodesToRemove.forEach(nodeId => graph.removeNode(nodeId));
    }
    
    return graph;
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
export function createPyretDataInstance(jsonString: string): PyretDataInstance {
  try {
    const pyretData = JSON.parse(jsonString) as PyretObject;
    return new PyretDataInstance(pyretData);
  } catch (error) {
    throw new Error(`Failed to parse Pyret JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Type guard to check if an IDataInstance is a PyretDataInstance
 * 
 * @param instance - IDataInstance to check
 * @returns True if the instance is a PyretDataInstance
 */
export function isPyretDataInstance(instance: IDataInstance): instance is PyretDataInstance {
  return instance instanceof PyretDataInstance;
}