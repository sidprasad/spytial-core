import type { RoutingModeDefinition } from './types';

/**
 * Registry of routing modes. Built-ins ('taut', 'grid') are registered by
 * routing/index.ts; opt-in routers shipped as separate package entries
 * register themselves on import.
 *
 * Re-registering an existing id replaces it — that is the upgrade-in-place
 * mechanism (e.g. a future libavoid entry can take over 'grid' so existing
 * specs get better orthogonal routing without changing their layoutFormat).
 */
const modes = new Map<string, RoutingModeDefinition>();

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
