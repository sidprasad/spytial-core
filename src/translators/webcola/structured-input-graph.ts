/* eslint-disable @typescript-eslint/no-explicit-any */
const d3: any = (window as any).d3v4 || (window as any).d3;
import { WebColaCnDGraph } from './webcola-cnd-graph';
import { IInputDataInstance, IAtom, ITuple, IRelation, DataInstanceEventListener } from '../../data-instance/interfaces';
import { JSONDataInstance } from '../../data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
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

  // When true, data-instance event handlers skip their enforceConstraintsAndRegenerate
  // call so that multi-step operations (remove + add) only trigger a single re-render.
  private _suppressDataChangeRerender = false;

  // Track event listeners to prevent duplicates
  private dataInstanceEventHandlers = {
    atomAdded: null as DataInstanceEventListener | null,
    atomRemoved: null as DataInstanceEventListener | null,
    relationTupleAdded: null as DataInstanceEventListener | null,
    relationTupleRemoved: null as DataInstanceEventListener | null,
  };

  constructor(dataInstance?: IInputDataInstance) {
    super(true);
    
    // Require data instance - if not provided, create empty one
    const instance = dataInstance || new JSONDataInstance({
      atoms: [],
      relations: []
    });
    
    console.log('StructuredInputGraph initialized with data instance:', instance);
    
    // Use setDataInstance to properly set up event listeners
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
        this.updateExportVisibility(newValue === 'true');
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
      this.updateTypeDatalist();
      const atom = await this.addAtomFromForm(type, label);
      if (atom) {
        successMsg.style.display = 'block';
        this.highlightNodes([atom.id]);
        setTimeout(() => { successMsg.style.display = 'none'; this.clearNodeHighlights(); }, 1500);
      }
      typeIn.value = '';
      labelIn.value = '';
      updateState();
      this.updateDeletionSelects();
      this.updateAtomPositions();
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
      this.updateDeletionSelects();
      this.updateAtomPositions();
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
      this.updateDeletionSelects();
      this.updateAtomPositions();
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
        const [relId] = relSel.value.split('::');
        await this.deleteRelation(relId);
      }
      this.dismissOverlays();
      this.updateDeletionSelects();
      this.updateAtomPositions();
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
        this.updateDeletionSelects();
        this.updateAtomPositions();
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
        this.updateDeletionSelects();
        this.updateAtomPositions();
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
    console.log('🔗 Handling edge creation request:', event.detail);
    
    const { relationId, sourceNodeId, targetNodeId, tuple } = event.detail;
    
    try {
      // Suppress the data-instance event handler so we get a single re-render below.
      this._suppressDataChangeRerender = true;
      try {
        this.dataInstance.addRelationTuple(relationId, tuple);
        console.log(`✅ Added relation to data instance: ${relationId}(${sourceNodeId}, ${targetNodeId})`);
      } finally {
        this._suppressDataChangeRerender = false;
      }
      await this.enforceConstraintsAndRegenerate();
    } catch (error) {
      console.error('❌ Failed to handle edge creation request:', error);
    }
  }

  /**
   * Handle edge modification requests from input mode
   * This updates the data instance when an edge label is edited
   */
  private async handleEdgeModificationRequest(event: CustomEvent): Promise<void> {
    console.log('🔗 Handling edge modification request:', event.detail);
    
    const { oldRelationId, newRelationId, sourceNodeId, targetNodeId, tuple } = event.detail;
    
    try {
      // Suppress data-instance events for all mutations; single re-render at the end.
      this._suppressDataChangeRerender = true;
      try {
        // If the new relation name is empty, delete the edge
        if (!newRelationId || newRelationId.trim() === '') {
          console.log('🗑️ Deleting edge (empty new relation name)');
          if (oldRelationId && oldRelationId.trim()) {
            this.dataInstance.removeRelationTuple(oldRelationId, tuple);
            console.log(`✅ Removed relation tuple from ${oldRelationId}`);
          }
        }
        // If the names are the same, no change needed
        else if (oldRelationId.trim() === newRelationId.trim()) {
          console.log('⏭️ Same relation name, no data changes needed');
          return;
        }
        // Otherwise, move the tuple from old relation to new relation
        else {
          if (oldRelationId && oldRelationId.trim()) {
            try {
              this.dataInstance.removeRelationTuple(oldRelationId, tuple);
              console.log(`🗑️ Removed from ${oldRelationId}`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.log(`⚠️ Could not remove from ${oldRelationId}: ${errorMsg}`);
            }
          }
          this.dataInstance.addRelationTuple(newRelationId, tuple);
          console.log(`➕ Added to ${newRelationId}`);
        }
      } finally {
        this._suppressDataChangeRerender = false;
      }
      await this.enforceConstraintsAndRegenerate();
    } catch (error) {
      console.error('❌ Failed to handle edge modification request:', error);
    }
  }

  /**
   * Handle edge reconnection requests from input mode
   * This updates the data instance when an edge endpoint is dragged to a new node
   */
  private async handleEdgeReconnectionRequest(event: CustomEvent): Promise<void> {
    console.log('🔄 Handling edge reconnection request:', event.detail);
    
    const { relationId, oldTuple, newTuple, oldSourceNodeId, oldTargetNodeId, newSourceNodeId, newTargetNodeId } = event.detail;
    
    try {
      // Suppress data-instance events for both mutations; single re-render at the end.
      this._suppressDataChangeRerender = true;
      try {
        if (relationId && relationId.trim()) {
          try {
            this.dataInstance.removeRelationTuple(relationId, oldTuple);
            console.log(`🗑️ Removed old tuple from ${relationId}: ${oldSourceNodeId} -> ${oldTargetNodeId}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`⚠️ Could not remove old tuple from ${relationId}: ${errorMsg}`);
          }
        }
        this.dataInstance.addRelationTuple(relationId, newTuple);
        console.log(`➕ Added new tuple to ${relationId}: ${newSourceNodeId} -> ${newTargetNodeId}`);
      } finally {
        this._suppressDataChangeRerender = false;
      }
      await this.enforceConstraintsAndRegenerate();
    } catch (error) {
      console.error('❌ Failed to handle edge reconnection request:', error);
    }
  }

  /**
   * Parse CnD specification and initialize the full CnD pipeline
   */
  private async parseCnDSpec(specString: string): Promise<void> {
    try {
      console.log('🔄 Parsing CnD spec and initializing pipeline...');
      this.cndSpecString = specString;
      
      // Initialize the full CnD pipeline
      await this.initializeCnDPipeline(specString);
      
      this.updateTypeDatalist();
      this.updateSpecInfo();
      
      // Trigger constraint enforcement and layout regeneration
      await this.enforceConstraintsAndRegenerate();
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('spec-loaded', {
        detail: { spec: this.cndSpecString }
      }));
      
      console.log('✅ CnD spec parsed and pipeline initialized');
    } catch (error) {
      console.error('❌ Failed to parse CnD spec:', error);
      this.updateSpecInfo('error', error instanceof Error ? error.message : 'Parse error');
    }
  }

  /**
   * Initialize the complete CnD pipeline with evaluator and layout instance
   */
  private async initializeCnDPipeline(specString: string): Promise<void> {
    if (!specString.trim()) {
      console.log('📝 Empty spec - clearing pipeline');
      this.evaluator = null;
      this.layoutInstance = null;
      return;
    }

    try {
      console.log('🔧 Initializing CnD pipeline with spec...');
      
      // Parse the CnD spec to create a layout spec
      const layoutSpec = parseLayoutSpec(specString);
      console.log('📋 Layout spec parsed successfully');
      
      // Create and initialize SGraphQueryEvaluator with current data instance
      this.evaluator = new SGraphQueryEvaluator();
      this.evaluator.initialize({
        sourceData: this.dataInstance
      });
      console.log('🔍 SGraphQueryEvaluator initialized with data instance');

      // Create LayoutInstance with the evaluator
      this.layoutInstance = new LayoutInstance(
        layoutSpec, 
        this.evaluator, 
        0, // instance number
        true // enable alignment edges
      );
      console.log('📐 LayoutInstance created');

      console.log('✅ CnD pipeline initialized successfully (evaluator + layout instance)');
    } catch (error) {
      console.error('❌ Failed to initialize CnD pipeline:', error);
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
    console.log('🔄 enforceConstraintsAndRegenerate() called');
    
    try {
      if (!this.layoutInstance) {
        console.log('⚠️ Cannot enforce constraints - no layout instance available');
        return;
      }

      console.log('📊 Current data instance state:', {
        atoms: this.dataInstance.getAtoms().length,
        relations: this.dataInstance.getRelations().length
      });

      // Re-initialize evaluator with current data to ensure consistency
      if (this.evaluator) {
        console.log('🔄 Re-initializing evaluator with updated data instance...');
        this.evaluator.initialize({
          sourceData: this.dataInstance
        });
        console.log('✅ Evaluator re-initialized');
      }

      console.log('🔧 Generating layout with constraint enforcement...');

      // Generate layout with constraint enforcement
      const layoutResult = this.layoutInstance.generateLayout(this.dataInstance);
      
      // Check for constraint validation errors
      if (layoutResult.error) {
        console.warn('⚠️ Constraint validation error detected:', layoutResult.error);
        
        // Store the error for potential future use
        this.currentConstraintError = layoutResult.error;
        
        // Dispatch event to notify external components about the constraint violation
        this.dispatchEvent(new CustomEvent('constraint-error', {
          detail: { 
            error: layoutResult.error,
            layout: layoutResult.layout 
          },
          bubbles: true
        }));
        
        console.log('📤 Dispatched constraint-error event with UNSAT core information');
      } else {
        console.log('✅ Layout generated successfully - all constraints satisfied');
        
        // Clear any previous constraint error since constraints are now satisfied
        if (this.currentConstraintError !== null) {
          console.log('🧹 Clearing previous constraint error - constraints now satisfied');
          this.currentConstraintError = null;
          
          // Dispatch event to notify that constraints are now satisfied
          this.dispatchEvent(new CustomEvent('constraints-satisfied', {
            detail: { layout: layoutResult.layout },
            bubbles: true
          }));
          
          console.log('📤 Dispatched constraints-satisfied event');
        }
      }
      
      // Render the layout (which will include visual indicators for error nodes if present).
      // Capture the current node positions BEFORE re-rendering so the solver can
      // warm-start from them.  This prevents nodes from jumping back to random
      // positions on every data change and makes convergence visibly faster.
      console.log('🎨 Rendering layout...');
      const priorState = this.getLayoutState();
      const hasExistingLayout = priorState.positions.length > 0;
      await this.renderLayout(layoutResult.layout, hasExistingLayout ? { priorPositions: priorState } : undefined);
      
      console.log('✅ Constraints enforced and layout regenerated successfully');
    } catch (error) {
      console.error('❌ Failed to enforce constraints and regenerate layout:', error);
      
      // Dispatch error event for unexpected errors
      this.dispatchEvent(new CustomEvent('layout-generation-error', {
        detail: { error },
        bubbles: true
      }));
    }
  }

  /**
   * No-op: Previously refreshed the type datalist from the data instance.
   * Now that updateTypeDatalist() is a no-op, this is too.
   */
  private refreshTypesFromDataInstance(): void {
    // Intentionally empty — call sites retained for clarity.
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
   * No-op: Previously toggled .export-section visibility in the old side
   * panel. That element no longer exists.
   */
  private updateExportVisibility(_show: boolean): void {
    // Intentionally empty — call sites retained for clarity.
  }

  /**
   * No-op: Previously updated #atom-type-suggestions datalist in the old
   * side panel. The add-atom popover now builds its own datalist on demand.
   */
  private updateTypeDatalist(): void {
    // Intentionally empty — call sites retained for clarity.
  }

  /**
   * No-op: Previously updated .spec-status and .type-list elements in the
   * old side panel. Those elements no longer exist.
   */
  private updateSpecInfo(_status?: 'loaded' | 'error', _message?: string): void {
    // Intentionally empty — call sites retained for clarity.
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
      console.log(`🔵 Adding atom: ${label} (${type})`);

      const atomId = this.generateAtomId(type);
      const atom: IAtom = {
        id: atomId,
        type: type,
        label: label
      };

      this.dataInstance.addAtom(atom);
      console.log(`✅ Atom added to data instance: ${atom.label} (${atom.id}:${atom.type})`);

      // Refresh types from updated data instance
      this.refreshTypesFromDataInstance();

      // Trigger constraint enforcement and layout regeneration
      await this.enforceConstraintsAndRegenerate();

      // Dispatch event
      this.dispatchEvent(new CustomEvent('atom-added', {
        detail: { atom }
      }));

      console.log(`🎉 Atom addition completed: ${atom.label} (${atom.id}:${atom.type})`);
      return atom;
    } catch (error) {
      console.error('❌ Failed to add atom:', error);
      return null;
    }
  }

  /**
   * No-op: Previously updated .atom-positions, .arity-display, and
   * .remove-position-btn elements in the old side panel. Those elements no
   * longer exist; the relation popover builds position selectors on demand.
   */
  private updateAtomPositions(): void {
    // Intentionally empty — call sites retained for clarity.
  }

  /**
   * No-op: Previously updated .relation-type-input and .add-relation-btn in
   * the old side panel. The relation popover manages its own button state.
   */
  private updateRelationButtonState(): void {
    // Intentionally empty — call sites retained for clarity.
  }

  /**
   * Add a relation from the form inputs
   */
  private async addRelationFromForm(relationName?: string): Promise<void> {
    try {
      // Accept name directly or try to read from popover input
      const relationType = relationName?.trim() ||
        (this.shadowRoot?.querySelector('.si-rel-name') as HTMLInputElement)?.value?.trim() || '';

      if (!relationType) return;

      // Get selected atom IDs from position selectors in order
      const selectedAtomIds = this.relationAtomPositions.filter(id => id.trim() !== '');

      if (selectedAtomIds.length < 2) {
        console.warn('Need at least 2 atoms for a relation');
        return;
      }

      console.log(`🔗 Adding relation: ${relationType}(${selectedAtomIds.join(', ')})`);

      // Get atom types for the tuple
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
      console.log(`✅ Relation added to data instance: ${relationType}(${selectedAtomIds.join(', ')})`);

      // Trigger constraint enforcement and layout regeneration
      await this.enforceConstraintsAndRegenerate();

      // Dispatch event
      this.dispatchEvent(new CustomEvent('relation-added', {
        detail: { relationType, tuple }
      }));

      console.log(`🎉 Relation addition completed: ${relationType}(${selectedAtomIds.join(', ')})`);
    } catch (error) {
      console.error('❌ Failed to add relation:', error);
    }
  }

  /**
   * Export current data using the data instance's reify method
   */
  private exportDataAsJSON(): void {
    try {
      console.log('📤 Exporting data instance using reify()...');
      
      // Use the data instance's reify method to get the proper format
      const reified = this.dataInstance.reify();
      
      // Convert to string - if it's already a string (like Pyret or Alloy), use as-is
      // If it's an object (like JSON), stringify it
      const exportString = typeof reified === 'string'
        ? reified
        : JSON.stringify(reified, null, 2);

      // Dispatch event with the reified data
      this.dispatchEvent(new CustomEvent('data-exported', {
        detail: {
          data: exportString,
          format: typeof reified === 'string' ? 'text' : 'json',
          reified: reified
        }
      }));

      console.log('✅ Data exported using reify()');
    } catch (error) {
      console.error('❌ Failed to export data:', error);
    }
  }

  /**
   * No-op: Previously refreshed types, deletion selects, and atom positions.
   * All three delegate methods are now no-ops since the old side panel was
   * removed; the popover UI builds its option lists on demand.
   */
  private handleDataChangeUIUpdate(_includeAtomPositions: boolean = false): void {
    // Intentionally empty — call sites retained for clarity.
  }

  /**
   * Handler for data deletions that triggers constraint validation.
   * The old side-panel UI updates (handleDataChangeUIUpdate) are now no-ops,
   * so only constraint enforcement remains.
   */
  private async handleDataDeletionWithValidation(_includeAtomPositions: boolean = false): Promise<void> {
    await this.enforceConstraintsAndRegenerate();
  }

  /**
   * Set the data instance for this graph
   */
  setDataInstance(instance: IInputDataInstance): void {
    console.log('🔄 Setting new data instance');
    
    // Remove old event listeners if they exist
    if (this.dataInstance) {
      if (this.dataInstanceEventHandlers.atomAdded) {
        this.dataInstance.removeEventListener('atomAdded', this.dataInstanceEventHandlers.atomAdded);
      }
      if (this.dataInstanceEventHandlers.atomRemoved) {
        this.dataInstance.removeEventListener('atomRemoved', this.dataInstanceEventHandlers.atomRemoved);
      }
      if (this.dataInstanceEventHandlers.relationTupleAdded) {
        this.dataInstance.removeEventListener('relationTupleAdded', this.dataInstanceEventHandlers.relationTupleAdded);
      }
      if (this.dataInstanceEventHandlers.relationTupleRemoved) {
        this.dataInstance.removeEventListener('relationTupleRemoved', this.dataInstanceEventHandlers.relationTupleRemoved);
      }
    }
    
    // Set the new data instance
    this.dataInstance = instance;
    
    // Refresh types from the new data instance
    this.refreshTypesFromDataInstance();
    
    // Create and store event handlers
    // ALL event handlers now trigger constraint validation to ensure constraints are
    // checked on every data change (additions, deletions, modifications).
    // They respect _suppressDataChangeRerender so multi-step operations can batch
    // multiple mutations and only pay for one re-render.
    this.dataInstanceEventHandlers.atomAdded = async () => {
      console.log('📍 Atom added to instance - updating UI and re-validating constraints');
      this.handleDataChangeUIUpdate(true); // Include atom positions for atom additions
      if (!this._suppressDataChangeRerender) {
        await this.enforceConstraintsAndRegenerate();
      }
    };

    this.dataInstanceEventHandlers.relationTupleAdded = async () => {
      console.log('🔗 Relation added to instance - updating UI and re-validating constraints');
      this.handleDataChangeUIUpdate(false); // No atom positions needed for relation additions
      if (!this._suppressDataChangeRerender) {
        await this.enforceConstraintsAndRegenerate();
      }
    };

    this.dataInstanceEventHandlers.atomRemoved = async () => {
      console.log('🗑️ Atom removed from instance - updating UI and re-validating constraints');
      this.handleDataChangeUIUpdate(true);
      if (!this._suppressDataChangeRerender) {
        await this.handleDataDeletionWithValidation(true);
      }
    };

    this.dataInstanceEventHandlers.relationTupleRemoved = async () => {
      console.log('🗑️ Relation tuple removed from instance - updating UI and re-validating constraints');
      this.handleDataChangeUIUpdate(false);
      if (!this._suppressDataChangeRerender) {
        await this.handleDataDeletionWithValidation(false);
      }
    };
    
    // Add event listeners to the new instance
    instance.addEventListener('atomAdded', this.dataInstanceEventHandlers.atomAdded);
    instance.addEventListener('relationTupleAdded', this.dataInstanceEventHandlers.relationTupleAdded);
    instance.addEventListener('atomRemoved', this.dataInstanceEventHandlers.atomRemoved);
    instance.addEventListener('relationTupleRemoved', this.dataInstanceEventHandlers.relationTupleRemoved);

    // Initial update of deletion selects and atom positions
    this.updateDeletionSelects();
    this.updateAtomPositions();
    
    console.log('✅ Data instance set successfully');
  }

  /**
   * No-op: Previously updated .atom-delete-select and .relation-delete-select
   * elements in the old side panel. Those elements no longer exist; deletion
   * is now handled via popovers that build their option lists on demand.
   */
  private updateDeletionSelects(): void {
    // Intentionally empty — call sites retained for clarity.
  }

  /**
   * Delete an atom by ID
   */
  private async deleteAtom(atomId: string): Promise<void> {
    if (!atomId) return;

    try {
      console.log(`🗑️ Deleting atom: ${atomId}`);
      
      // Find the atom before removing it
      const atoms = this.dataInstance.getAtoms();
      const atomToDelete = atoms.find(atom => atom.id === atomId);
      
      if (!atomToDelete) {
        console.warn(`⚠️ Atom ${atomId} not found`);
        return;
      }

      // Use the data instance's removeAtom method, which will:
      // 1. Remove the atom from the atoms array
      // 2. Remove it from its type
      // 3. Remove all relation tuples containing this atom
      // 4. Fire the 'atomRemoved' event (which triggers constraint validation)
      this.dataInstance.removeAtom(atomId);
      
      console.log(`✅ Atom removed from data instance: ${atomToDelete.label} (${atomToDelete.id})`);
      console.log(`🎉 Atom deletion completed: ${atomToDelete.label} (${atomToDelete.id})`);
      
      // Note: No need to manually call enforceConstraintsAndRegenerate() here because
      // the 'atomRemoved' event listener in setDataInstance() will handle it
      
      // Dispatch custom event for external listeners
      this.dispatchEvent(new CustomEvent('atom-deleted', {
        detail: { atom: atomToDelete }
      }));
    } catch (error) {
      console.error('❌ Failed to delete atom:', error);
    }
  }

  /**
   * Delete a specific relation tuple by its global index
   */
  private async deleteRelation(tupleIndexStr: string): Promise<void> {
    if (!tupleIndexStr) return;

    try {
      const tupleIndex = parseInt(tupleIndexStr, 10);
      console.log(`🗑️ Deleting relation tuple at index: ${tupleIndex}`);
      
      const relations = this.dataInstance.getRelations();
      
      // Find the relation and tuple at the given global tuple index
      let currentIndex = 0;
      let targetRelation: IRelation | null = null;
      let targetTuple: ITuple | null = null;
      
      for (const relation of relations) {
        for (const tuple of relation.tuples) {
          if (currentIndex === tupleIndex) {
            targetRelation = relation;
            targetTuple = tuple;
            break;
          }
          currentIndex++;
        }
        if (targetRelation) break;
      }
      
      if (!targetRelation || !targetTuple) {
        console.warn(`⚠️ Relation tuple at index ${tupleIndex} not found`);
        return;
      }

      const relationId = targetRelation.id || targetRelation.name;
      console.log(`🗑️ Found tuple in relation "${relationId}": ${targetTuple.atoms.join(' → ')}`);
      
      // Use the removeRelationTuple method to remove just this tuple
      // This will fire the 'relationTupleRemoved' event (which triggers constraint validation)
      this.dataInstance.removeRelationTuple(relationId, targetTuple);
      console.log(`✅ Relation tuple removed from data instance: ${relationId}: ${targetTuple.atoms.join(' → ')}`);
      console.log(`🎉 Relation tuple deletion completed: ${relationId}: ${targetTuple.atoms.join(' → ')}`);
      
      // Note: No need to manually call enforceConstraintsAndRegenerate() or updateDeletionSelects() here because
      // the 'relationTupleRemoved' event listener in setDataInstance() will handle both
      
      // Dispatch custom event for external listeners
      this.dispatchEvent(new CustomEvent('relation-tuple-deleted', {
        detail: { relationId, tuple: targetTuple }
      }));
    } catch (error) {
      console.error('❌ Failed to delete relation tuple:', error);
    }
  }

  /**
   * Clear all atoms and relations
   */
  private async clearAllItems(): Promise<void> {
    try {
      console.log('🧹 Clearing all atoms and relations...');
      
      const newInstance = new JSONDataInstance({
        atoms: [],
        relations: [],
        types: []
      });

      this.setDataInstance(newInstance);
      
      console.log('✅ All items cleared from data instance');
      
      // Trigger constraint enforcement and layout regeneration
      await this.enforceConstraintsAndRegenerate();

      console.log('🎉 Clear all completed');
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('all-items-cleared', {
        detail: {}
      }));
    } catch (error) {
      console.error('❌ Failed to clear all items:', error);
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
