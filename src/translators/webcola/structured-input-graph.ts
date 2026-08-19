/* eslint-disable @typescript-eslint/no-explicit-any */
// Guarded for headless import — see webcola-cnd-graph.ts.
const d3: any = typeof window !== 'undefined' ? ((window as any).d3v4 || (window as any).d3) : undefined;
import { WebColaCnDGraph } from './webcola-cnd-graph';
import { EdgeWithMetadata, NodeWithMetadata } from './webcolatranslator';
import { showConfirmDialog, showEdgeEditDialog, showPromptDialog } from './editing/dialogs';
import { IInputDataInstance, IAtom, ITuple } from '../../data-instance/interfaces';
import { JSONDataInstance } from '../../data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../../evaluators/data/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { ConstraintError } from '../../layout/constraint-types';

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
 * - Draggable edge endpoint handles in input mode: hollow ring at the source,
 *   filled diamond at the target (both diamonds for symmetric edges), tinted to
 *   the edge color
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
    super();

    // Editing lives here, not in the base graph. Nothing else turns it on.
    this.attachInputModeListeners();

    
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
    // Include the base's color attributes (`theme`/`background`) — the static
    // getter shadows the base's, so they'd otherwise stop being observed on the
    // interactive element.
    return ['cnd-spec', 'data-instance', 'show-export', 'theme', 'background'];
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
      case 'theme':
      case 'background':
        // Delegate to the base, whose setTheme re-tints the live graph in place
        // (no layout regeneration needed — node colors are a render concern).
        super.attributeChangedCallback(name, oldValue, newValue);
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
   *
   * The tuple carried by the event has the endpoints' own types on it, which are
   * not necessarily the relation's declared column types. The data instance
   * settles that when it writes the tuple (see settleTupleTypes), so nothing
   * needs adjusting here.
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
    if (!this.dataInstance) return `${type}1`;
    
    const existingAtoms = this.dataInstance.getAtoms();
    const existingIds = new Set(existingAtoms.map(atom => atom.id));
    
    let counter = 1;
    let candidateId = `${type}${counter}`;
    
    while (existingIds.has(candidateId)) {
      counter++;
      candidateId = `${type}${counter}`;
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
   * De-collapse symmetric edges in the editable graph: a relation backed by
   * both (a,b) and (b,a) renders as two independent arrows — each mapping 1:1
   * to a tuple — so delete/reconnect act on exactly one direction instead of an
   * ambiguous collapsed edge. The read-only base keeps the tidy double-header.
   */
  protected shouldCollapseSymmetricEdges(): boolean {
    return false;
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

  // =========================================
  // EDITING HOOKS FROM THE BASE GRAPH
  // =========================================

  /** Nodes start and finish an edge drag. */
  protected onNodesRendered(nodes: d3.Selection<SVGGElement, any, any, unknown>): void {
    nodes
      .on('mousedown.inputmode', (d: any) => {
        if (this.isInputModeActive) {
          d3.event.stopPropagation();
          this.startEdgeCreation(d);
        }
      })
      .on('mouseup.inputmode', (d: any) => {
        if (this.isInputModeActive && this.edgeCreationState.isCreating) {
          d3.event.stopPropagation();
          // Handle async operation without blocking the event
          this.finishEdgeCreation(d).catch(error => {
            console.error('Error finishing edge creation:', error);
          });
        }
      });
  }

  /** Clicking an edge opens its label editor. */
  protected onLinkPathsRendered(paths: d3.Selection<SVGPathElement, any, any, unknown>): void {
    paths
      .on('click.inputmode', (d: any) => {
        if (this.isInputModeActive && !this.isAlignmentEdge(d)) {
          d3.event.stopPropagation();
          // Handle async operation without blocking the event
          this.editEdgeLabel(d).catch(error => {
            console.error('Error editing edge label:', error);
          });
        }
      })
      .style('cursor', () => {
        return this.isInputModeActive ? 'pointer' : 'default';
      });
  }

  /** Every edge gets a draggable handle at each end. */
  protected onLinksRendered(linkGroups: d3.Selection<SVGGElement, any, any, unknown>): void {
    this.setupEdgeEndpointMarkers(linkGroups);
  }

  /**
   * Keep the endpoint handles on the edge. The base graph calls this from both
   * routing pipelines, so grid mode moves them too — see #572.
   */
  protected onPositionsUpdated(): void {
    this.updateEdgeEndpointMarkers();
  }

  protected onDispose(): void {
    this.detachInputModeListeners();
    this.deactivateInputMode();
  }

  // =========================================
  // INTERACTIVE EDITING
  // =========================================
  //
  // Input mode, edge creation, edge editing, and the draggable endpoint
  // handles. This all used to sit in WebColaCnDGraph behind an isInputAllowed
  // flag that only this class ever set. See #571.

  /**
   * Input mode state management for edge creation and modification
   */
  private isInputModeActive: boolean = false;

  private inputModeListenersAttached: boolean = false;

  private readonly handleInputModeKeydown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && !this.isInputModeActive) {
      this.activateInputMode();
    }
  };

  private readonly handleInputModeKeyup = (event: KeyboardEvent): void => {
    if (!event.metaKey && !event.ctrlKey && this.isInputModeActive) {
      this.deactivateInputMode();
    }
  };

  private readonly handleInputModeBlur = (): void => {
    if (this.isInputModeActive) {
      this.deactivateInputMode();
    }
  };

  private edgeCreationState: {
    isCreating: boolean;
    sourceNode: NodeWithMetadata | null;
    temporaryEdge: any;
  } = {
    isCreating: false,
    sourceNode: null,
    temporaryEdge: null
  };

  /**
   * Edge endpoint dragging state for moving edges between nodes
   */
  private edgeDragState: {
    isDragging: boolean;
    edge: EdgeWithMetadata | null;
    endpoint: 'source' | 'target' | null;
    dragMarker: any;
  } = {
    isDragging: false,
    edge: null,
    endpoint: null,
    dragMarker: null
  };

  private attachInputModeListeners(): void {
    if (this.inputModeListenersAttached) {
      return;
    }
    document.addEventListener('keydown', this.handleInputModeKeydown);
    document.addEventListener('keyup', this.handleInputModeKeyup);
    window.addEventListener('blur', this.handleInputModeBlur);
    this.inputModeListenersAttached = true;
  }

  private detachInputModeListeners(): void {
    if (!this.inputModeListenersAttached) {
      return;
    }
    document.removeEventListener('keydown', this.handleInputModeKeydown);
    document.removeEventListener('keyup', this.handleInputModeKeyup);
    window.removeEventListener('blur', this.handleInputModeBlur);
    this.inputModeListenersAttached = false;
  }

  /**
   * Activate input mode for edge creation and modification
   */
  private activateInputMode(): void {
    this.isInputModeActive = true;
    
    // Add input-mode class to SVG for styling
    if (this.svg) {
      this.svg.classed('input-mode', true);
    }

    // Disable node dragging and zoom/translate
    this.disableNodeDragging();
    this.disableZoom();

    // Update edge endpoint markers visibility
    this.updateEdgeEndpointMarkers();

    // Dispatch event for external listeners
    this.dispatchEvent(new CustomEvent('input-mode-activated', {
      detail: { active: true }
    }));
  }

  /**
   * Deactivate input mode and restore normal behavior
   */
  private deactivateInputMode(): void {
    this.isInputModeActive = false;
    
    // Remove input-mode class from SVG
    if (this.svg) {
      this.svg.classed('input-mode', false);
    }

    // Clean up any temporary edge creation state
    this.cleanupEdgeCreation();

    // Re-enable node dragging and zoom/translate
    this.enableNodeDragging();
    this.enableZoom();

    // Update edge endpoint markers visibility
    this.updateEdgeEndpointMarkers();

    // Dispatch event for external listeners
    this.dispatchEvent(new CustomEvent('input-mode-deactivated', {
      detail: { active: false }
    }));
  }

  /**
   * Disable node dragging when in input mode
   */
  private disableNodeDragging(): void {
    if (this.svgNodes && this.colaLayout) {
      this.svgNodes.on('.drag', null);
    }
  }

  /**
   * Re-enable node dragging when exiting input mode
   */
  private enableNodeDragging(): void {
    if (this.svgNodes && this.colaLayout && this.colaLayout.drag) {
      const nodeDrag = this.colaLayout.drag();
      this.setupNodeDragHandlers(nodeDrag);
      this.svgNodes.call(nodeDrag);
    }
  }

  /**
   * Disable zoom/translate functionality when in input mode
   */
  private disableZoom(): void {
    if (this.svg && this.zoomBehavior) {
      // Store current transform before disabling
      this.storedTransform = d3.zoomTransform(this.svg.node());
      // Disable zoom events but preserve the behavior
      this.svg.on('.zoom', null);
    }
  }

  /**
   * Re-enable zoom/translate functionality when exiting input mode
   */
  private enableZoom(): void {
    if (this.svg && this.zoomBehavior) {
      // Re-enable zoom behavior
      this.svg.call(this.zoomBehavior);
      // Restore the previous transform if we had one
      if (this.storedTransform) {
        this.svg.call(this.zoomBehavior.transform, this.storedTransform);
      }
    }
  }

  /**
   * Clean up temporary edge creation state
   */
  private cleanupEdgeCreation(): void {
    // Remove temporary edge if it exists
    if (this.edgeCreationState.temporaryEdge) {
      this.edgeCreationState.temporaryEdge.remove();
    }

    // Reset edge creation state
    this.edgeCreationState = {
      isCreating: false,
      sourceNode: null,
      temporaryEdge: null
    };
  }

  /**
   * Start edge creation from a source node
   */
  private startEdgeCreation(sourceNode: NodeWithMetadata): void {
    if (!this.isInputModeActive) return;

    // Clean up any existing edge creation
    this.cleanupEdgeCreation();

    // Set edge creation state
    this.edgeCreationState.isCreating = true;
    this.edgeCreationState.sourceNode = sourceNode;

    // Create temporary edge line
    this.edgeCreationState.temporaryEdge = this.container
      .append('line')
      .attr('class', 'temporary-edge')
      .attr('x1', sourceNode.x)
      .attr('y1', sourceNode.y)
      .attr('x2', sourceNode.x)
      .attr('y2', sourceNode.y)
      .attr('stroke', '#007bff')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.7);

    // Add mousemove listener for temporary edge visualization
    this.svg.on('mousemove.edgecreation', () => {
      if (this.edgeCreationState.isCreating && this.edgeCreationState.temporaryEdge) {
        const [mouseX, mouseY] = d3.mouse(this.container.node());
        this.edgeCreationState.temporaryEdge
          .attr('x2', mouseX)
          .attr('y2', mouseY);
      }
    });
  }

  /**
   * Finish edge creation by connecting to a target node
   */
  private async finishEdgeCreation(targetNode: NodeWithMetadata): Promise<void> {
    if (!this.isInputModeActive || !this.edgeCreationState.isCreating || !this.edgeCreationState.sourceNode) {
      return;
    }

    const sourceNode = this.edgeCreationState.sourceNode;

    // Confirm self-loop edges
    if (sourceNode.id === targetNode.id) {
      const confirmSelfLoop = await showConfirmDialog(this.shadowRoot!,
      
        `Are you sure you want to create a self-loop edge on "${sourceNode.label || sourceNode.id}"?`
      );
      if (!confirmSelfLoop) {
        this.cleanupEdgeCreation();
        return;
      }
    }

    // Clean up temporary edge visualization
    this.svg.on('mousemove.edgecreation', null);

    // Show edge label input dialog
    await this.showEdgeLabelInput(sourceNode, targetNode);
  }

  /**
   * Show edge label input dialog and create the edge
   */
  private async showEdgeLabelInput(sourceNode: NodeWithMetadata, targetNode: NodeWithMetadata): Promise<void> {
    const label = await showPromptDialog(this.shadowRoot!,
      
      `Enter label for edge from "${sourceNode.label || sourceNode.id}" to "${targetNode.label || targetNode.id}":`,
      ''
    );
    
    if (label !== null) { // User didn't cancel
      await this.createNewEdge(sourceNode, targetNode, label || '');
    }

    // Clean up edge creation state
    this.cleanupEdgeCreation();
  }

  /**
   * Create a new edge between two nodes
   */
  private async createNewEdge(sourceNode: NodeWithMetadata, targetNode: NodeWithMetadata, label: string): Promise<void> {
    if (!this.currentLayout) return;

    // Find node indices in the current layout
    const sourceIndex = this.currentLayout.nodes.findIndex(node => node.id === sourceNode.id);
    const targetIndex = this.currentLayout.nodes.findIndex(node => node.id === targetNode.id);

    if (sourceIndex === -1 || targetIndex === -1) {
      console.error('Could not find node indices for edge creation');
      return;
    }

    // Generate unique edge ID
    const edgeId = `edge_${sourceNode.id}_${targetNode.id}_${Date.now()}`;

    // Create new edge object.
    //
    // Store the NODE OBJECTS, not the indices. WebCola swaps indices for nodes
    // only inside Layout.start(), and this edge joins a layout that has already
    // started — rerenderGraph() deliberately never calls start() again. An index
    // written here would therefore never be resolved, and every reader
    // (routing, rendering, hit-testing) would treat the number as a node.
    // `currentLayout.nodes` is the same array WebCola resolved against, so these
    // are the identical objects it would have installed.
    const newEdge: EdgeWithMetadata = {
      id: edgeId,
      source: this.currentLayout.nodes[sourceIndex],
      target: this.currentLayout.nodes[targetIndex],
      label: label,
      relName: label,
      color: '#333',
      isUserCreated: true
    };

    // Add edge to current layout
    this.currentLayout.links.push(newEdge);

    // Update external state with the new edge
    await this.updateExternalStateForNewEdge(sourceNode, targetNode, label);

    // Dispatch event for external listeners
    this.dispatchEvent(new CustomEvent('edge-created', {
      detail: { 
        edge: newEdge,
        sourceNode: sourceNode,
        targetNode: targetNode
      }
    }));

    // Re-render the graph to show the new edge
    this.rerenderGraph();
  }

  /**
   * Update external state for a new edge through the external state management system
   * @param sourceNode - Source node of the edge
   * @param targetNode - Target node of the edge 
   * @param relationName - Name/label of the relation
   */
  private async updateExternalStateForNewEdge(sourceNode: NodeWithMetadata, targetNode: NodeWithMetadata, relationName: string): Promise<void> {
    if (!relationName.trim()) {
      return;
    }

    try {
      // Create a tuple representing the edge/relation
      const tuple: ITuple = {
        atoms: [sourceNode.id, targetNode.id],
        // Provisional: a layout node knows only its most specific type, and this class
        // has no data instance to check it against. Whichever data instance receives
        // the tuple settles its column types against the relation's declared signature
        // before storing it (see settleTupleTypes), so these values are never what
        // lands in a relation. A listener keeping its OWN store must settle them.
        types: [sourceNode.mostSpecificType || 'untyped', targetNode.mostSpecificType || 'untyped']
      };

      console.log(`Dispatching edge creation request: ${relationName}(${sourceNode.id}, ${targetNode.id})`);
      
      // Dispatch edge creation event for React components to handle
      const edgeCreationEvent = new CustomEvent('edge-creation-requested', {
        detail: {
          relationId: relationName,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          tuple: tuple
        },
        bubbles: true
      });
      this.dispatchEvent(edgeCreationEvent);
    } catch (error) {
      console.error('Failed to update external state for new edge:', error);
    }
  }

  /**
   * Edit the label of an existing edge
   */
  private async editEdgeLabel(edgeData: EdgeWithMetadata): Promise<void> {
    if (!this.isInputModeActive) return;

    // Use relName for data-instance lookups; fall back to label for display.
    const currentRelName = edgeData.relName || edgeData.label || '';
    const displayLabel = edgeData.label || edgeData.relName || '';
    const result = await showEdgeEditDialog(this.shadowRoot!, `Edit edge label:`, displayLabel);

    // Handle deletion request
    if (result === 'DELETE') {
      await this.deleteEdge(edgeData);
      return;
    }

    // Handle label change
    if (result !== null && result !== displayLabel) {
      const newLabel = result;

      // Get source and target nodes for data instance update
      const sourceNode = this.getNodeFromEdge(edgeData, 'source');
      const targetNode = this.getNodeFromEdge(edgeData, 'target');

      // Update external state using relation name (not display label)
      await this.updateExternalStateForEdgeModification(sourceNode, targetNode, currentRelName, newLabel);

      // Update edge data
      edgeData.label = newLabel;
      edgeData.relName = newLabel;

      // Dispatch event for external listeners
      this.dispatchEvent(new CustomEvent('edge-modified', {
        detail: { 
          edge: edgeData,
          oldLabel: displayLabel,
          newLabel: newLabel
        }
      }));

      // Re-render to show updated label
      this.rerenderGraph();
    }
  }

  /**
   * Get node from edge data based on source or target
   * @param edgeData - Edge data
   * @param position - 'source' or 'target'
   * @returns Node data or null
   */
  private getNodeFromEdge(edgeData: EdgeWithMetadata, position: 'source' | 'target'): NodeWithMetadata | null {
    if (!this.currentLayout) return null;
    
    // Endpoints are indices before WebCola's first tick and node objects after,
    // so accept either. See EdgeWithMetadata in webcolatranslator.
    const endpoint = edgeData[position] as NodeWithMetadata | number;
    const nodeIndex = typeof endpoint === 'number' ? endpoint : endpoint?.index;
    if (nodeIndex === undefined) return null;
    return this.currentLayout.nodes[nodeIndex] || null;
  }

  /**
   * Update external state for an edge modification through the external state management system
   * @param sourceNode - Source node of the edge
   * @param targetNode - Target node of the edge 
   * @param oldRelationName - Old relation name/label
   * @param newRelationName - New relation name/label
   */
  private async updateExternalStateForEdgeModification(
    sourceNode: NodeWithMetadata | null, 
    targetNode: NodeWithMetadata | null, 
    oldRelationName: string, 
    newRelationName: string
  ): Promise<void> {
    if (!sourceNode || !targetNode) {
      return;
    }

    try {
      // Create tuple for the relation
      const tuple: ITuple = {
        atoms: [sourceNode.id, targetNode.id],
        // Provisional: a layout node knows only its most specific type, and this class
        // has no data instance to check it against. Whichever data instance receives
        // the tuple settles its column types against the relation's declared signature
        // before storing it (see settleTupleTypes), so these values are never what
        // lands in a relation. A listener keeping its OWN store must settle them.
        types: [sourceNode.mostSpecificType || 'untyped', targetNode.mostSpecificType || 'untyped']
      };

      console.log(`Dispatching edge modification request: ${oldRelationName} -> ${newRelationName}`);

      // Dispatch edge modification event for React components to handle
      const edgeModificationEvent = new CustomEvent('edge-modification-requested', {
        detail: {
          oldRelationId: oldRelationName,
          newRelationId: newRelationName,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          tuple: tuple
        },
        bubbles: true
      });
      this.dispatchEvent(edgeModificationEvent);
    } catch (error) {
      console.error('Failed to update external state for edge modification:', error);
    }
  }

  /**
   * Adds draggable endpoint markers to edges for input mode.
   * These markers allow users to drag edge endpoints to reconnect edges.
   * 
   * @param linkGroups - D3 selection of link group elements
   */
  private setupEdgeEndpointMarkers(
    linkGroups: d3.Selection<SVGGElement, any, any, unknown>
  ): void {
    const self = this;

    // Build one draggable endpoint handle. The handle's SHAPE — not just its
    // color — encodes the endpoint's role, so it reads under color-vision
    // deficiency and never collides with the app's primary-action blue:
    //   • directed edge  → hollow ring at the source (origin), filled diamond
    //                       at the target (matches the arrowhead it sits on);
    //   • symmetric edge → both ends are filled diamonds, because a
    //                       bidirectional edge has no privileged direction.
    // Each handle is tinted with its own edge's rendered color so it's obvious
    // which edge a knob belongs to in a dense graph.
    const addHandle = (role: 'source' | 'target'): void => {
      const handles = linkGroups
        .filter((d: any) => !this.isAlignmentEdge(d))
        .append('g')
        .attr('class', `edge-endpoint-marker ${role}-marker`)
        .attr('opacity', 0)              // hidden until input mode
        .style('pointer-events', 'none');

      handles.each(function (d: any) {
        const g = d3.select(this);

        // Source of truth for the tint: the already-rendered edge path. Falls
        // back to the computed color, then a neutral slate.
        let color = self.edgeStrokeColor(d) || '#475569';
        const path = (this.parentNode as Element | null)
          ?.querySelector('path[data-link-id]') as SVGPathElement | null;
        if (path) {
          const stroke = path.getAttribute('stroke');
          if (stroke && stroke !== 'none') color = stroke;
        }

        // A bidirectional edge's two ends are interchangeable → both are heads.
        const isHead = !!d.bidirectional || role === 'target';
        if (isHead) {
          // Filled diamond (rotated square) centered on the origin; the parent
          // <g>'s translate does the positioning.
          g.append('rect')
            .attr('class', 'endpoint-shape')
            .attr('x', -6).attr('y', -6)
            .attr('width', 12).attr('height', 12)
            .attr('rx', 2)
            .attr('transform', 'rotate(45)')
            .attr('fill', color)
            .attr('stroke', 'white')
            .attr('stroke-width', 2);
        } else {
          // Hollow ring = the source/origin end of a directed edge.
          g.append('circle')
            .attr('class', 'endpoint-shape')
            .attr('r', 6)
            .attr('fill', 'white')
            .attr('stroke', color)
            .attr('stroke-width', 2.5);
        }

        // Native hover tooltip — the cheapest path to making the gesture
        // discoverable instead of tribal knowledge.
        const tip = d.bidirectional
          ? 'Symmetric edge — drag either end to move it · drop on empty space to delete'
          : role === 'source'
            ? 'Source end — drag to reconnect · drop on empty space to delete'
            : 'Target end — drag to reconnect · drop on empty space to delete';
        g.append('title').text(tip);
      });

      handles.call(
        d3.drag()
          .on('start', (d: EdgeWithMetadata) => this.startEdgeEndpointDrag(d, role))
          .on('drag', (d: EdgeWithMetadata) => this.dragEdgeEndpoint(d, role))
          .on('end', (d: EdgeWithMetadata) => this.endEdgeEndpointDrag(d, role))
      );
    };

    addHandle('target');
    addHandle('source');
  }

  /**
   * Start dragging an edge endpoint
   */
  private startEdgeEndpointDrag(edgeData: EdgeWithMetadata, endpoint: 'source' | 'target'): void {
    d3.event.sourceEvent.stopPropagation();
    
    this.edgeDragState.isDragging = true;
    this.edgeDragState.edge = edgeData;
    this.edgeDragState.endpoint = endpoint;
    
    console.log(`🔵 Started dragging ${endpoint} endpoint of edge:`, edgeData.id);
  }

  /**
   * Drag an edge endpoint - update visual feedback
   */
  private dragEdgeEndpoint(edgeData: EdgeWithMetadata, endpoint: 'source' | 'target'): void {
    if (!this.edgeDragState.isDragging) return;

    const [mouseX, mouseY] = d3.mouse(this.container.node());

    // Move the dragged handle group to follow the cursor.
    const markerClass = endpoint === 'target' ? '.target-marker' : '.source-marker';
    this.container
      .selectAll('.link-group')
      .filter((d: any) => d.id === edgeData.id)
      .select(markerClass)
      .attr('transform', `translate(${mouseX}, ${mouseY})`);
  }

  /**
   * End dragging an edge endpoint - reconnect or delete edge
   */
  private async endEdgeEndpointDrag(edgeData: EdgeWithMetadata, endpoint: 'source' | 'target'): Promise<void> {
    if (!this.edgeDragState.isDragging) return;

    const [mouseX, mouseY] = d3.mouse(this.container.node());
    
    // Find the node under the cursor
    const targetNode = this.findNodeAtPosition(mouseX, mouseY);
    
    if (targetNode) {
      console.log(`🔗 Reconnecting ${endpoint} to node:`, targetNode.id);
      await this.reconnectEdge(edgeData, endpoint, targetNode);
    } else {
      console.log(`🗑️ No node found - deleting edge:`, edgeData.id);
      await this.deleteEdge(edgeData);
    }
    
    // Clean up drag state
    this.edgeDragState = {
      isDragging: false,
      edge: null,
      endpoint: null,
      dragMarker: null
    };
    
    // Re-render to show changes
    this.rerenderGraph();
  }

  /**
   * Find a node at the given position
   */
  private findNodeAtPosition(x: number, y: number): NodeWithMetadata | null {
    if (!this.currentLayout?.nodes) return null;
    
    // Check each node to see if the position is within its bounds
    for (const node of this.currentLayout.nodes) {
      const halfWidth = ((node as any).visualWidth ?? node.width ?? 0) / 2;
      const halfHeight = ((node as any).visualHeight ?? node.height ?? 0) / 2;
      
      if (x >= node.x - halfWidth && x <= node.x + halfWidth &&
          y >= node.y - halfHeight && y <= node.y + halfHeight) {
        return node;
      }
    }
    
    return null;
  }

  /**
   * Reconnect an edge to a new node
   */
  private async reconnectEdge(
    edgeData: EdgeWithMetadata,
    endpoint: 'source' | 'target',
    newNode: NodeWithMetadata
  ): Promise<void> {
    const oldSourceNode = this.getNodeFromEdge(edgeData, 'source');
    const oldTargetNode = this.getNodeFromEdge(edgeData, 'target');
    
    if (!oldSourceNode || !oldTargetNode) {
      console.error('Could not find source or target node');
      return;
    }

    // Determine new source and target
    let newSourceNode: NodeWithMetadata;
    let newTargetNode: NodeWithMetadata;
    
    if (endpoint === 'source') {
      newSourceNode = newNode;
      newTargetNode = oldTargetNode;
    } else {
      newSourceNode = oldSourceNode;
      newTargetNode = newNode;
    }

    // Don't allow reconnecting if it results in the same edge
    if (newSourceNode.id === oldSourceNode.id && newTargetNode.id === oldTargetNode.id) {
      console.log('⏭️ Edge already connected to this node, no change needed');
      return;
    }

    // Use relName (the data-instance relation key) rather than label (the display
    // string, which may include n-ary suffixes like "[Person1]").
    const relationName = edgeData.relName || edgeData.label || '';

    if (!relationName.trim()) {
      console.warn('Edge has no relation name, cannot reconnect');
      return;
    }

    // Create tuples for old and new edges
    const oldTuple: ITuple = {
      atoms: [oldSourceNode.id, oldTargetNode.id],
      // Provisional: a layout node knows only its most specific type, and this class
      // has no data instance to check it against. Whichever data instance receives
      // the tuple settles its column types against the relation's declared signature
      // before storing it (see settleTupleTypes), so these values are never what
      // lands in a relation. A listener keeping its OWN store must settle them.
      types: [oldSourceNode.mostSpecificType || 'untyped', oldTargetNode.mostSpecificType || 'untyped']
    };

    const newTuple: ITuple = {
      atoms: [newSourceNode.id, newTargetNode.id],
      // Provisional: a layout node knows only its most specific type, and this class
      // has no data instance to check it against. Whichever data instance receives
      // the tuple settles its column types against the relation's declared signature
      // before storing it (see settleTupleTypes), so these values are never what
      // lands in a relation. A listener keeping its OWN store must settle them.
      types: [newSourceNode.mostSpecificType || 'untyped', newTargetNode.mostSpecificType || 'untyped']
    };

    console.log(`Reconnecting edge: ${relationName} from ${oldSourceNode.id}->${oldTargetNode.id} to ${newSourceNode.id}->${newTargetNode.id}`);

    // Dispatch edge reconnection event
    const edgeReconnectionEvent = new CustomEvent('edge-reconnection-requested', {
      detail: {
        relationId: relationName,
        oldTuple: oldTuple,
        newTuple: newTuple,
        oldSourceNodeId: oldSourceNode.id,
        oldTargetNodeId: oldTargetNode.id,
        newSourceNodeId: newSourceNode.id,
        newTargetNodeId: newTargetNode.id
      },
      bubbles: true
    });
    this.dispatchEvent(edgeReconnectionEvent);

    // Update the edge data in the current layout
    const sourceIndex = this.currentLayout.nodes.findIndex(n => n.id === newSourceNode.id);
    const targetIndex = this.currentLayout.nodes.findIndex(n => n.id === newTargetNode.id);
    
    // Store the NODE OBJECTS. These endpoints already HOLD resolved nodes — the
    // layout has started — so writing indices back would un-resolve them, and
    // nothing would ever resolve them again (see createNewEdge above).
    if (sourceIndex !== -1 && targetIndex !== -1) {
      edgeData.source = this.currentLayout.nodes[sourceIndex];
      edgeData.target = this.currentLayout.nodes[targetIndex];
    }
  }

  /**
   * Delete an edge from the graph
   */
  private async deleteEdge(edgeData: EdgeWithMetadata): Promise<void> {
    const sourceNode = this.getNodeFromEdge(edgeData, 'source');
    const targetNode = this.getNodeFromEdge(edgeData, 'target');

    if (!sourceNode || !targetNode) {
      console.error('Could not find source or target node for edge deletion');
      return;
    }

    // Use relName (the data-instance relation key) rather than label (display string).
    const relationName = edgeData.relName || edgeData.label || '';

    if (!relationName.trim()) {
      console.warn('Edge has no relation name, cannot delete from data instance');
      // Still remove from visualization
      this.removeEdgeFromLayout(edgeData);
      return;
    }

    // For group edges, collect tuples for ALL member nodes in the group.
    // A group edge from KeyNode to GroupA (containing N1, N2, N3) visually
    // represents the tuples (KeyNode,N1), (KeyNode,N2), (KeyNode,N3).
    const tuples: ITuple[] = [];

    if (edgeData.groupId && edgeData.keyNodeId && this.currentLayout) {
      const group = (this.currentLayout.groups || []).find((g: any) => g.id === edgeData.groupId);
      if (group) {
        const allGroups = this.currentLayout.groups || [];
        const memberIndices = this.collectGroupNodeIndices(group, allGroups);
        const keyNode = this.currentLayout.nodes.find((n: NodeWithMetadata) => n.id === edgeData.keyNodeId);

        for (const idx of memberIndices) {
          const memberNode = this.currentLayout.nodes[idx];
          if (memberNode && keyNode) {
            tuples.push({
              atoms: [keyNode.id, memberNode.id],
              // Provisional: a layout node knows only its most specific type, and this class
              // has no data instance to check it against. Whichever data instance receives
              // the tuple settles its column types against the relation's declared signature
              // before storing it (see settleTupleTypes), so these values are never what
              // lands in a relation. A listener keeping its OWN store must settle them.
              types: [keyNode.mostSpecificType || 'untyped', memberNode.mostSpecificType || 'untyped']
            });
          }
        }
      }
    }

    // Fallback: if no group tuples were found, use the direct source/target
    if (tuples.length === 0) {
      tuples.push({
        atoms: [sourceNode.id, targetNode.id],
        // Provisional: a layout node knows only its most specific type, and this class
        // has no data instance to check it against. Whichever data instance receives
        // the tuple settles its column types against the relation's declared signature
        // before storing it (see settleTupleTypes), so these values are never what
        // lands in a relation. A listener keeping its OWN store must settle them.
        types: [sourceNode.mostSpecificType || 'untyped', targetNode.mostSpecificType || 'untyped']
      });
    }

    console.log(`🗑️ Deleting edge: ${relationName} (${tuples.length} tuple(s))`);

    // Dispatch edge deletion event (using modification with empty new name)
    const edgeDeletionEvent = new CustomEvent('edge-modification-requested', {
      detail: {
        oldRelationId: relationName,
        newRelationId: '', // Empty string signals deletion
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        tuples: tuples
      },
      bubbles: true
    });
    this.dispatchEvent(edgeDeletionEvent);

    // Remove from current layout
    this.removeEdgeFromLayout(edgeData);
  }

  /**
   * Remove an edge from the current layout
   */
  private removeEdgeFromLayout(edgeData: EdgeWithMetadata): void {
    if (!this.currentLayout?.links) return;
    
    const index = this.currentLayout.links.findIndex(link => link.id === edgeData.id);
    if (index !== -1) {
      this.currentLayout.links.splice(index, 1);
      console.log(`✅ Edge removed from layout: ${edgeData.id}`);
    }
  }

  /**
   * Update positions of edge endpoint markers
   * Positions them at the arrow/marker positions of edges
   */
  private updateEdgeEndpointMarkers(): void {
    // Skip when detached (e.g. dispose() via disconnectedCallback): path
    // geometry reads throw on non-rendered elements, and there is nothing
    // visible to update anyway.
    if (!this.svgLinkGroups || !this.isConnected) return;

    const place = (
      sel: d3.Selection<any, any, any, unknown>,
      position: 'start' | 'end'
    ): void => {
      sel
        .attr('transform', (d: EdgeWithMetadata, i: number, nodes: any) => {
          const point = this.getEdgePathPoint(nodes[i], position);
          const fallback = (position === 'end' ? d.target : d.source) as any;
          const x = point ? point.x : (fallback?.x || 0);
          const y = point ? point.y : (fallback?.y || 0);
          return `translate(${x}, ${y})`;
        })
        .attr('opacity', this.isInputModeActive ? 0.95 : 0)
        .style('pointer-events', this.isInputModeActive ? 'all' : 'none')
        .style('cursor', 'move')
        .raise(); // keep handles above the edge paths
    };

    // Target markers sit at the arrow end; source markers at the path start.
    place(this.svgLinkGroups.select('.target-marker'), 'end');
    place(this.svgLinkGroups.select('.source-marker'), 'start');
  }

  /**
   * Read the start or end point of the edge path `el` belongs to.
   *
   * Returns null when the path is missing or not rendered:
   * getTotalLength()/getPointAtLength() throw InvalidStateError on detached
   * or hidden paths, so callers fall back to layout coordinates.
   */
  private getEdgePathPoint(el: Element | null | undefined, position: 'start' | 'end'): { x: number; y: number } | null {
    const pathElement = this.getLinkPathElement(el);
    if (!pathElement) return null;
    try {
      return pathElement.getPointAtLength(position === 'end' ? pathElement.getTotalLength() : 0);
    } catch {
      return null;
    }
  }

}
