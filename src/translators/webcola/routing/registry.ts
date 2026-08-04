import type { RoutingModeDefinition } from './types';

/**
 * Registry of routing modes. Built-ins ('taut', 'grid') are registered by
 * routing/index.ts; opt-in routers shipped as separate package entries
 * register themselves on import.
 *
 * Re-registering an existing id replaces it — that is the upgrade-in-place
 * mechanism (e.g. the libavoid entry takes over 'grid' so existing specs get
 * better orthogonal routing without changing their layoutFormat).
 *
 * The store lives on globalThis (Symbol.for key) rather than in module scope:
 * opt-in router entries are built as separate bundles that inline their own
 * copy of this module, and a module-scoped Map would give each copy a private
 * registry — registrations from `spytial-core/routers/*` (or a second script
 * tag) would be invisible to the copy the renderer reads. One process, one
 * registry, no matter how many bundle copies of this file are loaded.
 */
const REGISTRY_KEY = Symbol.for('spytial-core.routing-modes');
const modes: Map<string, RoutingModeDefinition> =
  ((globalThis as any)[REGISTRY_KEY] ??= new Map<string, RoutingModeDefinition>());

export function registerRoutingMode(def: RoutingModeDefinition): void {
  modes.set(def.id, def);
}

export function getRoutingMode(id: string): RoutingModeDefinition | undefined {
  return modes.get(id);
}

/** Registration order is dropdown order. */
export function listRoutingModes(): RoutingModeDefinition[] {
  return [...modes.values()];
}
