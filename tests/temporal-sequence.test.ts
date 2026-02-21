import { describe, expect, it } from 'vitest';
import { resolveSequenceMode } from '../src/translators/webcola/temporal-sequence';

describe('Temporal sequence mode resolution', () => {
  it('defaults to ignore_history', () => {
    expect(resolveSequenceMode(undefined)).toBe('ignore_history');
    expect(resolveSequenceMode('default')).toBe('ignore_history');
  });

  it('passes through explicit modes', () => {
    expect(resolveSequenceMode('ignore_history')).toBe('ignore_history');
    expect(resolveSequenceMode('stability')).toBe('stability');
    expect(resolveSequenceMode('change_emphasis')).toBe('change_emphasis');
  });
});
