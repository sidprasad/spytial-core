import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from './constants';

const DEFAULT_COLOR = '#000000';

function sanitizeParams(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return {};
  }
  return params;
}

function applyDefaults(
  params: Record<string, unknown>,
  defaults: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...params };
  for (const [key, value] of Object.entries(defaults)) {
    if (normalized[key] === undefined || normalized[key] === null) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function normalizeConstraintParams(
  type: string,
  params: Record<string, unknown> | undefined
): Record<string, unknown> {
  const safeParams = sanitizeParams(params);

  switch (type) {
    case 'size':
      return applyDefaults(safeParams, {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      });
    case 'align':
      return applyDefaults(safeParams, { direction: 'horizontal' });
    case 'cyclic':
      return applyDefaults(safeParams, { direction: 'clockwise' });
    case 'groupselector':
      return applyDefaults(safeParams, { addEdge: false });
    default:
      return { ...safeParams };
  }
}

export function normalizeDirectiveParams(
  type: string,
  params: Record<string, unknown> | undefined
): Record<string, unknown> {
  const safeParams = sanitizeParams(params);

  switch (type) {
    case 'size':
      return applyDefaults(safeParams, {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      });
    case 'atomColor':
    case 'edgeColor':
      return applyDefaults(safeParams, { value: DEFAULT_COLOR });
    case 'inferredEdge':
      return applyDefaults(safeParams, { color: DEFAULT_COLOR });
    case 'icon':
      return applyDefaults(safeParams, { showLabels: false });
    default:
      return { ...safeParams };
  }
}
