import { constructorInfo } from './identity';
import type { PyretObject } from './pyret-data-instance';
import type { ReifiedValue } from './reify';

interface SetContents { kind: 'list-set' | 'tree-set'; elements: ReifiedValue[] }

function variant(value: ReifiedValue, name: string, fields: string[]): value is PyretObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('$name' in value) || value.$name !== name) return false;
  const info = constructorInfo(value);
  return !!info && !info.mutableFields?.length && info.arity === (fields.length || -1)
    && info.fields.length === fields.length && info.fields.every((field, i) => field === fields[i])
    && !!value.dict && fields.every(field => Object.prototype.hasOwnProperty.call(value.dict, field));
}

/** Read the built-in set representation already reconstructed from the datum.
 * This is only a source-rendering view: structural reification keeps the list
 * or AVL tree intact. Like ordinary constructors, recognition uses the stored
 * variant name and field signature, not runtime brands or a producer cache.
 */
export function setContents(value: ReifiedValue): SetContents | undefined {
  const kind = variant(value, 'list-set', ['elems']) ? 'list-set'
    : variant(value, 'tree-set', ['elems']) ? 'tree-set' : undefined;
  if (!kind) return undefined;
  const root = (value as PyretObject).dict!.elems as ReifiedValue;
  const elements: ReifiedValue[] = [];
  const onPath = new Set<object>();
  const invalid = () => new Error(`Malformed Pyret ${kind} backing structure`);
  if (kind === 'list-set') {
    let node = root;
    while (!variant(node, 'empty', [])) {
      if (!variant(node, 'link', ['first', 'rest']) || onPath.has(node)) throw invalid();
      onPath.add(node);
      elements.push(node.dict!.first as ReifiedValue);
      node = node.dict!.rest as ReifiedValue;
    }
  } else {
    // Iterative inorder traversal preserves inspection order without depending
    // on AVL height labels or requiring its private constructors in eval scope.
    const stack: { node: ReifiedValue; phase: 'enter' | 'emit' | 'exit' }[] = [{ node: root, phase: 'enter' }];
    while (stack.length) {
      const { node, phase } = stack.pop()!;
      if (variant(node, 'leaf', [])) continue;
      if (!variant(node, 'branch', ['value', 'h', 'left', 'right'])) throw invalid();
      if (phase === 'exit') {
        onPath.delete(node);
      } else if (phase === 'emit') {
        elements.push(node.dict!.value as ReifiedValue);
      } else {
        if (onPath.has(node)) throw invalid();
        onPath.add(node);
        stack.push({ node, phase: 'exit' }, { node: node.dict!.right as ReifiedValue, phase: 'enter' },
          { node, phase: 'emit' }, { node: node.dict!.left as ReifiedValue, phase: 'enter' });
      }
    }
  }
  return { kind, elements };
}

export function setSource(set: SetContents, child: (value: ReifiedValue) => string): string {
  if (set.kind === 'tree-set') return `[tree-set: ${set.elements.map(child).join(', ')}]`;
  // add prepends. Build from the tail to retain the observed list order for
  // every size; literal makeN optimizations and generic make order differ.
  return '[list-set: ]' + [...set.elements].reverse().map(e => `.add(${child(e)})`).join('');
}
