import { WebColaCnDGraph } from './webcola-cnd-graph';
import { InstanceLayout } from '../../layout/interfaces';

/**
 * Editable version of {@link WebColaCnDGraph}.
 *
 * This custom element dispatches a `node-click` event whenever a node is
 * clicked so that host applications can react (e.g. open an editor). It
 * otherwise behaves exactly like `WebColaCnDGraph`.
 */
export class EditableWebColaGraph extends WebColaCnDGraph {
  constructor() {
    super();
  }

  /** Render layout and attach click handlers */
  public async renderLayout(layout: InstanceLayout): Promise<void> {
    await super.renderLayout(layout);
    this.attachClickHandlers();
  }

  private attachClickHandlers(): void {
    const nodes = this.shadowRoot?.querySelectorAll('g.node, g.error-node');
    nodes?.forEach((n) => {
      n.addEventListener('click', this.handleNodeClick as EventListener);
    });
  }

  private handleNodeClick = (e: Event): void => {
    const target = e.currentTarget as SVGGElement;
    const datum: any = (target as any).__data__;
    if (datum && datum.id) {
      this.dispatchEvent(
        new CustomEvent('node-click', { detail: { id: datum.id } })
      );
    }
  };
}

if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
  if (!customElements.get('editable-webcola-graph')) {
    customElements.define('editable-webcola-graph', EditableWebColaGraph);
  }
}
