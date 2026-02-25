/**
 * Projection Transform Module
 * 
 * Provides a standalone, pre-layout data instance transformation that applies
 * projections to an IDataInstance. Projections are a form of metaprogramming:
 * they rewrite the datum itself by removing projected atoms and collapsing
 * relation arities, producing a new IDataInstance that downstream consumers
 * (layout, export, analysis) can operate on naively.
 * 
 * This module is intentionally decoupled from the layout engine. Projections
 * are a semantic transformation on the model, not a visual/constraint concern.
 * 
 * @module projection-transform
 */

import { IDataInstance, IType } from './interfaces';

/**
 * A projection specifying which type (sig) to project over,
 * and optionally how to order the atoms of that type.
 */
export interface Projection {
  /** The type/sig name to project over */
  sig: string;
  /** 
   * Optional ordering specification for atoms of this type.
   * When provided with an evaluator via ProjectionTransformOptions,
   * atoms are topologically sorted according to the tuples returned
   * by evaluating this selector.
   */
  orderBy?: string;
}

/**
 * The result of selecting a specific atom for a projected type.
 * Used to populate projection UI controls (dropdowns).
 */
export interface ProjectionChoice {
  /** The projected type/sig name */
  type: string;
  /** The currently selected atom ID for this type */
  projectedAtom: string;
  /** All available atoms for this type, in display order */
  atoms: string[];
}

/**
 * Options for configuring projection transform behavior.
 */
export interface ProjectionTransformOptions {
  /**
   * Optional evaluator function for `orderBy` selectors.
   * When a Projection has an `orderBy` field, this function
   * is called with the selector string and should return an array of
   * [from, to] tuple pairs defining a partial order on atoms.
   * 
   * If not provided, orderBy fields are ignored and atoms are
   * sorted lexicographically.
   */
  evaluateOrderBy?: (selector: string) => string[][];

  /**
   * Optional error handler for orderBy evaluation failures.
   * If not provided, errors are silently caught and atoms fall back
   * to lexicographic ordering.
   */
  onOrderByError?: (selector: string, error: unknown) => void;
}

/**
 * The result of applying a projection transform to a data instance.
 */
export interface ProjectionTransformResult {
  /** The transformed data instance with projections applied */
  instance: IDataInstance;
  /** The projection choices made, for populating UI controls */
  choices: ProjectionChoice[];
}


/**
 * Applies projections to a data instance, producing a new
 * IDataInstance with projected types/atoms removed and relation arities
 * reduced accordingly.
 * 
 * This is the core pre-layout transformation step. It:
 * 1. Resolves which atoms belong to each projected sig (including subtypes)
 * 2. Orders atoms per sig (via orderBy or lexicographic fallback)
 * 3. Selects the active atom per sig (from user selections or defaults to first)
 * 4. Delegates to IDataInstance.applyProjections() for the actual data rewrite
 * 
 * **Evaluation-order dependency:** The `evaluateOrderBy` callback is invoked
 * *before* `instance.applyProjections()` is called, so it evaluates against the
 * **original, un-projected** data instance. This is intentional — the ordering
 * relation (e.g., `next: Time → Time`) involves atoms of the projected type,
 * which are removed by projection. The caller must therefore initialise the
 * evaluator with the original instance, not the projected one:
 *
 * ```
 * evaluator.initialize({ sourceData: originalInstance })   // ← full data
 * applyProjectionTransform(originalInstance, ...)           // ← orderBy runs here
 * layoutInstance.generateLayout(projectedInstance)          // ← layout on projected
 * ```
 *
 * Layout selectors evaluated later (step 3) still work correctly: atom IDs
 * returned by the evaluator that no longer exist in the projected graph are
 * silently filtered out during node matching.
 *
 * @param instance - The source data instance to project
 * @param projections - The projections (which sigs to project over)
 * @param selections - User selections mapping type/sig name → chosen atom ID.
 *                     This object is mutated to fill in defaults for unset projections.
 * @param options - Optional configuration (orderBy evaluator, error handler)
 * @returns The projected data instance and the finalized projection choices
 * 
 * @example
 * ```typescript
 * import { applyProjectionTransform } from 'spytial-core';
 * 
 * const result = applyProjectionTransform(
 *   dataInstance,
 *   [{ sig: 'State', orderBy: 'next' }],
 *   { State: 'State0' },
 *   { evaluateOrderBy: (sel) => evaluator.evaluate(sel).selectedTwoples() }
 * );
 * 
 * // result.instance is the projected IDataInstance
 * // result.choices has the dropdown metadata
 * ```
 */
export function applyProjectionTransform(
  instance: IDataInstance,
  projections: Projection[],
  selections: Record<string, string>,
  options: ProjectionTransformOptions = {}
): ProjectionTransformResult {
  const projectedSigs = projections.map(d => d.sig);
  
  if (projectedSigs.length === 0) {
    return { instance, choices: [] };
  }

  const allTypes = instance.getTypes();

  // For each projected sig, collect atoms from all types that include
  // this sig in their type hierarchy (handles abstract sigs / subtypes)
  const atomsPerType: Record<string, string[]> = {};

  for (const projection of projections) {
    const sig = projection.sig;

    // Validate that the sig exists in the type hierarchy
    const sigExists = allTypes.some(t => t.types.includes(sig));
    if (!sigExists) {
      throw new Error(`Projected type '${sig}' not found in data instance`);
    }

    // Find all types that include this sig (i.e., subtypes/descendants)
    const matchingTypes = allTypes.filter(t => t.types.includes(sig));

    // Collect all atoms, deduplicating (parent sigs may include subsig atoms)
    const atomSet = new Set<string>();
    for (const type of matchingTypes) {
      for (const atom of type.atoms) {
        atomSet.add(atom.id);
      }
    }

    let atoms = [...atomSet];

    // Apply orderBy sorting if an evaluator is provided
    if (projection.orderBy && options.evaluateOrderBy) {
      try {
        const orderTuples = options.evaluateOrderBy(projection.orderBy);
        atoms = topologicalSortWithCycleBreaking(atoms, orderTuples);
      } catch (error) {
        if (options.onOrderByError) {
          options.onOrderByError(projection.orderBy, error);
        }
        // Fallback to lexicographic sort
        atoms.sort((a, b) => a.localeCompare(b));
      }
    } else {
      // Default: sort lexicographically by atom ID
      atoms.sort((a, b) => a.localeCompare(b));
    }

    atomsPerType[sig] = atoms;
  }

  // Select which atom to project for each sig
  const projectedAtomIds: string[] = [];

  for (const [typeId, atomIds] of Object.entries(atomsPerType)) {
    if (atomIds.length > 0) {
      if (selections[typeId]) {
        projectedAtomIds.push(selections[typeId]);
      } else {
        // Default to first atom; mutate selections so caller sees the default
        const defaultAtom = atomIds[0];
        selections[typeId] = defaultAtom;
        projectedAtomIds.push(defaultAtom);
      }
    }
  }

  // Build projection choices for UI consumption
  const choices: ProjectionChoice[] = Object.entries(selections)
    .filter(([typeId]) => projectedSigs.includes(typeId))
    .map(([typeId, atomId]) => ({
      type: typeId,
      projectedAtom: atomId,
      atoms: atomsPerType[typeId] || []
    }));

  // Apply the actual data transformation
  const projectedInstance = instance.applyProjections(projectedAtomIds);

  return { instance: projectedInstance, choices };
}


/**
 * Topological sort with cycle breaking via Kahn's algorithm.
 * 
 * Given a set of atoms and a partial order defined by [from, to] tuples,
 * produces a total ordering that respects the partial order where possible.
 * Cycles are broken by preferring the lexicographically smallest node.
 * 
 * @param atoms - The atoms to sort
 * @param tuples - Pairs [from, to] defining the partial order (from < to)
 * @returns Sorted array of atom IDs
 */
export function topologicalSortWithCycleBreaking(atoms: string[], tuples: string[][]): string[] {
  const atomSet = new Set(atoms);

  // Build adjacency list and in-degree count
  const adjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const atom of atoms) {
    adjacency.set(atom, new Set());
    inDegree.set(atom, 0);
  }

  for (const tuple of tuples) {
    if (tuple.length >= 2) {
      const from = tuple[0];
      const to = tuple[1];

      if (atomSet.has(from) && atomSet.has(to) && from !== to) {
        const neighbors = adjacency.get(from)!;
        if (!neighbors.has(to)) {
          neighbors.add(to);
          inDegree.set(to, (inDegree.get(to) || 0) + 1);
        }
      }
    }
  }

  // Kahn's algorithm with cycle breaking
  const result: string[] = [];
  const remaining = new Set(atoms);

  while (remaining.size > 0) {
    const ready: string[] = [];
    for (const atom of remaining) {
      if ((inDegree.get(atom) || 0) === 0) {
        ready.push(atom);
      }
    }

    if (ready.length === 0) {
      // Cycle detected — break by picking lexicographically smallest
      const sorted = [...remaining].sort((a, b) => a.localeCompare(b));
      ready.push(sorted[0]);
    }

    ready.sort((a, b) => a.localeCompare(b));

    const node = ready[0];
    result.push(node);
    remaining.delete(node);

    const neighbors = adjacency.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (remaining.has(neighbor)) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 1) - 1);
      }
    }
  }

  return result;
}
