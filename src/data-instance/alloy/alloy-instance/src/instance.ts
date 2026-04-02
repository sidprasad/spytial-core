import { AlloyAtom, atomIsOfType } from './atom';
import {
  AlloyRelation,
  getRelationTuples,
  relationsFromElements
} from './relation';
import { AlloyTuple } from './tuple';
import {
  AlloyType,
  findAndPopulateIntType,
  getTypeAtoms,
  typesFromElements
} from './type';
import { keyBy } from './util';
import { typeHierarchiesFromElement, typeNamesFromElement } from './xml';

/**
 * An Alloy-format instance. Note that this is a distinct type from the AlloyInstance used 
 * in the ScriptView component's alloy-proxy. 
 */
export interface AlloyInstance {
  types: Record<string, AlloyType>;
  relations: Record<string, AlloyRelation>;
  skolems: Record<string, AlloyRelation>;
}

export function getInstanceAtom(
  instance: AlloyInstance,
  atomId: string
): AlloyAtom {
  const foundAtom = getInstanceAtoms(instance).find(
    (atom) => atom.id === atomId
  );
  if (!foundAtom) throw new Error(`Could not find atom with id ${atomId}`);
  return foundAtom;
}

export function getInstanceAtoms(instance: AlloyInstance): AlloyAtom[] {
  return getInstanceTypes(instance)
    .map(getTypeAtoms)
    .reduce((prev, curr) => prev.concat(curr), []);
}

/**
 * 
 * @param instance AlloyInstance
 * @param atomId Id of the atom to remove
 * @returns A new AlloyInstance with the atom removed.
 */
export function removeInstanceAtom(
  instance: AlloyInstance,
  atomId: string): AlloyInstance {
  const atom = getInstanceAtom(instance, atomId);
  const newTypes = { ...instance.types };
  const newRelations = { ...instance.relations };
  const newSkolems = { ...instance.skolems };
  // Remove the atom from its type
  const type = instance.types[atom.type];
  if (type) {
    const filteredAtoms = type.atoms.filter((a) => a.id !== atomId);
    if (filteredAtoms.length === 0) {
      delete newTypes[type.id];
    } else {
      newTypes[atom.type] = { ...type, atoms: filteredAtoms };
    }
    // Remove from relations — create new relation objects to avoid mutating originals
    // Keep relations even if they end up with 0 tuples (only removeInstanceRelationTuple
    // deletes empty relations, since atom removal is a cascade side-effect)
    for (const [key, relation] of Object.entries(instance.relations)) {
      const filtered = relation.tuples.filter((tuple) => !tuple.atoms.includes(atomId));
      newRelations[key] = { ...relation, tuples: filtered };
    }
    // Remove from skolems — create new skolem objects to avoid mutating originals
    for (const [key, skolem] of Object.entries(instance.skolems)) {
      const filtered = skolem.tuples.filter((tuple) => !tuple.atoms.includes(atomId));
      newSkolems[key] = { ...skolem, tuples: filtered };
    }
    return {
      types: newTypes,
      relations: newRelations,
      skolems: newSkolems
    };
  } else {
    throw new Error(`Could not find type for atom ${atomId}`);
  }
}

export function addInstanceAtom(instance: AlloyInstance, atom: AlloyAtom): AlloyInstance {
  const newTypes = { ...instance.types };
  
  // If the type EXISTS, we can add the atom to it.
  // ELSE, we need to create a new type for the atom.

  
  const type = newTypes[atom.type];


  // [SP TODO]: This isn't super robust to type heirarchies, but it works for now.
  if (!type) {


    // Get the type

    // Create a new type for the atom
    const newType : AlloyType = {
      _: 'type',
      id: atom.type,
      types: [atom.type, 'univ'], // The type hierarchy is just the atom's type for now
      atoms: [atom]
    };
    newTypes[newType.id] = newType;
  }
  else {
      newTypes[atom.type] = { ...type, atoms: [...type.atoms, atom] };
  }
  return {
    ...instance,
    types: newTypes
  };
}


export function removeInstanceRelationTuple(
  instance: AlloyInstance,
  relationId: string,
  tuple: AlloyTuple): AlloyInstance {
  const relation = getInstanceRelation(instance, relationId);
  const newRelations = { ...instance.relations };
  const newSkolems = { ...instance.skolems };

  // Structural comparison — the incoming tuple is a freshly constructed object,
  // so reference equality (===) will never match the stored tuple.
  const tuplesEqual = (a: AlloyTuple, b: AlloyTuple): boolean =>
    a.atoms.length === b.atoms.length && a.atoms.every((atom, i) => atom === b.atoms[i]);

  // Remove the tuple from the relation — create new object to avoid mutating original
  const filteredTuples = relation.tuples.filter((t) => !tuplesEqual(t, tuple));
  if (filteredTuples.length === 0) {
    delete newRelations[relation.id];
  } else {
    newRelations[relation.id] = { ...relation, tuples: filteredTuples };
  }
  // Remove the tuple from skolems — create new objects to avoid mutating originals
  for (const [key, skolem] of Object.entries(instance.skolems)) {
    const filtered = skolem.tuples.filter((t) => !tuplesEqual(t, tuple));
    if (filtered.length === 0) {
      delete newSkolems[key];
    } else {
      newSkolems[key] = { ...skolem, tuples: filtered };
    }
  }
  return {
    ...instance,
    relations: newRelations,
    skolems: newSkolems
  };
}


export function addInstanceRelationTuple(
  instance: AlloyInstance,
  relationId: string,
  tuple: AlloyTuple): AlloyInstance {
  let relation = instance.relations[relationId];
  const newRelations = { ...instance.relations };
  const newSkolems = { ...instance.skolems };

  if (!relation) {
    // Create a new relation if it doesn't exist
    newRelations[relationId] = {
      id: relationId,
      name: relationId,
      tuples: [tuple],
      types: tuple.types,
      _: 'relation',
    };
  } else {
    // Add the tuple to a new copy of the relation — avoid mutating original
    newRelations[relation.id] = { ...relation, tuples: [...relation.tuples, tuple] };
  }
  // [SP TODO]: Don't worry about skolems for now
  return {
    ...instance,
    relations: newRelations,
    skolems: newSkolems
  };
}



export function getInstanceAtomsOfType(
  instance: AlloyInstance,
  type: AlloyType | string
): AlloyAtom[] {
  return getInstanceAtoms(instance).filter((atom) =>
    atomIsOfType(instance, atom, type)
  );
}

export function getInstanceRelation(
  instance: AlloyInstance,
  relation: string
): AlloyRelation {
  const rel = instance.relations[relation];
  if (!rel) throw new Error(`Could not find relation ${relation}`);
  return rel;
}

export function getInstanceRelations(instance: AlloyInstance): AlloyRelation[] {
  return Object.values(instance.relations);
}

export function getInstanceSkolems(instance: AlloyInstance): AlloyRelation[] {
  return Object.values(instance.skolems)
}

export function getInstanceRelationsAndSkolems(instance: AlloyInstance): AlloyRelation[] {
  const skolemsArray = getInstanceSkolems(instance)
  const relationsArray = getInstanceRelations(instance)
  return skolemsArray.concat(relationsArray)
}

/**
 * Get the Skolem names associated with a given atom.
 * This returns an array of Skolem names that contain the specified atom in their tuples.
 * 
 * @param instance The instance to search for Skolems
 * @param atomId The ID of the atom to find Skolem associations for
 * @returns Array of Skolem names that reference this atom
 */
export function getSkolemNamesForAtom(instance: AlloyInstance, atomId: string): string[] {
  const skolemNames: string[] = [];
  
  for (const skolem of Object.values(instance.skolems)) {
    for (const tuple of skolem.tuples) {
      if (tuple.atoms.includes(atomId)) {
        skolemNames.push(skolem.name);
        break; // Only add each skolem name once per atom
      }
    }
  }
  
  return skolemNames;
}


export function getInstanceTuples(instance: AlloyInstance): AlloyTuple[] {
  return getInstanceRelations(instance)
    .map(getRelationTuples)
    .reduce((prev, curr) => prev.concat(curr), []);
}

export function getInstanceType(
  instance: AlloyInstance,
  typeId: string
): AlloyType {
  const type = instance.types[typeId];
  if (!type) throw new Error(`Could not find type with id ${typeId}`);
  return type;
}

/**
 * Get all types in an instance.
 * @param instance
 */
export function getInstanceTypes(instance: AlloyInstance): AlloyType[] {
  return Object.values(instance.types);
}

/**
 * Create an instance object from and <instance> element.
 *
 * @param element An <instance> element.
 */
export function instanceFromElement(element: Element): AlloyInstance {
  const bitwidth = element.getAttribute('bitwidth');
  if (!bitwidth) throw new Error('No bitwidth found in instance');

  const typeNames = typeNamesFromElement(element);
  const typeHierarchies = typeHierarchiesFromElement(typeNames, element);
  const types = typesFromElements(
    typeHierarchies,
    element.querySelectorAll('sig')
  );
  const relations = relationsFromElements(
    typeNames,
    element.querySelectorAll('field')
  );

  const skolems = relationsFromElements(
    typeNames,
    element.querySelectorAll('skolem')
  )

  findAndPopulateIntType(parseInt(bitwidth), types);
  return {
    types: keyBy(types, (t) => t.id),
    relations: keyBy(relations, (r) => r.id),
    skolems: keyBy(skolems, (s) => s.id)
  };
}



