import { Graph } from "graphlib";
import { IAtom, IDataInstance, IRelation, ITuple, IType } from "../interfaces";

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




function atomListToTuple(atoms: IAtom[]): ITuple {

    return {
        atoms: atoms.map(a => a.id),
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
    private readonly graph: Graph;

    /**
     * Construct from a datum in the exampledatum.json format.
     * @param datum - The parsed JSON object
     */
    constructor(datum: { atoms: RacketGAtom[]; relations: RacketGRelation[] }) {



        // Atoms
        this.atoms = datum.atoms.map(atom => ({
            id: atom.id,
            //label: atom.label,
            type: atom.type
        }));



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
            const srcAtom = this.atoms.find(atom => atom.id === rel.src);
            const dstAtom = this.atoms.find(atom => atom.id === rel.dst);
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












        // Optionally, build a graphlib Graph for generateGraph
        this.graph = new Graph();
        this.atoms.forEach(atom => this.graph.setNode(atom.id, atom));
        datum.relations.forEach(rel => {
            this.graph.setEdge(rel.src, rel.dst, rel.label);
        });
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
     */
    applyProjections(atomIds: string[]): IDataInstance {
        // Create a Set for fast lookup
        const atomIdSet = new Set(atomIds);

        // Filter atoms
        const projectedAtoms = this.atoms.filter(atom => atomIdSet.has(atom.id));

        // Filter relations: only keep tuples where all atoms are in the projected set
        const projectedRelations = this.relations
            .map(rel => {
                const filteredTuples = rel.tuples.filter(tuple =>
                    tuple.atoms.every(atomId => atomIdSet.has(atomId))
                );
                return { ...rel, tuples: filteredTuples };
            })
            .filter(rel => rel.tuples.length > 0);

        // Filter types: only include types with at least one atom in the projection
        const projectedTypes = this.types
            .map(type => {
                const filteredAtoms = type.atoms.filter(atom => atomIdSet.has(atom.id));
                return { ...type, atoms: filteredAtoms };
            })
            .filter(type => type.atoms.length > 0);

        // Build a new graph with only projected atoms and edges between them
        const projectedGraph = new Graph();
        projectedAtoms.forEach(atom => projectedGraph.setNode(atom.id, atom));
        projectedRelations.forEach(rel => {
            rel.tuples.forEach(tuple => {
                if (tuple.atoms.length === 2) {
                    projectedGraph.setEdge(tuple.atoms[0], tuple.atoms[1], rel.name);
                }
            });
        });

        // Return a new instance
        const projectedDatum = {
            atoms: projectedAtoms,
            relations: []
        };
        // Reconstruct relations in the original input format for the constructor
        projectedRelations.forEach(rel => {
            rel.tuples.forEach(tuple => {
                if (tuple.atoms.length === 2) {
                    projectedDatum.relations.push({
                        src: tuple.atoms[0],
                        dst: tuple.atoms[1],
                        label: rel.name
                    });
                }
            });
        });

        return new RacketGDataInstance(projectedDatum);
    }

    /**
     * Utility to deep copy a graphlib Graph.
     * @param source - The source Graph to copy
     * @returns A new deep-copied Graph
     */
    private deepCopyGraph(source: Graph): Graph {
        const copy = new Graph({ directed: source.isDirected(), multigraph: source.isMultigraph(), compound: source.isCompound() });
        source.nodes().forEach(node => {
            copy.setNode(node, JSON.parse(JSON.stringify(source.node(node))));
        });
        source.edges().forEach(edge => {
            copy.setEdge(
                edge.v,
                edge.w,
                JSON.parse(JSON.stringify(source.edge(edge))),
                edge.name
            );
        });
        // Copy parent relationships if compound
        if (source.isCompound()) {
            source.nodes().forEach(node => {
                const parent = source.parent(node);
                if (parent !== undefined) {
                    copy.setParent(node, parent);
                }
            });
        }
        return copy;
    }

    /**
     * Generate a graphlib Graph from the data instance.
     */
    generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph {

        // Deep copy the underlying graph
        let g = this.deepCopyGraph(this.graph);


        g.nodes().forEach(node => {
            let outEdges = g.outEdges(node) || [];
            let inEdges = g.inEdges(node) || [];
            if (outEdges.length === 0 && inEdges.length === 0) {
                const isBuiltin = this.getAtomType(node).isBuiltin;
                if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
                    g.removeNode(node);
                }
            }
        });
        return g;
    }
}