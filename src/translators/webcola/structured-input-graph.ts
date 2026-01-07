/* eslint-disable @typescript-eslint/no-explicit-any */
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
  
  // Track event listeners to prevent duplicates
  private dataInstanceEventHandlers = {
    atomAdded: null as DataInstanceEventListener | null,
    atomRemoved: null as DataInstanceEventListener | null,
    relationTupleAdded: null as DataInstanceEventListener | null,
    relationTupleRemoved: null as DataInstanceEventListener | null,
  };

  /**
   * Input mode state management for edge creation and modification
   */
  private isInputModeActive: boolean = false;
  private edgeCreationState: {
    isCreating: boolean;
    sourceNode: any | null;
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
    edge: any | null;
    endpoint: 'source' | 'target' | null;
    dragMarker: any;
  } = {
    isDragging: false,
    edge: null,
    endpoint: null,
    dragMarker: null
  };

  constructor(dataInstance?: IInputDataInstance) {
    super();
    
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
    
    // Initialize input mode keyboard event handlers
    this.initializeInputModeHandlers();
    
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

    // Create controls container
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.className = 'structured-input-controls';
    this.controlsContainer.innerHTML = this.getControlsHTML();

    // Add styles
    const style = document.createElement('style');
    style.textContent = this.getControlsCSS();
    this.shadowRoot.appendChild(style);

    // Add controls to shadow DOM
    this.shadowRoot.appendChild(this.controlsContainer);

    // Bind event handlers
    this.bindControlEvents();
  }

  /**
   * Generate HTML for the controls interface
   */
  private getControlsHTML(): string {
    return `
      <div class="structured-input-panel">
        <div class="panel-header">
          <h3>Data Editor</h3>
          <button class="toggle-panel" aria-label="Toggle panel">▼</button>
        </div>
        <div class="panel-content">
          <div class="atom-creation-section section-card">
            <div class="section-header" data-section="atoms">
              <h4>Atoms</h4>
              <button class="section-toggle" aria-label="Toggle section">▼</button>
            </div>
            <div class="section-content">
              <div class="atom-form">
                <div class="form-group">
                  <label class="form-label">Type</label>
                  <select class="atom-type-select form-control" aria-label="Select atom type">
                    <option value="">Select type...</option>
                  </select>
                  <span class="label-divider">or</span>
                  <textarea class="custom-type-input form-control" placeholder="Enter custom type..."></textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Label</label>
                  <input type="text" class="atom-label-input form-control" placeholder="Enter label..." aria-label="Atom label">
                  <small class="form-hint">ID will be auto-generated</small>
                </div>
                <button class="add-atom-btn btn-primary" disabled>Add Atom</button>
              </div>
            </div>
          </div>
          
          <div class="relation-creation-section section-card">
            <div class="section-header" data-section="relations">
              <h4>Relations</h4>
              <button class="section-toggle" aria-label="Toggle section">▼</button>
            </div>
            <div class="section-content">
              <div class="relation-form">
                <div class="form-group">
                  <label class="form-label">Relation Name</label>
                  <input type="text" class="relation-type-input form-control" placeholder="e.g., friend, knows, parent" />
                </div>
                <div class="relation-atoms">
                  <label class="form-label">Atoms (Arity: <span class="arity-display">2</span>)</label>
                  <div class="atom-positions"></div>
                  <div class="arity-controls">
                    <button type="button" class="add-position-btn btn-sm">+ Add Position</button>
                    <button type="button" class="remove-position-btn btn-sm">- Remove Position</button>
                  </div>
                </div>
                <button class="add-relation-btn btn-primary" disabled>Create Relation</button>
              </div>
            </div>
          </div>
          
          <div class="deletion-section section-card">
            <div class="section-header" data-section="delete">
              <h4>Delete</h4>
              <button class="section-toggle" aria-label="Toggle section">▼</button>
            </div>
            <div class="section-content">
              <div class="deletion-controls">
                <div class="form-group">
                  <label class="form-label">Delete Atom</label>
                  <select class="atom-delete-select form-control" aria-label="Select atom to delete">
                    <option value="">Select atom...</option>
                  </select>
                  <button class="delete-atom-btn btn-danger" disabled>Delete Atom</button>
                </div>
                <div class="form-group">
                  <label class="form-label">Delete Relation</label>
                  <select class="relation-delete-select form-control" aria-label="Select relation to delete">
                    <option value="">Select relation...</option>
                  </select>
                  <button class="delete-relation-btn btn-danger" disabled>Delete Relation</button>
                </div>
              </div>
              <div class="bulk-delete">
                <button class="clear-all-btn btn-danger-outline">Clear All Data</button>
            </div>
          </div>
          
          <div class="export-section section-card">
            <div class="section-header" data-section="export">
              <h4>Export</h4>
              <button class="section-toggle" aria-label="Toggle section">▼</button>
            </div>
            <div class="section-content">
              <button class="export-json-btn btn-secondary">Export (Reify)</button>
              <textarea class="export-output" readonly placeholder="Exported data will appear here..."></textarea>
            </div>
          </div>
          
          <div class="spec-info-section section-card">
            <div class="section-header" data-section="spec">
              <h4>Spec Info</h4>
              <button class="section-toggle" aria-label="Toggle section">▼</button>
            </div>
            <div class="section-content">
              <div class="spec-details">
                <div class="spec-status">No spec loaded</div>
                <div class="type-list"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate CSS for the controls interface
   */
  private getControlsCSS(): string {
    return `
      .structured-input-controls {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 320px;
        background: #ffffff;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        overflow: hidden;
      }

      .panel-header {
        background: #0078d4;
        color: white;
        padding: 10px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .panel-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }

      .toggle-panel, .section-toggle {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        cursor: pointer;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 3px;
        transition: background 0.2s ease;
      }

      .toggle-panel:hover, .section-toggle:hover {
        background: rgba(255,255,255,0.3);
      }

      .panel-content {
        padding: 12px;
        max-height: 600px;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .panel-content::-webkit-scrollbar {
        width: 8px;
      }

      .panel-content::-webkit-scrollbar-track {
        background: #f5f5f5;
      }

      .panel-content::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 4px;
      }

      .panel-content::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
      }

      .panel-content.collapsed {
        display: none;
      }

      .section-card {
        background: #fafbfc;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        padding: 0;
        margin-bottom: 10px;
      }

      .section-card:last-child {
        margin-bottom: 0;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #f6f8fa;
        border-bottom: 1px solid #d0d7de;
        cursor: pointer;
        user-select: none;
      }

      .section-header:hover {
        background: #eef2f5;
      }

      .section-toggle {
        background: transparent;
        color: #57606a;
        font-size: 10px;
        padding: 2px 6px;
      }

      .section-toggle:hover {
        background: rgba(0,0,0,0.05);
      }

      .section-content {
        padding: 12px;
      }

      .section-content.collapsed {
        display: none;
      }

      h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: #24292e;
      }

      .atom-form, .relation-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .form-label {
        font-size: 11px;
        font-weight: 600;
        color: #57606a;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .label-divider {
        text-align: center;
        color: #8b949e;
        font-size: 10px;
        font-weight: 500;
        margin: 2px 0;
      }

      .form-control {
        padding: 6px 8px;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        font-size: 12px;
        background: white;
        transition: border-color 0.15s ease;
      }

      .form-control:focus {
        outline: none;
        border-color: #0078d4;
        box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.1);
      }

      .custom-type-input {
        resize: vertical;
        min-height: 60px;
        font-family: 'SF Mono', Monaco, 'Consolas', 'Courier New', monospace;
        font-size: 11px;
        line-height: 1.4;
      }

      .form-hint {
        font-size: 10px;
        color: #8b949e;
        font-style: italic;
      }

      .btn-primary, .btn-secondary, .btn-danger, .btn-danger-outline {
        padding: 7px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: background-color 0.15s ease;
        width: 100%;
      }

      .btn-primary {
        background: #0078d4;
        color: white;
      }

      .btn-primary:hover:not(:disabled) {
        background: #106ebe;
      }

      .btn-secondary {
        background: #6c757d;
        color: white;
      }

      .btn-secondary:hover {
        background: #5a6268;
      }

      .btn-danger {
        background: #dc3545;
        color: white;
      }

      .btn-danger:hover:not(:disabled) {
        background: #c82333;
      }

      .btn-danger-outline {
        background: white;
        color: #dc3545;
        border: 1px solid #dc3545;
      }

      .btn-danger-outline:hover {
        background: #dc3545;
        color: white;
      }

      .btn-primary:disabled, .btn-danger:disabled {
        background: #e9ecef;
        color: #adb5bd;
        cursor: not-allowed;
      }

      .btn-sm {
        padding: 5px 10px;
        font-size: 11px;
        border-radius: 3px;
        border: 1px solid #d0d7de;
        background: white;
        cursor: pointer;
        font-weight: 400;
        transition: background-color 0.15s ease;
      }

      .btn-sm:hover:not(:disabled) {
        background: #f6f8fa;
        border-color: #0078d4;
      }

      .atom-selector {
        margin-top: 8px;
      }

      .atom-checkboxes {
        max-height: 120px;
        overflow-y: auto;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        padding: 8px;
        background: white;
      }

      .atom-checkbox-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        font-size: 12px;
      }

      .atom-checkbox-item input[type="checkbox"] {
        margin: 0;
        width: 16px;
        height: 16px;
      }

      .relation-atoms {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .atom-positions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        background: white;
        border: 1px solid #d0d7de;
        border-radius: 4px;
      }

      .atom-position {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .atom-position label {
        font-size: 10px;
        font-weight: 600;
        color: #57606a;
      }

      .atom-position select {
        padding: 5px 8px;
        border: 1px solid #d0d7de;
        border-radius: 3px;
        font-size: 11px;
        background: white;
      }

      .arity-controls {
        display: flex;
        gap: 6px;
      }

      .arity-display {
        font-weight: 700;
        color: #0078d4;
      }

      .deletion-controls {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .bulk-delete {
        border-top: 1px solid #d0d7de;
        padding-top: 10px;
        margin-top: 4px;
      }

      .export-output {
        width: 100%;
        height: 100px;
        margin-top: 8px;
        padding: 8px;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, 'Consolas', 'Courier New', monospace;
        font-size: 10px;
        line-height: 1.4;
        resize: vertical;
        background: #f6f8fa;
        color: #24292e;
      }

      .export-output:focus {
        outline: none;
        border-color: #0078d4;
        box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.1);
      }

      .spec-status {
        font-size: 11px;
        padding: 6px 8px;
        border-radius: 3px;
        background: #f6f8fa;
        border: 1px solid #d0d7de;
        font-weight: 500;
      }

      .spec-status.loaded {
        background: #d4edda;
        border-color: #c3e6cb;
        color: #155724;
      }

      .spec-status.error {
        background: #f8d7da;
        border-color: #f5c6cb;
        color: #721c24;
      }

      .type-list {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .type-item {
        background: #e7f3ff;
        color: #0969da;
        padding: 3px 8px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 500;
        border: 1px solid #b6d7f0;
      }
    `;
  }

  /**
   * Bind event handlers to control elements
   */
  private bindControlEvents(): void {
    if (!this.controlsContainer) return;

    // Toggle panel
    const toggleBtn = this.controlsContainer.querySelector('.toggle-panel') as HTMLButtonElement;
    const panelContent = this.controlsContainer.querySelector('.panel-content') as HTMLDivElement;
    
    toggleBtn?.addEventListener('click', () => {
      const isCollapsed = panelContent.classList.contains('collapsed');
      panelContent.classList.toggle('collapsed');
      toggleBtn.textContent = isCollapsed ? '▲' : '▼';
    });

    // Toggle individual sections
    const sectionHeaders = this.controlsContainer.querySelectorAll('.section-header');
    sectionHeaders.forEach(header => {
      const toggleBtn = header.querySelector('.section-toggle') as HTMLButtonElement;
      const sectionCard = header.closest('.section-card') as HTMLElement;
      const sectionContent = sectionCard?.querySelector('.section-content') as HTMLElement;
      
      if (toggleBtn && sectionContent) {
        header.addEventListener('click', (e) => {
          // Don't toggle if clicking on the toggle button itself (it has its own handler)
          if (e.target === toggleBtn) return;
          
          const isCollapsed = sectionContent.classList.contains('collapsed');
          sectionContent.classList.toggle('collapsed');
          toggleBtn.textContent = isCollapsed ? '▲' : '▼';
        });
        
        // Also allow clicking the toggle button directly
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent header click
          const isCollapsed = sectionContent.classList.contains('collapsed');
          sectionContent.classList.toggle('collapsed');
          toggleBtn.textContent = isCollapsed ? '▲' : '▼';
        });
      }
    });

    // Atom creation
    const typeSelect = this.controlsContainer.querySelector('.atom-type-select') as HTMLSelectElement;
    const customTypeInput = this.controlsContainer.querySelector('.custom-type-input') as HTMLTextAreaElement;
    const labelInput = this.controlsContainer.querySelector('.atom-label-input') as HTMLInputElement;
    const addBtn = this.controlsContainer.querySelector('.add-atom-btn') as HTMLButtonElement;

    const updateAddButtonState = () => {
      const selectedType = typeSelect.value;
      const customType = customTypeInput.value.trim();
      // Use custom type if provided, otherwise use dropdown selection
      const effectiveType = customType || selectedType;
      addBtn.disabled = !effectiveType || !labelInput.value.trim();
    };

    typeSelect?.addEventListener('change', () => {
      // Clear custom type input when a dropdown option is selected (unless it's "Select type...")
      if (typeSelect.value && typeSelect.value !== 'Other...') {
        customTypeInput.value = '';
      }
      updateAddButtonState();
    });

    customTypeInput?.addEventListener('input', () => {
      // Clear dropdown selection when custom type is entered
      if (customTypeInput.value.trim()) {
        typeSelect.value = '';
      }
      updateAddButtonState();
    });

    labelInput?.addEventListener('input', updateAddButtonState);

    addBtn?.addEventListener('click', async () => {
      // Use custom type if provided, otherwise use dropdown selection
      const customType = customTypeInput.value.trim();
      let selectedType = customType || typeSelect.value;
      
      if (customType) {
        // Add to custom types set for future reference
        this.customTypes.add(customType);
        
        // Remove "Other..." temporarily to add it back at the end
        const otherOption = Array.from(typeSelect.options).find(opt => opt.value === 'Other...');
        if (otherOption) {
          typeSelect.removeChild(otherOption);
        }
        
        // Add to dropdown for future use if not already there
        const existingOption = Array.from(typeSelect.options).find(opt => opt.value === customType);
        if (!existingOption) {
          const option = document.createElement('option');
          option.value = customType;
          option.textContent = customType;
          typeSelect.appendChild(option);
        }
        
        // Re-add "Other..." at the end to keep it always available
        if (otherOption) {
          typeSelect.appendChild(otherOption);
        }
        
        // Reset selections
        typeSelect.value = '';
        customTypeInput.value = '';
      } else if (!selectedType) {
        return; // Don't proceed if no type selected
      }
      
      await this.addAtomFromForm(selectedType, labelInput.value.trim());
      labelInput.value = '';
      updateAddButtonState();
      this.updateDeletionSelects(); // Update deletion dropdowns
      this.updateAtomPositions(); // Update relation creation positions
    });

    // Relation creation
    const relationTypeInput = this.controlsContainer.querySelector('.relation-type-input') as HTMLInputElement;
    const addRelationBtn = this.controlsContainer.querySelector('.add-relation-btn') as HTMLButtonElement;
    const addPositionBtn = this.controlsContainer.querySelector('.add-position-btn') as HTMLButtonElement;
    const removePositionBtn = this.controlsContainer.querySelector('.remove-position-btn') as HTMLButtonElement;

    const updateAddRelationButtonState = () => {
      const filledPositions = this.relationAtomPositions.filter(pos => pos.trim() !== '').length;
      const hasEnoughPositions = filledPositions >= 2;
      const hasType = relationTypeInput.value.trim();
      addRelationBtn.disabled = !hasEnoughPositions || !hasType;
    };

    relationTypeInput?.addEventListener('input', updateAddRelationButtonState);

    // Initialize atom position selectors
    this.updateAtomPositions();

    addPositionBtn?.addEventListener('click', () => {
      this.relationAtomPositions.push('');
      this.updateAtomPositions();
      updateAddRelationButtonState();
    });

    removePositionBtn?.addEventListener('click', () => {
      if (this.relationAtomPositions.length > 2) {
        this.relationAtomPositions.pop();
        this.updateAtomPositions();
        updateAddRelationButtonState();
      }
    });

    addRelationBtn?.addEventListener('click', async () => {
      await this.addRelationFromForm();
      relationTypeInput.value = '';
      // Reset positions to default (2 empty positions)
      this.relationAtomPositions = ['', ''];
      this.updateAtomPositions();
      updateAddRelationButtonState();
      this.updateDeletionSelects();
    });

    // Deletion controls
    const atomDeleteSelect = this.controlsContainer.querySelector('.atom-delete-select') as HTMLSelectElement;
    const relationDeleteSelect = this.controlsContainer.querySelector('.relation-delete-select') as HTMLSelectElement;
    const deleteAtomBtn = this.controlsContainer.querySelector('.delete-atom-btn') as HTMLButtonElement;
    const deleteRelationBtn = this.controlsContainer.querySelector('.delete-relation-btn') as HTMLButtonElement;
    const clearAllBtn = this.controlsContainer.querySelector('.clear-all-btn') as HTMLButtonElement;

    // Update deletion button states
    const updateDeleteButtonStates = () => {
      deleteAtomBtn.disabled = !atomDeleteSelect.value;
      deleteRelationBtn.disabled = !relationDeleteSelect.value;
    };

    atomDeleteSelect?.addEventListener('change', updateDeleteButtonStates);
    relationDeleteSelect?.addEventListener('change', updateDeleteButtonStates);

    deleteAtomBtn?.addEventListener('click', async () => {
      await this.deleteAtom(atomDeleteSelect.value);
      this.updateDeletionSelects();
      this.updateAtomPositions();
      updateDeleteButtonStates();
    });

    deleteRelationBtn?.addEventListener('click', async () => {
      await this.deleteRelation(relationDeleteSelect.value);
      this.updateDeletionSelects();
      updateDeleteButtonStates();
    });

    clearAllBtn?.addEventListener('click', async () => {
      await this.clearAllItems();
      this.updateDeletionSelects();
      this.updateAtomPositions();
      updateDeleteButtonStates();
    });

    // Export
    const exportBtn = this.controlsContainer.querySelector('.export-json-btn') as HTMLButtonElement;
    exportBtn?.addEventListener('click', () => {
      this.exportDataAsJSON();
    });

    // Initial update of deletion selects
    this.updateDeletionSelects();
  }

  /**
   * Handle edge creation requests from input mode
   */
  private async handleEdgeCreationRequest(event: CustomEvent): Promise<void> {
    console.log('🔗 Handling edge creation request:', event.detail);
    
    const { relationId, sourceNodeId, targetNodeId, tuple } = event.detail;
    
    try {
      // Add relation to data instance
      this.dataInstance.addRelationTuple(relationId, tuple);
      console.log(`✅ Added relation to data instance: ${relationId}(${sourceNodeId}, ${targetNodeId})`);
      
      // Trigger constraint enforcement and layout regeneration
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
        // Remove from old relation if it has a valid name
        // Use try-catch to gracefully handle cases where the old relation doesn't exist
        if (oldRelationId && oldRelationId.trim()) {
          try {
            this.dataInstance.removeRelationTuple(oldRelationId, tuple);
            console.log(`🗑️ Removed from ${oldRelationId}`);
          } catch (error) {
            // Relation may not exist, which is fine - just skip removal and proceed with adding to new relation
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`⚠️ Could not remove from ${oldRelationId}: ${errorMsg}`);
          }
        }
        
        // Add to new relation (will create if doesn't exist)
        this.dataInstance.addRelationTuple(newRelationId, tuple);
        console.log(`➕ Added to ${newRelationId}`);
      }
      
      // Trigger constraint enforcement and layout regeneration
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
      // Remove the old tuple
      if (relationId && relationId.trim()) {
        try {
          this.dataInstance.removeRelationTuple(relationId, oldTuple);
          console.log(`🗑️ Removed old tuple from ${relationId}: ${oldSourceNodeId} -> ${oldTargetNodeId}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(`⚠️ Could not remove old tuple from ${relationId}: ${errorMsg}`);
        }
      }
      
      // Add the new tuple
      this.dataInstance.addRelationTuple(relationId, newTuple);
      console.log(`➕ Added new tuple to ${relationId}: ${newSourceNodeId} -> ${newTargetNodeId}`);
      
      // Trigger constraint enforcement and layout regeneration
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
      
      this.updateTypeSelector();
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
      const projections = {};
      const layoutResult = this.layoutInstance.generateLayout(this.dataInstance, projections);
      
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
      
      // Render the layout (which will include visual indicators for error nodes if present)
      console.log('🎨 Rendering layout...');
      await this.renderLayout(layoutResult.layout);
      
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
   * Update the type selector based on current data instance
   */
  private refreshTypesFromDataInstance(): void {
    this.updateTypeSelector();
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
   * Update export section visibility
   */
  private updateExportVisibility(show: boolean): void {
    const exportSection = this.controlsContainer?.querySelector('.export-section') as HTMLElement;
    if (exportSection) {
      exportSection.style.display = show ? 'block' : 'none';
    }
  }

  /**
   * Update the type selector with available types
   */
  private updateTypeSelector(): void {
    const typeSelect = this.controlsContainer?.querySelector('.atom-type-select') as HTMLSelectElement;
    if (!typeSelect) return;

    // Clear existing options (except the first one)
    while (typeSelect.children.length > 1) {
      typeSelect.removeChild(typeSelect.lastChild!);
    }

    // Add atom types from data instance
    const atomTypes = this.getAvailableAtomTypes();
    atomTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeSelect.appendChild(option);
    });

    // Add custom types that have been created
    this.customTypes.forEach(type => {
      // Only add if not already in the list
      const existingOption = Array.from(typeSelect.options).find(opt => opt.value === type);
      if (!existingOption) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeSelect.appendChild(option);
      }
    });

    // Add "Other..." option at the end
    const otherOption = document.createElement('option');
    otherOption.value = 'Other...';
    otherOption.textContent = 'Other...';
    typeSelect.appendChild(otherOption);
  }

  /**
   * Update spec information display
   */
  private updateSpecInfo(status: 'loaded' | 'error' = 'loaded', message?: string): void {
    const specStatus = this.controlsContainer?.querySelector('.spec-status') as HTMLElement;
    const typeList = this.controlsContainer?.querySelector('.type-list') as HTMLElement;
    
    if (!specStatus || !typeList) return;

    specStatus.className = `spec-status ${status}`;
    
    if (status === 'error') {
      specStatus.textContent = message || 'Error loading spec';
      typeList.innerHTML = '';
      return;
    }

    const atomTypes = this.getAvailableAtomTypes();
    specStatus.textContent = `Loaded: ${atomTypes.length} atom types available`;
    
    typeList.innerHTML = atomTypes.map(type => 
      `<span class="type-item">${type}</span>`
    ).join('');
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
  private async addAtomFromForm(type: string, label: string): Promise<void> {
    if (!type || !label) return;

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
    } catch (error) {
      console.error('❌ Failed to add atom:', error);
    }
  }

  /**
   * Update atom position selectors for relation creation
   */
  private updateAtomPositions(): void {
    if (!this.controlsContainer) return;

    const positionsContainer = this.controlsContainer.querySelector('.atom-positions') as HTMLDivElement;
    const arityDisplay = this.controlsContainer.querySelector('.arity-display') as HTMLSpanElement;
    const removePositionBtn = this.controlsContainer.querySelector('.remove-position-btn') as HTMLButtonElement;
    
    if (!positionsContainer) return;

    // Update arity display
    if (arityDisplay) {
      arityDisplay.textContent = this.relationAtomPositions.length.toString();
    }

    // Update remove button state
    if (removePositionBtn) {
      removePositionBtn.disabled = this.relationAtomPositions.length <= 2;
    }

    // Clear existing positions
    positionsContainer.innerHTML = '';

    const atoms = this.dataInstance.getAtoms();
    if (atoms.length === 0) {
      positionsContainer.innerHTML = '<div style="color: #666; font-size: 11px;">No atoms available</div>';
      return;
    }

    // Create position selectors
    this.relationAtomPositions.forEach((selectedAtomId, index) => {
      const positionDiv = document.createElement('div');
      positionDiv.className = 'atom-position';
      
      const label = document.createElement('label');
      label.textContent = `Position ${index + 1}:`;
      
      const select = document.createElement('select');
      select.dataset.position = index.toString();
      
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select Atom';
      select.appendChild(defaultOption);
      
      // Add atom options
      atoms.forEach(atom => {
        const option = document.createElement('option');
        option.value = atom.id;
        option.textContent = `${atom.label} (${atom.type})`;
        if (atom.id === selectedAtomId) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      
      // Add event listener
      select.addEventListener('change', () => {
        this.relationAtomPositions[index] = select.value;
        this.updateRelationButtonState();
      });
      
      positionDiv.appendChild(label);
      positionDiv.appendChild(select);
      positionsContainer.appendChild(positionDiv);
    });
  }

  /**
   * Update the add relation button state based on current positions
   */
  private updateRelationButtonState(): void {
    if (!this.controlsContainer) return;
    
    const relationTypeInput = this.controlsContainer.querySelector('.relation-type-input') as HTMLInputElement;
    const addRelationBtn = this.controlsContainer.querySelector('.add-relation-btn') as HTMLButtonElement;
    
    const filledPositions = this.relationAtomPositions.filter(pos => pos.trim() !== '').length;
    const hasEnoughPositions = filledPositions >= 2;
    const hasType = relationTypeInput?.value.trim();
    
    if (addRelationBtn) {
      addRelationBtn.disabled = !hasEnoughPositions || !hasType;
    }
  }

  /**
   * Add a relation from the form inputs
   */
  private async addRelationFromForm(): Promise<void> {
    if (!this.controlsContainer) return;

    try {
      const relationTypeInput = this.controlsContainer.querySelector('.relation-type-input') as HTMLInputElement;
      const relationType = relationTypeInput.value.trim();

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
      
      // Update export output
      const exportOutput = this.controlsContainer?.querySelector('.export-output') as HTMLTextAreaElement;
      if (exportOutput) {
        exportOutput.value = exportString;
      }

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
   * Common handler for data changes that updates UI components
   * @param includeAtomPositions - Whether to update atom position selectors (needed for atom changes)
   */
  private handleDataChangeUIUpdate(includeAtomPositions: boolean = false): void {
    this.refreshTypesFromDataInstance();
    this.updateDeletionSelects();
    if (includeAtomPositions) {
      this.updateAtomPositions();
    }
  }

  /**
   * Common handler for data deletions that updates UI and triggers constraint validation
   * @param includeAtomPositions - Whether to update atom position selectors (needed for atom deletions)
   */
  private async handleDataDeletionWithValidation(includeAtomPositions: boolean = false): Promise<void> {
    this.handleDataChangeUIUpdate(includeAtomPositions);
    // Trigger constraint enforcement and layout regeneration
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
    // checked on every data change (additions, deletions, modifications)
    this.dataInstanceEventHandlers.atomAdded = async () => {
      console.log('📍 Atom added to instance - updating UI and re-validating constraints');
      this.handleDataChangeUIUpdate(true); // Include atom positions for atom additions
      await this.enforceConstraintsAndRegenerate(); // Re-run constraint validation
    };

    this.dataInstanceEventHandlers.relationTupleAdded = async () => {
      console.log('🔗 Relation added to instance - updating UI and re-validating constraints');
      this.handleDataChangeUIUpdate(false); // No atom positions needed for relation additions
      await this.enforceConstraintsAndRegenerate(); // Re-run constraint validation
    };

    this.dataInstanceEventHandlers.atomRemoved = async () => {
      console.log('🗑️ Atom removed from instance - updating UI and re-validating constraints');
      await this.handleDataDeletionWithValidation(true); // Include atom positions for atom deletions
    };

    this.dataInstanceEventHandlers.relationTupleRemoved = async () => {
      console.log('🗑️ Relation tuple removed from instance - updating UI and re-validating constraints');
      await this.handleDataDeletionWithValidation(false); // No atom positions needed for relation deletions
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
   * Update the deletion dropdown selects with current atoms and relations
   */
  private updateDeletionSelects(): void {
    if (!this.controlsContainer) return;

    const atomDeleteSelect = this.controlsContainer.querySelector('.atom-delete-select') as HTMLSelectElement;
    const relationDeleteSelect = this.controlsContainer.querySelector('.relation-delete-select') as HTMLSelectElement;

    if (atomDeleteSelect) {
      // Clear existing options (except first)
      while (atomDeleteSelect.children.length > 1) {
        atomDeleteSelect.removeChild(atomDeleteSelect.lastChild!);
      }

      // Add current atoms with user-friendly labels
      const atoms = this.dataInstance.getAtoms();
      atoms.forEach(atom => {
        const option = document.createElement('option');
        option.value = atom.id;
        // Show label first, then type and ID for context
        option.textContent = `${atom.label} (${atom.type})`;
        atomDeleteSelect.appendChild(option);
      });
    }

    if (relationDeleteSelect) {
      // Clear existing options (except first)
      while (relationDeleteSelect.children.length > 1) {
        relationDeleteSelect.removeChild(relationDeleteSelect.lastChild!);
      }

      // Add current relation tuples (not relations) with user-friendly labels
      const relations = this.dataInstance.getRelations();
      let tupleIndex = 0;
      relations.forEach((relation) => {
        relation.tuples.forEach((tuple) => {
          const option = document.createElement('option');
          // Use tupleIndex as value to uniquely identify each tuple
          option.value = tupleIndex.toString();
          
          // Convert atom IDs to labels for better UX
          const atomLabels = tuple.atoms.map((atomId: string) => {
            const atom = this.dataInstance!.getAtoms().find(a => a.id === atomId);
            return atom ? atom.label : atomId;
          });
          
          // Use relation ID and source-target format instead of just type
          const relationDisplayName = relation.id || relation.name || 'relation';
          option.textContent = `${relationDisplayName}: ${atomLabels.join(' → ')}`;
          relationDeleteSelect.appendChild(option);
          tupleIndex++;
        });
      });
    }
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

  // =========================================
  // INPUT MODE FUNCTIONALITY
  // =========================================

  /**
   * Initialize keyboard event handlers for input mode activation
   */
  private initializeInputModeHandlers(): void {
    // Handle keydown for Cmd/Ctrl press
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && !this.isInputModeActive) {
        this.activateInputMode();
      }
    });

    // Handle keyup for Cmd/Ctrl release
    document.addEventListener('keyup', (event) => {
      if (!event.metaKey && !event.ctrlKey && this.isInputModeActive) {
        this.deactivateInputMode();
      }
    });

    // Handle window blur to ensure input mode is deactivated
    window.addEventListener('blur', () => {
      if (this.isInputModeActive) {
        this.deactivateInputMode();
      }
    });
  }

  /**
   * Activate input mode for edge creation and modification
   */
  private activateInputMode(): void {
    this.isInputModeActive = true;
    
    // Add input-mode class to SVG for styling
    const svg = (this as any).svg;
    if (svg) {
      svg.classed('input-mode', true);
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
    const svg = (this as any).svg;
    if (svg) {
      svg.classed('input-mode', false);
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
    const svgNodes = (this as any).svgNodes;
    const colaLayout = (this as any).colaLayout;
    if (svgNodes && colaLayout) {
      svgNodes.on('.drag', null);
    }
  }

  /**
   * Re-enable node dragging when exiting input mode
   */
  private enableNodeDragging(): void {
    const svgNodes = (this as any).svgNodes;
    const colaLayout = (this as any).colaLayout;
    if (svgNodes && colaLayout && colaLayout.drag) {
      const nodeDrag = colaLayout.drag();
      (this as any).setupNodeDragHandlers(nodeDrag);
      svgNodes.call(nodeDrag);
    }
  }

  /**
   * Disable zoom/translate functionality when in input mode
   */
  private disableZoom(): void {
    const svg = (this as any).svg;
    const zoomBehavior = (this as any).zoomBehavior;
    if (svg && zoomBehavior) {
      // Store current transform before disabling
      (this as any).storedTransform = (window as any).d3.zoomTransform(svg.node());
      // Disable zoom events but preserve the behavior
      svg.on('.zoom', null);
    }
  }

  /**
   * Re-enable zoom/translate functionality when exiting input mode
   */
  private enableZoom(): void {
    const svg = (this as any).svg;
    const zoomBehavior = (this as any).zoomBehavior;
    const storedTransform = (this as any).storedTransform;
    if (svg && zoomBehavior) {
      // Re-enable zoom behavior
      svg.call(zoomBehavior);
      // Restore the previous transform if we had one
      if (storedTransform) {
        svg.call(zoomBehavior.transform, storedTransform);
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
   * Update edge endpoint markers visibility based on input mode state
   */
  private updateEdgeEndpointMarkers(): void {
    const svgLinkGroups = (this as any).svgLinkGroups;
    if (!svgLinkGroups) {
      console.warn('⚠️ svgLinkGroups not found, cannot update edge markers');
      return;
    }

    console.log('🎯 Updating edge endpoint markers, input mode active:', this.isInputModeActive);
    console.log('📊 Link groups:', svgLinkGroups.size());
    
    // Debug: check what's in a link group
    svgLinkGroups.each(function(this: any) {
      const group = d3.select(this);
      console.log('  Group children:', group.selectAll('*').size(), 'path:', group.select('path').size(), 'rect:', group.select('rect').size(), 'polygon:', group.select('polygon').size());
    });
    
    // Update target markers (at the arrow end) with visibility AND position
    const targetMarkers = svgLinkGroups.selectAll('.target-marker');
    console.log('  Target markers found:', targetMarkers.size());
    if (targetMarkers.size() === 0) {
      console.error('❌ NO TARGET MARKERS FOUND IN DOM!');
    }
    targetMarkers
      .attr('opacity', this.isInputModeActive ? 1 : 0)
      .style('pointer-events', this.isInputModeActive ? 'all' : 'none')
      .attr('transform', (d: any) => {
        const x = d.target?.x || 0;
        const y = d.target?.y || 0;
        console.log('  Target marker position:', d.id, x, y);
        return `translate(${x}, ${y})`;
      })
      .raise();

    // Update source markers (at the start) with visibility AND position
    const sourceMarkers = svgLinkGroups.selectAll('.source-marker');
    console.log('  Source markers found:', sourceMarkers.size());
    if (sourceMarkers.size() === 0) {
      console.error('❌ NO SOURCE MARKERS FOUND IN DOM!');
    }
    sourceMarkers
      .attr('opacity', this.isInputModeActive ? 1 : 0)
      .style('pointer-events', this.isInputModeActive ? 'all' : 'none')
      .attr('transform', (d: any) => {
        const x = d.source?.x || 0;
        const y = d.source?.y || 0;
        console.log('  Source marker position:', d.id, x, y);
        return `translate(${x}, ${y})`;
      })
      .raise();
  }

  /**
   * Check if input mode is currently active (exposed for parent class)
   */
  protected get inputModeActive(): boolean {
    return this.isInputModeActive;
  }

  /**
   * Get edge creation state (exposed for parent class)
   */
  protected get edgeCreating(): boolean {
    return this.edgeCreationState.isCreating;
  }

  /**
   * Get edge drag state (exposed for parent class)
   */
  protected get edgeDragging(): boolean {
    return this.edgeDragState.isDragging;
  }
}