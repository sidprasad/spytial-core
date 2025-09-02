import { Graph } from "graphlib";
import { IAtom, IDataInstance, IRelation, ITuple, IType } from "../interfaces";

/////// TODO: THis is still a work in progress.
/// FOr example, lists are still being collapsed in places (id vs name/label, etc).




/**
 * Atom structure as found in exampledatum.json
 */
interface RacketGAtom {
    id: string;
    label: string;
    type: string;
}

/**
 * Relation structure as found in exampledatum.json
 */
interface RacketGRelation {
    src: string;
    dst: string;
    label: string;
}

export function generateEdgeId(
    relation: IRelation,
    tuple: ITuple
): string {

    const relationId = relation.id;
    const atoms = tuple.atoms;
    return `${relationId}:${atoms.join('->')}`;
}


function atomListToTuple(atoms: IAtom[]): ITuple {

    return {
        atoms: atoms.map(a => a.id), // name or ID?
        types: atoms.map(a => a.type)
    };
}

/**
 * Adapts a RacketG-style datum to the IDataInstance interface.
 */
export class RacketGDataInstance implements IDataInstance {
    private readonly atoms: IAtom[];
    private readonly types: IType[];
    private readonly relations: IRelation[];

    /**
     * Construct from a datum in the exampledatum.json format.
     * @param datum - The parsed JSON object
     */
    constructor(datum: { atoms: RacketGAtom[]; relations: RacketGRelation[] }) {



        // Atoms
        this.atoms = datum.atoms.map(atom => 
            {
                return {
                    id: String(atom.id), // Using label as ID. We could change this later.
                    label : atom.label,
                    type: atom.type
                };
            });
        



        let typeMap = new Map<string, IAtom[]>();
        this.atoms.forEach(atom => {
            if (!typeMap.has(atom.type)) {
                typeMap.set(atom.type, []);
            }
            typeMap.get(atom.type)!.push(atom);
        });

        // Now create types from the atom map
        this.types = Array.from(typeMap.entries()).map(([typeId, atoms]) => ({
            id: typeId,
            types: [typeId], // For simplicity, type hierarchy is just the type itself
            atoms: atoms,
            isBuiltin: false // Assuming no built-in types in this example
        }));



        // Group relations by label
        const relationMap = new Map<string, { label: string; tuples: ITuple[]; types: string[] }>();

        datum.relations.forEach(rel => {

            const src = String(rel.src);
            const dst = String(rel.dst);


            const srcAtom = this.atoms.find(atom => atom.id === src);
            const dstAtom = this.atoms.find(atom => atom.id === dst);
            if (!srcAtom || !dstAtom) {
                throw new Error(`Relation references non-existent atoms: ${rel.src} or ${rel.dst}`);
            }
            if (!relationMap.has(rel.label)) {
                relationMap.set(rel.label, {
                    label: rel.label,
                    tuples: [],
                    types: [srcAtom.type, dstAtom.type]
                });
            }
            relationMap.get(rel.label)!.tuples.push(atomListToTuple([srcAtom, dstAtom]));
        });

        // Now create IRelation[] from the grouped map
        this.relations = Array.from(relationMap.entries()).map(([label, { tuples, types }]) => ({
            id: label,
            name: label,
            types,
            tuples
        }));










    }

    /**
     * Get the type of an atom by its ID.
     */
    getAtomType(id: string): IType {

        const atom = this.atoms.find(a => a.id === id);
        if (!atom) {
            throw new Error(`Atom with ID ${id} not found`);
        }

        // THis is **super** defensive, and may not be good.
        return this.types.find(t => t.id === atom.type) || {
            id: atom.type,
            types: [atom.type], // Assuming type hierarchy is just the type itself
            atoms: [atom],
            isBuiltin: false // Assuming no built-in types in this example
        };
    }

    /**
     * Get all types in the instance.
     */
    getTypes(): readonly IType[] {
        return this.types;
    }

    /**
     * Get all atoms in the instance.
     */
    getAtoms(): readonly IAtom[] {
        return this.atoms;
    }

    /**
     * Get all relations in the instance.
     */
    getRelations(): readonly IRelation[] {
        return this.relations;
    }

    /**
     * Apply projections to the data instance, returning a new instance with only the
     * atoms and relations that are in the given atomIds.
     * 
     * SidP: TODO: I'm not sure if this is the right interpretation of projections.
     * I don't think its the same as Alloy projections.
     */
    applyProjections(atomIds: string[]): IDataInstance {

        // TODO: NO PROJECTION FOR NOW.

        return this; // No projection applied, return the original instance


    }

    /**
     * Generate a graphlib Graph from the data instance.
     * 
     * 
     * TODO: This one is super behind the others for now.
     * 
     */
    generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph {

        const graph = new Graph({ directed: true, multigraph: true, compound: true });

        this.atoms.forEach(atom => {
            const nodeId = atom.id;
            // Set node with label object
            graph.setNode(nodeId, { label: atom.label });
        });


        this.relations.forEach(relation => {
            // You can add custom logic for attributes, arity, etc.
            const isAttribute = false; // Implement your own attribute detection if needed

            if (!isAttribute) {
                relation.tuples.forEach(tuple => {
                    const edgeId = generateEdgeId(relation, tuple);
                    const atoms = tuple.atoms;


                    const sourceIndex = 0;
                    const targetIndex = atoms.length - 1;

                    const source = atoms[sourceIndex];
                    const target = atoms[targetIndex];

                    if (source && target) {
                        const betweenTuples = atoms.slice(1, -1).join(',');
                        const tupleSuffix = betweenTuples.length > 0 ? `[${betweenTuples}]` : '';
                        const label = relation.name + tupleSuffix;

                        const source_node_id = source;
                        const target_node_id = target;

                        graph.setEdge(source_node_id, target_node_id, label, edgeId);
                    }
                });
            }
        });




        graph.nodes().forEach(node => {
            let outEdges = graph.outEdges(node) || [];
            let inEdges = graph.inEdges(node) || [];
            if (outEdges.length === 0 && inEdges.length === 0) {
                const isBuiltin = this.getAtomType(node).isBuiltin;
                if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
                    graph.removeNode(node);
                }
            }
        });
        return graph; // Return the graph as is for now, no filtering applied
    }


}