import { describe, it, expect } from 'vitest';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

describe('Pyret Table Graph Generation', () => {
  const pyretTableData = {
    "dict": {
      "r": {
        "dict": {
          "_header-raw-array": [
            "origin",
            "destination"
          ],
          "_rows-raw-array": [
            ["PVD", "ORD"],
            ["ORD", "PVD"],
            ["PVD", "DCA"]
          ]
        },
        "brands": {
          "$brandtable168": true
        }
      }
    },
    "brands": [],
    "$name": "flights"
  };

  it('should generate a valid graph from table data', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const graph = instance.generateGraph(false, false);

    expect(graph).toBeDefined();
    expect(graph.nodes().length).toBeGreaterThan(0);
    expect(graph.edges().length).toBeGreaterThan(0);
  });

  it('should correctly represent table structure in the graph', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const atoms = instance.getAtoms();
    const relations = instance.getRelations();
    
    // Check that we have the root object
    const rootAtom = atoms.find(a => a.type === 'flights');
    expect(rootAtom).toBeDefined();
    
    // Check that we have the table object
    const tableAtom = atoms.find(a => a.type === 'table');
    expect(tableAtom).toBeDefined();
    
    // Check that we have a relation connecting root to table
    const rRelation = relations.find(r => r.name === 'r');
    expect(rRelation).toBeDefined();
    expect(rRelation?.tuples.length).toBe(1);
  });

  it('should preserve string idempotency by default', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const atoms = instance.getAtoms();
    
    // PVD appears twice in the data, but should only have one atom (idempotent by default)
    const pvdAtoms = atoms.filter(a => a.label === 'PVD');
    expect(pvdAtoms.length).toBe(1);
    
    // ORD also appears twice
    const ordAtoms = atoms.filter(a => a.label === 'ORD');
    expect(ordAtoms.length).toBe(1);
  });

  it('should allow disabling string idempotency', () => {
    const instance = new PyretDataInstance(pyretTableData, { stringsIdempotent: false });
    const atoms = instance.getAtoms();
    
    // With idempotency disabled, PVD should have 3 separate atoms (2 in rows, 1 in header for "origin"... wait no)
    // Actually PVD appears 2 times in the rows data
    const pvdAtoms = atoms.filter(a => a.label === 'PVD');
    expect(pvdAtoms.length).toBeGreaterThanOrEqual(2);
    
    // ORD should also have multiple separate atoms
    const ordAtoms = atoms.filter(a => a.label === 'ORD');
    expect(ordAtoms.length).toBeGreaterThanOrEqual(2);
  });

  it('should properly structure semantic relational tuples', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    // The table should create a semantic relation with binary tuples
    const tableRelation = relations.find(r => r.name === 'table');
    expect(tableRelation).toBeDefined();
    expect(tableRelation?.tuples.length).toBe(3); // 3 rows
    
    // Each tuple should be binary (origin, destination)
    tableRelation?.tuples.forEach(tuple => {
      expect(tuple.atoms.length).toBe(2);
    });
  });
});
