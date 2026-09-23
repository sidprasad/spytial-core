import type { LayoutNode } from './interfaces';

// Presentation bookkeeping must not change generated layout JSON or object keys.
// Cloned/deserialized nodes retain their supplied dimensions unless the host
// explicitly opts them in with LayoutNode.autoSize.
const autoSizedNodes = new WeakSet<LayoutNode>();

export function markAutoSizedNode(node: LayoutNode): void {
  autoSizedNodes.add(node);
}

export function isAutoSizedNode(node: LayoutNode): boolean {
  return node.autoSize === true || autoSizedNodes.has(node);
}
