import type { AlloyInstance } from './alloy/alloy-instance';
import type { IAtom, IDataInstance, ITuple } from './interfaces';

/** Authoritative declarations, supplied by a host. Never inferred from tuples. */
export interface EditSchema {
  types: { id: string; parents: string[]; builtin?: boolean; abstract?: boolean; min?: number; max?: number }[];
  relations: { id: string; name: string; columns: string[] }[];
}

export interface StructuralIssue {
  code: 'unknown-type' | 'unknown-relation' | 'missing-atom' | 'type-mismatch' | 'arity' | 'abstract-type' | 'multiplicity';
  severity: 'error' | 'incomplete';
  message: string;
  atomIds: string[];
  relationId?: string;
}

export interface StructuralValidation {
  status: 'unavailable' | 'invalid' | 'incomplete' | 'valid';
  issues: StructuralIssue[];
}

/** Alloy XML carries `one` signatures, but not field multiplicity declarations. */
export function editSchemaFromAlloy(instance: AlloyInstance): EditSchema {
  return {
    types: Object.values(instance.types).map(t => ({
      id: t.id, parents: [...t.types], builtin: !!t.meta?.builtin,
      abstract: !!t.meta?.abstract,
      ...(t.meta?.one ? { min: 1, max: 1 } : {}),
    })),
    relations: Object.values(instance.relations).map(r => ({
      id: r.id, name: r.name, columns: [...r.types],
    })),
  };
}

export function atomFitsType(instance: IDataInstance, schema: EditSchema, atom: IAtom, expected: string): boolean {
  // Include explicit memberships, e.g. overlapping subset signatures, as well
  // as the atom's primary type. Traverse declarations, not observed edges.
  const memberships = new Set([atom.type]);
  for (const type of instance.getTypes()) {
    if (type.atoms.some(a => a.id === atom.id)) memberships.add(type.id);
  }
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === expected) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return schema.types.find(t => t.id === id)?.parents.some(visit) ?? false;
  };
  return [...memberships].some(visit);
}

export function checkRelationTuple(instance: IDataInstance, schema: EditSchema, relationId: string, tuple: ITuple): StructuralIssue[] {
  const relation = schema.relations.find(r => r.id === relationId);
  const issue = (code: StructuralIssue['code'], message: string, atomIds = tuple.atoms): StructuralIssue =>
    ({ code, severity: 'error', message, atomIds: [...atomIds], relationId });
  if (!relation) return [issue('unknown-relation', `Relation "${relationId}" is not declared in this model.`)];
  if (tuple.atoms.length !== relation.columns.length) {
    return [issue('arity', `Relation "${relation.name}" needs ${relation.columns.length} atoms; this tuple has ${tuple.atoms.length}.`)];
  }
  const atoms = instance.getAtoms();
  return tuple.atoms.flatMap((id, i) => {
    const atom = atoms.find(a => a.id === id);
    if (!atom) return [issue('missing-atom', `Relation "${relation.name}" refers to missing atom "${id}".`, [id])];
    const expected = relation.columns[i];
    return atomFitsType(instance, schema, atom, expected) ? [] : [issue('type-mismatch',
      `Relation "${relation.name}", position ${i + 1}, needs ${expected}; "${id}" is ${atom.type}.`, [id])];
  });
}

/** Structural validity only. `valid` does not certify model or layout properties. */
export function validateInstanceStructure(instance: IDataInstance | null, schema?: EditSchema | null): StructuralValidation {
  if (!instance || !schema) return { status: 'unavailable', issues: [] };
  const issues: StructuralIssue[] = [];
  const atoms = [...new Map(instance.getAtoms().map(a => [a.id, a])).values()];
  for (const atom of atoms) {
    const type = schema.types.find(t => t.id === atom.type);
    if (!type) issues.push({ code: 'unknown-type', severity: 'error', atomIds: [atom.id],
      message: `Type "${atom.type}" is not declared in this model.` });
    else if (type.abstract) issues.push({ code: 'abstract-type', severity: 'error', atomIds: [atom.id],
      message: `"${atom.id}" needs a concrete subtype of abstract signature ${type.id}.` });
  }
  for (const type of schema.types) {
    if (type.builtin) continue;
    const members = atoms.filter(a => atomFitsType(instance, schema, a, type.id));
    if (type.min !== undefined && members.length < type.min) {
      issues.push({ code: 'multiplicity', severity: 'incomplete', atomIds: members.map(a => a.id),
        message: `${type.id} needs at least ${type.min} atom(s); currently ${members.length}.` });
    }
    if (type.max !== undefined && members.length > type.max) {
      issues.push({ code: 'multiplicity', severity: 'error', atomIds: members.map(a => a.id),
        message: `${type.id} allows at most ${type.max} atom(s); currently ${members.length}.` });
    }
  }
  for (const relation of instance.getRelations()) {
    if (!schema.relations.some(r => r.id === relation.id)) {
      issues.push({ code: 'unknown-relation', severity: 'error', relationId: relation.id,
        atomIds: relation.tuples.flatMap(t => t.atoms), message: `Relation "${relation.name}" is not declared in this model.` });
      continue;
    }
    for (const tuple of relation.tuples) issues.push(...checkRelationTuple(instance, schema, relation.id, tuple));
  }
  return { status: issues.some(i => i.severity === 'error') ? 'invalid' : issues.length ? 'incomplete' : 'valid', issues };
}
