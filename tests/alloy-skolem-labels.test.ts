import { describe, it, expect } from 'vitest';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { 
  getSkolemNamesForAtom,
  getInstanceSkolems
} from '../src/data-instance/alloy/alloy-instance/src/instance';
import { generateGraph, getAtomSkolems } from '../src/data-instance/alloy/alloy-graph';

/**
 * Test suite for Alloy Skolem attribute improvements.
 * 
 * This tests that atoms referenced by Skolem constants have their Skolem
 * names available as an attribute (IAtom.skolems), similar to how Sterling 
 * and Alloy Analyzer display them in graph visualizations.
 * 
 * The key design decision is that Skolems are stored as separate attributes
 * rather than modifying the atom label, which preserves atom identification
 * for evaluators and constraint enforcement.
 */
describe('Alloy Skolem Attributes', () => {
  // Sample Alloy XML with Skolems (from sample/unsat-grouping/datum.xml)
  const xmlWithSkolems = `
    <alloy builddate="Monday, October 28th, 2024">
    <instance bitwidth="4" maxseq="-1" command="temporary-name_ttt_1" filename="/no-name.rkt" version="3.5">

    <sig label="seq/Int" ID="0" parentID="1" builtin="yes">
    </sig>

    <sig label="Int" ID="1" parentID="2" builtin="yes">
    </sig>

    <sig label="univ" ID="2" builtin="yes">
    </sig>

    <field label="no-field-guard" ID="3" parentID="2">
    <types> <type ID="2"/><type ID="2"/> </types>
    </field>

    <sig label="Cell" ID="4" parentID="2">
    <atom label="Cell0"/><atom label="Cell1"/><atom label="Cell2"/><atom label="Cell3"/><atom label="Cell4"/><atom label="Cell5"/><atom label="Cell6"/><atom label="Cell7"/><atom label="Cell8"/>
    </sig>

    <sig label="Mark" ID="5" parentID="2">
    </sig>

    <sig label="X" ID="6" parentID="5">
    <atom label="X"/>
    </sig>

    <sig label="O" ID="7" parentID="5">
    <atom label="O"/>
    </sig>

    <field label="mark" ID="8" parentID="4">
    <tuple><atom label="Cell0"/><atom label="X"/></tuple>
    <tuple><atom label="Cell2"/><atom label="X"/></tuple>
    <tuple><atom label="Cell4"/><atom label="X"/></tuple>
    <tuple><atom label="Cell6"/><atom label="O"/></tuple>
    <tuple><atom label="Cell7"/><atom label="O"/></tuple>
    <tuple><atom label="Cell8"/><atom label="O"/></tuple>
    <types><type ID="4"/><type ID="5"/></types>
    </field>

    <field label="right" ID="9" parentID="4">
    <tuple><atom label="Cell0"/><atom label="Cell6"/></tuple>
    <tuple><atom label="Cell1"/><atom label="Cell4"/></tuple>
    <tuple><atom label="Cell3"/><atom label="Cell7"/></tuple>
    <tuple><atom label="Cell5"/><atom label="Cell0"/></tuple>
    <tuple><atom label="Cell7"/><atom label="Cell2"/></tuple>
    <tuple><atom label="Cell8"/><atom label="Cell1"/></tuple>
    <types><type ID="4"/><type ID="4"/></types>
    </field>

    <field label="down" ID="10" parentID="4">
    <tuple><atom label="Cell1"/><atom label="Cell7"/></tuple>
    <tuple><atom label="Cell2"/><atom label="Cell6"/></tuple>
    <tuple><atom label="Cell3"/><atom label="Cell5"/></tuple>
    <tuple><atom label="Cell4"/><atom label="Cell2"/></tuple>
    <tuple><atom label="Cell7"/><atom label="Cell0"/></tuple>
    <tuple><atom label="Cell8"/><atom label="Cell3"/></tuple>
    <types><type ID="4"/><type ID="4"/></types>
    </field>

    <skolem label="$c1_some32007" ID="11">
    <tuple><atom label="Cell8"/></tuple>
    <types><type ID="2"/></types>
    </skolem>

    <skolem label="$c3_some32009" ID="12">
    <tuple><atom label="Cell6"/></tuple>
    <types><type ID="2"/></types>
    </skolem>

    <skolem label="$c2_some32008" ID="13">
    <tuple><atom label="Cell7"/></tuple>
    <types><type ID="2"/></types>
    </skolem>

    </instance>
    </alloy>
  `;

  // Sample Alloy XML without Skolems (from sample/forge/datum.xml)
  const xmlWithoutSkolems = `
    <alloy builddate="Wednesday, May 14th, 2025">
    <instance bitwidth="4" maxseq="-1" command="temporary-name_source_1" filename="/test.frg" version="4.1">

    <sig label="seq/Int" ID="0" parentID="1" builtin="yes">
    </sig>

    <sig label="Int" ID="1" parentID="2" builtin="yes">
    </sig>

    <sig label="univ" ID="2" builtin="yes">
    </sig>

    <field label="no-field-guard" ID="3" parentID="2">
    <types> <type ID="2"/><type ID="2"/> </types>
    </field>

    <sig label="Node" ID="4" parentID="2">
    <atom label="Node0"/><atom label="Node1"/><atom label="Node2"/>
    </sig>

    <field label="edge" ID="5" parentID="4">
    <tuple><atom label="Node0"/><atom label="Node1"/></tuple>
    <tuple><atom label="Node1"/><atom label="Node2"/></tuple>
    <types><type ID="4"/><type ID="4"/></types>
    </field>

    </instance>
    </alloy>
  `;

  describe('getSkolemNamesForAtom', () => {
    it('should return Skolem names for atoms referenced by Skolems', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const instance = datum.instances[0];
      
      // Cell8 is referenced by $c1_some32007
      const cell8Skolems = getSkolemNamesForAtom(instance, 'Cell8');
      expect(cell8Skolems).toContain('$c1_some32007');
      
      // Cell6 is referenced by $c3_some32009
      const cell6Skolems = getSkolemNamesForAtom(instance, 'Cell6');
      expect(cell6Skolems).toContain('$c3_some32009');
      
      // Cell7 is referenced by $c2_some32008
      const cell7Skolems = getSkolemNamesForAtom(instance, 'Cell7');
      expect(cell7Skolems).toContain('$c2_some32008');
    });

    it('should return empty array for atoms not referenced by any Skolem', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const instance = datum.instances[0];
      
      // Cell0 is not referenced by any Skolem
      const cell0Skolems = getSkolemNamesForAtom(instance, 'Cell0');
      expect(cell0Skolems).toEqual([]);
      
      // Cell1 is not referenced by any Skolem
      const cell1Skolems = getSkolemNamesForAtom(instance, 'Cell1');
      expect(cell1Skolems).toEqual([]);
    });

    it('should return empty array when instance has no Skolems', () => {
      const datum = parseAlloyXML(xmlWithoutSkolems);
      const instance = datum.instances[0];
      
      const node0Skolems = getSkolemNamesForAtom(instance, 'Node0');
      expect(node0Skolems).toEqual([]);
    });
  });

  describe('getInstanceSkolems', () => {
    it('should return all Skolems from instance', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const instance = datum.instances[0];
      
      const skolems = getInstanceSkolems(instance);
      expect(skolems).toHaveLength(3);
      
      const skolemNames = skolems.map(s => s.name);
      expect(skolemNames).toContain('$c1_some32007');
      expect(skolemNames).toContain('$c2_some32008');
      expect(skolemNames).toContain('$c3_some32009');
    });

    it('should return empty array when instance has no Skolems', () => {
      const datum = parseAlloyXML(xmlWithoutSkolems);
      const instance = datum.instances[0];
      
      const skolems = getInstanceSkolems(instance);
      expect(skolems).toEqual([]);
    });
  });

  describe('AlloyDataInstance skolems attribute', () => {
    it('should include Skolem names in atom skolems property', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const dataInstance = new AlloyDataInstance(datum.instances[0]);
      
      const atoms = dataInstance.getAtoms();
      
      // Find atoms with Skolem references
      const cell8 = atoms.find(a => a.id === 'Cell8');
      const cell6 = atoms.find(a => a.id === 'Cell6');
      const cell7 = atoms.find(a => a.id === 'Cell7');
      
      // Skolems should be available as attribute
      expect(cell8?.skolems).toContain('$c1_some32007');
      expect(cell6?.skolems).toContain('$c3_some32009');
      expect(cell7?.skolems).toContain('$c2_some32008');
    });

    it('should preserve atom ID and label without Skolem modification', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const dataInstance = new AlloyDataInstance(datum.instances[0]);
      
      const atoms = dataInstance.getAtoms();
      
      // Find atoms with Skolem references
      const cell8 = atoms.find(a => a.id === 'Cell8');
      const cell6 = atoms.find(a => a.id === 'Cell6');
      
      // ID and label should remain unchanged (not include Skolem names)
      expect(cell8?.id).toBe('Cell8');
      expect(cell8?.label).toBe('Cell8');
      expect(cell6?.id).toBe('Cell6');
      expect(cell6?.label).toBe('Cell6');
    });

    it('should have undefined skolems for atoms without Skolem references', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const dataInstance = new AlloyDataInstance(datum.instances[0]);
      
      const atoms = dataInstance.getAtoms();
      
      // Atoms not referenced by Skolems should have undefined skolems
      const cell0 = atoms.find(a => a.id === 'Cell0');
      const cell1 = atoms.find(a => a.id === 'Cell1');
      
      expect(cell0?.skolems).toBeUndefined();
      expect(cell1?.skolems).toBeUndefined();
    });

    it('should handle instances without Skolems', () => {
      const datum = parseAlloyXML(xmlWithoutSkolems);
      const dataInstance = new AlloyDataInstance(datum.instances[0]);
      
      const atoms = dataInstance.getAtoms();
      
      // All atoms should have undefined skolems
      for (const atom of atoms) {
        expect(atom.skolems).toBeUndefined();
      }
    });
  });

  describe('getTypes atom skolems attribute', () => {
    it('should include Skolem names in type atom skolems property', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const dataInstance = new AlloyDataInstance(datum.instances[0]);
      
      const types = dataInstance.getTypes();
      const cellType = types.find(t => t.id === 'Cell');
      
      expect(cellType).toBeDefined();
      
      // Find atoms with Skolem references in type
      const cell8 = cellType!.atoms.find(a => a.id === 'Cell8');
      const cell6 = cellType!.atoms.find(a => a.id === 'Cell6');
      
      expect(cell8?.skolems).toContain('$c1_some32007');
      expect(cell6?.skolems).toContain('$c3_some32009');
    });
  });

  describe('Graph generation does not modify labels', () => {
    it('should use atom ID as node label (not include Skolems)', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const instance = datum.instances[0];
      
      const graph = generateGraph(instance, false, false);
      
      // Get node labels (values) from the graph
      const nodes = graph.nodes();
      
      // Verify nodes exist
      expect(nodes).toContain('Cell8');
      expect(nodes).toContain('Cell6');
      expect(nodes).toContain('Cell7');
      
      // Node labels should be just the atom IDs (not include Skolem names)
      const cell8Label = graph.node('Cell8');
      const cell6Label = graph.node('Cell6');
      const cell7Label = graph.node('Cell7');
      
      expect(cell8Label).toBe('Cell8');
      expect(cell6Label).toBe('Cell6');
      expect(cell7Label).toBe('Cell7');
    });
  });

  describe('getAtomSkolems helper for graph rendering', () => {
    it('should return Skolem names for atoms', () => {
      const datum = parseAlloyXML(xmlWithSkolems);
      const instance = datum.instances[0];
      
      // The helper should be available for graph renderers
      const cell8Skolems = getAtomSkolems(instance, 'Cell8');
      expect(cell8Skolems).toContain('$c1_some32007');
    });
  });

  describe('Multiple Skolems referencing same atom', () => {
    const xmlWithMultipleSkolems = `
      <alloy builddate="Wednesday, May 14th, 2025">
      <instance bitwidth="4" maxseq="-1" command="test" filename="/test.frg" version="4.1">

      <sig label="seq/Int" ID="0" parentID="1" builtin="yes">
      </sig>

      <sig label="Int" ID="1" parentID="2" builtin="yes">
      </sig>

      <sig label="univ" ID="2" builtin="yes">
      </sig>

      <field label="no-field-guard" ID="3" parentID="2">
      <types> <type ID="2"/><type ID="2"/> </types>
      </field>

      <sig label="Node" ID="4" parentID="2">
      <atom label="Node0"/><atom label="Node1"/>
      </sig>

      <skolem label="$sk1" ID="5">
      <tuple><atom label="Node0"/></tuple>
      <types><type ID="2"/></types>
      </skolem>

      <skolem label="$sk2" ID="6">
      <tuple><atom label="Node0"/></tuple>
      <types><type ID="2"/></types>
      </skolem>

      </instance>
      </alloy>
    `;

    it('should include all Skolem names when multiple Skolems reference same atom', () => {
      const datum = parseAlloyXML(xmlWithMultipleSkolems);
      const dataInstance = new AlloyDataInstance(datum.instances[0]);
      
      const atoms = dataInstance.getAtoms();
      const node0 = atoms.find(a => a.id === 'Node0');
      
      // Skolems array should include both Skolem names
      expect(node0?.skolems).toContain('$sk1');
      expect(node0?.skolems).toContain('$sk2');
      expect(node0?.skolems).toHaveLength(2);
      
      // ID and label should remain unchanged
      expect(node0?.id).toBe('Node0');
      expect(node0?.label).toBe('Node0');
    });
  });
});
