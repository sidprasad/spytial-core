/** Visual dimensions, before the padding used by WebCola for collision avoidance. */
export interface LinkDistanceNode {
  visualWidth?: number;
  visualHeight?: number;
  width?: number;
  height?: number;
}

/**
 * A soft target for one edge, not a separation constraint. The solver may move
 * its endpoints farther apart to satisfy the author's spatial requirements.
 *
 * Each edge uses its own endpoint sizes. A long label adds a bounded amount of
 * room to that edge alone: rendered edge labels can sit beside their route, so
 * their full width does not have to be inserted between both nodes.
 */
export function idealLinkDistance(
  source: LinkDistanceNode | undefined,
  target: LinkDistanceNode | undefined,
  nodeCount: number,
  scaleFactor: number,
  visibleLabelWidth = 0,
): number {
  const visualSize = (node: LinkDistanceNode | undefined): number => Math.max(
    node?.visualWidth ?? node?.width ?? 100,
    node?.visualHeight ?? node?.height ?? 60,
  );
  const endpointRadiusSum = (visualSize(source) + visualSize(target)) / 2;
  const density = Math.max(0.7, 1 - Math.log10(Math.max(1, nodeCount)) * 0.1);
  const labelAllowance = Math.min(48, Math.max(0, visibleLabelWidth) * 0.35);
  const targetDistance = (endpointRadiusSum + 85 + labelAllowance) * density / (scaleFactor / 5);

  // Keep some air around large nodes even when the density/scale adjustment
  // would pull their centres through each other's visual bounds.
  return Math.max(endpointRadiusSum + 24, Math.min(targetDistance, 350));
}
