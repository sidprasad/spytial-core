import { parseAlloyXML } from '../../src/data-instance/alloy/alloy-instance';

/** A universal field with ordinary, inherited, and builtin endpoint types. */
export function alloyUnivFixture() {
  return parseAlloyXML(`<alloy><instance bitwidth="2" maxseq="2" command="run {}" filename="univ.als">
    <sig label="seq/Int" ID="0" parentID="1" builtin="yes"/>
    <sig label="Int" ID="1" parentID="2" builtin="yes"/>
    <sig label="univ" ID="2" builtin="yes"/>
    <sig label="Person" ID="3" parentID="2"><atom label="Person$0"/><atom label="Person$1"/></sig>
    <sig label="Student" ID="4" parentID="3"><atom label="Student$0"/></sig>
    <sig label="Place" ID="5" parentID="2"><atom label="Place$0"/></sig>
    <sig label="String" ID="6" parentID="2" builtin="yes"><atom label="&quot;hello&quot;"/></sig>
    <field label="related" ID="7" parentID="3">
      <tuple><atom label="Person$0"/><atom label="Person$1"/></tuple>
      <types><type ID="3"/><type ID="2"/></types>
    </field>
  </instance></alloy>`).instances[0];
}
