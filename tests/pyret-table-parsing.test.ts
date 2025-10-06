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
    // - Array objects for each row (14 rows)
    // - String atoms for header values (origin, destination)
    // - String atoms for unique airport codes
    expect(atoms.length).toBeGreaterThan(0);
    
    // Check that we have the expected types
    const types = [...new Set(atoms.map(a => a.type))];
    expect(types).toContain('cnd');
    expect(types).toContain('table');
    expect(types).toContain('Array');
    expect(types).toContain('String');
  });

  it('should identify table headers', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    // We should have a relation for the header
    const headerRelation = relations.find(r => r.name === '_header-raw-array');
    expect(headerRelation).toBeDefined();
    
    // The header relation should have 2 tuples (origin and destination)
    expect(headerRelation?.tuples.length).toBe(2);
    
    // Get the atoms for the header values
    const atoms = instance.getAtoms();
    const headerAtoms = headerRelation!.tuples.map(t => {
      const atomId = t.atoms[1]; // Second atom in tuple is the value
      return atoms.find(a => a.id === atomId);
    });
    
    const headerLabels = headerAtoms.map(a => a?.label);
    expect(headerLabels).toContain('origin');
    expect(headerLabels).toContain('destination');
  });

  it('should parse table rows correctly', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    // We should have a relation for rows
    const rowsRelation = relations.find(r => r.name === '_rows-raw-array');
    expect(rowsRelation).toBeDefined();
    
    // The rows relation should have 14 tuples (14 rows)
    expect(rowsRelation?.tuples.length).toBe(14);
  });

  it('should create atoms for array elements', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const atoms = instance.getAtoms();
    
    // Check that we have Array atoms for each row
    const arrayAtoms = atoms.filter(a => a.type === 'Array');
    expect(arrayAtoms.length).toBe(14); // 14 rows in the table
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

  it('should handle element relations for nested arrays', () => {
    const instance = new PyretDataInstance(pyretTableData);
    const relations = instance.getRelations();
    
    // We should have an 'element' relation for the nested array elements
    const elementRelation = relations.find(r => r.name === 'element');
    expect(elementRelation).toBeDefined();
    
    // Each row has 2 elements (origin and destination), so 14 rows * 2 = 28 elements
    expect(elementRelation?.tuples.length).toBeGreaterThanOrEqual(28);
  });
});
