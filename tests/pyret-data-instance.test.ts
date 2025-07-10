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

    it('should parse atoms correctly', () => {
        const instance = new PyretDataInstance(pyretData);
        const atoms = instance.getAtoms();

        expect(atoms).toHaveLength(16); 
        expect(atoms.map(atom => atom.type)).toContain('Black');
        expect(atoms.map(atom => atom.type)).toContain('Red');
        expect(atoms.map(atom => atom.type)).toContain('Leaf');

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
});