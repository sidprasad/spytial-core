import { describe, expect, it } from 'vitest';
import type { SequencePolicy } from '../src/translators/webcola/sequence-policy';
import { ignoreHistory, stability, changeEmphasis } from '../src/translators/webcola/sequence-policy';

describe('Sequence layout types', () => {
  it('built-in policies have the expected names', () => {
    const names = [ignoreHistory, stability, changeEmphasis].map(p => p.name);
    expect(names).toEqual(['ignore_history', 'stability', 'change_emphasis']);
  });

  it('SequencePolicy interface is structurally satisfied by built-ins', () => {
    const policies: SequencePolicy[] = [ignoreHistory, stability, changeEmphasis];
    for (const p of policies) {
      expect(typeof p.name).toBe('string');
      expect(typeof p.apply).toBe('function');
    }
  });
});

