import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';

const validJSON: IJsonDataInstance = {
    atoms: [
        { id: 'atom1', type: 'Type1', label: 'Atom 1' },
        { id: 'atom2', type: 'Type2', label: 'Atom 2' },
    ],
    relations: [
        {
            id: 'relation1',
            name: 'Relation 1',
            types: ['Type1', 'Type2'],
            tuples: [
                { atoms: ['atom1', 'atom2'], types: ['Type1', 'Type2'] },
            ],
        },
    ],
};

describe('JSONDataInstance', () => {

    it('should create an instance from valid JSON', () => {
        const instance = new JSONDataInstance(validJSON);
        expect(instance).toBeDefined();
        expect(instance.getAtoms()).toHaveLength(2);
        expect(instance.getRelations()).toHaveLength(1);
    });


    it('should generate a graph representation', () => {
        const instance = new JSONDataInstance(validJSON);
        const graph = instance.generateGraph();
        expect(graph).toBeDefined();
        expect(graph.nodes()).toHaveLength(2);
        expect(graph.edges()).toHaveLength(1);
    });
});
describe('JSONDataInstance relation-type inference (lenient external JSON)', () => {
    // The exact shape the json-demo placeholder (and host-language
    // integrations) produce: no relation id, no relation/tuple `types`.
    const lenientJSON = {
        atoms: [
            { id: 'p1', label: 'Alice', type: 'Person' },
            { id: 'p2', label: 'Bob', type: 'Person' },
            { id: 'c1', label: 'Toyota', type: 'Car' },
        ],
        relations: [
            {
                name: 'friend',
                tuples: [{ atoms: ['p1', 'p2'] }],
            },
            {
                name: 'owns',
                tuples: [
                    { atoms: ['p1', 'c1'] },
                    { atoms: ['p2', 'c1'] },
                ],
            },
        ],
    } as unknown as IJsonDataInstance;

    it('constructs from relations missing id and types arrays', () => {
        const instance = new JSONDataInstance(lenientJSON);
        expect(instance.getAtoms()).toHaveLength(3);
        expect(instance.getRelations()).toHaveLength(2);
    });

    it('fills tuple types from the referenced atoms', () => {
        const instance = new JSONDataInstance(lenientJSON);
        const owns = instance.getRelations().find(r => r.name === 'owns')!;
        expect(owns.tuples[0].types).toEqual(['Person', 'Car']);
        expect(owns.types).toEqual(['Person', 'Car']);
        expect(owns.id).toBe('owns');
    });

    it('falls back to univ for unknown atoms and mixed positions', () => {
        const mixed = {
            atoms: [
                { id: 'p1', label: 'Alice', type: 'Person' },
                { id: 'c1', label: 'Toyota', type: 'Car' },
            ],
            relations: [
                {
                    name: 'touches',
                    tuples: [
                        { atoms: ['p1', 'ghost'] },   // ghost: not an atom → univ
                        { atoms: ['c1', 'ghost'] },   // position 0 disagrees → univ
                    ],
                },
            ],
        } as unknown as IJsonDataInstance;
        const instance = new JSONDataInstance(mixed, { validateReferences: false });
        const touches = instance.getRelations()[0];
        expect(touches.tuples[0].types).toEqual(['Person', 'univ']);
        expect(touches.types).toEqual(['univ', 'univ']);
    });

    it('never overrides provided types or id', () => {
        const explicit = {
            atoms: [{ id: 'p1', label: 'Alice', type: 'Person' }],
            relations: [
                {
                    id: 'custom-id',
                    name: 'self',
                    types: ['Being'],
                    tuples: [{ atoms: ['p1'], types: ['Being'] }],
                },
            ],
        } as unknown as IJsonDataInstance;
        const rel = new JSONDataInstance(explicit).getRelations()[0];
        expect(rel.id).toBe('custom-id');
        expect(rel.types).toEqual(['Being']);
        expect(rel.tuples[0].types).toEqual(['Being']);
    });

    it('keeps an arity-correct signature when a relation name is split across records', () => {
        // Regression for the merge/union bug: inferring each record before
        // mergeRelations, then unioning the signatures, produced
        // ['Person','Car','Bike'] on two-atom tuples — which SQLEvaluator reads
        // as arity 3. The signature must be derived AFTER merge from the full
        // tuple set: ['Person', 'univ'] (position 1 disagrees), length 2.
        const split = {
            atoms: [
                { id: 'p1', label: 'Alice', type: 'Person' },
                { id: 'p2', label: 'Bob', type: 'Person' },
                { id: 'c1', label: 'Toyota', type: 'Car' },
                { id: 'b1', label: 'Trek', type: 'Bike' },
            ],
            relations: [
                { name: 'owns', tuples: [['p1', 'c1']] },   // Person -> Car
                { name: 'owns', tuples: [['p2', 'b1']] },   // Person -> Bike
            ],
        } as unknown as IJsonDataInstance;
        const owns = new JSONDataInstance(split).getRelations().find(r => r.name === 'owns')!;
        expect(owns.tuples).toHaveLength(2);
        expect(owns.types).toEqual(['Person', 'univ']);
        expect(owns.types.length).toBe(owns.tuples[0].atoms.length); // arity invariant
        // Tuple-level types stay specific; only the shared signature abstracts.
        expect(owns.tuples.map(t => t.types)).toEqual([['Person', 'Car'], ['Person', 'Bike']]);
    });

    it('survives mergeRelations type-dedup collapsing a homogeneous signature', () => {
        // Order-dependent regression: a lenient record (→ types: []) as the
        // FIRST occurrence of a name, then a homogeneous explicit record.
        // mergeRelations de-duplicates types when appending, collapsing
        // ['Person','Person'] into ['Person'] on arity-2 tuples. The post-merge
        // signature inference must repair the arity (length must equal 2).
        const collapsed = {
            atoms: [
                { id: 'a', label: 'A', type: 'Person' },
                { id: 'b', label: 'B', type: 'Person' },
                { id: 'c', label: 'C', type: 'Person' },
                { id: 'd', label: 'D', type: 'Person' },
            ],
            relations: [
                { name: 'friend', tuples: [['a', 'b']] },                     // lenient → placeholder []
                { name: 'friend', types: ['Person', 'Person'],
                  tuples: [{ atoms: ['c', 'd'], types: ['Person', 'Person'] }] },
            ],
        } as unknown as IJsonDataInstance;
        const friend = new JSONDataInstance(collapsed).getRelations().find(r => r.name === 'friend')!;
        expect(friend.tuples).toHaveLength(2);
        expect(friend.types.length).toBe(2);           // NOT ['Person'] (arity 1)
        expect(friend.types).toEqual(['Person', 'Person']);
    });

    it('re-derives a caller-provided signature whose length does not match arity', () => {
        // A malformed explicit signature (length 1 on binary tuples) cannot be
        // used as given; it is repaired to arity-correct rather than preserved.
        const wrong = {
            atoms: [{ id: 'p1', label: 'A', type: 'Person' }, { id: 'c1', label: 'C', type: 'Car' }],
            relations: [{ name: 'owns', types: ['Person'], tuples: [{ atoms: ['p1', 'c1'], types: ['Person', 'Car'] }] }],
        } as unknown as IJsonDataInstance;
        const owns = new JSONDataInstance(wrong).getRelations()[0];
        expect(owns.types).toEqual(['Person', 'Car']);
    });

    it('preserves an explicit signature on a relation with zero tuples', () => {
        // No tuples means no arity evidence — the provided signature must
        // survive rather than being wiped to [] (regression guard).
        const empty = {
            atoms: [{ id: 'p1', label: 'A', type: 'Person' }],
            relations: [{ id: 'friend', name: 'friend', types: ['Person', 'Person'], tuples: [] }],
        } as unknown as IJsonDataInstance;
        const friend = new JSONDataInstance(empty).getRelations()[0];
        expect(friend.types).toEqual(['Person', 'Person']);
    });

    it('accepts bare-array tuples (the json-demo placeholder shape)', () => {
        // Verbatim shape of webcola-demo/json-demo.html's textarea placeholder.
        const placeholder = {
            atoms: [
                { id: 'p1', label: 'Alice', type: 'Person' },
                { id: 'p2', label: 'Bob', type: 'Person' },
            ],
            relations: [
                { name: 'friend', tuples: [['p1', 'p2']] },
            ],
        } as unknown as IJsonDataInstance;
        const instance = new JSONDataInstance(placeholder);
        const friend = instance.getRelations()[0];
        expect(friend.tuples[0].atoms).toEqual(['p1', 'p2']);
        expect(friend.tuples[0].types).toEqual(['Person', 'Person']);
        expect(friend.types).toEqual(['Person', 'Person']);
        const graph = instance.generateGraph();
        expect(graph.nodes()).toHaveLength(2);
        expect(graph.edges()).toHaveLength(1);
    });

    it('merges same-name lenient relations without crashing', () => {
        const twoSources = {
            atoms: [
                { id: 'p1', label: 'Alice', type: 'Person' },
                { id: 'p2', label: 'Bob', type: 'Person' },
            ],
            relations: [
                { name: 'friend', tuples: [{ atoms: ['p1', 'p2'] }] },
                { name: 'friend', tuples: [{ atoms: ['p2', 'p1'] }] },
            ],
        } as unknown as IJsonDataInstance;
        const instance = new JSONDataInstance(twoSources);
        const friend = instance.getRelations();
        expect(friend).toHaveLength(1);
        expect(friend[0].tuples).toHaveLength(2);
    });
});
