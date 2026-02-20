import { describe, it, expect, vi } from 'vitest';
import { DotDataInstance } from '../src/data-instance/dot/dot-data-instance';
import type { DotTypeConfig, DotDataInstanceOptions } from '../src/data-instance/dot/dot-data-instance';
import type { IAtom, ITuple, DataInstanceEvent } from '../src/data-instance/interfaces';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Convenience: collect all atom IDs from an instance. */
const atomIds = (inst: DotDataInstance) =>
  inst.getAtoms().map((a) => a.id).sort();

/** Convenience: collect all type IDs from an instance. */
const typeIds = (inst: DotDataInstance) =>
  inst.getTypes().map((t) => t.id).sort();

/** Convenience: collect all relation IDs from an instance. */
const relationIds = (inst: DotDataInstance) =>
  inst.getRelations().map((r) => r.id).sort();

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BASIC PARSING — Core DOT subset
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — basic parsing', () => {
  it('parses an empty digraph', () => {
    const inst = new DotDataInstance('digraph {}');
    expect(inst.getAtoms()).toHaveLength(0);
    expect(inst.getRelations()).toHaveLength(0);
    expect(inst.getTypes()).toHaveLength(0);
    expect(inst.nodeCount).toBe(0);
    expect(inst.edgeCount).toBe(0);
  });

  it('parses nodes from edge declarations', () => {
    const inst = new DotDataInstance('digraph { a -> b; b -> c; }');
    expect(atomIds(inst)).toEqual(['a', 'b', 'c']);
    expect(inst.nodeCount).toBe(3);
    expect(inst.edgeCount).toBe(2);
  });

  it('assigns default type "Node" to untyped nodes', () => {
    const inst = new DotDataInstance('digraph { a -> b; }');
    for (const atom of inst.getAtoms()) {
      expect(atom.type).toBe('Node');
    }
    expect(typeIds(inst)).toEqual(['Node']);
  });

  it('uses node ID as label when no label attribute is present', () => {
    const inst = new DotDataInstance('digraph { myNode; }');
    const atom = inst.getAtoms().find((a) => a.id === 'myNode');
    expect(atom).toBeDefined();
    expect(atom!.label).toBe('myNode');
  });

  it('reads the label attribute from nodes', () => {
    const inst = new DotDataInstance(
      'digraph { alice [label="Alice Johnson"]; }',
    );
    const atom = inst.getAtoms().find((a) => a.id === 'alice');
    expect(atom!.label).toBe('Alice Johnson');
  });

  it('assigns unlabeled edges the default relation name "edge"', () => {
    const inst = new DotDataInstance('digraph { a -> b; }');
    const rels = inst.getRelations();
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe('edge');
    expect(rels[0].name).toBe('edge');
  });

  it('uses edge label as relation name', () => {
    const inst = new DotDataInstance(
      'digraph { a -> b [label="knows"]; }',
    );
    expect(relationIds(inst)).toEqual(['knows']);
  });

  it('groups edges with the same label into one relation', () => {
    const inst = new DotDataInstance(`digraph {
      a -> b [label="friends"];
      c -> d [label="friends"];
      a -> c [label="colleagues"];
    }`);
    const rels = inst.getRelations();
    expect(rels).toHaveLength(2);

    const friends = rels.find((r) => r.id === 'friends');
    expect(friends!.tuples).toHaveLength(2);

    const colleagues = rels.find((r) => r.id === 'colleagues');
    expect(colleagues!.tuples).toHaveLength(1);
  });

  it('handles self-loops', () => {
    const inst = new DotDataInstance('digraph { a -> a [label="self"]; }');
    const rels = inst.getRelations();
    expect(rels).toHaveLength(1);
    expect(rels[0].tuples[0].atoms).toEqual(['a', 'a']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TYPE EXTRACTION — reading types from DOT
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — type extraction', () => {
  it('extracts type from node attribute (default mode)', () => {
    const inst = new DotDataInstance(`digraph {
      alice [label="Alice" type="Person"];
      cs101 [label="CS 101" type="Course"];
    }`);

    const alice = inst.getAtoms().find((a) => a.id === 'alice')!;
    expect(alice.type).toBe('Person');

    const cs101 = inst.getAtoms().find((a) => a.id === 'cs101')!;
    expect(cs101.type).toBe('Course');

    expect(typeIds(inst)).toEqual(['Course', 'Person']);
  });

  it('falls back to default type when attribute is missing', () => {
    const inst = new DotDataInstance(`digraph {
      alice [label="Alice" type="Person"];
      untyped [label="???"];
    }`);

    const untyped = inst.getAtoms().find((a) => a.id === 'untyped')!;
    expect(untyped.type).toBe('Node');
  });

  it('supports custom type attribute name', () => {
    const inst = new DotDataInstance(
      'digraph { alice [label="Alice" kind="Human"]; }',
      { typeAttribute: 'kind' },
    );
    const alice = inst.getAtoms().find((a) => a.id === 'alice')!;
    expect(alice.type).toBe('Human');
  });

  it('supports custom default type', () => {
    const inst = new DotDataInstance('digraph { a -> b; }', {
      typeConfig: { defaultType: 'Entity' },
    });
    for (const atom of inst.getAtoms()) {
      expect(atom.type).toBe('Entity');
    }
  });

  it('supports custom default relation name', () => {
    const inst = new DotDataInstance('digraph { a -> b; }', {
      defaultRelationName: 'link',
    });
    expect(inst.getRelations()[0].id).toBe('link');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. TYPE HIERARCHY — the extends chain
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — type hierarchy', () => {
  const typeConfig: DotTypeConfig = {
    types: {
      Entity: {},
      Person: { extends: 'Entity' },
      Student: { extends: 'Person' },
      Faculty: { extends: 'Person' },
      Course: { extends: 'Entity' },
    },
    defaultType: 'Entity',
  };

  const dot = `digraph {
    alice [label="Alice" type="Student"];
    bob   [label="Bob"   type="Faculty"];
    cs101 [label="CS 101" type="Course"];
    alice -> cs101 [label="enrolled"];
    bob   -> cs101 [label="teaches"];
  }`;

  it('builds correct hierarchy arrays', () => {
    const inst = new DotDataInstance(dot, { typeConfig });

    const studentType = inst
      .getTypes()
      .find((t) => t.id === 'Student')!;
    expect(studentType.types).toEqual(['Student', 'Person', 'Entity']);

    const facultyType = inst
      .getTypes()
      .find((t) => t.id === 'Faculty')!;
    expect(facultyType.types).toEqual(['Faculty', 'Person', 'Entity']);

    const courseType = inst
      .getTypes()
      .find((t) => t.id === 'Course')!;
    expect(courseType.types).toEqual(['Course', 'Entity']);
  });

  it('flat hierarchy when no config is given', () => {
    const inst = new DotDataInstance(dot);
    // Without config, each type just has itself.
    for (const t of inst.getTypes()) {
      expect(t.types).toEqual([t.id]);
    }
  });

  it('auto-creates parent types referenced in extends', () => {
    const config: DotTypeConfig = {
      types: {
        Student: { extends: 'Person' },
        // Person is NOT declared — should be auto-created.
      },
    };
    const inst = new DotDataInstance(
      'digraph { a [type="Student"]; }',
      { typeConfig: config },
    );
    const descriptors = inst.getTypeDescriptors();
    expect(descriptors['Person']).toBeDefined();
  });

  it('typeIsOfType checks ancestry correctly', () => {
    const inst = new DotDataInstance(dot, { typeConfig });
    expect(inst.typeIsOfType('Student', 'Entity')).toBe(true);
    expect(inst.typeIsOfType('Student', 'Person')).toBe(true);
    expect(inst.typeIsOfType('Student', 'Student')).toBe(true);
    expect(inst.typeIsOfType('Student', 'Course')).toBe(false);
    expect(inst.typeIsOfType('Faculty', 'Entity')).toBe(true);
    expect(inst.typeIsOfType('Entity', 'Student')).toBe(false);
  });

  it('getTopLevelTypeId returns the root', () => {
    const inst = new DotDataInstance(dot, { typeConfig });
    expect(inst.getTopLevelTypeId('Student')).toBe('Entity');
    expect(inst.getTopLevelTypeId('Person')).toBe('Entity');
    expect(inst.getTopLevelTypeId('Entity')).toBe('Entity');
  });

  it('handles cyclic extends gracefully', () => {
    const config: DotTypeConfig = {
      types: {
        A: { extends: 'B' },
        B: { extends: 'A' }, // cycle!
      },
    };
    const inst = new DotDataInstance('digraph { x [type="A"]; }', {
      typeConfig: config,
    });
    // Should not infinite loop. Hierarchy should stop at cycle.
    const aType = inst.getTypes().find((t) => t.id === 'A')!;
    expect(aType.types).toContain('A');
    expect(aType.types).toContain('B');
    expect(aType.types.length).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BUILT-IN TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — built-in types', () => {
  it('marks types as builtin via descriptor', () => {
    const inst = new DotDataInstance(
      'digraph { n1 [type="Int"]; n2 [type="Person"]; }',
      {
        typeConfig: {
          types: {
            Int: { isBuiltin: true },
            Person: {},
          },
        },
      },
    );
    const intType = inst.getTypes().find((t) => t.id === 'Int')!;
    expect(intType.isBuiltin).toBe(true);

    const personType = inst.getTypes().find((t) => t.id === 'Person')!;
    expect(personType.isBuiltin).toBe(false);
  });

  it('marks types as builtin via builtinTypes array', () => {
    const inst = new DotDataInstance(
      'digraph { n1 [type="String"]; }',
      {
        typeConfig: {
          builtinTypes: ['String'],
        },
      },
    );
    const strType = inst.getTypes().find((t) => t.id === 'String')!;
    expect(strType.isBuiltin).toBe(true);
  });

  it('merges both builtin sources', () => {
    const inst = new DotDataInstance(
      'digraph { a [type="Int"]; b [type="Bool"]; }',
      {
        typeConfig: {
          types: {
            Int: { isBuiltin: true },
          },
          builtinTypes: ['Bool'],
        },
      },
    );
    expect(inst.getTypes().find((t) => t.id === 'Int')!.isBuiltin).toBe(
      true,
    );
    expect(
      inst.getTypes().find((t) => t.id === 'Bool')!.isBuiltin,
    ).toBe(true);
  });

  it('isBuiltin defaults to false for all types when no config', () => {
    const inst = new DotDataInstance('digraph { a -> b; }');
    for (const t of inst.getTypes()) {
      expect(t.isBuiltin).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. getAtomType / getTypes — registry correctness
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — getAtomType & getTypes', () => {
  it('getAtomType returns correct hierarchy for typed nodes', () => {
    const inst = new DotDataInstance(
      'digraph { alice [type="Person"]; }',
      {
        typeConfig: {
          types: { Person: { extends: 'Entity' }, Entity: {} },
        },
      },
    );
    const t = inst.getAtomType('alice');
    expect(t.id).toBe('Person');
    expect(t.types).toEqual(['Person', 'Entity']);
    expect(t.atoms).toHaveLength(1);
    expect(t.atoms[0].id).toBe('alice');
  });

  it('getAtomType throws for nonexistent atom', () => {
    const inst = new DotDataInstance('digraph { a; }');
    expect(() => inst.getAtomType('nonexistent')).toThrow(/not found/);
  });

  it('getTypes groups atoms correctly', () => {
    const inst = new DotDataInstance(`digraph {
      a [type="Person"];
      b [type="Person"];
      c [type="Course"];
    }`);

    const personType = inst.getTypes().find((t) => t.id === 'Person')!;
    expect(personType.atoms).toHaveLength(2);

    const courseType = inst.getTypes().find((t) => t.id === 'Course')!;
    expect(courseType.atoms).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. RELATIONS — tuple and type correctness
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — relations', () => {
  it('relation types reflect actual source/target types', () => {
    const inst = new DotDataInstance(`digraph {
      alice [type="Person"];
      cs101 [type="Course"];
      alice -> cs101 [label="enrolled"];
    }`);

    const enrolled = inst.getRelations().find((r) => r.id === 'enrolled')!;
    expect(enrolled.types).toEqual(['Person', 'Course']);
    expect(enrolled.tuples).toHaveLength(1);
    expect(enrolled.tuples[0].atoms).toEqual(['alice', 'cs101']);
    expect(enrolled.tuples[0].types).toEqual(['Person', 'Course']);
  });

  it('relation types union across heterogeneous edges', () => {
    const inst = new DotDataInstance(`digraph {
      a [type="Person"];
      b [type="Student"];
      c [type="Course"];
      a -> c [label="enrolled"];
      b -> c [label="enrolled"];
    }`);

    const enrolled = inst.getRelations().find((r) => r.id === 'enrolled')!;
    // Source types should be Person|Student (unioned), target is Course.
    expect(enrolled.types[0].split('|').sort()).toEqual([
      'Person',
      'Student',
    ]);
    expect(enrolled.types[1]).toBe('Course');
    expect(enrolled.tuples).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. MUTATIONS — addAtom, removeAtom, addRelationTuple, removeRelationTuple
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — mutations', () => {
  it('addAtom adds to atoms and type registry', () => {
    const inst = new DotDataInstance('digraph {}');
    inst.addAtom({ id: 'a', type: 'Person', label: 'Alice' });

    expect(inst.nodeCount).toBe(1);
    expect(inst.getAtoms()[0].id).toBe('a');
    expect(inst.getTypes().find((t) => t.id === 'Person')).toBeDefined();
  });

  it('addAtom throws on duplicate ID', () => {
    const inst = new DotDataInstance('digraph { a; }');
    expect(() =>
      inst.addAtom({ id: 'a', type: 'Node', label: 'dup' }),
    ).toThrow(/already exists/);
  });

  it('removeAtom removes from atoms, type registry, and graph', () => {
    const inst = new DotDataInstance('digraph { a -> b [label="knows"]; }');
    expect(inst.nodeCount).toBe(2);
    expect(inst.edgeCount).toBe(1);

    inst.removeAtom('a');
    expect(inst.nodeCount).toBe(1);
    expect(inst.edgeCount).toBe(0); // edge removed with node
    expect(atomIds(inst)).toEqual(['b']);
  });

  it('removeAtom throws for nonexistent atom', () => {
    const inst = new DotDataInstance('digraph {}');
    expect(() => inst.removeAtom('nope')).toThrow(/does not exist/);
  });

  it('addRelationTuple adds an edge', () => {
    const inst = new DotDataInstance('digraph { a; b; }');
    const tuple: ITuple = {
      atoms: ['a', 'b'],
      types: ['Node', 'Node'],
    };
    inst.addRelationTuple('knows', tuple);
    expect(inst.edgeCount).toBe(1);

    const rels = inst.getRelations();
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe('knows');
  });

  it('addRelationTuple throws on duplicate', () => {
    const inst = new DotDataInstance('digraph { a; b; }');
    const tuple: ITuple = {
      atoms: ['a', 'b'],
      types: ['Node', 'Node'],
    };
    inst.addRelationTuple('knows', tuple);
    expect(() => inst.addRelationTuple('knows', tuple)).toThrow(
      /already exists/,
    );
  });

  it('removeRelationTuple removes the edge', () => {
    const inst = new DotDataInstance('digraph { a; b; }');
    const tuple: ITuple = {
      atoms: ['a', 'b'],
      types: ['Node', 'Node'],
    };
    inst.addRelationTuple('knows', tuple);
    expect(inst.edgeCount).toBe(1);

    inst.removeRelationTuple('knows', tuple);
    expect(inst.edgeCount).toBe(0);
  });

  it('removeRelationTuple throws for nonexistent tuple', () => {
    const inst = new DotDataInstance('digraph { a; b; }');
    expect(() =>
      inst.removeRelationTuple('knows', {
        atoms: ['a', 'b'],
        types: ['Node', 'Node'],
      }),
    ).toThrow(/does not exist/);
  });

  it('edge naming is consistent between parser and mutations', () => {
    // Edges created by the parser and by addRelationTuple should both
    // be removable via removeRelationTuple.
    const inst = new DotDataInstance('digraph { a -> b [label="rel"]; }');
    expect(inst.edgeCount).toBe(1);

    // Remove the parser-created edge.
    inst.removeRelationTuple('rel', {
      atoms: ['a', 'b'],
      types: ['Node', 'Node'],
    });
    expect(inst.edgeCount).toBe(0);

    // Re-add via mutation.
    inst.addRelationTuple('rel', {
      atoms: ['a', 'b'],
      types: ['Node', 'Node'],
    });
    expect(inst.edgeCount).toBe(1);

    // Remove again.
    inst.removeRelationTuple('rel', {
      atoms: ['a', 'b'],
      types: ['Node', 'Node'],
    });
    expect(inst.edgeCount).toBe(0);
  });

  it('addRelationTuple rejects tuples with < 2 atoms', () => {
    const inst = new DotDataInstance('digraph { a; }');
    expect(() =>
      inst.addRelationTuple('x', { atoms: ['a'], types: ['Node'] }),
    ).toThrow(/at least 2 atoms/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EVENT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — events', () => {
  it('fires atomAdded events', () => {
    const inst = new DotDataInstance('digraph {}');
    const events: DataInstanceEvent[] = [];
    inst.addEventListener('atomAdded', (e) => events.push(e));

    inst.addAtom({ id: 'a', type: 'Node', label: 'A' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('atomAdded');
    expect(events[0].data.atom!.id).toBe('a');
  });

  it('fires atomRemoved events', () => {
    const inst = new DotDataInstance('digraph { a; }');
    const events: DataInstanceEvent[] = [];
    inst.addEventListener('atomRemoved', (e) => events.push(e));

    inst.removeAtom('a');
    expect(events).toHaveLength(1);
    expect(events[0].data.atomId).toBe('a');
  });

  it('fires relationTupleAdded / relationTupleRemoved events', () => {
    const inst = new DotDataInstance('digraph { a; b; }');
    const added: DataInstanceEvent[] = [];
    const removed: DataInstanceEvent[] = [];
    inst.addEventListener('relationTupleAdded', (e) => added.push(e));
    inst.addEventListener('relationTupleRemoved', (e) =>
      removed.push(e),
    );

    const tuple: ITuple = {
      atoms: ['a', 'b'],
      types: ['Node', 'Node'],
    };
    inst.addRelationTuple('rel', tuple);
    inst.removeRelationTuple('rel', tuple);

    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
  });

  it('removeEventListener stops delivery', () => {
    const inst = new DotDataInstance('digraph {}');
    const events: DataInstanceEvent[] = [];
    const listener = (e: DataInstanceEvent) => events.push(e);

    inst.addEventListener('atomAdded', listener);
    inst.addAtom({ id: 'a', type: 'Node', label: 'A' });
    expect(events).toHaveLength(1);

    inst.removeEventListener('atomAdded', listener);
    inst.addAtom({ id: 'b', type: 'Node', label: 'B' });
    expect(events).toHaveLength(1); // no new event
  });

  it('listener errors do not break other listeners', () => {
    const inst = new DotDataInstance('digraph {}');
    const events: DataInstanceEvent[] = [];

    inst.addEventListener('atomAdded', () => {
      throw new Error('boom');
    });
    inst.addEventListener('atomAdded', (e) => events.push(e));

    // Should not throw.
    inst.addAtom({ id: 'a', type: 'Node', label: 'A' });
    expect(events).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. generateGraph — immutability
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — generateGraph', () => {
  it('returns a fresh graph (does not mutate the source)', () => {
    const inst = new DotDataInstance('digraph { a; b; a -> b [label="r"]; }');
    const originalNodeCount = inst.nodeCount;

    const graph = inst.generateGraph(false, false);
    expect(graph.nodeCount()).toBe(originalNodeCount);

    // Mutate the returned graph.
    graph.removeNode('a');
    expect(graph.nodeCount()).toBe(1);

    // Source is unaffected.
    expect(inst.nodeCount).toBe(originalNodeCount);
  });

  it('hideDisconnected removes isolated nodes from the copy', () => {
    const inst = new DotDataInstance(
      'digraph { a -> b [label="r"]; lonely; }',
    );
    const graph = inst.generateGraph(true, false);
    expect(graph.hasNode('lonely')).toBe(false);
    expect(graph.hasNode('a')).toBe(true);

    // Source unaffected.
    expect(inst.nodeCount).toBe(3);
  });

  it('hideDisconnectedBuiltIns only hides builtin isolated nodes', () => {
    const inst = new DotDataInstance(
      'digraph { a -> b [label="r"]; lonely [type="Int"]; free [type="Person"]; }',
      {
        typeConfig: {
          types: { Int: { isBuiltin: true }, Person: {} },
        },
      },
    );
    const graph = inst.generateGraph(false, true);
    expect(graph.hasNode('lonely')).toBe(false); // Int is builtin + disconnected
    expect(graph.hasNode('free')).toBe(true); // Person is not builtin
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. applyProjections — returns new instance
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — applyProjections', () => {
  it('returns a new instance with only the specified atoms', () => {
    const inst = new DotDataInstance(`digraph {
      a [type="Person" label="Alice"];
      b [type="Person" label="Bob"];
      c [type="Course" label="CS"];
      a -> c [label="enrolled"];
      b -> c [label="enrolled"];
    }`);

    const projected = inst.applyProjections(['a', 'c']);
    expect(projected.nodeCount).toBe(2);
    expect(atomIds(projected)).toEqual(['a', 'c']);

    // Only edges between kept atoms survive.
    expect(projected.edgeCount).toBe(1);
    expect(projected.getRelations()[0].id).toBe('enrolled');

    // Original is unaffected.
    expect(inst.nodeCount).toBe(3);
  });

  it('preserves type attributes in projection', () => {
    const inst = new DotDataInstance(
      'digraph { a [type="Person" label="Alice"]; b; a -> b [label="r"]; }',
      { typeConfig: { types: { Person: { extends: 'Entity' } } } },
    );
    const projected = inst.applyProjections(['a']);
    const atom = projected.getAtoms().find((a) => a.id === 'a')!;
    expect(atom.type).toBe('Person');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. reify — round-trip to DOT
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — reify', () => {
  it('produces valid DOT that can be re-parsed', () => {
    const inst = new DotDataInstance(`digraph {
      alice [label="Alice" type="Person"];
      bob [label="Bob" type="Person"];
      alice -> bob [label="knows"];
    }`);

    const dotString = inst.reify();
    expect(dotString).toContain('digraph');
    expect(dotString).toContain('knows');

    // Re-parse the output and verify.
    const inst2 = new DotDataInstance(dotString);
    expect(inst2.nodeCount).toBe(inst.nodeCount);
    expect(inst2.edgeCount).toBe(inst.edgeCount);
  });

  it('preserves type attribute in reified DOT', () => {
    const inst = new DotDataInstance(
      'digraph { a [label="A" type="Foo"]; }',
    );
    const dot = inst.reify();
    expect(dot).toContain('type="Foo"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. addFromDataInstance
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — addFromDataInstance', () => {
  it('merges atoms and relations from another instance', () => {
    const inst1 = new DotDataInstance('digraph { a -> b [label="r"]; }');
    const inst2 = new DotDataInstance('digraph { c -> d [label="s"]; }');

    const success = inst1.addFromDataInstance(inst2, false);
    expect(success).toBe(true);
    expect(inst1.nodeCount).toBe(4);
    expect(atomIds(inst1)).toEqual(['a', 'b', 'c', 'd']);

    const rels = inst1.getRelations();
    expect(rels).toHaveLength(2);
  });

  it('handles ID conflicts by remapping', () => {
    const inst1 = new DotDataInstance('digraph { a; }');
    const inst2 = new DotDataInstance('digraph { a; }');

    const success = inst1.addFromDataInstance(inst2, false);
    expect(success).toBe(false); // conflict occurred
    expect(inst1.nodeCount).toBe(2); // both atoms exist, one remapped
  });

  it('unifies built-in atoms when unifyBuiltIns=true', () => {
    const config: DotDataInstanceOptions = {
      typeConfig: {
        types: { Int: { isBuiltin: true } },
      },
    };
    const inst1 = new DotDataInstance(
      'digraph { n1 [type="Int" label="1"]; }',
      config,
    );
    const inst2 = new DotDataInstance(
      'digraph { n2 [type="Int" label="1"]; }',
      config,
    );

    inst1.addFromDataInstance(inst2, true);
    // The Int atom with label "1" should be unified — only 1 atom.
    expect(inst1.nodeCount).toBe(1);
  });

  it('imports type descriptors from the source', () => {
    const inst1 = new DotDataInstance('digraph { a [type="Person"]; }');
    const inst2 = new DotDataInstance('digraph { b [type="Student"]; }', {
      typeConfig: {
        types: { Student: { extends: 'Person' } },
      },
    });

    inst1.addFromDataInstance(inst2, false);
    // inst1 should now know about the Student → Person hierarchy.
    expect(inst1.typeIsOfType('Student', 'Person')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe('DotDataInstance — edge cases', () => {
  it('handles nodes with no edges', () => {
    const inst = new DotDataInstance('digraph { lonely; }');
    expect(inst.nodeCount).toBe(1);
    expect(inst.edgeCount).toBe(0);
    expect(inst.getRelations()).toHaveLength(0);
  });

  it('handles multiple edges between same nodes', () => {
    const inst = new DotDataInstance(`digraph {
      a -> b [label="knows"];
      a -> b [label="likes"];
    }`);
    expect(inst.edgeCount).toBe(2);
    expect(inst.getRelations()).toHaveLength(2);
  });

  it('handles undirected graphs', () => {
    const inst = new DotDataInstance('graph { a -- b [label="friend"]; }');
    const rels = inst.getRelations();
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe('friend');
  });

  it('reify produces correct operator for undirected graphs', () => {
    const inst = new DotDataInstance('graph { a -- b [label="r"]; }');
    const dot = inst.reify();
    expect(dot).toContain('--');
    expect(dot).not.toContain('->');
  });
});
