import { measuredBox } from './edge-labels';

/** A single rendered edge caption, attribute line, or tag line. */
export type DiagramLabelTarget =
  | { kind: 'edge'; edgeId: string }
  | { kind: 'attribute' | 'tag'; nodeId: string; key: string };

type Label = SVGTextElement | SVGTSpanElement;

function key(target: DiagramLabelTarget): string {
  return target.kind === 'edge' ? JSON.stringify(['edge', target.edgeId]) :
    JSON.stringify([target.kind, target.nodeId, target.key]);
}

/** Paint behind a line without changing its glyphs or the edge/node geometry. */
function mark(label: Label): () => void {
  const edge = label.localName === 'text';
  const text = edge ? label : label.parentElement!;
  const marker = label.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  marker.setAttribute('class', 'label-highlight-marker');
  marker.setAttribute('aria-hidden', 'true');
  text.before(marker);

  // Pinned marks follow both the tick-time positions and the final routed
  // captions, including font loads. Only active labels need to be measured.
  const position = () => {
    const bounds = measuredBox(label);
    if (!bounds) {
      marker.removeAttribute('points');
      return;
    }
    const { x, y, width, height } = bounds;
    const top = y + height * .15, bottom = y + height * .94;
    marker.setAttribute('points',
      `${x - 1},${top} ${x + width + 2},${top} ${x + width + 1},${bottom} ${x - 2},${bottom}`);
    // The renderer raises paths and labels when it reroutes an edge.
    if (edge) {
      const transform = text.getAttribute('transform');
      if (transform) marker.setAttribute('transform', transform);
      else marker.removeAttribute('transform');
      if (text.previousSibling !== marker) text.before(marker);
    }
  };
  position();
  const view = label.ownerDocument.defaultView!;
  const mutations = new view.MutationObserver(position);
  mutations.observe(text, { attributes: true, subtree: !edge, characterData: true, childList: true });
  const resize = view.ResizeObserver && new view.ResizeObserver(position);
  resize?.observe(text);
  return () => {
    mutations.disconnect();
    resize?.disconnect();
    marker.remove();
  };
}

/** Current-render lookup, independent of captions and safe for arbitrary host IDs. */
export class LabelHighlights {
  private readonly labels = new Map<string, Label>();
  private readonly active = new Map<Label, { count: number; remove: () => void }>();

  register(target: DiagramLabelTarget, label: Label): void {
    if (label.textContent) this.labels.set(key(target), label);
  }

  has(target: DiagramLabelTarget): boolean {
    return this.labels.has(key(target));
  }

  highlight(targets: readonly DiagramLabelTarget[]): () => void {
    const acquired = new Set<Label>();
    for (const target of targets) {
      const label = this.labels.get(key(target));
      if (!label || acquired.has(label)) continue;
      acquired.add(label);
      const previous = this.active.get(label);
      if (previous) previous.count++;
      else this.active.set(label, { count: 1, remove: mark(label) });
    }
    return () => {
      for (const label of acquired) {
        const entry = this.active.get(label);
        if (entry && --entry.count === 0) {
          entry.remove();
          this.active.delete(label);
        }
      }
      acquired.clear();
    };
  }

  /** Editing an edge rebuilds just the link layer. Full renders replace both layers. */
  clear(edgesOnly = false): void {
    for (const [id, label] of this.labels) {
      if (edgesOnly && label.localName !== 'text') continue;
      this.active.get(label)?.remove();
      this.active.delete(label);
      this.labels.delete(id);
    }
  }
}
