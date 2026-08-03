/**
 * Pluggable edge-routing layer for the WebCola renderer.
 *
 * Importing this module registers the built-in routing modes:
 *   - 'taut' (default): obstacle-avoiding corner-visibility shortest path
 *     with fillet smoothing, via the standard pipeline.
 *   - 'grid': orthogonal routing via the bespoke GridRouter pipeline.
 *
 * Additional routers register themselves with registerRoutingMode() when
 * their package entry is imported, and appear in the Routing dropdown
 * automatically. Re-registering an id replaces the mode (upgrade-in-place).
 */
import { registerRoutingMode } from './registry';
import { TautRouter } from './taut-router';

export * from './types';
export * from './registry';
export * from './geometry';
export * from './taut-router';
export * from './grid-helpers';

registerRoutingMode({
  id: 'taut',
  label: 'Taut',
  pipeline: 'standard',
  createRouter: () => new TautRouter(),
});

registerRoutingMode({
  id: 'grid',
  label: 'Grid',
  pipeline: 'grid',
});
