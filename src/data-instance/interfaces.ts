
// import { applyProjections } from '../data-instance/alloy-instance/src/projection';

import { Graph } from "graphlib";



export interface IAtom  {
  id: string;
  type: string;
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

    getAtomType(id: string): IType | undefined;
    getTypes(): readonly IType[];
    getAtoms(): readonly IAtom[];
    getRelations(): readonly IRelation[]; // Assuming relations are just strings for simplicity

    applyProjections(atomIds: string[]) : IDataInstance;

    // TODO: Do we really need these options here?
    generateGraph(hideDisconnected : boolean, hideDisconnectedBuiltIns : boolean) : Graph;
}
