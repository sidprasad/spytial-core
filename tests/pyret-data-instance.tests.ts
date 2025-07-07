import { describe, it, expect } from 'vitest';
import { PyretDataInstance, createPyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

describe('PyretDataInstance', () => {
    
    
    const pyretData = {
        "dict": {
            "value": 11,
            "left": {
                "dict": {
                    "_output": {
                        "name": "_output"
                    },
                    "_match": {
                        "name": "leaf"
                    }
                },
                "brands": {
                    "$brandTree988": true,
                    "$brandleaf990": true
                },
                "$name": "leaf",
                "$loc": [
                    "definitions://",
                    10,
                    2,
                    157,
                    10,
                    8,
                    163
                ],
                "$mut_fields_mask": [],
                "$arity": -1,
                "$constructor": {
                    "_output": {
                        "name": "_output"
                    },
                    "_match": {
                        "name": "leaf"
                    }
                }
            },
            "right": {
                "dict": {
                    "value": -1,
                    "left": {
                        "dict": {
                            "value": 1,
                            "left": {
                                "dict": {
                                    "_output": {
                                        "name": "_output"
                                    },
                                    "_match": {
                                        "name": "leaf"
                                    }
                                },
                                "brands": {
                                    "$brandTree988": true,
                                    "$brandleaf990": true
                                },
                                "$name": "leaf",
                                "$loc": [
                                    "definitions://",
                                    10,
                                    2,
                                    157,
                                    10,
                                    8,
                                    163
                                ],
                                "$mut_fields_mask": [],
                                "$arity": -1,
                                "$constructor": {
                                    "_output": {
                                        "name": "_output"
                                    },
                                    "_match": {
                                        "name": "leaf"
                                    }
                                }
                            },
                            "right": {
                                "dict": {
                                    "_output": {
                                        "name": "_output"
                                    },
                                    "_match": {
                                        "name": "leaf"
                                    }
                                },
                                "brands": {
                                    "$brandTree988": true,
                                    "$brandleaf990": true
                                },
                                "$name": "leaf",
                                "$loc": [
                                    "definitions://",
                                    10,
                                    2,
                                    157,
                                    10,
                                    8,
                                    163
                                ],
                                "$mut_fields_mask": [],
                                "$arity": -1,
                                "$constructor": {
                                    "_output": {
                                        "name": "_output"
                                    },
                                    "_match": {
                                        "name": "leaf"
                                    }
                                }
                            }
                        },
                        "brands": {
                            "$brandTree988": true,
                            "$brandtnode989": true
                        }
                    },
                    "right": {
                        "dict": {
                            "_output": {
                                "name": "_output"
                            },
                            "_match": {
                                "name": "leaf"
                            }
                        },
                        "brands": {
                            "$brandTree988": true,
                            "$brandleaf990": true
                        },
                        "$name": "leaf",
                        "$loc": [
                            "definitions://",
                            10,
                            2,
                            157,
                            10,
                            8,
                            163
                        ],
                        "$mut_fields_mask": [],
                        "$arity": -1,
                        "$constructor": {
                            "_output": {
                                "name": "_output"
                            },
                            "_match": {
                                "name": "leaf"
                            }
                        }
                    }
                },
                "brands": {
                    "$brandTree988": true,
                    "$brandtnode989": true
                }
            }
        },
        "brands": {
            "$brandTree988": true,
            "$brandtnode989": true
        }
    };

    it('should parse atoms correctly', () => {
        const instance = new PyretDataInstance(pyretData);
        const atoms = instance.getAtoms();

        expect(atoms).toHaveLength(4); // tnode, leaf, tnode, and value atoms
        expect(atoms.map(atom => atom.type)).toContain('tnode');
        expect(atoms.map(atom => atom.type)).toContain('leaf');
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
        expect(leftRelation?.tuples).toHaveLength(1);
        expect(leftRelation?.tuples[0].atoms).toEqual(['atom_1', 'atom_2']); // Example IDs
    });

    it('should handle invalid input gracefully', () => {
        expect(() => new PyretDataInstance(null as any)).toThrow();
        expect(() => createPyretDataInstance('invalid json')).toThrow();
    });

    it('should apply projections correctly', () => {
        const instance = new PyretDataInstance(pyretData);
        const projected = instance.applyProjections(['atom_1', 'atom_2']); // Example IDs

        expect(projected.getAtoms()).toHaveLength(2);
        expect(projected.getRelations()).toHaveLength(1); // Only relations involving atom_1 and atom_2
    });
});