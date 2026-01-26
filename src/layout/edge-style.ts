export type EdgeStyle = 'solid' | 'dashed' | 'dotted';

export function normalizeEdgeStyle(value: unknown): EdgeStyle | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'solid' || normalized === 'dashed' || normalized === 'dotted') {
    return normalized;
  }

  return undefined;
}
