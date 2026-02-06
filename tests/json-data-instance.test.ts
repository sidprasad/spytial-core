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
describe('JSONDataInstance.applyProjections', () => {
    it('should return clone when no atoms are provided', () => {
        const instance = new JSONDataInstance(validJSON);
        const projected = instance.applyProjections([]);
        
        expect(projected.getAtoms()).toHaveLength(2);
        expect(projected.getRelations()).toHaveLength(1);
    });

    it('should project over a single atom type', () => {
        // Create an instance with Time dimension
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'alice', type: 'Person', label: 'Alice' },
                { id: 'bob', type: 'Person', label: 'Bob' },
                { id: 'file1', type: 'File', label: 'Document.pdf' },
                { id: 'time0', type: 'Time', label: 'Time 0' },
                { id: 'time1', type: 'Time', label: 'Time 1' },
            ],
            relations: [
                {
                    id: 'access',
                    name: 'access',
                    types: ['Person', 'File', 'Time'],
                    tuples: [
                        { atoms: ['alice', 'file1', 'time0'], types: ['Person', 'File', 'Time'] },
                        { atoms: ['bob', 'file1', 'time1'], types: ['Person', 'File', 'Time'] },
                    ],
                },
            ],
            types: [
                { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
                { id: 'File', types: ['File'], atoms: [], isBuiltin: false },
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        
        // Project over time0 - should only show access relations at time0
        const projected = instance.applyProjections(['time0']);
        
        // Time atoms should be removed from the projected instance
        const projectedAtoms = projected.getAtoms();
        expect(projectedAtoms.some(a => a.id === 'time0')).toBe(false);
        expect(projectedAtoms.some(a => a.id === 'time1')).toBe(false);
        
        // Alice and file1 should remain (they're in the tuple with time0)
        expect(projectedAtoms.some(a => a.id === 'alice')).toBe(true);
        expect(projectedAtoms.some(a => a.id === 'file1')).toBe(true);
        
        // Bob should be removed because his only tuple was with time1
        expect(projectedAtoms.some(a => a.id === 'bob')).toBe(true); // Bob is still an atom, just no relations
        
        // The access relation should now be binary (Person -> File)
        const accessRel = projected.getRelations().find(r => r.name === 'access');
        expect(accessRel).toBeDefined();
        expect(accessRel!.types).toEqual(['Person', 'File']);
        expect(accessRel!.tuples).toHaveLength(1);
        expect(accessRel!.tuples[0].atoms).toEqual(['alice', 'file1']);
    });

    it('should throw error when projecting over multiple atoms of same type', () => {
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'time0', type: 'Time', label: 'Time 0' },
                { id: 'time1', type: 'Time', label: 'Time 1' },
            ],
            relations: [],
            types: [
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        
        expect(() => instance.applyProjections(['time0', 'time1'])).toThrow(
            "Cannot project over 'time1' and 'time0'. Both are of type 'Time'"
        );
    });

    it('should throw error when projecting over non-existent atom', () => {
        const instance = new JSONDataInstance(validJSON);
        
        expect(() => instance.applyProjections(['nonexistent'])).toThrow(
            "Cannot project over atom 'nonexistent': atom not found"
        );
    });

    it('should handle type hierarchies correctly', () => {
        // Create an instance with type hierarchy (Student extends Person)
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'alice', type: 'Student', label: 'Alice' },
                { id: 'course1', type: 'Course', label: 'CS101' },
                { id: 'time0', type: 'Time', label: 'Time 0' },
            ],
            relations: [
                {
                    id: 'enrolled',
                    name: 'enrolled',
                    types: ['Student', 'Course', 'Time'],
                    tuples: [
                        { atoms: ['alice', 'course1', 'time0'], types: ['Student', 'Course', 'Time'] },
                    ],
                },
            ],
            types: [
                { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
                { id: 'Student', types: ['Student', 'Person'], atoms: [], isBuiltin: false },
                { id: 'Course', types: ['Course'], atoms: [], isBuiltin: false },
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        
        // Project over time0
        const projected = instance.applyProjections(['time0']);
        
        const enrolledRel = projected.getRelations().find(r => r.name === 'enrolled');
        expect(enrolledRel).toBeDefined();
        expect(enrolledRel!.types).toEqual(['Student', 'Course']);
        expect(enrolledRel!.tuples[0].atoms).toEqual(['alice', 'course1']);
    });

    it('should handle multiple projections over different types', () => {
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'alice', type: 'Person', label: 'Alice' },
                { id: 'file1', type: 'File', label: 'Document.pdf' },
                { id: 'time0', type: 'Time', label: 'Time 0' },
                { id: 'loc1', type: 'Location', label: 'Office' },
            ],
            relations: [
                {
                    id: 'access',
                    name: 'access',
                    types: ['Person', 'File', 'Time', 'Location'],
                    tuples: [
                        { atoms: ['alice', 'file1', 'time0', 'loc1'], types: ['Person', 'File', 'Time', 'Location'] },
                    ],
                },
            ],
            types: [
                { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
                { id: 'File', types: ['File'], atoms: [], isBuiltin: false },
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
                { id: 'Location', types: ['Location'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        
        // Project over both time0 and loc1
        const projected = instance.applyProjections(['time0', 'loc1']);
        
        const accessRel = projected.getRelations().find(r => r.name === 'access');
        expect(accessRel).toBeDefined();
        expect(accessRel!.types).toEqual(['Person', 'File']);
        expect(accessRel!.tuples[0].atoms).toEqual(['alice', 'file1']);
    });

    it('should only keep tuples matching ALL projected atoms in multi-type projection', () => {
        // This test verifies that multi-type projection requires ALL projected columns to match,
        // not just ANY projected atom appearing somewhere in the tuple.
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'alice', type: 'Person', label: 'Alice' },
                { id: 'bob', type: 'Person', label: 'Bob' },
                { id: 'file1', type: 'File', label: 'Document.pdf' },
                { id: 'time0', type: 'Time', label: 'Time 0' },
                { id: 'time1', type: 'Time', label: 'Time 1' },
                { id: 'loc1', type: 'Location', label: 'Office' },
                { id: 'loc2', type: 'Location', label: 'Home' },
            ],
            relations: [
                {
                    id: 'access',
                    name: 'access',
                    types: ['Person', 'File', 'Time', 'Location'],
                    tuples: [
                        // Should be KEPT: matches both time0 AND loc1
                        { atoms: ['alice', 'file1', 'time0', 'loc1'], types: ['Person', 'File', 'Time', 'Location'] },
                        // Should be FILTERED: has time0 but wrong location (loc2 != loc1)
                        { atoms: ['alice', 'file1', 'time0', 'loc2'], types: ['Person', 'File', 'Time', 'Location'] },
                        // Should be FILTERED: has loc1 but wrong time (time1 != time0)
                        { atoms: ['bob', 'file1', 'time1', 'loc1'], types: ['Person', 'File', 'Time', 'Location'] },
                        // Should be FILTERED: wrong time AND wrong location
                        { atoms: ['bob', 'file1', 'time1', 'loc2'], types: ['Person', 'File', 'Time', 'Location'] },
                    ],
                },
            ],
            types: [
                { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
                { id: 'File', types: ['File'], atoms: [], isBuiltin: false },
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
                { id: 'Location', types: ['Location'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        
        // Project over time0 AND loc1 - should only keep tuples matching BOTH
        const projected = instance.applyProjections(['time0', 'loc1']);
        
        const accessRel = projected.getRelations().find(r => r.name === 'access');
        expect(accessRel).toBeDefined();
        expect(accessRel!.types).toEqual(['Person', 'File']);
        
        // Only one tuple should remain: alice accessing file1 at time0 and loc1
        expect(accessRel!.tuples).toHaveLength(1);
        expect(accessRel!.tuples[0].atoms).toEqual(['alice', 'file1']);
    });

    it('should filter tuples to only those containing projected atom', () => {
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'alice', type: 'Person', label: 'Alice' },
                { id: 'bob', type: 'Person', label: 'Bob' },
                { id: 'time0', type: 'Time', label: 'Time 0' },
                { id: 'time1', type: 'Time', label: 'Time 1' },
            ],
            relations: [
                {
                    id: 'active',
                    name: 'active',
                    types: ['Person', 'Time'],
                    tuples: [
                        { atoms: ['alice', 'time0'], types: ['Person', 'Time'] },
                        { atoms: ['bob', 'time1'], types: ['Person', 'Time'] },
                        { atoms: ['alice', 'time1'], types: ['Person', 'Time'] },
                    ],
                },
            ],
            types: [
                { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        
        // Project over time0 - should only include alice's tuple at time0
        const projected = instance.applyProjections(['time0']);
        
        const activeRel = projected.getRelations().find(r => r.name === 'active');
        expect(activeRel).toBeDefined();
        expect(activeRel!.types).toEqual(['Person']);
        expect(activeRel!.tuples).toHaveLength(1);
        expect(activeRel!.tuples[0].atoms).toEqual(['alice']);
    });

    it('should handle unary relations after projection', () => {
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'alice', type: 'Person', label: 'Alice' },
                { id: 'time0', type: 'Time', label: 'Time 0' },
            ],
            relations: [
                {
                    id: 'active',
                    name: 'active',
                    types: ['Person', 'Time'],
                    tuples: [
                        { atoms: ['alice', 'time0'], types: ['Person', 'Time'] },
                    ],
                },
            ],
            types: [
                { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        const projected = instance.applyProjections(['time0']);
        
        const activeRel = projected.getRelations().find(r => r.name === 'active');
        expect(activeRel).toBeDefined();
        expect(activeRel!.types).toEqual(['Person']);
        // Unary tuple should be kept
        expect(activeRel!.tuples).toHaveLength(1);
        expect(activeRel!.tuples[0].atoms).toEqual(['alice']);
    });

    it('should preserve relations not affected by projection', () => {
        const jsonData: IJsonDataInstance = {
            atoms: [
                { id: 'alice', type: 'Person', label: 'Alice' },
                { id: 'bob', type: 'Person', label: 'Bob' },
                { id: 'time0', type: 'Time', label: 'Time 0' },
            ],
            relations: [
                {
                    id: 'friends',
                    name: 'friends',
                    types: ['Person', 'Person'],
                    tuples: [
                        { atoms: ['alice', 'bob'], types: ['Person', 'Person'] },
                    ],
                },
                {
                    id: 'active',
                    name: 'active',
                    types: ['Person', 'Time'],
                    tuples: [
                        { atoms: ['alice', 'time0'], types: ['Person', 'Time'] },
                    ],
                },
            ],
            types: [
                { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
                { id: 'Time', types: ['Time'], atoms: [], isBuiltin: false },
            ],
        };

        const instance = new JSONDataInstance(jsonData);
        const projected = instance.applyProjections(['time0']);
        
        // friends relation should be unchanged
        const friendsRel = projected.getRelations().find(r => r.name === 'friends');
        expect(friendsRel).toBeDefined();
        expect(friendsRel!.types).toEqual(['Person', 'Person']);
        expect(friendsRel!.tuples).toHaveLength(1);
        expect(friendsRel!.tuples[0].atoms).toEqual(['alice', 'bob']);
    });
});