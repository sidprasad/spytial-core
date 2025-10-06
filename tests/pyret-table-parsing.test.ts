import { describe, it, expect } from 'vitest';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

describe('Pyret Table Parsing', () => {
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
            ["PVD", "DCA"],
            ["DCA", "PVD"],
            ["DCA", "ORD"],
            ["ORD", "DCA"],
            ["DCA", "IAH"],
            ["IAH", "DCA"],
            ["ORD", "BMG"],
            ["BMG", "ORD"],
            ["DEN", "SFO"],
            ["SFO", "DEN"],
            ["IAH", "SFO"],
            ["SFO", "IAH"]
          ]
        },
        "brands": {
          "$brandtable168": true
        }
      }
    },
    "brands": [],
    "$name": "cnd"
  };

  it('should parse Pyret table data correctly', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const atoms = instance.getAtoms();
    const relations = instance.getRelations();

    console.log('Atoms:', atoms.map(a => ({ id: a.id, type: a.type, label: a.label })));
    console.log('Relations:', relations.map(r => ({ name: r.name, tuples: r.tuples })));

    // The table should have atoms for the table object, rows, and values
    expect(atoms.length).toBeGreaterThan(0);
  });

  it('should identify table headers', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    console.log('All relation names:', relations.map(r => r.name));
    
    // We should have a relation for the header
    const headerRelation = relations.find(r => r.name === '_header-raw-array');
    expect(headerRelation).toBeDefined();
  });

  it('should parse table rows correctly', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    // We should have a relation for rows
    const rowsRelation = relations.find(r => r.name === '_rows-raw-array');
    expect(rowsRelation).toBeDefined();
  });
});
