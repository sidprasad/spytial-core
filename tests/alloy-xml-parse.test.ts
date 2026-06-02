// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';

// Minimal builtin sigs so instanceFromElement can populate the Int type.
const SIGS =
  '<sig label="Int" ID="1" parentID="2" builtin="yes"></sig><sig label="univ" ID="2" builtin="yes"></sig>';
const inst = (attrs: string) => `<instance bitwidth="4" ${attrs}>${SIGS}</instance>`;
const trace = (attrs: string) => `<alloy>${inst(attrs)}${inst(attrs)}</alloy>`;

describe('parseAlloyXML loopBack derivation', () => {
  it('derives loopBack = tracelength - looplength from Alloy-native XML (no backloop/loop)', () => {
    expect(parseAlloyXML(trace('tracelength="4" looplength="2"')).loopBack).toBe(2);
    expect(parseAlloyXML(trace('tracelength="5" looplength="2"')).loopBack).toBe(3);
  });

  it('prefers backloop, then loop, over looplength', () => {
    expect(parseAlloyXML(trace('tracelength="4" looplength="2" backloop="3"')).loopBack).toBe(3);
    expect(parseAlloyXML(trace('tracelength="4" looplength="2" loop="1"')).loopBack).toBe(1);
  });

  it('does not treat a static instance (tracelength=1 looplength=1) as a trace', () => {
    expect(
      parseAlloyXML(`<alloy>${inst('tracelength="1" looplength="1"')}</alloy>`).loopBack
    ).toBeUndefined();
  });
});

describe('parseAlloyXML visualizer config', () => {
  it('reads script, theme and cnd attributes from <visualizer>', () => {
    const xml = `<alloy>${inst('tracelength="1"')}<visualizer script="s1" theme="t1" cnd="c1"></visualizer></alloy>`;
    const cfg = parseAlloyXML(xml).visualizerConfig!;
    expect(cfg.script).toBe('s1');
    expect(cfg.theme).toBe('t1');
    expect(cfg.cnd).toBe('c1');
  });

  it('leaves missing visualizer attributes undefined', () => {
    const cfg = parseAlloyXML(`<alloy>${inst('tracelength="1"')}</alloy>`).visualizerConfig!;
    expect(cfg.script).toBeUndefined();
    expect(cfg.theme).toBeUndefined();
    expect(cfg.cnd).toBeUndefined();
  });
});
