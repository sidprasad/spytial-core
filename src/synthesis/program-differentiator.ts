import { JSONDataInstance } from '../data-instance/json-data-instance';
import type { IDataInstance, IType, IRelation, IAtom, ITuple } from '../data-instance/interfaces';
import { parseLayoutSpec } from '../layout/layoutspec';
import { SGraphQueryEvaluator } from '../evaluators/sgq-evaluator';

interface RelationSchema {
  relationId: string;
  relationName: string;
  arity: number;
  tupleTypes: string[];
}

export interface ProgramDiffWitness {
  /** Data instance that produces a distinguishable selector manifest across both programs. */
  instance: IDataInstance;
  /** Canonical fingerprints for each program on the witness instance. */
  manifests: {
    programA: string;
    programB: string;
  };
}

export interface ProgramDiffWitnessOptions {
  /** Number of atoms per type to try while synthesizing candidates. */
  atomCountCandidates?: number[];
}

/**
 * Attempts to synthesize an IDataInstance (respecting the input schema) that
 * manifests differently under two Spytial programs.
 *
 * The witness search is selector-driven: it extracts selectors from each layout
 * program, evaluates them on schema-preserving candidate instances, and returns
 * the first candidate whose canonical manifest differs.
 */
export function findProgramDiffWitness(
  schemaSource: IDataInstance,
  programA: string,
  programB: string,
  options: ProgramDiffWitnessOptions = {}
): ProgramDiffWitness | null {
  const selectors = Array.from(new Set([
    ...extractSelectors(programA),
    ...extractSelectors(programB),
  ])).filter(Boolean);

  // If there are no selectors to compare, there is no observable program diff.
  if (selectors.length === 0) {
    return null;
  }

  const candidateSizes = options.atomCountCandidates ?? [1, 2, 3];
  const typePool = getConcreteTypes(schemaSource.getTypes());
  const relationSchemas = inferRelationSchemas(schemaSource);

  for (const atomsPerType of candidateSizes) {
    const candidate = createCandidateInstance(typePool, relationSchemas, atomsPerType);
    const manifestA = computeManifest(programA, candidate, selectors);
    const manifestB = computeManifest(programB, candidate, selectors);

    if (manifestA !== manifestB) {
      return {
        instance: candidate,
        manifests: {
          programA: manifestA,
          programB: manifestB,
        },
      };
    }
  }

  return null;
}

function getConcreteTypes(types: IType[]): string[] {
  const builtIn = new Set(['Int', 'String', 'Bool', 'univ']);
  const concrete = types
    .filter((t) => !t.isBuiltin && !builtIn.has(t.id))
    .map((t) => t.id);

  // Preserve at least one type so the candidate is never empty.
  return concrete.length > 0 ? concrete : ['Entity'];
}

function inferRelationSchemas(source: IDataInstance): RelationSchema[] {
  const relations = source.getRelations();
  return relations.map((relation) => {
    const arity = relation.types.length > 0
      ? relation.types.length
      : relation.tuples[0]?.atoms.length ?? 2;

    const tupleTypes = relation.types.length > 0
      ? relation.types
      : inferTupleTypesFromTuple(relation, source, arity);

    return {
      relationId: relation.id,
      relationName: relation.name,
      arity,
      tupleTypes,
    };
  });
}

function inferTupleTypesFromTuple(
  relation: IRelation,
  source: IDataInstance,
  arity: number
): string[] {
  const sample = relation.tuples[0];
  if (!sample) {
    return Array.from({ length: arity }, () => 'Entity');
  }

  return sample.atoms.map((atomId) => source.getAtomType(atomId).id);
}

function createCandidateInstance(
  typePool: string[],
  relationSchemas: RelationSchema[],
  atomsPerType: number
): IDataInstance {
  const atomsByType = new Map<string, string[]>();
  const atoms: IAtom[] = [];
  const types: IType[] = [];

  for (const type of typePool) {
    const atomIds: string[] = [];
    for (let i = 0; i < atomsPerType; i++) {
      const id = `${type.toLowerCase()}_${i + 1}`;
      atomIds.push(id);
      atoms.push({ id, type, label: id, labels: [] });
    }

    atomsByType.set(type, atomIds);
    types.push({ id: type, types: [type], atoms: atomIds, isBuiltin: false });
  }

  const relations: IRelation[] = relationSchemas.map((schema) => {
    const tuples = buildCandidateTuples(schema, atomsByType, atomsPerType);
    return {
      id: schema.relationId,
      name: schema.relationName,
      types: schema.tupleTypes,
      tuples,
    };
  });

  return new JSONDataInstance({ atoms, relations, types });
}

function buildCandidateTuples(
  schema: RelationSchema,
  atomsByType: Map<string, string[]>,
  atomsPerType: number
): ITuple[] {
  if (schema.tupleTypes.length === 0) {
    return [];
  }

  const tuples: ITuple[] = [];
  const fallbackAtomId = getFallbackAtomId(atomsByType);

  const baseAtoms = schema.tupleTypes.map((type) => {
    const ids = atomsByType.get(type);
    if (ids && ids.length > 0) {
      return ids[0];
    }

    // Fallback for schema/reference mismatches.
    return fallbackAtomId;
  });
  tuples.push({ atoms: baseAtoms, types: schema.tupleTypes });

  if (atomsPerType > 1) {
    const shiftedAtoms = schema.tupleTypes.map((type) => {
      const ids = atomsByType.get(type);
      if (ids && ids.length > 1) {
        return ids[1];
      }
      return ids?.[0] ?? fallbackAtomId;
    });
    tuples.push({ atoms: shiftedAtoms, types: schema.tupleTypes });
  }

  if (schema.arity >= 2 && atomsPerType > 1) {
    const zigzagAtoms = schema.tupleTypes.map((type, idx) => {
      const ids = atomsByType.get(type);
      if (!ids || ids.length === 0) {
        return fallbackAtomId;
      }
      return ids[idx % Math.min(2, ids.length)];
    });

    const zigzagKey = zigzagAtoms.join('|');
    const existing = new Set(tuples.map((t) => t.atoms.join('|')));
    if (!existing.has(zigzagKey)) {
      tuples.push({ atoms: zigzagAtoms, types: schema.tupleTypes });
    }
  }

  return tuples;
}


function getFallbackAtomId(atomsByType: Map<string, string[]>): string {
  for (const ids of atomsByType.values()) {
    if (ids.length > 0) {
      return ids[0];
    }
  }

  throw new Error('Cannot build candidate witness: no atoms available in type pool');
}

function extractSelectors(program: string): string[] {
  const spec = parseLayoutSpec(program);
  const selectors: string[] = [];

  spec.constraints.orientation.relative.forEach((constraint) => selectors.push(constraint.selector));
  spec.constraints.orientation.cyclic.forEach((constraint) => selectors.push(constraint.selector));
  spec.constraints.alignment.forEach((constraint) => selectors.push(constraint.selector));
  spec.constraints.grouping.byselector.forEach((constraint) => selectors.push(constraint.selector));

  spec.directives.atomColors.forEach((directive) => selectors.push(directive.selector));
  spec.directives.sizes.forEach((directive) => selectors.push(directive.selector));
  spec.directives.icons.forEach((directive) => selectors.push(directive.selector));
  spec.directives.edgeColors.forEach((directive) => {
    if (directive.selector) selectors.push(directive.selector);
    if (directive.filter) selectors.push(directive.filter);
  });
  spec.directives.attributes.forEach((directive) => {
    if (directive.selector) selectors.push(directive.selector);
    if (directive.filter) selectors.push(directive.filter);
  });
  spec.directives.tags.forEach((directive) => {
    selectors.push(directive.toTag);
    selectors.push(directive.value);
  });
  spec.directives.hiddenFields.forEach((directive) => {
    if (directive.selector) selectors.push(directive.selector);
    if (directive.filter) selectors.push(directive.filter);
  });
  spec.directives.inferredEdges.forEach((directive) => selectors.push(directive.selector));
  spec.directives.hiddenAtoms.forEach((directive) => selectors.push(directive.selector));

  return selectors.filter((selector) => typeof selector === 'string' && selector.trim().length > 0);
}

function computeManifest(program: string, instance: IDataInstance, selectors: string[]): string {
  // Ensure parse-level normalization is reflected in the fingerprint.
  const parsedSpec = parseLayoutSpec(program);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });

  const selectorChunks = selectors
    .map((selector) => {
      try {
        const result = evaluator.evaluate(selector);
        if (result.isError()) {
          return `${selector}=ERROR:${result.prettyPrint()}`;
        }

        if (result.isSingleton()) {
          return `${selector}=SINGLE:${String(result.singleResult())}`;
        }

        const raw = result.getRawResult();
        if (!Array.isArray(raw)) {
          return `${selector}=EMPTY`;
        }

        const tuples = raw
          .map((tuple) => tuple.map((entry) => String(entry)).join('->'))
          .sort();
        return `${selector}=TUPLES:${tuples.join(',')}`;
      } catch (error) {
        return `${selector}=THROW:${error instanceof Error ? error.message : String(error)}`;
      }
    })
    .sort();

  const specShape = JSON.stringify(parsedSpec);
  return `${specShape}||${selectorChunks.join('||')}`;
}
