/**
 * Shared test fixture: a small binary-search-tree Alloy instance
 * (sig `Node`, fields `left`, `right`, `key`) used to exercise the spec
 * editor's domain awareness (relation/type dropdowns, completions).
 */

import { AlloyDataInstance } from '../../src/data-instance/alloy-data-instance'
import { parseAlloyXML } from '../../src/data-instance/alloy/alloy-instance/src/xml'
import type { IInputDataInstance } from '../../src/data-instance/interfaces'

export const SAMPLE_BST_XML = `<alloy builddate="2025-05-14">
<instance bitwidth="4" maxseq="-1" command="bst" filename="bst.frg" version="4.1">
<sig label="seq/Int" ID="0" parentID="1" builtin="yes"></sig>
<sig label="Int" ID="1" parentID="2" builtin="yes"></sig>
<sig label="univ" ID="2" builtin="yes"></sig>
<field label="no-field-guard" ID="3" parentID="2">
<types> <type ID="2"/><type ID="2"/> </types>
</field>
<sig label="Node" ID="4" parentID="2">
<atom label="Node0"/><atom label="Node1"/><atom label="Node2"/>
</sig>
<field label="right" ID="5" parentID="4">
<tuple><atom label="Node1"/><atom label="Node2"/></tuple>
<types><type ID="4"/><type ID="4"/></types>
</field>
<field label="key" ID="6" parentID="4">
<tuple><atom label="Node0"/><atom label="7"/></tuple>
<types><type ID="4"/><type ID="1"/></types>
</field>
<field label="left" ID="7" parentID="4">
<tuple><atom label="Node0"/><atom label="Node1"/></tuple>
<types><type ID="4"/><type ID="4"/></types>
</field>
</instance>
</alloy>`

export function buildSampleBstInstance(): IInputDataInstance {
  const datum = parseAlloyXML(SAMPLE_BST_XML)
  return new AlloyDataInstance(datum.instances[0])
}
