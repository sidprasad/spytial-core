/**
 * Well-formedness checks over a relationalizer's raw output.
 *
 * These run on the JSON an integration produced, *before* it becomes a
 * JSONDataInstance. That ordering is the whole point: the normalizer dedupes
 * atoms and validates references as a repair step, so a datum with a dangling
 * tuple or a duplicated id still lays out fine and the integration never
 * learns it emitted something wrong. Checking the raw form is what turns those
 * into visible failures.
 *
 * Errors mean the datum does not describe a graph and any spatial assertion
 * over it would be meaningless. Warnings mean it will lay out, but something
 * in it probably was not intended.
 */

import { Diagnostic } from './types';

function error(code: Diagnostic['code'], message: string, where?: string): Diagnostic {
    return { code, severity: 'error', message, where };
}

function warning(code: Diagnostic['code'], message: string, where?: string): Diagnostic {
    return { code, severity: 'warning', message, where };
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/**
 * Check a raw datum. Returns every problem found rather than stopping at the
 * first, so an integration author fixes one round of bugs instead of ten.
 *
 * Structural failures short-circuit the checks that depend on them — there is
 * no use reporting dangling tuples when `atoms` is not an array.
 */
export function checkDatum(datum: unknown): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!isObject(datum)) {
        return [error(
            'datum/not-an-object',
            `Datum must be a JSON object with "atoms" and "relations", got ${Array.isArray(datum) ? 'an array' : typeof datum}.`,
        )];
    }

    const rawAtoms = datum.atoms;
    const rawRelations = datum.relations;

    if (!Array.isArray(rawAtoms)) {
        diagnostics.push(error(
            'datum/atoms-not-an-array',
            `"atoms" must be an array, got ${rawAtoms === undefined ? 'nothing' : typeof rawAtoms}.`,
            'atoms',
        ));
    }
    // Required, not optional: the data instance rejects a datum without it, and
    // it does so from inside layout generation where the message says nothing
    // about which relationalizer left the field off. Write `"relations": []`.
    if (!Array.isArray(rawRelations)) {
        diagnostics.push(error(
            'datum/relations-not-an-array',
            `"relations" must be an array, got ${rawRelations === undefined ? 'nothing' : typeof rawRelations}. Use an empty array when the value has no edges.`,
            'relations',
        ));
    }
    if (diagnostics.length > 0) return diagnostics;

    const atoms = rawAtoms as unknown[];
    const relations = rawRelations as unknown[];

    // ── Atoms ────────────────────────────────────────────────────────
    const atomIds = new Set<string>();
    const seenTwice = new Set<string>();

    if (atoms.length === 0) {
        diagnostics.push(error(
            'datum/no-atoms',
            'Datum has no atoms, so there is nothing to lay out. A relationalizer that walked a real value should produce at least one.',
            'atoms',
        ));
    }

    atoms.forEach((atom, i) => {
        const where = `atoms[${i}]`;
        if (!isObject(atom)) {
            diagnostics.push(error('datum/atom-not-an-object', `Atom must be an object, got ${typeof atom}.`, where));
            return;
        }
        if (!isNonEmptyString(atom.id)) {
            diagnostics.push(error(
                'datum/atom-missing-id',
                'Atom needs a non-empty string "id". Ids carry identity: two distinct values need distinct ids, and two references to one value need the same id.',
                where,
            ));
        } else if (atomIds.has(atom.id)) {
            // Only report a given id once no matter how often it repeats.
            if (!seenTwice.has(atom.id)) {
                seenTwice.add(atom.id);
                diagnostics.push(error(
                    'datum/duplicate-atom-id',
                    `Two atoms share the id "${atom.id}". The data instance keeps the first and drops the rest, so one of these values would silently vanish from the diagram.`,
                    where,
                ));
            }
        } else {
            atomIds.add(atom.id);
        }

        if (!isNonEmptyString(atom.type)) {
            diagnostics.push(error(
                'datum/atom-missing-type',
                'Atom needs a non-empty string "type". Selectors are written against these types, so an atom without one cannot be selected.',
                where,
            ));
        }
        if (!isNonEmptyString(atom.label)) {
            diagnostics.push(warning(
                'datum/atom-missing-label',
                'Atom has no "label", so the node renders without readable text.',
                where,
            ));
        }
    });

    // ── Relations ────────────────────────────────────────────────────
    const relationIds = new Set<string>();

    relations.forEach((relation, i) => {
        const where = `relations[${i}]`;
        if (!isObject(relation)) {
            diagnostics.push(error('datum/relation-not-an-object', `Relation must be an object, got ${typeof relation}.`, where));
            return;
        }

        const name = isNonEmptyString(relation.name) ? relation.name : undefined;
        if (!name) {
            diagnostics.push(error(
                'datum/relation-missing-name',
                'Relation needs a non-empty string "name". Selectors refer to relations by name, so an unnamed one is unreachable.',
                where,
            ));
        }

        const id = isNonEmptyString(relation.id) ? relation.id : undefined;
        if (id) {
            if (relationIds.has(id)) {
                diagnostics.push(error(
                    'datum/duplicate-relation-id',
                    `Two relations share the id "${id}".`,
                    where,
                ));
            }
            relationIds.add(id);
        }

        const label = name ?? `relations[${i}]`;

        if (!Array.isArray(relation.tuples)) {
            diagnostics.push(error(
                'datum/relation-missing-tuples',
                `Relation "${label}" needs a "tuples" array.`,
                `${where}.tuples`,
            ));
            return;
        }

        const tuples = relation.tuples as unknown[];
        if (tuples.length === 0) {
            diagnostics.push(warning(
                'datum/empty-relation',
                `Relation "${label}" has no tuples. A selector over it will match nothing.`,
                `${where}.tuples`,
            ));
        }

        const arities = new Set<number>();

        tuples.forEach((tuple, j) => {
            const tupleWhere = `${where}.tuples[${j}]`;
            if (!isObject(tuple)) {
                diagnostics.push(error('datum/tuple-not-an-object', `Tuple must be an object, got ${typeof tuple}.`, tupleWhere));
                return;
            }
            if (!Array.isArray(tuple.atoms)) {
                diagnostics.push(error(
                    'datum/tuple-missing-atoms',
                    `Tuple in "${label}" needs an "atoms" array of atom ids.`,
                    tupleWhere,
                ));
                return;
            }

            const tupleAtoms = tuple.atoms as unknown[];
            if (tupleAtoms.length === 0) {
                diagnostics.push(error('datum/tuple-empty', `Tuple in "${label}" has no atoms.`, tupleWhere));
                return;
            }
            arities.add(tupleAtoms.length);

            tupleAtoms.forEach((atomId, k) => {
                if (!isNonEmptyString(atomId)) {
                    diagnostics.push(error(
                        'datum/dangling-tuple-atom',
                        `Tuple position ${k} in "${label}" is not an atom id (got ${typeof atomId}).`,
                        `${tupleWhere}.atoms[${k}]`,
                    ));
                } else if (!atomIds.has(atomId)) {
                    diagnostics.push(error(
                        'datum/dangling-tuple-atom',
                        `Tuple position ${k} in "${label}" references atom "${atomId}", which is not in "atoms". Left alone this fails later inside layout generation, as "Atom with ID '${atomId}' not found", with nothing to say which tuple was at fault.`,
                        `${tupleWhere}.atoms[${k}]`,
                    ));
                }
            });

            // A tuple's own types must line up with its own atoms. This is
            // checked per tuple, not against the relation's declared `types`:
            // that list is positional and gets appended to as columns settle,
            // so comparing lengths against it produces false alarms.
            if (Array.isArray(tuple.types) && tuple.types.length !== tupleAtoms.length) {
                diagnostics.push(warning(
                    'datum/tuple-type-arity-mismatch',
                    `Tuple in "${label}" has ${tupleAtoms.length} atoms but ${(tuple.types as unknown[]).length} types.`,
                    tupleWhere,
                ));
            }
        });

        if (arities.size > 1) {
            diagnostics.push(warning(
                'datum/ragged-relation',
                `Relation "${label}" mixes tuple arities (${[...arities].sort((a, b) => a - b).join(', ')}). Selectors assume a relation has one arity.`,
                `${where}.tuples`,
            ));
        }
    });

    return diagnostics;
}
