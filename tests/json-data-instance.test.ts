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
