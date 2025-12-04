import { Graph } from 'graphlib';
import type { IDataInstance, IAtom, IRelation, IType, ITuple } from '../interfaces';

/**
 * Normalized representation of a TLA+ value coming from a trace or state dump.
 * The interface intentionally mirrors the minimal data commonly present in
 * counterexample JSON emitted by tools like TLC/Apalache.
 */
export interface TlaValue {
  /** Optional type label from the source tool (e.g., "Int", "Bool", "Set(Int)") */
  readonly type?: string;
  /** Raw value as emitted in the JSON trace */
  readonly value: unknown;
}

/**
 * A single state in a TLA+ execution trace.
 */
export interface TlaState {
  /** Optional human friendly name (e.g., "Init", "Step 1") */
  readonly name?: string;
  /** Mapping of variable names to their values in this state */
  readonly variables: Record<string, TlaValue | unknown>;
}

/**
 * Top-level TLA+ datum describing a trace. Each state is converted into a
 * `State` atom and each variable assignment becomes a relation tuple from the
 * owning state atom to the atom representing the value.
 */
export interface TlaDatum {
  readonly states: TlaState[];
  /** Optional loop index (Apalache-style) to close the trace */
  readonly loop?: number;
}

interface NormalizedTlaData {
  atoms: IAtom[];
  relations: IRelation[];
  types: IType[];
  builtinTypes: Set<string>;
}

/**
 * IDataInstance implementation for TLA+ traces. The instance models:
 * - `State` atoms for each step in the trace
 * - Atoms for every variable value in each state
 * - Variable-specific relations connecting states to their values
 * - A `Next` relation connecting successive states (and the loop edge when present)
 *
 * Several TLA+ toolchains (e.g., TLC/Apalache) can emit DOT state graphs for
 * debugging. The `State` atom + `Next` relation structure mirrors those exports
 * so the generated graph can be visually compared against the DOT output using
 * the existing DotDataInstance.
 */
export class TlaDataInstance implements IDataInstance {
  private readonly atoms: IAtom[];
  private readonly relations: IRelation[];
  private readonly types: IType[];
  private readonly builtinTypes: Set<string>;
  private readonly datum: TlaDatum;

  constructor(datum: TlaDatum, normalized?: NormalizedTlaData) {
    this.datum = datum;

    if (normalized) {
      this.atoms = normalized.atoms;
      this.relations = normalized.relations;
      this.types = normalized.types;
      this.builtinTypes = normalized.builtinTypes;
    } else {
      const processed = this.normalizeDatum(datum);
      this.atoms = processed.atoms;
      this.relations = processed.relations;
      this.types = processed.types;
      this.builtinTypes = processed.builtinTypes;
    }
  }

  /** Get a type definition for a specific atom id. */
  getAtomType(id: string): IType {
    const atom = this.atoms.find(a => a.id === id);
    if (!atom) {
      throw new Error(`Atom with ID '${id}' not found in TLA+ datum.`);
    }

    const type = this.types.find(t => t.id === atom.type);
    if (!type) {
      throw new Error(`Type '${atom.type}' not found for atom '${id}'.`);
    }

    return type;
  }

  /** Return all known types. */
  getTypes(): readonly IType[] {
    return this.types;
  }

  /** Return all atoms. */
  getAtoms(): readonly IAtom[] {
    return this.atoms;
  }

  /** Return all relations. */
  getRelations(): readonly IRelation[] {
    return this.relations;
  }

  /** Create a projected instance containing only the requested atoms and their incident tuples. */
  applyProjections(atomIds: string[]): IDataInstance {
    const allowed = new Set(atomIds);
    const atoms = this.atoms.filter(atom => allowed.has(atom.id));

    const relations = this.relations
      .map(relation => {
        const tuples = relation.tuples.filter(tuple => tuple.atoms.every(atomId => allowed.has(atomId)));
        if (tuples.length === 0) {
          return null;
        }
        return { ...relation, tuples } as IRelation;
      })
      .filter((relation): relation is IRelation => relation !== null);

    const types = this.rebuildTypes(atoms);

    return new TlaDataInstance(this.datum, {
      atoms,
      relations,
      types,
      builtinTypes: new Set(this.builtinTypes),
    });
  }

  /** Convert the instance into a graphlib Graph for layout algorithms. */
  generateGraph(hideDisconnected: boolean = false, hideDisconnectedBuiltIns: boolean = false): Graph {
    const graph = new Graph({ directed: true, multigraph: true });

    this.atoms.forEach(atom => {
      graph.setNode(atom.id, {
        id: atom.id,
        label: atom.label,
        type: atom.type,
        isBuiltin: this.isAtomBuiltin(atom),
      });
    });

    this.relations.forEach(relation => {
      relation.tuples.forEach((tuple, tupleIndex) => {
        if (tuple.atoms.length >= 2) {
          const sourceId = tuple.atoms[0];
          const targetId = tuple.atoms[tuple.atoms.length - 1];
          const edgeName = `${relation.id}_${tupleIndex}`;
          graph.setEdge(sourceId, targetId, relation.name, edgeName);
        } else if (tuple.atoms.length === 1) {
          const atomId = tuple.atoms[0];
          const edgeName = `${relation.id}_${tupleIndex}`;
          graph.setEdge(atomId, atomId, relation.name, edgeName);
        }
      });
    });

    if (hideDisconnected || hideDisconnectedBuiltIns) {
      const connectedNodes = new Set<string>();
      graph.edges().forEach(edge => {
        connectedNodes.add(edge.v);
        connectedNodes.add(edge.w);
      });

      graph.nodes().forEach(node => {
        const nodeData = graph.node(node) as { isBuiltin?: boolean } | undefined;
        const isBuiltin = nodeData?.isBuiltin ?? false;
        const shouldHide = hideDisconnected && !connectedNodes.has(node);
        const shouldHideBuiltin = hideDisconnectedBuiltIns && isBuiltin && !connectedNodes.has(node);

        if (shouldHide || shouldHideBuiltin) {
          graph.removeNode(node);
        }
      });
    }

    return graph;
  }

  /** Normalize the raw datum into atoms, relations, and types. */
  private normalizeDatum(datum: TlaDatum): NormalizedTlaData {
    const atoms: IAtom[] = [];
    const relationTuples = new Map<string, { name: string; types: string[]; tuples: ITuple[] }>();
    const typeMap = new Map<string, IAtom[]>();
    const builtinTypes = new Set<string>();

    const registerType = (typeId: string, isBuiltin: boolean, atom: IAtom): void => {
      if (!typeMap.has(typeId)) {
        typeMap.set(typeId, []);
      }
      typeMap.get(typeId)!.push(atom);
      if (isBuiltin) {
        builtinTypes.add(typeId);
      }
    };

    const stateType = 'State';

    datum.states.forEach((state, index) => {
      const stateId = `state_${index}`;
      const stateAtom: IAtom = {
        id: stateId,
        type: stateType,
        label: state.name ?? `State ${index + 1}`,
      };
      atoms.push(stateAtom);
      registerType(stateType, true, stateAtom);

      Object.entries(state.variables ?? {}).forEach(([varName, rawValue]) => {
        const value = this.normalizeValue(rawValue);
        const valueType = this.inferType(value);
        const valueAtom: IAtom = {
          id: `${stateId}.${varName}`,
          type: valueType,
          label: `${varName} = ${this.describeValue(value.value)}`,
        };

        atoms.push(valueAtom);
        registerType(valueType, this.isBuiltinType(valueType), valueAtom);

        const tuple: ITuple = {
          atoms: [stateId, valueAtom.id],
          types: [stateType, valueType],
        };

        if (!relationTuples.has(varName)) {
          relationTuples.set(varName, {
            name: varName,
            types: [stateType, valueType],
            tuples: [],
          });
        }

        relationTuples.get(varName)!.tuples.push(tuple);
      });
    });

    const relations: IRelation[] = Array.from(relationTuples.entries()).map(([id, relation]) => ({
      id,
      name: relation.name,
      types: relation.types,
      tuples: relation.tuples,
    }));

    const nextTuples: ITuple[] = [];
    for (let i = 0; i < datum.states.length - 1; i++) {
      nextTuples.push({ atoms: [`state_${i}`, `state_${i + 1}`], types: [stateType, stateType] });
    }

    if (datum.loop !== undefined && datum.loop >= 0 && datum.loop < datum.states.length) {
      const lastIndex = datum.states.length - 1;
      nextTuples.push({ atoms: [`state_${lastIndex}`, `state_${datum.loop}`], types: [stateType, stateType] });
    }

    if (nextTuples.length > 0) {
      relations.push({ id: 'Next', name: 'Next', types: [stateType, stateType], tuples: nextTuples });
    }

    const types: IType[] = Array.from(typeMap.entries()).map(([typeId, atomsForType]) => ({
      id: typeId,
      types: [typeId],
      atoms: atomsForType,
      isBuiltin: builtinTypes.has(typeId),
    }));

    return { atoms, relations, types, builtinTypes };
  }

  private rebuildTypes(atoms: IAtom[]): IType[] {
    const typeMap = new Map<string, IAtom[]>();

    atoms.forEach(atom => {
      if (!typeMap.has(atom.type)) {
        typeMap.set(atom.type, []);
      }
      typeMap.get(atom.type)!.push(atom);
    });

    return Array.from(typeMap.entries()).map(([typeId, atomsForType]) => ({
      id: typeId,
      types: [typeId],
      atoms: atomsForType,
      isBuiltin: this.builtinTypes.has(typeId),
    }));
  }

  private normalizeValue(raw: TlaValue | unknown): TlaValue {
    if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
      return raw as TlaValue;
    }
    return { value: raw as unknown };
  }

  private inferType(value: TlaValue): string {
    if (value.type && value.type.trim().length > 0) {
      return value.type.trim();
    }

    const val = value.value;
    if (Array.isArray(val)) {
      return 'Seq';
    }

    switch (typeof val) {
      case 'number':
        return Number.isInteger(val) ? 'Int' : 'Real';
      case 'boolean':
        return 'Bool';
      case 'string':
        return 'String';
      case 'object':
        return val === null ? 'Null' : 'Record';
      default:
        return 'Unknown';
    }
  }

  private describeValue(val: unknown): string {
    if (typeof val === 'string') {
      return val;
    }
    if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
      return String(val);
    }
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  private isBuiltinType(typeId: string): boolean {
    return ['State', 'Int', 'Real', 'Bool', 'String'].includes(typeId);
  }

  private isAtomBuiltin(atom: IAtom): boolean {
    return this.builtinTypes.has(atom.type);
  }
}

/**
 * Factory to create an IDataInstance from a TLA+ datum.
 */
export function createTlaDataInstance(datum: TlaDatum): IDataInstance {
  return new TlaDataInstance(datum);
}

/**
 * Type guard for narrowing IDataInstance to TlaDataInstance.
 */
export function isTlaDataInstance(instance: IDataInstance): instance is TlaDataInstance {
  return instance instanceof TlaDataInstance;
}
