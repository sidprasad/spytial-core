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

    it('should reify diamond-shaped data (shared atom) correctly without duplication or error', () => {
        // Diamond: Root -> Left -> Shared, Root -> Right -> Shared
        // The same JS object reference is used for `sharedLeaf` in both branches.
        const sharedLeaf: any = {
            dict: { value: 42 },
            brands: { "$brandExampleData": true, "$brandLeafNode": true },
            $name: "LeafNode"
        };
        const diamond: any = {
            dict: {
                left: {
                    dict: { child: sharedLeaf },
                    brands: { "$brandExampleData": true, "$brandInner": true },
                    $name: "Inner"
                },
                right: {
                    dict: { child: sharedLeaf },
                    brands: { "$brandExampleData": true, "$brandInner": true },
                    $name: "Inner"
                }
            },
            brands: { "$brandExampleData": true, "$brandRoot": true },
            $name: "Root"
        };

        const instance = new PyretDataInstance(diamond);
        const reified = instance.reify();

        // The shared leaf should appear the same way in both branches
        expect(reified).toBeDefined();
        expect(typeof reified).toBe('string');
        // Should not contain any cycle markers — the diamond is not a cycle
        expect(reified).not.toContain('/* cycle:');
        // Both branches should refer to the same leaf by the same representation
        const normalised = reified.replace(/\s+/g, '');
        expect(normalised).toBe('Root(Inner(LeafNode(42)),Inner(LeafNode(42)))');
    });

    it('should handle self-loop cycles without infinite recursion', () => {
        // Build a root that points to a self-referencing node (so root is not in any cycle)
        const selfRef: any = {
            dict: {},
            brands: { "$brandCycleTest": true, "$brandNode": true },
            $name: "Node"
        };
        selfRef.dict.self = selfRef;

        const root: any = {
            dict: { loop: selfRef },
            brands: { "$brandCycleTest": true, "$brandRoot": true },
            $name: "Root"
        };

        const instance = new PyretDataInstance(root);
        // Must terminate without throwing or hanging
        const reified = instance.reify();

        expect(reified).toBeDefined();
        expect(typeof reified).toBe('string');
        // The self-loop should be reported as a cycle marker
        expect(reified).toContain('/* cycle:');
    });

    it('should handle mutual cycles (A -> B -> A) without infinite recursion', () => {
        // nodeA.child = nodeB, nodeB.parent = nodeA (mutual cycle); root -> nodeA is the entry
        const nodeA: any = {
            dict: {},
            brands: { "$brandMutual": true, "$brandNodeA": true },
            $name: "NodeA"
        };
        const nodeB: any = {
            dict: {},
            brands: { "$brandMutual": true, "$brandNodeB": true },
            $name: "NodeB"
        };
        nodeA.dict.child = nodeB;
        nodeB.dict.parent = nodeA;

        const root: any = {
            dict: { entry: nodeA },
            brands: { "$brandMutual": true, "$brandRoot": true },
            $name: "Root"
        };

        const instance = new PyretDataInstance(root);
        // Must terminate without throwing or hanging
        const reified = instance.reify();

        expect(reified).toBeDefined();
        expect(typeof reified).toBe('string');
        // Must detect the cycle and not hang
        expect(reified).toContain('/* cycle:');
    });
});