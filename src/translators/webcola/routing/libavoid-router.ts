import { AvoidLib } from 'libavoid-js';
import type { EdgeRouter, Point, PortAttachment, RouterHost } from './types';
import { registerRoutingMode } from './registry';
import { EDGE_CLEARANCE_PX } from './taut-router';

/**
 * Orthogonal edge routing via libavoid (the Adaptagrams C++ router, compiled
 * to WASM by libavoid-js). Ships as the opt-in `spytial-core/routers/libavoid`
 * entry — core never loads the WASM.
 *
 * Batch design: libavoid's quality comes from routing ALL edges in one
 * transaction (global nudging, crossing penalties), so the work happens in
 * beginPass — one Router, one shape per node, one connector per edge, one
 * processTransaction. routeEdge is then a cache lookup. Every wasm-side
 * object is destroyed before beginPass returns; nothing lives across passes.
 *
 * LICENSE NOTE: libavoid-js is LGPL-2.1-or-later. It is an optional peer
 * dependency — consumers who import this entry install it themselves, so
 * spytial-core does not redistribute LGPL code. (Decision pending on
 * shipping a self-contained CDN bundle.)
 */

// libavoid ConnDirFlags (embind exposes these as numeric constants).
const CONN_DIR_UP = 1;
const CONN_DIR_DOWN = 2;
const CONN_DIR_LEFT = 4;
const CONN_DIR_RIGHT = 8;
const CONN_DIR_ALL = 15;

/** Maps a port's outward normal to the libavoid visibility direction. */
function connDirForNormal(normal: Point): number {
  if (normal.x === -1) return CONN_DIR_LEFT;
  if (normal.x === 1) return CONN_DIR_RIGHT;
  if (normal.y === -1) return CONN_DIR_UP;
  if (normal.y === 1) return CONN_DIR_DOWN;
  return CONN_DIR_ALL;
}

export class LibavoidRouter implements EdgeRouter {
  /** Routes computed by the last beginPass, keyed by edge id. */
  private batch = new Map<string, Point[]>();

  beginPass(host: RouterHost): void {
    this.batch.clear();
    const Avoid = AvoidLib.getInstance(); // throws if load() has not finished

    // Wasm-side objects to free before returning. Router-owned objects
    // (shapes, connectors, pins) die with the router; everything passed
    // by value (points, rectangles, connends) we destroy ourselves.
    const temps: any[] = [];
    // Embind exposes RouterFlag as an enum object; the Router ctor takes the
    // raw unsigned value. (The package typings claim Avoid.OrthogonalRouting —
    // that key does not exist at runtime.)
    const router = new Avoid.Router(Avoid.RouterFlag.OrthogonalRouting.value);
    try {
      router.setRoutingParameter(Avoid.RoutingParameter.shapeBufferDistance, EDGE_CLEARANCE_PX);
      router.setRoutingParameter(Avoid.RoutingParameter.idealNudgingDistance, 8);
      router.setRoutingOption(
        Avoid.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes, true
      );

      // One shape per node (inflation is libavoid's job via shapeBufferDistance,
      // so shapes use the un-inflated visible rectangle). The deflated top-left
      // is kept alongside: pin offsets are relative to it.
      const shapeByNodeId = new Map<string, { shape: any; minX: number; minY: number }>();
      for (const o of host.obstacles()) {
        const minX = o.minX + EDGE_CLEARANCE_PX, minY = o.minY + EDGE_CLEARANCE_PX;
        const maxX = o.maxX - EDGE_CLEARANCE_PX, maxY = o.maxY - EDGE_CLEARANCE_PX;
        const tl = new Avoid.Point(minX, minY);
        const br = new Avoid.Point(maxX, maxY);
        const rect = new Avoid.Rectangle(tl, br);
        temps.push(tl, br, rect);
        shapeByNodeId.set(o.id, { shape: new Avoid.ShapeRef(router, rect), minX, minY });
      }

      // One connector per router-owned edge, attached via shape connection
      // pins at the port-distributed attachment points, visible only outward.
      const conns: Array<{ id: string; connRef: any; fallback: [Point, Point] }> = [];
      let pinClass = 1000; // unique classId per pin
      const mkEnd = (s: { shape: any; minX: number; minY: number }, att: PortAttachment) => {
        const classId = pinClass++;
        const pin = new Avoid.ShapeConnectionPin(
          s.shape, classId,
          att.point.x - s.minX, att.point.y - s.minY,
          false, 0, connDirForNormal(att.normal)
        );
        pin.setExclusive(false);
        const end = new Avoid.ConnEnd(s.shape, classId);
        temps.push(end);
        return end;
      };
      for (const edge of host.routerEdges()) {
        const src = host.portAttachment(edge, 'source');
        const tgt = host.portAttachment(edge, 'target');
        const srcShape = shapeByNodeId.get(edge.source.id);
        const tgtShape = shapeByNodeId.get(edge.target.id);
        if (!srcShape || !tgtShape) continue;

        const srcEnd = mkEnd(srcShape, src);
        const tgtEnd = mkEnd(tgtShape, tgt);
        const connRef = new Avoid.ConnRef(router, srcEnd, tgtEnd);
        conns.push({ id: edge.id, connRef, fallback: [src.point, tgt.point] });
      }

      router.processTransaction();

      // Copy every route out to plain JS before any wasm object dies.
      // PolyLine exposes at(i) via its interface base and ps(i) on the
      // concrete binding — accept either.
      for (const { id, connRef, fallback } of conns) {
        const poly = connRef.displayRoute();
        const n = typeof poly?.size === 'function' ? poly.size() : 0;
        const route: Point[] = [];
        for (let i = 0; i < n; i++) {
          const p = typeof poly.at === 'function' ? poly.at(i) : poly.ps(i);
          route.push({ x: p.x, y: p.y });
        }
        this.batch.set(id, route.length >= 2 ? route : [fallback[0], fallback[1]]);
      }
    } finally {
      for (const t of temps) {
        try { Avoid.destroy(t); } catch { /* already freed with the router */ }
      }
      try { Avoid.destroy(router); } catch { /* never leak the pass */ }
    }
  }

  routeEdge(edge: any, host: RouterHost): Point[] {
    const cached = this.batch.get(edge.id);
    if (cached) return cached;
    // Defensive fallback (edge missed by the batch): straight port-to-port.
    const src = host.portAttachment(edge, 'source');
    const tgt = host.portAttachment(edge, 'target');
    return [src.point, tgt.point];
  }
}

let loadPromise: Promise<void> | null = null;

export interface LibavoidRoutingOptions {
  /**
   * Explicit URL for libavoid.wasm. Needed when the consumer's bundler does
   * not serve the file next to the libavoid-js module (the loader's default).
   */
  wasmUrl?: string;
  /**
   * Also re-register the 'grid' mode so existing layoutFormat="grid" users
   * get libavoid orthogonal routing in place of WebCola's GridRouter.
   * Default true — one import upgrades grid quality.
   */
  takeOverGrid?: boolean;
}

/**
 * Loads the libavoid WASM and registers the routing mode(s). Registration
 * happens only after the WASM is ready, so the router is never selected
 * before it can route; until then unknown layoutFormat values fall back to
 * taut with a console warning.
 *
 * Elements created before this resolves built their Routing dropdown without
 * the libavoid option — create (or re-render) diagrams after awaiting this.
 */
export function registerLibavoidRouting(options: LibavoidRoutingOptions = {}): Promise<void> {
  loadPromise ??= (async () => {
    await AvoidLib.load(options.wasmUrl);
    registerRoutingMode({
      id: 'libavoid',
      label: 'Orthogonal (libavoid)',
      pipeline: 'standard',
      createRouter: () => new LibavoidRouter(),
    });
    if (options.takeOverGrid !== false) {
      registerRoutingMode({
        id: 'grid',
        label: 'Grid (libavoid)',
        pipeline: 'standard',
        createRouter: () => new LibavoidRouter(),
      });
    }
  })();
  return loadPromise;
}
