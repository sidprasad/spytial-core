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

  it('anchors policy raw state transform to the live viewport at change time', () => {
    const suppliedState = {
      positions: [{ id: 'a', x: 1, y: 2 }],
      transform: { k: 1, x: 0, y: 0 },
    };
    const liveState = {
      positions: [{ id: 'a', x: 10, y: 20 }],
      transform: { k: 2, x: 30, y: -40 },
    };
    const fakeThis: any = {
      currentLayout: { nodes: [{ id: 'a' }] },
      getLayoutState: () => liveState,
      hasValidTransform: proto.hasValidTransform,
    };
    const options: any = {
      priorPositions: suppliedState,
      policy: { name: 'stability', apply: () => ({}) },
      prevInstance: {},
      currInstance: {},
    };

    const result = proto.buildPolicyRawState.call(fakeThis, options);
    expect(result.positions).toEqual(suppliedState.positions);
    expect(result.transform).toEqual(liveState.transform);
  });

  it('keeps supplied transform when no live layout is present', () => {
    const suppliedState = {
      positions: [{ id: 'a', x: 1, y: 2 }],
      transform: { k: 1.5, x: -12, y: 9 },
    };
    const liveState = {
      positions: [],
      transform: { k: 3, x: 100, y: 100 },
    };
    const fakeThis: any = {
      currentLayout: null,
      getLayoutState: () => liveState,
      hasValidTransform: proto.hasValidTransform,
    };
    const options: any = {
      priorPositions: suppliedState,
      policy: { name: 'stability', apply: () => ({}) },
      prevInstance: {},
      currInstance: {},
    };

    const result = proto.buildPolicyRawState.call(fakeThis, options);
    expect(result).toEqual(suppliedState);
  });
});
