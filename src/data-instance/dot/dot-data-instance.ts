import { Graph } from 'graphlib';
import parse from 'graphlib-dot';
import type { IAtom, IType, IRelation, IInputDataInstance, ITuple } from '../interfaces';
import { Tuple } from '../../evaluators';


/**
 * Simple DOT data instance implementation
 * Converts DOT graphs to the IDataInstance interface with proper type handling
 * Leverages type information from DOT annotations and builtin type detection
 */
export class DotDataInstance implements IInputDataInstance {


  private graph: Graph;
  constructor(dotSpec: string) {

    // This graph is the source of truth for the data instance.
    // Each node has its type and label as properties.
    this.graph = parse.read(dotSpec);

    // For each edge, remove it and then re-add it with label and name.
    this.graph.edges().forEach(edge => {
      const edgeData = this.graph.edge(edge);
      if (edgeData && edgeData.label) {
        // Remove the edge first
        this.graph.removeEdge(edge);
        // Re-add it with label and name
        this.addEdge(edge.v, edge.w, edgeData.label);
      }
    });
  }


  private addEdge(v: string, w: string, label: string): void {
    const name = `${v}-${w}-${label}`;
    // Add an edge with a label and an optional name
    this.graph.setEdge(v, w, label, name);
  }


  reify(): string {
    // Convert the graph back to DOT format
    return parse.write(this.graph);
  }


  getAtoms(): readonly IAtom[] {
    const atoms: IAtom[] = [];
    this.graph.nodes().forEach((nodeId) => {
      const node = this.graph.node(nodeId);
      if (node && node.label) {
        atoms.push({
          id: nodeId,
          type: node.type || 'unknown',
          label: node.label
        });
      }
    });
    return atoms;
  }

  getAtomType(id: string): IType {
    const node = this.graph.node(id);
    if (!node) {
      throw new Error(`Atom with id ${id} not found`);
    }

    const t = node.type || 'unknown';

    return {
      id: t,
      types: [t],
      atoms: this.getAtoms().filter(atom => atom.type === t),
      isBuiltin: false // Assuming no built-in types in DOT
    };
  }

  getTypes(): readonly IType[] {

    // First get Atom types, then dedup.
    const atoms = this.getAtoms();
    const typeMap: Record<string, IType> = {};
    atoms.forEach(atom => {
      const typeId = atom.type || 'unknown';
      if (!typeMap[typeId]) {
        typeMap[typeId] = {
          id: typeId,
          types: [typeId],
          atoms: [],
          isBuiltin: false // Assuming no built-in types in DOT
        };
      }
      typeMap[typeId].atoms.push(atom);
    }
    );
    return Object.values(typeMap);
  }

  // TODO: Fix.
  applyProjections(atomIds: string[]): DotDataInstance {
    // const newGraph = new Graph();

    // atomIds.forEach(id => {
    //   const node = this.graph.node(id);
    //   if (node) {
    //     newGraph.setNode(id, { ...node });
    //   }
    // });

    // // Copy edges
    // this.graph.edges().forEach(edge => {
    //   if (newGraph.hasNode(edge.v) && newGraph.hasNode(edge.w)) {
    //     newGraph.setEdge(edge.v, edge.w, this.graph.edge(edge));
    //   }
    // });

    // return new DotDataInstance(parse.write(newGraph));

    console.log('applyProjections is not implemented for DotDataInstance');
    return this;
  }




  generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph {

    // TODO: This modifies the GRAPH IN PLACE, which is not ideal right?

    // const graph = new Graph({ directed: true, multigraph: true, compound: true });

    // // Copy over this.graph nodes and edges
    // this.graph.nodes().forEach(nodeId => {
    //   const node = this.graph.node(nodeId);
    //   if (node) {
    //     graph.setNode(nodeId, { label: node.label, type: node.type });
    //   }
    // });
    // this.graph.edges().forEach(edge => {
    //   graph.setEdge(edge.v, edge.w, this.graph.edge(edge));
    // });




    this.graph.nodes().forEach(node => {
      let outEdges = this.graph.outEdges(node) || [];
      let inEdges = this.graph.inEdges(node) || [];
      if (outEdges.length === 0 && inEdges.length === 0) {
        const isBuiltin = this.getAtomType(node).isBuiltin;
        if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
          this.graph.removeNode(node);
        }
      }
    });
    return this.graph; // Return the graph as is for now, no filtering applied
  }



  getRelations(): readonly IRelation[] {
    
    // First, each relation comes from an edge in the graph.
    const relationMap = new Map<string, { label: string; tuples: ITuple[]; types: string[] }>();
    

    // Now for each edge, we create a relation in the relationMap.
    this.graph.edges().forEach(edge => {
      const source = edge.v;
      const target = edge.w;
      const label = this.graph.edge(edge) || '';
      
      // Create a tuple from the edge
      const tuple: ITuple = {
        atoms: [source, target],
        types: [this.getAtomType(source).id, this.getAtomType(target).id]
      };

      if (!relationMap.has(label)) {
        relationMap.set(label, { label, tuples: [], types: tuple.types });
      }
      relationMap.get(label)!.tuples.push(tuple);
    });

    // Convert the relationMap to an array of IRelation
    const relations: IRelation[] = [];
    relationMap.forEach((value, key) => {
      relations.push({
        id: key,
        name: key,
        types: value.types,
        tuples: value.tuples
      });
    }
    );
    return relations;
  }



  addAtom(atom: IAtom): void {
    if (this.graph.hasNode(atom.id)) {
      throw new Error(`Atom with id ${atom.id} already exists`);
    }
    this.graph.setNode(atom.id, { type: atom.type, label: atom.label });
  }

  addRelationTuple(relationId : string, t : ITuple): void {
    
    // Add the edge in the graph that corresponds to this tuple
    const source = t.atoms[0];
    const target = t.atoms[t.atoms.length - 1];
    const edgeName = `${relationId}:${t.atoms.join('-')}`;
    if (this.graph.hasEdge(source, target, edgeName)) {
      throw new Error(`Relation tuple ${relationId} with atoms ${t.atoms.join(', ')} already exists`);
    }
    this.addEdge(source, target, relationId);

  }

  removeRelationTuple(relationId: string, t : ITuple): void {
   
    // Remove the edge in the graph that corresponds to this tuple
    const source = t.atoms[0];
    const target = t.atoms[t.atoms.length - 1];
    const edgeName = `${relationId}:${t.atoms.join('-')}`;
    if (this.graph.hasEdge(source, target, edgeName)) {
      this.graph.removeEdge(source, target, edgeName);
    } else {
      throw new Error(`Relation tuple ${relationId} with atoms ${t.atoms.join(', ')} does not exist`);
    }
  }

  removeAtom(id: string): void {
    if (!this.graph.hasNode(id)) {
      throw new Error(`Atom with id ${id} does not exist`);
    }
    
    // Remove by its ID (I believe graphlib does the rest.)
    this.graph.removeNode(id);
  }


}
  
