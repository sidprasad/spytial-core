import { describe, expect, it, vi } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

describe('Loading indicator behavior', () => {
  const proto = WebColaCnDGraph.prototype as any;

  function createHarness() {
    const root = document.createElement('div');
    const loading = document.createElement('div');
    loading.id = 'loading';
    const progress = document.createElement('span');
    progress.id = 'loading-progress';
    loading.appendChild(progress);
    const error = document.createElement('div');
    error.id = 'error';
    error.style.display = 'block';

    root.appendChild(loading);
    root.appendChild(error);

    const fakeThis: any = {
      shadowRoot: root,
      get root() { return this.shadowRoot; },
      loadingShowTimer: null,
    };
    fakeThis.hideLoading = proto.hideLoading;

    return { fakeThis, loading, progress, error };
  }

  it('shows loading status only after the configured delay', () => {
    vi.useFakeTimers();
    try {
      const { fakeThis, loading, error } = createHarness();
      proto.showLoading.call(fakeThis);

      expect(error.style.display).toBe('none');
      expect(loading.classList.contains('visible')).toBe(false);

      vi.advanceTimersByTime(180);
      expect(loading.classList.contains('visible')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending show when loading is hidden quickly', () => {
    vi.useFakeTimers();
    try {
      const { fakeThis, loading } = createHarness();
      proto.showLoading.call(fakeThis);
      proto.hideLoading.call(fakeThis);

      vi.advanceTimersByTime(250);
      expect(loading.classList.contains('visible')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates progress text and status label', () => {
    const { fakeThis, loading, progress } = createHarness();
    const message = 'Computing layout... 80%';

    proto.updateLoadingProgress.call(fakeThis, message);

    expect(progress.textContent).toBe(message);
    expect(loading.getAttribute('aria-label')).toBe(message);
  });
});
