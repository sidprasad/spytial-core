import type { IDataInstance, IAtom, IType, IRelation, ITuple, IInputDataInstance, DataInstanceEventType, DataInstanceEventListener, DataInstanceEvent } from './interfaces';
import type { AlloyType, AlloyAtom, AlloyRelation, AlloyTuple } from './alloy/alloy-instance';
import { addInstanceAtom, addInstanceRelationTuple, removeInstanceRelationTuple, AlloyInstance, removeInstanceAtom } from './alloy/alloy-instance';
import { 
  getInstanceAtoms,
  getInstanceTypes,
  getInstanceRelations,
  getInstanceAtom,
  getSkolemNamesForAtom
} from './alloy/alloy-instance';
import { getAtomType } from './alloy/alloy-instance/src/atom';
import { isBuiltin } from './alloy/alloy-instance/src/type';
import { applyProjections } from './alloy/alloy-instance/src/projection';
import { generateGraph } from './alloy/alloy-graph';
import { Graph } from 'graphlib';

/**
 * Implementation of IDataInstance for Alloy instances
 * Wraps the existing AlloyInstance to provide the IDataInstance interface
 */
export class AlloyDataInstance implements IInputDataInstance {
  /** Event listeners for data instance changes */
  private eventListeners = new Map<DataInstanceEventType, Set<DataInstanceEventListener>>();

  constructor(private alloyInstance: AlloyInstance) {}

  /**
   * Add an event listener for data instance changes
   */
  addEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  /**
   * Remove an event listener for data instance changes
   */
  removeEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  private emitEvent(event: DataInstanceEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in data instance event listener:', error);
        }
      });
    }
  }

  /**
   * Get type information for a specific atom
   * 
   * @param atomId - ID of the atom
   * @returns Type information implementing IType interface
   */
  public getAtomType(atomId: string): IType {
    const alloyType = getAtomType(this.alloyInstance, atomId);
    
    // Convert AlloyType to IType
    return {
      id: alloyType.id,
      types: alloyType.types,
      atoms: alloyType.atoms.map((atom: AlloyAtom) => {
        const skolemNames = getSkolemNamesForAtom(this.alloyInstance, atom.id);
        return {
          id: atom.id,
          label: atom.id,
          type: atom.type,
          skolems: skolemNames.length > 0 ? skolemNames : undefined
        };
      }),
      isBuiltin: isBuiltin(alloyType)
    };
  }

  /**
   * Get all types defined in this instance
   * 
   * @returns Array of all types implementing IType interface
   */
  public getTypes(): readonly IType[] {
    const alloyTypes = getInstanceTypes(this.alloyInstance);
    
    return alloyTypes.map((alloyType: AlloyType) => ({
      id: alloyType.id,
      types: alloyType.types,
      atoms: alloyType.atoms.map((atom: AlloyAtom) => {
        const skolemNames = getSkolemNamesForAtom(this.alloyInstance, atom.id);
        return {
          id: atom.id,
          type: atom.type,
          label: atom.id,
          skolems: skolemNames.length > 0 ? skolemNames : undefined
        };
      }),
      isBuiltin: isBuiltin(alloyType)
    }));
  }

  /**
   * Get all atoms in this instance
   * 
   * @returns Array of all atoms implementing IAtom interface
   */
  public getAtoms(): readonly IAtom[] {
    const alloyAtoms = getInstanceAtoms(this.alloyInstance);
    
    return alloyAtoms.map((alloyAtom: AlloyAtom) => {
      const skolemNames = getSkolemNamesForAtom(this.alloyInstance, alloyAtom.id);
      return {
        id: alloyAtom.id,
        type: alloyAtom.type,
        label: alloyAtom.id,
        skolems: skolemNames.length > 0 ? skolemNames : undefined
      };
    });
  }

  /**
   * Get all relations in this instance
   * 
   * @returns Array of all relations implementing IRelation interface
   */
  public getRelations(): readonly IRelation[] {
    const alloyRelations = getInstanceRelations(this.alloyInstance);
    
    return alloyRelations.map((alloyRelation: AlloyRelation) => ({
      id: alloyRelation.id,
      name: alloyRelation.name, 
      types: alloyRelation.types,
      tuples: alloyRelation.tuples.map((tuple: AlloyTuple) => ({
        atoms: tuple.atoms,
        types: tuple.types
      }))
    }));
  }

  /**
   * Apply projections to filter/transform the instance
   * Creates a new instance with filtered data based on provided atom IDs
   * 
   * @param atomIds - Array of atom IDs to project onto
   * @returns New filtered AlloyDataInstance
   */
  public applyProjections(atomIds: string[]): AlloyDataInstance {
    const projectedAlloyInstance = applyProjections(this.alloyInstance, atomIds);
    return new AlloyDataInstance(projectedAlloyInstance);
  }

  /**
   * Generate graph representation of this instance
   * Uses the existing alloy-graph generateGraph function
   * 
   * @param hideDisconnected - Whether to hide disconnected nodes
   * @param hideDisconnectedBuiltIns - Whether to hide disconnected built-in nodes
   * @returns Graph representation using graphlib.Graph
   */
  public generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph {
    return generateGraph(this.alloyInstance, hideDisconnected, hideDisconnectedBuiltIns);
  }

  /**
   * Get the underlying AlloyInstance for backward compatibility
   * 
   * @returns The wrapped AlloyInstance
   */
  public getAlloyInstance(): AlloyInstance {
    return this.alloyInstance;
  }


  /**
   * Reify the instance to a Forge INST.
   * 
   * @returns An inst string representation of the AlloyInstance
   */
  public reify(): string {
    let inst = "";

    const instName = "builtinstance"; // Generate a unique name readable name.


    const PREFIX = `inst ${instName} {`;

    const POSTFIX = "}";

    // First declare all the ATOMS (I think in order?)
    let instanceTypes = this.alloyInstance.types;
    
    // Create a dict where the key is the type id and the value is the atoms
    let typeAtoms : Record<string, string[]> = {};
    for (let typeId in instanceTypes) {
        let type = instanceTypes[typeId];
        let atoms = type.atoms;
        typeAtoms[typeId] = atoms.map(atom => `\`${atom.id}`);
    }

    // Then declare all the relations
    let instanceRelations = this.alloyInstance.relations;
    let relationDecls : Record<string, string[]> = {};

    for (let relationId in instanceRelations) {
        let relation = instanceRelations[relationId];
        let tuples = relation.tuples;
        let tupleStrings = tuples.map(tuple => {
            let tupleString = tuple.atoms.map(a => `\`${a}`).join("->");
            return `(${tupleString})`;
        });

        let relName = relation.name;

        relationDecls[relName] = tupleStrings;
    }

    // Now we can create the inst string
    // First, declare all the atoms in order
    for (let typeId in typeAtoms) {
        let atoms = typeAtoms[typeId];
        if(atoms.length > 0) {
            inst += `${typeId} = ${atoms.join("+")}\n`;
        }
    }

    // Then declare all the relations
    for (let relationId in relationDecls) {
        let tuples = relationDecls[relationId];
        if (tuples.length > 0) {
            inst += `${relationId} = ${tuples.join("+")}\n`;
        }
        else {
            inst += `no ${relationId}\n`;
        }
    }
    return `${PREFIX}\n${inst}\n${POSTFIX}`;
  }


  /**
   * Remove an atom by ID
   * 
   * @param id - ID of the atom to remove
   */
  public removeAtom(id: string): void {
    
    // We actually have to 
    this.alloyInstance = removeInstanceAtom(this.alloyInstance, id);
    
    // Emit event
    this.emitEvent({
      type: 'atomRemoved',
      data: { atomId: id }
    });
  }

  public addAtom(atom: IAtom): void {
    // Convert IAtom to AlloyAtom
    const alloyAtom: AlloyAtom = {
      _: 'atom',
      id: atom.id,
      type: atom.type,
      
    };
    this.alloyInstance = addInstanceAtom(this.alloyInstance, alloyAtom);
    
    // Emit event
    this.emitEvent({
      type: 'atomAdded',
      data: { atom }
    });
  }

  public addRelationTuple(relationId: string, tuple: ITuple): void {
    // Convert ITuple to AlloyTuple
    const alloyTuple: AlloyTuple = {
      _: 'tuple',
      atoms: tuple.atoms,
      types: tuple.types
    };
    this.alloyInstance = addInstanceRelationTuple(this.alloyInstance, relationId, alloyTuple);
    
    // Emit event
    this.emitEvent({
      type: 'relationTupleAdded',
      data: { relationId, tuple }
    });
  }

  public removeRelationTuple(relationId: string, t: ITuple): void {
    
    // Convert ITuple to AlloyTuple
    const alloyTuple: AlloyTuple = {
      _: 'tuple',
      atoms: t.atoms,
      types: t.types
    };


    this.alloyInstance = removeInstanceRelationTuple(this.alloyInstance, relationId, alloyTuple);
    
    // Emit event
    this.emitEvent({
      type: 'relationTupleRemoved',
      data: { relationId, tuple: t }
    });
  }

  /**
   * Adds data from another AlloyDataInstance to this instance.
   * 
   * @param dataInstance - The data instance to add from.
   * @param unifyBuiltIns - Whether to unify built-in types (reuse existing ones).
   * @returns True if the operation is successful, false otherwise.
   */
  public addFromDataInstance(dataInstance: IDataInstance, unifyBuiltIns: boolean): boolean {
    // Ensure the input is an AlloyDataInstance
    if (!isAlloyDataInstance(dataInstance)) {
      return false;
    }

    const alloyInstance = dataInstance.getAlloyInstance();
    const reIdMap = new Map<string, string>();

    // Add atoms
    getInstanceAtoms(alloyInstance).forEach(atom => {
      const isBuiltin = this.getAtomType(atom.id).isBuiltin;

      if (unifyBuiltIns && isBuiltin) {
        // Check if the built-in atom already exists
        const existingAtom = this.getAtoms().find(
          existing => existing.type === atom.type && existing.label === atom.id
        );

        if (existingAtom) {
          // Map the original atom ID to the existing atom ID
          reIdMap.set(atom.id, existingAtom.id);
          return; // Skip adding this atom
        }
      }

      // Generate a new ID for the atom to avoid conflicts
      const newId = `atom_${this.getAtoms().length + 1}`;
      reIdMap.set(atom.id, newId);

      // Use the addAtom method to add the atom
      this.addAtom({
        id: newId,
        type: atom.type,
        label: atom.id, // Use the original ID as the label
      });
    });

    // Add relations
    getInstanceRelations(alloyInstance).forEach(relation => {
      relation.tuples.forEach(tuple => {
        const mappedTuple: ITuple = {
          atoms: tuple.atoms.map(atomId => reIdMap.get(atomId) || atomId),
          types: tuple.types,
        };

        // Use the addRelationTuple method to add the tuple
        this.addRelationTuple(relation.id, mappedTuple);
      });
    });

    // Add types
    getInstanceTypes(alloyInstance).forEach(type => {
      const existingType = this.getTypes().find(t => t.id === type.id);
      if (!existingType) {
        // Add the type if it doesn't exist.
        // I *think* built-in types already exist in the instance.
        this.alloyInstance.types[type.id] = {
          _: 'type',
          id: type.id,
          types: type.types,
          atoms: type.atoms.map(atom => ({
            _: 'atom',
            id: reIdMap.get(atom.id) || atom.id,
            type: atom.type,
          })),
          meta: {
            builtin: false,
            abstract: false,
            enum: false,
            one: false,
            private: false,
          },
        };
      } else {
        // If the type already exists, i think we are good.
      }
    });

    return true;
  }
}

/**
 * Factory function to create AlloyDataInstance from AlloyInstance
 * 
 * @param alloyInstance - AlloyInstance to wrap
 * @returns IDataInstance implementation for Alloy
 */
export function createAlloyDataInstance(alloyInstance: AlloyInstance): IDataInstance {
  return new AlloyDataInstance(alloyInstance);
}

/**
 * Type guard to check if an IDataInstance is an AlloyDataInstance
 * 
 * @param instance - IDataInstance to check
 * @returns True if the instance is an AlloyDataInstance
 */
export function isAlloyDataInstance(instance: IDataInstance): instance is AlloyDataInstance {
  return instance instanceof AlloyDataInstance;
}


/**
 * Creates an empty AlloyDataInstance with default Alloy built-in types
 * Includes fundamental types like univ, Int, seq/Int that are always present in Alloy
 * 
 * @returns A new AlloyDataInstance with built-in types but no user-defined atoms or relations
 */
export function createEmptyAlloyDataInstance(): AlloyDataInstance {
  // Default built-in types that should always be present in Alloy instances
  const defaultTypes: Record<string, AlloyType> = {
    'univ': {
      _: 'type',
      id: 'univ',
      types: [],
      atoms: [],
      meta: {
        builtin: true,
        abstract: false,
        enum: false,
        one: false,
        private: false
      }
    },
    'Int': {
      _: 'type', 
      id: 'Int',
      types: ['Int', 'univ'],
      atoms: [  ],
      meta: {
        builtin: true,
        abstract: false,
        enum: false,
        one: false,
        private: false
      }
    },
    'seq/Int': {
      _: 'type',
      id: 'seq/Int', 
      types: ['seq/Int', 'univ'],
      atoms: [],
      meta: {
        builtin: true,
        abstract: false,
        enum: false,
        one: false,
        private: false
      }
    }
  };


  const emptyAlloyInstance: AlloyInstance = {
    types: defaultTypes,
    relations: {},
    skolems: {}
  };

  return new AlloyDataInstance(emptyAlloyInstance);
}