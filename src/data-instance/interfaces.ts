import { Graph } from "graphlib";

/**
 * Event types that can be emitted by data instance changes.
 */
export type DataInstanceEventType = 'atomAdded' | 'atomRemoved' | 'relationTupleAdded' | 'relationTupleRemoved';

/**
 * Event object emitted when data instance changes occur.
 */
export interface DataInstanceEvent {
  /** The type of event that occurred */
  type: DataInstanceEventType;
  /** Event payload data */
  data: {
    /** The atom that was added/removed (if applicable) */
    atom?: IAtom;
    /** The ID of the atom that was affected (if applicable) */
    atomId?: string;
    /** The ID of the relation that was affected (if applicable) */
    relationId?: string;
    /** The tuple that was added/removed (if applicable) */
    tuple?: ITuple;
  };
}

/**
 * Function type for handling data instance events.
 */
export type DataInstanceEventListener = (event: DataInstanceEvent) => void;

/**
 * Represents an atom in the data instance - a basic entity with an identity, type, and display label.
 * 
 * @example
 * ```typescript
 * const atom: IAtom = {
 *   id: 'person1',
 *   type: 'Person', 
 *   label: 'Alice'
 * };
 * ```
 */
export interface IAtom  {
  /** Unique identifier for the atom (may differ from the label/name) */
  id: string;
  /** Type classification of the atom */
  type: string;
  /** Display label for the atom, used in visualizations */
  label: string;
}

/**
 * Represents a tuple in a relation - an ordered collection of atoms.
 * 
 * @example
 * ```typescript
 * const tuple: ITuple = {
 *   atoms: ['person1', 'person2'],
 *   types: ['Person', 'Person']
 * };
 * ```
 */
export interface ITuple {
  /** Ordered array of atom IDs that comprise the tuple */
  atoms: string[];
  /** Ordered array of types corresponding to the atoms */
  types: string[];
}

/**
 * Represents a type definition in the data instance, including its hierarchy and associated atoms.
 */
export interface IType {
    /** Unique identifier for the type */
    id: string;
    /** Type hierarchy as an array of type IDs, in ascending order */
    types: string[];
    /** Atoms that belong to this type */
    atoms: IAtom[];
    /** Flag indicating if the type is a built-in system type */
    isBuiltin: boolean;
}

/**
 * Represents a relation in the data instance - a named collection of tuples with defined types.
 * 
 * @example
 * ```typescript
 * const relation: IRelation = {
 *   id: 'friends',
 *   name: 'Friends',
 *   types: ['Person', 'Person'],
 *   tuples: [
 *     { atoms: ['person1', 'person2'], types: ['Person', 'Person'] }
 *   ]
 * };
 * ```
 */
export interface IRelation {
  /** Unique identifier for the relation */
  id: string;
  /** Display name of the relation */
  name: string;
  /** Types that are allowed in the relation's tuples */
  types: string[];
  /** Collection of tuples that belong to this relation */
  tuples: ITuple[];
}

/**
 * Core interface for read-only data instances that can generate graph representations.
 * Provides access to atoms, types, relations, and graph generation capabilities.
 */
export interface IDataInstance {
    /**
     * Gets the type information for an atom by its ID.
     * @param id - The atom ID to look up
     * @returns The type information for the atom
     */
    getAtomType(id: string): IType;
    
    /**
     * Gets all type definitions in the data instance.
     * @returns Readonly array of all types
     */
    getTypes(): readonly IType[];
    
    /**
     * Gets all atoms in the data instance.
     * @returns Readonly array of all atoms
     */
    getAtoms(): readonly IAtom[];
    
    /**
     * Gets all relations in the data instance.
     * @returns Readonly array of all relations
     */
    getRelations(): readonly IRelation[];

    /**
     * Creates a new data instance with only the specified atoms and their related data.
     * @param atomIds - Array of atom IDs to include in the projection
     * @returns New data instance containing only the projected data
     */
    applyProjections(atomIds: string[]) : IDataInstance;

    /**
     * Generates a graph representation of the data instance.
     * @param hideDisconnected - Whether to hide disconnected atoms
     * @param hideDisconnectedBuiltIns - Whether to hide disconnected built-in atoms
     * @returns Graph representation of the data
     */
    generateGraph(hideDisconnected : boolean, hideDisconnectedBuiltIns : boolean) : Graph;
}

/**
 * Interface for mutable data instances that support adding and removing atoms and relations.
 * Extends the read-only IDataInstance with mutation operations.
 */
export interface IInputDataInstance  extends IDataInstance {
  /**
   * Adds a new atom to the data instance.
   * @param atom - The atom to add
   */
  addAtom(atom: IAtom): void;
  
  /**
   * Adds a tuple to the specified relation.
   * @param relationId - The ID of the relation to add the tuple to
   * @param t - The tuple to add
   */
  addRelationTuple(relationId : string, t : ITuple): void;

  /**
   * Removes an atom from the data instance by its ID.
   * @param id - The ID of the atom to remove
   */
  removeAtom(id: string): void;
  
  /**
   * Removes a tuple from the specified relation.
   * @param relationId - The ID of the relation to remove the tuple from
   * @param t - The tuple to remove
   */
  removeRelationTuple(relationId: string, t : ITuple ): void;

  // Event system for data instance changes
  addEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void;
  removeEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void;
  
  // And a method to re-ify the data instance
  // to something in the source language / format.
  // E.g. in Forge this would return a Forge instance.
  reify(): unknown;
}