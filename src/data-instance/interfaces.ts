import { Graph } from "graphlib";

// Event types for data instance changes
export type DataInstanceEventType = 'atomAdded' | 'atomRemoved' | 'relationTupleAdded' | 'relationTupleRemoved';

export interface DataInstanceEvent {
  type: DataInstanceEventType;
  data: {
    atom?: IAtom;
    atomId?: string;
    relationId?: string;
    tuple?: ITuple;
  };
}

export type DataInstanceEventListener = (event: DataInstanceEvent) => void;

export interface IAtom  {
  
  
  id: string; // ID might have to be DIFFERENT FROM the NAME (these are the same in Alloy, but different elsewhere.)
  type: string;
  label: string; // Label for the atom, used for display purposes
  
  /**
   * Optional array of Skolem constant names that reference this atom.
   * Skolems are existentially quantified variables that Alloy/Forge produces
   * when solving constraints. They are displayed as attributes in visualizers
   * like Sterling and Alloy Analyzer.
   */
  skolems?: string[];
}


export interface ITuple {
  // ordered array of atom ids that comprise the tuple
  atoms: string[];
  // ordered array of types that comprise the tuple
  types: string[];
}



export interface IType {
    id: string;
    types: string[]; // Type hierarchy as an array of type ids, in ascending order
    atoms: IAtom[]; // Atoms defined by the type
    isBuiltin: boolean; // Flag indicating if the type is a built-in type
}

export interface IRelation {
  // the relation's unique identifier
  id: string;
  // the relation's name
  name: string;
  // the types that are allowed in the relation's tuples
  types: string[];
  // the relation's tuples
  tuples: ITuple[];
}


export interface IDataInstance {

    // To graph data

    getAtomType(id: string): IType;
    getTypes(): readonly IType[];
    getAtoms(): readonly IAtom[];
    getRelations(): readonly IRelation[]; // Assuming relations are just strings for simplicity

    applyProjections(atomIds: string[]) : IDataInstance;

    generateGraph(hideDisconnected : boolean, hideDisconnectedBuiltIns : boolean) : Graph;

}


export interface IInputDataInstance  extends IDataInstance {
  // Add atoms, relations, and types
  addAtom(atom: IAtom): void;
  addRelationTuple(relationId : string, t : ITuple): void;

  removeAtom(id: string): void;
  removeRelationTuple(relationId: string, t : ITuple ): void;

  // Event system for data instance changes
  addEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void;
  removeEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void;
  
  // And a method to re-ify the data instance
  // to something in the source language / format.
  // E.g. in Forge this would return a Forge instance.
  reify(): unknown;


  // Add atoms / relations / types from another data instance.
  /**
   * Adds atoms and relations from another data instance to this one.
   * @param dataInstance The data instance to add atoms and relations from.
   * @param unifyBuiltIns If true, values of built-in types will be unified with existing ones.
   * @returns true if the data instance was added successfully, false if there were conflicts.
   */
  addFromDataInstance(dataInstance: IDataInstance, unifyBuiltIns : boolean): boolean; 
}