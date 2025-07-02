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
  const type = newTypes[atom.type];
  if (type) {
    type.atoms = type.atoms.filter((a) => a.id !== atomId);
    if (type.atoms.length === 0) {
      delete newTypes[type.id];
    }
    // Remove from relations
    Object.values(newRelations).forEach((relation) => {
      relation.tuples = relation.tuples.filter((tuple) => !tuple.atoms.includes(atomId));
    });
    // Remove from skolems
    Object.values(newSkolems).forEach((skolem) => {
      skolem.tuples = skolem.tuples.filter((tuple) => !tuple.atoms.includes(atomId));
    });
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
    // Create a new type for the atom
    const newType : AlloyType = {
      _: 'type',
      id: atom.type,
      types: [atom.type], // The type hierarchy is just the atom's type for now
      atoms: [atom]
    };
    newTypes[newType.id] = newType;
  }
  else {
      type.atoms.push(atom);
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
  // Remove the tuple from the relation
  relation.tuples = relation.tuples.filter((t) => t !== tuple);
  // If the relation has no tuples left, remove it from the instance
  if (relation.tuples.length === 0) {
    delete newRelations[relation.id];
  } else {
    newRelations[relation.id] = relation;
  }
  // Remove the tuple from skolems
  Object.values(newSkolems).forEach((skolem) => {
    skolem.tuples = skolem.tuples.filter((t) => t !== tuple);
    if (skolem.tuples.length === 0) {
      delete newSkolems[skolem.id];
    } else {
      newSkolems[skolem.id] = skolem;
    }
  });
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
    relation = {
      id: relationId,
      name: relationId,
      tuples: [tuple],
      types: tuple.types,
      _: 'relation',
    };
    newRelations[relationId] = relation;
  } else {
    // Add the tuple to the relation
    relation.tuples.push(tuple);
    newRelations[relation.id] = relation;
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



