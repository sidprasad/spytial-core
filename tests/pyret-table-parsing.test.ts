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

    // The table should have atoms for:
    // - Root cnd object
    // - Table object
    // - String atoms for unique airport codes
    expect(atoms.length).toBeGreaterThan(0);
    
    // Check that we have the expected types
    const types = [...new Set(atoms.map(a => a.type))];
    expect(types).toContain('cnd');
    expect(types).toContain('table');
    expect(types).toContain('String');
  });

  it('should create semantic relational tuples from table rows', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    // We should have a relation named after the table type
    const tableRelation = relations.find(r => r.name === 'table');
    expect(tableRelation).toBeDefined();
    
    // The table relation should have 14 tuples (one per row)
    expect(tableRelation?.tuples.length).toBe(14);
    
    // Each tuple should be binary (2 atoms: origin and destination)
    tableRelation?.tuples.forEach(tuple => {
      expect(tuple.atoms.length).toBe(2);
    });
    
    // Check that the first tuple is (PVD, ORD)
    const atoms = instance.getAtoms();
    const firstTuple = tableRelation!.tuples[0];
    const firstOrigin = atoms.find(a => a.id === firstTuple.atoms[0]);
    const firstDestination = atoms.find(a => a.id === firstTuple.atoms[1]);
    expect(firstOrigin?.label).toBe('PVD');
    expect(firstDestination?.label).toBe('ORD');
  });

  it('should parse table rows correctly', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    // We should have a relation named 'table' with semantic tuples
    const tableRelation = relations.find(r => r.name === 'table');
    expect(tableRelation).toBeDefined();
    
    // The table relation should have 14 tuples (14 rows)
    expect(tableRelation?.tuples.length).toBe(14);
  });

  it('should create atoms for airport codes', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const atoms = instance.getAtoms();
    
    // Check that we have String atoms for airport codes
    const stringAtoms = atoms.filter(a => a.type === 'String');
    const airportCodes = stringAtoms.map(a => a.label).filter(l => l.length === 3 && l === l.toUpperCase());
    
    // We should have atoms for unique airport codes used in the table
    const uniqueAirports = new Set(['PVD', 'ORD', 'DCA', 'IAH', 'BMG', 'DEN', 'SFO']);
    uniqueAirports.forEach(airport => {
      expect(airportCodes).toContain(airport);
    });
  });

  it('should verify tuple structure represents table ⊆ Origin × Destination', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    const atoms = instance.getAtoms();
    
    // Get the table relation
    const tableRelation = relations.find(r => r.name === 'table');
    expect(tableRelation).toBeDefined();
    
    // Verify several known tuples exist
    const tuples = tableRelation!.tuples.map(t => ({
      origin: atoms.find(a => a.id === t.atoms[0])?.label,
      destination: atoms.find(a => a.id === t.atoms[1])?.label
    }));
    
    // Check for specific known routes
    expect(tuples).toContainEqual({ origin: 'PVD', destination: 'ORD' });
    expect(tuples).toContainEqual({ origin: 'ORD', destination: 'PVD' });
    expect(tuples).toContainEqual({ origin: 'DEN', destination: 'SFO' });
  });
});
