/* eslint-disable @typescript-eslint/no-explicit-any */
const d3: any = (window as any).d3v4 || (window as any).d3;
import { WebColaCnDGraph } from './webcola-cnd-graph';
import { IInputDataInstance, IAtom, ITuple, IRelation } from '../../data-instance/interfaces';
import { JSONDataInstance } from '../../data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../../evaluators/data/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { ConstraintError } from '../../layout/constraint-validator';

/**
 * Structured Input Graph Custom Element
 * Extends WebColaCnDGraph to provide structured input capabilities
 * 
 * Features:
 * - All WebColaCnDGraph functionality (edge creation, visualization, etc.)
 * - Modern, intuitive data editor interface with visual icons and better organization
 * - Auto-generated unique atom IDs with user-provided labels
 * - Full CnD pipeline integration (data instance, evaluator, layout instance)
 * - Constraint enforcement on data changes
 * - Data export using the data instance's reify() method (supports JSON, Pyret, Alloy, etc.)
 * - Enhanced edge endpoint markers (amber square for source, red triangle for target)
 * 
 * Attributes:
 * - cnd-spec: CnD specification string (YAML/JSON)
 * - data-instance: Initial data instance (optional)
 * - show-export: Whether to show export functionality (default: true)
 * 
 * Events Fired (in addition to WebColaCnDGraph events):
 * - 'atom-added': When a new atom is added via structured input
 *   * event.detail: { atom: IAtom }
 * - 'data-exported': When data is exported using reify()
 *   * event.detail: { data: string, format: 'json' | 'text', reified: unknown }
 * - 'spec-loaded': When CnD spec is successfully loaded
 *   * event.detail: { spec: string }
 * - 'constraint-error': When constraints cannot be satisfied (UNSAT core detected)
 *   * event.detail: { error: ConstraintError, layout: InstanceLayout }
 * - 'constraints-satisfied': When previously unsatisfied constraints become satisfied
 *   * event.detail: { layout: InstanceLayout }
 * - 'layout-generation-error': When an unexpected error occurs during layout generation
 *   * event.detail: { error: Error }
 */
export class StructuredInputGraph extends WebColaCnDGraph {
  private dataInstance!: IInputDataInstance;
  private evaluator: SGraphQueryEvaluator | null = null;
  private layoutInstance: LayoutInstance | null = null;
  private cndSpecString: string = '';
  private controlsContainer: HTMLDivElement | null = null;
  private customTypes: Set<string> = new Set();
  private relationAtomPositions: string[] = ['', '']; // Default to 2 positions
  private currentConstraintError: ConstraintError | null = null; // Track current constraint validation error
  private selectedNodeId: string | null = null;

  constructor(dataInstance?: IInputDataInstance) {
    super(true);
    
    // Require data instance - if not provided, create empty one
    const instance = dataInstance || new JSONDataInstance({
      atoms: [],
      relations: []
    });
    
    this.setDataInstance(instance);
    
    // Add structured input specific initialization
    this.initializeStructuredInput();
    
    // Listen for edge creation, modification, and reconnection events from the parent WebColaCnDGraph
    this.addEventListener('edge-creation-requested', this.handleEdgeCreationRequest.bind(this) as unknown as EventListener);
    this.addEventListener('edge-modification-requested', this.handleEdgeModificationRequest.bind(this) as unknown as EventListener);
    this.addEventListener('edge-reconnection-requested', this.handleEdgeReconnectionRequest.bind(this) as unknown as EventListener);
  }

  /**
   * Observed attributes for this custom element
   */
  static get observedAttributes(): string[] {
    return ['cnd-spec', 'data-instance', 'show-export'];
  }

  /**
   * Called when attributes change
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'cnd-spec':
        this.parseCnDSpec(newValue);
        break;
      case 'data-instance':
        this.updateDataInstance(newValue);
        break;
      case 'show-export':
        break;
    }
  }

  /**
   * Initialize the structured input interface
   */
  private initializeStructuredInput(): void {
    // Wait for the shadow DOM to be ready
    requestAnimationFrame(() => {
      this.createControlsInterface();
    });
  }

  /**
   * Create the structured input controls interface
   */
  private createControlsInterface(): void {
    if (!this.shadowRoot) return;

    // Add styles
    const style = document.createElement('style');
    style.textContent = this.getControlsCSS();
    this.shadowRoot.appendChild(style);

    // Inject toolbar buttons into the existing #graph-toolbar
    const toolbar = this.shadowRoot.querySelector('#graph-toolbar');
    if (toolbar) {
      this.controlsContainer = document.createElement('div');
      this.controlsContainer.style.display = 'contents'; // wrapper for querying
      this.controlsContainer.innerHTML = this.getControlsHTML();
      toolbar.appendChild(this.controlsContainer);
    }

    // Bind event handlers
    this.bindControlEvents();

    // Set up canvas interactions (context menu, click-to-select)
    this.setupCanvasInteractions();
  }

  /**
   * Generate HTML for the toolbar controls (injected into #graph-toolbar)
   */
  private getControlsHTML(): string {
    return `
      <div class="si-toolbar-group">
        <button class="si-tb-btn" data-action="add-atom" title="Add Node">+ Node</button>
        <button class="si-tb-btn" data-action="add-relation" title="Add Relation">+ Relation</button>
        <button class="si-tb-btn si-tb-danger" data-action="delete" title="Delete selected node (or right-click)">Delete</button>
      </div>
    `;
  }

  /**
   * Generate CSS for the controls interface
   */
  private getControlsCSS(): string {
    return `
      /* Toolbar button group */
      .si-toolbar-group {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: 16px;
        padding-left: 16px;
        border-left: 1px solid #e5e7eb;
      }
      .si-tb-btn {
        padding: 4px 10px;
        border: 1px solid #d1d5db;
        background: #f9fafb;
        color: #374151;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        transition: all 0.15s ease;
        user-select: none;
      }
      .si-tb-btn:hover { background: #f3f4f6; border-color: #9ca3af; color: #111827; }
      .si-tb-btn:active { background: #e5e7eb; transform: translateY(0.5px); }
      .si-tb-btn.active { background: #0078d4; color: white; border-color: #0078d4; }
      .si-tb-btn.si-tb-danger:hover { background: #fff5f5; color: #dc3545; border-color: #dc3545; }
      .si-tb-btn:disabled { background: #f9fafb; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; }

      /* Toolbar dropdown popover */
      .si-popover {
        position: absolute;
        background: white;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 12px;
        z-index: 5000;
        min-width: 240px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .si-popover .si-field { margin-bottom: 8px; }
      .si-popover .si-field label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: #57606a;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 3px;
      }
      .si-popover input, .si-popover select {
        display: block;
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        font-size: 12px;
        box-sizing: border-box;
        background: white;
      }
      .si-popover input:focus, .si-popover select:focus {
        outline: none;
        border-color: #0078d4;
        box-shadow: 0 0 0 2px rgba(0,120,212,0.1);
      }
      .si-popover .si-hint {
        font-size: 10px;
        color: #dc3545;
        font-style: italic;
        margin-top: 2px;
        display: none;
      }
      .si-popover .si-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 10px;
      }
      .si-popover .si-actions button {
        padding: 5px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        border: 1px solid #d0d7de;
        background: #f6f8fa;
        color: #24292e;
      }
      .si-popover .si-actions .si-btn-primary {
        background: #0078d4;
        color: white;
        border-color: #0078d4;
      }
      .si-popover .si-actions .si-btn-primary:disabled {
        background: #ccc;
        border-color: #ccc;
        cursor: not-allowed;
      }
      .si-popover .si-actions .si-btn-danger {
        background: #dc3545;
        color: white;
        border-color: #dc3545;
      }
      .si-popover .si-success {
        color: #28a745;
        font-size: 11px;
        font-weight: 500;
        text-align: center;
        padding: 4px 0;
        display: none;
      }

      /* Relation arity controls inside popover */
      .si-popover .si-arity-controls {
        display: flex;
        gap: 6px;
        margin-top: 6px;
      }
      .si-popover .si-arity-controls button {
        padding: 3px 8px;
        font-size: 11px;
        border: 1px solid #d0d7de;
        background: white;
        border-radius: 3px;
        cursor: pointer;
      }
      .si-popover .si-arity-controls button:hover { background: #f6f8fa; }
      .si-popover .si-position-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }

      /* Node context menu */
      .node-context-menu {
        position: absolute;
        background: white;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        z-index: 5000;
        min-width: 120px;
        padding: 4px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .node-context-menu .menu-item {
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
      }
      .node-context-menu .menu-item:hover { background: #f6f8fa; }
      .node-context-menu .menu-item.danger { color: #dc3545; }
      .node-context-menu .menu-item.danger:hover { background: #fff5f5; }
    `;
  }

  /**
   * Bind event handlers to toolbar buttons
   */
  private bindControlEvents(): void {
    if (!this.controlsContainer) return;

    const toolbar = this.controlsContainer.closest('#graph-toolbar') || this.controlsContainer;
    const buttons = this.controlsContainer.querySelectorAll('.si-tb-btn');

    buttons.forEach(btn => {
      // Prevent mousedown on toolbar buttons from triggering global dismiss
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        // Close any existing popover first
        this.dismissOverlays();

        if (action === 'add-atom') this.showAddAtomPopover(btn as HTMLElement);
        else if (action === 'add-relation') this.showAddRelationPopover(btn as HTMLElement);
        else if (action === 'delete') this.handleDeleteAction();
      });
    });
  }

  /**
   * Show add-atom popover anchored to a toolbar button
   */
  private showAddAtomPopover(anchor: HTMLElement): void {
    const allTypes = new Set<string>();
    this.getAvailableAtomTypes().forEach(t => allTypes.add(t));
    this.customTypes.forEach(t => allTypes.add(t));
    const datalistOpts = Array.from(allTypes).map(t => `<option value="${t}">`).join('');

    const popover = document.createElement('div');
    popover.className = 'si-popover';
    popover.innerHTML = `
      <div class="si-field">
        <label>Type</label>
        <input type="text" class="si-type-input" list="si-type-dl" placeholder="e.g. Person, Org..." />
        <datalist id="si-type-dl">${datalistOpts}</datalist>
        <div class="si-hint si-type-hint"></div>
      </div>
      <div class="si-field">
        <label>Label</label>
        <input type="text" class="si-label-input" placeholder="Enter label..." />
        <div class="si-hint si-label-hint"></div>
      </div>
      <div class="si-success">Added!</div>
      <div class="si-actions">
        <button class="si-btn-primary" disabled>Add</button>
      </div>
    `;

    this.positionPopover(popover, anchor);

    const typeIn = popover.querySelector('.si-type-input') as HTMLInputElement;
    const labelIn = popover.querySelector('.si-label-input') as HTMLInputElement;
    const addBtn = popover.querySelector('.si-btn-primary') as HTMLButtonElement;
    const typeHint = popover.querySelector('.si-type-hint') as HTMLElement;
    const labelHint = popover.querySelector('.si-label-hint') as HTMLElement;
    const successMsg = popover.querySelector('.si-success') as HTMLElement;

    const updateState = () => {
      const hasType = typeIn.value.trim();
      const hasLabel = labelIn.value.trim();
      addBtn.disabled = !hasType || !hasLabel;
      typeHint.style.display = hasLabel && !hasType ? 'block' : 'none';
      typeHint.textContent = 'Type is required';
      labelHint.style.display = hasType && !hasLabel ? 'block' : 'none';
      labelHint.textContent = 'Label is required';
    };

    typeIn.addEventListener('input', updateState);
    labelIn.addEventListener('input', updateState);

    const doAdd = async () => {
      const type = typeIn.value.trim();
      const label = labelIn.value.trim();
      if (!type || !label) return;
      this.customTypes.add(type);
      const atom = await this.addAtomFromForm(type, label);
      if (atom) {
        successMsg.style.display = 'block';
        this.highlightNodes([atom.id]);
        setTimeout(() => { successMsg.style.display = 'none'; this.clearNodeHighlights(); }, 1500);
      }
      typeIn.value = '';
      labelIn.value = '';
      updateState();
    };

    addBtn.addEventListener('click', doAdd);
    labelIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !addBtn.disabled) doAdd(); });
    typeIn.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.dismissOverlays(); });
    labelIn.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.dismissOverlays(); });
    typeIn.focus();

    this.setupPopoverDismiss(popover);
  }

  /**
   * Show add-relation popover anchored to a toolbar button
   */
  private showAddRelationPopover(anchor: HTMLElement): void {
    const popover = document.createElement('div');
    popover.className = 'si-popover';

    const buildPositionSelectors = () => {
      const atoms = this.dataInstance.getAtoms();
      if (atoms.length === 0) return '<div style="color:#666;font-size:11px;">No atoms yet</div>';
      return this.relationAtomPositions.map((sel, i) => {
        const opts = atoms.map(a =>
          `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${a.label} (${a.type})</option>`
        ).join('');
        return `<div><label style="font-size:10px;color:#57606a;">Position ${i + 1}</label><select data-pos="${i}"><option value="">Select...</option>${opts}</select></div>`;
      }).join('');
    };

    popover.innerHTML = `
      <div class="si-field">
        <label>Relation Name</label>
        <input type="text" class="si-rel-name" placeholder="e.g. friend, knows..." />
      </div>
      <div class="si-field">
        <label>Atoms (Arity: <strong class="si-arity">${this.relationAtomPositions.length}</strong>)</label>
        <div class="si-position-list">${buildPositionSelectors()}</div>
        <div class="si-arity-controls">
          <button class="si-add-pos">+ Position</button>
          <button class="si-rm-pos">- Position</button>
        </div>
      </div>
      <div class="si-success">Created!</div>
      <div class="si-actions">
        <button class="si-btn-primary" disabled>Create</button>
      </div>
    `;

    this.positionPopover(popover, anchor);

    const nameIn = popover.querySelector('.si-rel-name') as HTMLInputElement;
    const createBtn = popover.querySelector('.si-btn-primary') as HTMLButtonElement;
    const successMsg = popover.querySelector('.si-success') as HTMLElement;
    const posList = popover.querySelector('.si-position-list') as HTMLElement;
    const aritySpan = popover.querySelector('.si-arity') as HTMLElement;

    const updateCreateState = () => {
      const filled = this.relationAtomPositions.filter(p => p.trim()).length;
      createBtn.disabled = !nameIn.value.trim() || filled < 2;
    };

    nameIn.addEventListener('input', updateCreateState);

    // Delegated change handler for position selects
    posList.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      const pos = parseInt(sel.dataset.pos || '0');
      this.relationAtomPositions[pos] = sel.value;
      updateCreateState();
    });

    popover.querySelector('.si-add-pos')?.addEventListener('click', () => {
      this.relationAtomPositions.push('');
      aritySpan.textContent = this.relationAtomPositions.length.toString();
      posList.innerHTML = buildPositionSelectors();
      updateCreateState();
    });

    popover.querySelector('.si-rm-pos')?.addEventListener('click', () => {
      if (this.relationAtomPositions.length > 2) {
        this.relationAtomPositions.pop();
        aritySpan.textContent = this.relationAtomPositions.length.toString();
        posList.innerHTML = buildPositionSelectors();
        updateCreateState();
      }
    });

    createBtn.addEventListener('click', async () => {
      await this.addRelationFromForm(nameIn.value.trim());
      nameIn.value = '';
      this.relationAtomPositions = ['', ''];
      aritySpan.textContent = '2';
      posList.innerHTML = buildPositionSelectors();
      updateCreateState();
      successMsg.style.display = 'block';
      setTimeout(() => { successMsg.style.display = 'none'; }, 1500);
    });

    nameIn.focus();
    this.setupPopoverDismiss(popover);
  }

  /**
   * Handle delete toolbar action — deletes selected node or shows a popover to select one
   */
  private handleDeleteAction(): void {
    if (this.selectedNodeId) {
      const id = this.selectedNodeId;
      this.selectedNodeId = null;
      this.clearNodeHighlights();
      this.deleteAtom(id);
      return;
    }

    // No node selected — show a delete popover with atom/relation select
    const anchor = this.controlsContainer?.querySelector('[data-action="delete"]') as HTMLElement;
    if (!anchor) return;

    const atoms = this.dataInstance.getAtoms();
    const relations = this.dataInstance.getRelations();
    const atomOpts = atoms.map(a => `<option value="${a.id}">${a.label} (${a.type})</option>`).join('');
    const relOpts = relations.flatMap(r =>
      r.tuples.map((t, i) => `<option value="${r.id}::${i}">${r.name}(${t.atoms.join(', ')})</option>`)
    ).join('');

    const popover = document.createElement('div');
    popover.className = 'si-popover';
    popover.innerHTML = `
      <div class="si-field">
        <label>Delete Atom</label>
        <select class="si-del-atom"><option value="">Select atom...</option>${atomOpts}</select>
      </div>
      <div class="si-field">
        <label>Delete Relation</label>
        <select class="si-del-rel"><option value="">Select relation...</option>${relOpts}</select>
      </div>
      <div class="si-actions">
        <button class="si-btn-danger" disabled>Delete</button>
      </div>
    `;

    this.positionPopover(popover, anchor);

    const atomSel = popover.querySelector('.si-del-atom') as HTMLSelectElement;
    const relSel = popover.querySelector('.si-del-rel') as HTMLSelectElement;
    const delBtn = popover.querySelector('.si-btn-danger') as HTMLButtonElement;

    const updateState = () => { delBtn.disabled = !atomSel.value && !relSel.value; };
    atomSel.addEventListener('change', () => { if (atomSel.value) relSel.value = ''; updateState(); });
    relSel.addEventListener('change', () => { if (relSel.value) atomSel.value = ''; updateState(); });

    delBtn.addEventListener('click', async () => {
      if (atomSel.value) {
        await this.deleteAtom(atomSel.value);
      } else if (relSel.value) {
        const [relationId, tupleIndexStr] = relSel.value.split('::');
        await this.deleteRelationTuple(relationId, parseInt(tupleIndexStr, 10));
      }
      this.dismissOverlays();
    });

    this.setupPopoverDismiss(popover);
  }

  /**
   * Position a popover below an anchor element
   */
  private positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
    if (!this.shadowRoot) return;
    // Append to shadow root and position absolutely relative to the host element
    const hostRect = this.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    popover.style.position = 'absolute';
    popover.style.top = `${anchorRect.bottom - hostRect.top + 4}px`;
    popover.style.left = `${anchorRect.left - hostRect.left}px`;
    popover.style.zIndex = '10001'; // Above everything including modals
    this.shadowRoot.appendChild(popover);
  }

  /**
   * Set up click-outside dismiss for a popover
   */
  private _activePopover: HTMLElement | null = null;

  private setupPopoverDismiss(popover: HTMLElement): void {
    this._activePopover = popover;
    // Prevent mousedown inside popover from reaching global dismiss handler
    popover.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  // ── Canvas interactions (context menu, click-to-select) ──

  /**
   * Set up canvas-level interactions: right-click menu, click-to-select + keyboard delete
   */
  private setupCanvasInteractions(): void {
    const svgContainer = this.shadowRoot?.querySelector('#svg-container') as HTMLElement;
    const svgEl = this.shadowRoot?.querySelector('#svg') as SVGSVGElement;
    if (!svgContainer || !svgEl) return;

    // Make host focusable for keyboard events and position context for popovers
    this.setAttribute('tabindex', '0');
    this.style.outline = 'none';
    this.style.position = 'relative';

    // ── Global click-outside dismiss for popovers ──
    // Uses bubble phase so popover's stopPropagation prevents this from firing
    this.shadowRoot?.addEventListener('mousedown', () => {
      if (this._activePopover) this.dismissOverlays();
    });

    // Also dismiss on clicks outside the shadow root
    document.addEventListener('mousedown', () => {
      if (this._activePopover) this.dismissOverlays();
    });

    // ── SVG click: node selection ──
    svgEl.addEventListener('click', (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey) return; // input mode

      const target = e.target as SVGElement;
      const nodeGroup = target.closest('.node') || target.closest('.error-node');

      this.clearNodeHighlights();
      this.selectedNodeId = null;

      if (nodeGroup) {
        const nodeData = d3.select(nodeGroup).datum() as any;
        if (nodeData?.id) {
          this.selectedNodeId = nodeData.id;
          this.highlightNodes([nodeData.id]);
          this.focus();
        }
      }
    });

    // ── Right-click context menu on nodes ──
    svgEl.addEventListener('contextmenu', (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const nodeGroup = target.closest('.node') || target.closest('.error-node');
      if (!nodeGroup) return;

      e.preventDefault();
      e.stopPropagation();

      const nodeData = d3.select(nodeGroup).datum() as any;
      if (!nodeData?.id) return;

      const rect = svgContainer.getBoundingClientRect();
      const menuX = e.clientX - rect.left;
      const menuY = e.clientY - rect.top;
      this.showNodeContextMenu(svgContainer, nodeData, menuX, menuY);
    });

    // ── Keyboard: Delete/Backspace to delete selected node, Escape to deselect ──
    this.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.selectedNodeId = null;
        this.clearNodeHighlights();
        this.dismissOverlays();
        return;
      }

      if (!this.selectedNodeId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if user is typing in an input
        const active = this.shadowRoot?.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

        e.preventDefault();
        const atomId = this.selectedNodeId;
        this.selectedNodeId = null;
        this.clearNodeHighlights();
        this.deleteAtom(atomId);
      }
    });
  }

  /**
   * Show a context menu for a node
   */
  private showNodeContextMenu(container: HTMLElement, nodeData: any, x: number, y: number): void {
    this.dismissOverlays();

    const menu = document.createElement('div');
    menu.className = 'node-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const label = nodeData.name || nodeData.label || nodeData.id;
    menu.innerHTML = `
      <div class="menu-item danger" data-action="delete">Delete "${label}"</div>
    `;

    container.appendChild(menu);

    menu.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.action === 'delete') {
        this.dismissOverlays();
        await this.deleteAtom(nodeData.id);
      }
    });

    // Dismiss on next click anywhere
    const dismiss = (e: Event) => {
      if (!menu.contains(e.target as Node)) {
        this.dismissOverlays();
      }
      this.shadowRoot?.removeEventListener('click', dismiss);
      document.removeEventListener('click', dismiss);
    };
    // Delay so the current click doesn't immediately dismiss
    setTimeout(() => {
      this.shadowRoot?.addEventListener('click', dismiss);
      document.addEventListener('click', dismiss);
    }, 0);
  }

  /**
   * Dismiss any open popovers or context menus
   */
  private dismissOverlays(): void {
    this._activePopover = null;
    this.shadowRoot?.querySelectorAll('.si-popover, .node-context-menu').forEach(el => el.remove());
  }

  /**
   * Handle edge creation requests from input mode
   */
  private async handleEdgeCreationRequest(event: CustomEvent): Promise<void> {
    const { relationId, tuple } = event.detail;

    try {
      this.dataInstance.addRelationTuple(relationId, tuple);
      await this.enforceConstraintsAndRegenerate();
    } catch (error) {
      console.error('Failed to handle edge creation request:', error);
    }
  }

  /**
   * Handle edge modification requests from input mode
   * This updates the data instance when an edge label is edited
   */
  private async handleEdgeModificationRequest(event: CustomEvent): Promise<void> {
    const { oldRelationId, newRelationId, tuple, tuples } = event.detail;

    // Support both single `tuple` and array `tuples` (group edges send multiple).
    const allTuples: ITuple[] = tuples ?? (tuple ? [tuple] : []);

    try {
      // If the new relation name is empty, delete the edge
      if (!newRelationId || newRelationId.trim() === '') {
        if (oldRelationId && oldRelationId.trim()) {
          for (const t of allTuples) {
            this.dataInstance.removeRelationTuple(oldRelationId, t);
          }
        }
      }
      // If the names are the same, no change needed
      else if (oldRelationId.trim() === newRelationId.trim()) {
        return;
      }
      // Otherwise, move the tuple(s) from old relation to new relation
      else {
        let removedCount = 0;
        if (oldRelationId && oldRelationId.trim()) {
          for (const t of allTuples) {
            try {
              this.dataInstance.removeRelationTuple(oldRelationId, t);
              removedCount++;
            } catch (removeErr) {
              console.error(
                `Failed to remove tuple from "${oldRelationId}": [${t.atoms.join(', ')}]`,
                removeErr
              );
            }
          }
        }
        // Only add to new relation if we successfully removed from old
        // (or there was no old relation to remove from)
        if (removedCount > 0 || !oldRelationId || !oldRelationId.trim()) {
          for (const t of allTuples) {
            this.dataInstance.addRelationTuple(newRelationId, t);
          }
        }
      }
      await this.enforceConstraintsAndRegenerate();
    } catch (error) {
      console.error('Failed to handle edge modification request:', error);
    }
  }

  /**
   * Handle edge reconnection requests from input mode
   * This updates the data instance when an edge endpoint is dragged to a new node
   */
  private async handleEdgeReconnectionRequest(event: CustomEvent): Promise<void> {
    const { relationId, oldTuple, newTuple } = event.detail;

    try {
      if (relationId && relationId.trim()) {
        try {
          this.dataInstance.removeRelationTuple(relationId, oldTuple);
        } catch (removeErr) {
          console.error(
            `Failed to remove old tuple from "${relationId}": [${oldTuple.atoms.join(', ')}]`,
            removeErr
          );
          // Bail out — don't add the new tuple if we couldn't remove the old one,
          // as that would create a duplicate edge.
          return;
        }
      }
      this.dataInstance.addRelationTuple(relationId, newTuple);
      await this.enforceConstraintsAndRegenerate();
    } catch (error) {
      console.error('Failed to handle edge reconnection request:', error);
    }
  }

  /**
   * Parse CnD specification and initialize the full CnD pipeline
   */
  private async parseCnDSpec(specString: string): Promise<void> {
    try {
      this.cndSpecString = specString;
      
      // Initialize the full CnD pipeline
      await this.initializeCnDPipeline(specString);

      await this.enforceConstraintsAndRegenerate();

      this.dispatchEvent(new CustomEvent('spec-loaded', {
        detail: { spec: this.cndSpecString }
      }));
    } catch (error) {
      console.error('Failed to parse CnD spec:', error);
    }
  }

  /**
   * Initialize the complete CnD pipeline with evaluator and layout instance
   */
  private async initializeCnDPipeline(specString: string): Promise<void> {
    if (!specString.trim()) {
      this.evaluator = null;
      this.layoutInstance = null;
      return;
    }

    try {
      const layoutSpec = parseLayoutSpec(specString);

      this.evaluator = new SGraphQueryEvaluator();
      this.evaluator.initialize({
        sourceData: this.dataInstance
      });

      this.layoutInstance = new LayoutInstance(
        layoutSpec,
        this.evaluator,
        0, // instance number
        true // enable alignment edges
      );
    } catch (error) {
      console.error('Failed to initialize CnD pipeline:', error);
      this.evaluator = null;
      this.layoutInstance = null;
      throw error;
    }
  }

  /**
   * Enforce constraints and regenerate layout
   * This method validates constraints on every data update and reports UNSAT cores
   */
  private async enforceConstraintsAndRegenerate(): Promise<void> {
    try {
      if (!this.layoutInstance) {
        // Still re-render so local data-instance mutations are visible
        this.rerenderGraph();
        return;
      }

      // Re-initialize evaluator with current data to ensure consistency
      if (this.evaluator) {
        this.evaluator.initialize({
          sourceData: this.dataInstance
        });
      }

      const layoutResult = this.layoutInstance.generateLayout(this.dataInstance);

      if (layoutResult.error) {
        this.currentConstraintError = layoutResult.error;
        this.dispatchEvent(new CustomEvent('constraint-error', {
          detail: { error: layoutResult.error, layout: layoutResult.layout },
          bubbles: true
        }));
      } else if (this.currentConstraintError !== null) {
        this.currentConstraintError = null;
        this.dispatchEvent(new CustomEvent('constraints-satisfied', {
          detail: { layout: layoutResult.layout },
          bubbles: true
        }));
      }

      // Warm-start from prior positions to prevent nodes jumping on every change
      const priorState = this.getLayoutState();
      const hasExistingLayout = priorState.positions.length > 0;
      await this.renderLayout(layoutResult.layout, hasExistingLayout ? { priorPositions: priorState } : undefined);
    } catch (error) {
      console.error('Failed to enforce constraints and regenerate layout:', error);
      this.dispatchEvent(new CustomEvent('layout-generation-error', {
        detail: { error },
        bubbles: true
      }));
    }
  }


  /**
   * Get available atom types from the current data instance
   */
  private getAvailableAtomTypes(): string[] {
    const atomTypes = new Set<string>();

    if (this.dataInstance) {
      const atoms = this.dataInstance.getAtoms();
      atoms.forEach(atom => {
        if (atom.type) {
          atomTypes.add(atom.type);
        }
      });
    }

    // Add some default types if none found
    if (atomTypes.size === 0) {
      atomTypes.add('Entity');
      atomTypes.add('Person');
      atomTypes.add('Object');
    }

    return Array.from(atomTypes);
  }

  /**
   * Update the data instance
   */
  private updateDataInstance(instanceString: string): void {
    try {
      // This would need to be implemented with proper data instance parsing
      // For now, assume it's passed as an object reference
      console.log('Data instance updated:', instanceString);
    } catch (error) {
      console.error('Failed to update data instance:', error);
    }
  }


  /**
   * Generate a unique atom ID
   */
  private generateAtomId(type: string): string {
    if (!this.dataInstance) return `${type}-1`;
    
    const existingAtoms = this.dataInstance.getAtoms();
    const existingIds = new Set(existingAtoms.map(atom => atom.id));
    
    let counter = 1;
    let candidateId = `${type}-${counter}`;
    
    while (existingIds.has(candidateId)) {
      counter++;
      candidateId = `${type}-${counter}`;
    }
    
    return candidateId;
  }

  /**
   * Add an atom from the form inputs
   */
  private async addAtomFromForm(type: string, label: string): Promise<IAtom | null> {
    if (!type || !label) return null;

    try {
      const atomId = this.generateAtomId(type);
      const atom: IAtom = {
        id: atomId,
        type: type,
        label: label
      };

      this.dataInstance.addAtom(atom);
      await this.enforceConstraintsAndRegenerate();

      this.dispatchEvent(new CustomEvent('atom-added', {
        detail: { atom }
      }));

      return atom;
    } catch (error) {
      console.error('Failed to add atom:', error);
      return null;
    }
  }


  /**
   * Add a relation from the form inputs
   */
  private async addRelationFromForm(relationName?: string): Promise<void> {
    try {
      const relationType = relationName?.trim() ||
        (this.shadowRoot?.querySelector('.si-rel-name') as HTMLInputElement)?.value?.trim() || '';

      if (!relationType) return;

      const selectedAtomIds = this.relationAtomPositions.filter(id => id.trim() !== '');

      if (selectedAtomIds.length < 2) {
        console.warn('Need at least 2 atoms for a relation');
        return;
      }

      const atoms = this.dataInstance.getAtoms();
      const atomTypes = selectedAtomIds.map(id => {
        const atom = atoms.find(a => a.id === id);
        return atom?.type || 'untyped';
      });

      const tuple: ITuple = {
        atoms: selectedAtomIds,
        types: atomTypes
      };

      this.dataInstance.addRelationTuple(relationType, tuple);
      await this.enforceConstraintsAndRegenerate();

      this.dispatchEvent(new CustomEvent('relation-added', {
        detail: { relationType, tuple }
      }));
    } catch (error) {
      console.error('Failed to add relation:', error);
    }
  }

  /**
   * Export current data using the data instance's reify method
   */
  private exportDataAsJSON(): void {
    try {
      const reified = this.dataInstance.reify();
      const exportString = typeof reified === 'string'
        ? reified
        : JSON.stringify(reified, null, 2);

      this.dispatchEvent(new CustomEvent('data-exported', {
        detail: {
          data: exportString,
          format: typeof reified === 'string' ? 'text' : 'json',
          reified: reified
        }
      }));
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  }


  /**
   * Set the data instance for this graph
   */
  setDataInstance(instance: IInputDataInstance): void {
    this.dataInstance = instance;
  }


  /**
   * Delete an atom by ID
   */
  private async deleteAtom(atomId: string): Promise<void> {
    if (!atomId) return;

    try {
      const atoms = this.dataInstance.getAtoms();
      const atomToDelete = atoms.find(atom => atom.id === atomId);

      if (!atomToDelete) return;

      this.dataInstance.removeAtom(atomId);
      await this.enforceConstraintsAndRegenerate();

      this.dispatchEvent(new CustomEvent('atom-deleted', {
        detail: { atom: atomToDelete }
      }));
    } catch (error) {
      console.error('Failed to delete atom:', error);
    }
  }

  /**
   * Delete a specific relation tuple by relation ID and tuple index within that relation
   */
  private async deleteRelationTuple(relationId: string, tupleIndex: number): Promise<void> {
    try {
      const relations = this.dataInstance.getRelations();
      const relation = relations.find(r => r.id === relationId);
      if (!relation || tupleIndex < 0 || tupleIndex >= relation.tuples.length) return;

      const targetTuple = relation.tuples[tupleIndex];
      this.dataInstance.removeRelationTuple(relationId, targetTuple);
      await this.enforceConstraintsAndRegenerate();

      this.dispatchEvent(new CustomEvent('relation-tuple-deleted', {
        detail: { relationId, tuple: targetTuple }
      }));
    } catch (error) {
      console.error('Failed to delete relation tuple:', error);
    }
  }

  /**
   * Clear all atoms and relations
   */
  private async clearAllItems(): Promise<void> {
    try {
      this.setDataInstance(new JSONDataInstance({
        atoms: [],
        relations: [],
        types: []
      }));

      await this.enforceConstraintsAndRegenerate();

      this.dispatchEvent(new CustomEvent('all-items-cleared', {
        detail: {}
      }));
    } catch (error) {
      console.error('Failed to clear all items:', error);
    }
  }



  /**
   * Get the current data instance
   */
  getDataInstance(): IInputDataInstance | null {
    return this.dataInstance;
  }

  /**
   * Get the current constraint error (if any)
   * Returns null if all constraints are currently satisfied
   */
  getCurrentConstraintError(): ConstraintError | null {
    return this.currentConstraintError;
  }

  /**
   * Check if there are currently unsatisfied constraints
   */
  hasConstraintErrors(): boolean {
    return this.currentConstraintError !== null;
  }

  /**
   * Set the CnD specification
   */
  async setCnDSpec(spec: string): Promise<void> {
    this.setAttribute('cnd-spec', spec);
    await this.parseCnDSpec(spec);
  }

  /**
   * Get available atom types from the current data instance
   */
  getAvailableTypes(): string[] {
    return this.getAvailableAtomTypes();
  }
}
