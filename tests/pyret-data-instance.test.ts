import { describe, it, expect } from 'vitest';
import { PyretDataInstance, createPyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

describe('PyretDataInstance', () => {

    /*
    data RBNod:
        | Black(value, left, right)
        | Red(value, left, right)
        | Leaf(value)
        sharing:
            method _output(self):
            x = DR.genlayout( self, "")
            VS.vs-constr-render("RBNod", [list: ], { cli: render, cpo: lam(a): x end })
            end
        end

    rbt = Black( 5, Black( 1, Red( 2, Red( 1, Leaf(0), Leaf(0)), Leaf(0)), Leaf(0)), Red( 6, Leaf(0), Leaf(0)))

    */
    const pyretData = {
        "dict": {
            "value": 5,
            "left": {
                "dict": {
                    "value": 1,
                    "left": {
                        "dict": {
                            "value": 2,
                            "left": {
                                "dict": {
                                    "value": 1,
                                    "left": {
                                        "dict": {
                                            "value": 0
                                        },
                                        "brands": {
                                            "$brandRBNod961": true,
                                            "$brandLeaf964": true
                                        }
                                    },
                                    "right": {
                                        "dict": {
                                            "value": 0
                                        },
                                        "brands": {
                                            "$brandRBNod961": true,
                                            "$brandLeaf964": true
                                        }
                                    }
                                },
                                "brands": {
                                    "$brandRBNod961": true,
                                    "$brandRed963": true
                                }
                            },
                            "right": {
                                "dict": {
                                    "value": 0
                                },
                                "brands": {
                                    "$brandRBNod961": true,
                                    "$brandLeaf964": true
                                }
                            }
                        },
                        "brands": {
                            "$brandRBNod961": true,
                            "$brandRed963": true
                        }
                    },
                    "right": {
                        "dict": {
                            "value": 0
                        },
                        "brands": {
                            "$brandRBNod961": true,
                            "$brandLeaf964": true
                        }
                    }
                },
                "brands": {
                    "$brandRBNod961": true,
                    "$brandBlack962": true
                }
            },
            "right": {
                "dict": {
                    "value": 6,
                    "left": {
                        "dict": {
                            "value": 0
                        },
                        "brands": {
                            "$brandRBNod961": true,
                            "$brandLeaf964": true
                        }
                    },
                    "right": {
                        "dict": {
                            "value": 0
                        },
                        "brands": {
                            "$brandRBNod961": true,
                            "$brandLeaf964": true
                        }
                    }
                },
                "brands": {
                    "$brandRBNod961": true,
                    "$brandRed963": true
                }
            }
        },
        "brands": {
            "$brandRBNod961": true,
            "$brandBlack962": true
        }
    };


    const reifiedData = "Black( 5, Black( 1, Red( 2, Red( 1, Leaf(0), Leaf(0)), Leaf(0)), Leaf(0)), Red( 6, Leaf(0), Leaf(0)))";

    it('should parse atoms correctly', () => {
        const instance = new PyretDataInstance(pyretData);
        const atoms = instance.getAtoms();

        expect(atoms).toHaveLength(16); 
        expect(atoms.map(atom => atom.type)).toContain('Black');
        expect(atoms.map(atom => atom.type)).toContain('Red');
        expect(atoms.map(atom => atom.type)).toContain('Leaf');
        expect(atoms.map(atom => atom.type)).toContain('Number');

        // And the types

    });

    it('should extract relations correctly', () => {
        const instance = new PyretDataInstance(pyretData);
        const relations = instance.getRelations();

        expect(relations).toHaveLength(3); // value, left, right
        const relationNames = relations.map(relation => relation.name);
        expect(relationNames).toContain('value');
        expect(relationNames).toContain('left');
        expect(relationNames).toContain('right');

        const leftRelation = relations.find(relation => relation.name === 'left');
        expect(leftRelation).toBeDefined();
    });

    it('can create a proper graph', () => {
        const instance = new PyretDataInstance(pyretData);
        const graph = instance.generateGraph(false, false);

        expect(graph).toBeDefined();
        expect(graph.nodes()).toHaveLength(16); // 16 atoms
        // How many nodes?
        expect(graph.edges()).toHaveLength(21); // 

        // And I want to make sure that the labels are correct for each node.



    });

    it('should reify the instance correctly', () => {
        const instance = new PyretDataInstance(pyretData);
        const reified = instance.reify();

        // What about whitespace mismatch or something?
        expect(reified).toBeDefined();
        expect(typeof reified).toBe('string');

        // Remove whitespace for comparison
        const normalizedReified = reified.replace(/\s+/g, '');
        const normalizedReifiedData = reifiedData.replace(/\s+/g, '');
        expect(normalizedReified).toBe(normalizedReifiedData);
    });

    it('should handle decimal numbers in n-ary relations correctly', () => {
        const instance = new PyretDataInstance(null);

        // Add atoms
        instance.addAtom({ id: 'node1', label: 'Node1', type: 'Node' });
        instance.addAtom({ id: 'node2', label: 'Node2', type: 'Node' });
        instance.addAtom({ id: 'weight1', label: '3.14', type: 'Number' });
        instance.addAtom({ id: 'weight2', label: '2.5', type: 'Number' });

        // Add n-ary relations with decimal middle atoms
        instance.addRelationTuple('edge', {
            atoms: ['node1', 'weight1', 'node2'],
            types: ['Node', 'Number', 'Node']
        });
        instance.addRelationTuple('edge', {
            atoms: ['node2', 'weight2', 'node1'],
            types: ['Node', 'Number', 'Node']
        });

        // Get the relation and verify it has the correct name with first tuple's decimal
        const relations = instance.getRelations();
        expect(relations.length).toBe(1);
        expect(relations[0].id).toBe('edge');
        expect(relations[0].name).toBe('edge[3.14]');
        expect(relations[0].tuples.length).toBe(2);

        // Generate graph and verify edge labels contain decimal numbers correctly
        const graph = instance.generateGraph(false, false);
        const edges = graph.edges();
        expect(edges.length).toBe(2);

        // Check edge labels
        const edgeLabels = edges.map(edge => graph.edge(edge));
        expect(edgeLabels).toContain('edge[3.14]');
        expect(edgeLabels).toContain('edge[2.5]');

        // Verify no double-bracketing (e.g., edge[weight1][3.14])
        edgeLabels.forEach(label => {
            expect(label).not.toMatch(/\]\[/); // Should not contain "][" pattern
            expect(label).toMatch(/^edge\[\d+\.?\d*\]$/); // Should match edge[number] pattern
        });
    });
});