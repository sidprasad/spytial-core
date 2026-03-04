import { describe, expect, it } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

describe('Temporal viewport continuity policy', () => {
  const proto = WebColaCnDGraph.prototype as any;

  it('treats finite positive-scale transforms as valid', () => {
    expect(proto.hasValidTransform({ k: 1, x: 10, y: -20 })).toBe(true);
    expect(proto.hasValidTransform({ k: 0, x: 10, y: -20 })).toBe(false);
    expect(proto.hasValidTransform({ k: NaN, x: 10, y: -20 })).toBe(false);
    expect(proto.hasValidTransform({ k: 1, x: Infinity, y: 0 })).toBe(false);
  });

  it('preserves viewport flags when prior transform is available', () => {
    const fakeThis: any = {
      isInitialRender: true,
      userHasManuallyZoomed: false,
    };

    proto.applyViewportRenderPolicy.call(fakeThis, false, true);

    expect(fakeThis.isInitialRender).toBe(false);
    expect(fakeThis.userHasManuallyZoomed).toBe(true);
  });

  it('resets to initial-fit behavior for completely new renders', () => {
    const fakeThis: any = {
      isInitialRender: false,
      userHasManuallyZoomed: true,
    };

    proto.applyViewportRenderPolicy.call(fakeThis, false, false);

    expect(fakeThis.isInitialRender).toBe(true);
    expect(fakeThis.userHasManuallyZoomed).toBe(false);
  });
});
