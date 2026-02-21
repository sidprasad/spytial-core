import { describe, expect, it } from 'vitest';
import type { TemporalMode } from '../src/translators/webcola/temporal-policy';

describe('Temporal sequence types', () => {
  it('TemporalMode accepts the three canonical modes', () => {
    const modes: TemporalMode[] = ['ignore_history', 'stability', 'change_emphasis'];
    expect(modes).toHaveLength(3);
  });
});
