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

    it('should handle Pyret rational numbers correctly', () => {
        // Test with a rational number like 1.5 represented as {n: 3, d: 2}
        const pyretDataWithRational = {
            dict: {
                value: {
                    n: 3,
                    d: 2
                }
            },
            brands: {
                "$brandtest": true
            },
            $name: "TestNode"
        };

        const instance = new PyretDataInstance(pyretDataWithRational);
        const atoms = instance.getAtoms();
        const relations = instance.getRelations();

        // Should have 2 atoms: the parent object and the converted rational number
        expect(atoms).toHaveLength(2);

        // Find the number atom
        const numberAtom = atoms.find(a => a.type === 'Number');
        expect(numberAtom).toBeDefined();
        expect(numberAtom?.label).toBe('1.5'); // 3/2 = 1.5

        // Should have 1 relation connecting the parent to the rational number
        expect(relations).toHaveLength(1);
        expect(relations[0].id).toBe('value');
    });

    it('should handle multiple rational numbers', () => {
        const pyretDataWithRationals = {
            dict: {
                half: { n: 1, d: 2 },
                quarter: { n: 1, d: 4 },
                threeHalves: { n: 3, d: 2 }
            },
            brands: { "$brandtest": true },
            $name: "Fractions"
        };

        const instance = new PyretDataInstance(pyretDataWithRationals);
        const atoms = instance.getAtoms();

        // Find all number atoms
        const numberAtoms = atoms.filter(a => a.type === 'Number');
        expect(numberAtoms).toHaveLength(3);

        const labels = numberAtoms.map(a => a.label).sort();
        expect(labels).toContain('0.5');   // 1/2
        expect(labels).toContain('0.25');  // 1/4
        expect(labels).toContain('1.5');   // 3/2
    });
});