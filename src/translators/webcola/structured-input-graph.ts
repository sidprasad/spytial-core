/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebColaCnDGraph } from './webcola-cnd-graph';
import { IInputDataInstance, IAtom, ITuple, IRelation } from '../../data-instance/interfaces';
import { JSONDataInstance } from '../../data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';

/**
 * Structured Input Graph Custom Element
 * Extends WebColaCnDGraph to provide structured input capabilities
 * 
 * Features:
 * - All WebColaCnDGraph functionality (edge creation, visualization, etc.)
 * - Block-based structured input interface
 * - Auto-generated unique atom IDs with user-provided labels
 * - Full CnD pipeline integration (data instance, evaluator, layout instance)
 * - Constraint enforcement on data changes
 * - IDataInstance JSON export
 * 
 * Attributes:
 * - cnd-spec: CnD specification string (YAML/JSON)
 * - data-instance: Initial data instance (optional)
 * - show-export: Whether to show export functionality (default: true)
 * 
 * Events Fired (in addition to WebColaCnDGraph events):
 * - 'atom-added': When a new atom is added via structured input
 *   * event.detail: { atom: IAtom }
 * - 'data-exported': When data is exported
 *   * event.detail: { data: string, format: 'json' }
 * - 'spec-loaded': When CnD spec is successfully loaded
 *   * event.detail: { spec: string }
 */
export class StructuredInputGraph extends WebColaCnDGraph {
  private dataInstance!: IInputDataInstance;
  private evaluator: SGraphQueryEvaluator | null = null;
  private layoutInstance: LayoutInstance | null = null;
  private cndSpecString: string = '';
  private controlsContainer: HTMLDivElement | null = null;
  private customTypes: Set<string> = new Set();
  private relationAtomPositions: string[] = ['', '']; // Default to 2 positions

  constructor(dataInstance?: IInputDataInstance) {
    super();
    
    // Require data instance - if not provided, create empty one
    const instance = dataInstance || new JSONDataInstance({
      atoms: [],
      relations: []
    });
    
    console.log('🔧 StructuredInputGraph initialized with data instance:', instance);
    
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
          <h3>Structured Input</h3>
          <button class="toggle-panel" aria-label="Toggle panel">▲</button>
        </div>
        <div class="panel-content">
          <div class="atom-creation-section">
            <h4>Add Atoms</h4>
            <div class="atom-form">
              <select class="atom-type-select" aria-label="Select atom type">
                <option value="">Select type...</option>
              </select>
              <textarea class="custom-type-input" placeholder="Or enter custom type name..."></textarea>
              <input type="text" class="atom-label-input" placeholder="Enter label..." aria-label="Atom label">
              <button class="add-atom-btn" disabled>Add Atom</button>
            </div>
            <div class="type-info">
              <small>ID will be auto-generated</small>
            </div>
          </div>
          
          <div class="relation-creation-section">
            <h4>Create Relations</h4>
            <div class="relation-form">
              <input type="text" class="relation-type-input" placeholder="Relation type (e.g., friend, knows, parent)" />
              <div class="relation-atoms">
                <div style="font-size: 0.9em; color: #666; margin-bottom: 8px;">
                  Atoms (arity: <span class="arity-display">2</span>):
                </div>
                <div class="atom-positions"></div>
                <div class="arity-controls">
                  <button type="button" class="add-position-btn">+ Add Position</button>
                  <button type="button" class="remove-position-btn">- Remove Position</button>
                </div>
              </div>
              <button class="add-relation-btn" disabled>Add Relation</button>
            </div>
          </div>
          
          <div class="deletion-section">
            <h4>Delete Items</h4>
            <div class="deletion-controls">
              <select class="atom-delete-select" aria-label="Select atom to delete">
                <option value="">Select atom to delete...</option>
              </select>
              <button class="delete-atom-btn" disabled>Delete Atom</button>
            </div>
            <div class="deletion-controls">
              <select class="relation-delete-select" aria-label="Select relation to delete">
                <option value="">Select relation to delete...</option>
              </select>
              <button class="delete-relation-btn" disabled>Delete Relation</button>
            </div>
            <div class="bulk-delete">
              <button class="clear-all-btn">Clear All Items</button>
            </div>
          </div>
          
          <div class="export-section">
            <h4>Export Data</h4>
            <button class="export-json-btn">Export as JSON</button>
            <textarea class="export-output" readonly placeholder="Exported data will appear here..."></textarea>
          </div>
          
          <div class="spec-info-section">
            <h4>Spec Information</h4>
            <div class="spec-details">
              <div class="spec-status">No spec loaded</div>
              <div class="type-list"></div>
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
        top: 10px;
        right: 10px;
        width: 300px;
        background: white;
        border: 2px solid #007acc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      }

      .panel-header {
        background: #007acc;
        color: white;
        padding: 12px;
        border-radius: 6px 6px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .panel-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }

      .toggle-panel {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 12px;
        padding: 4px;
        border-radius: 3px;
      }

      .toggle-panel:hover {
        background: rgba(255,255,255,0.2);
      }

      .panel-content {
        padding: 12px;
        max-height: 400px;
        overflow-y: auto;
      }

      .panel-content.collapsed {
        display: none;
      }

      .atom-creation-section, .relation-creation-section, .deletion-section, .export-section, .spec-info-section {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #eee;
      }

      .atom-creation-section:last-child, .deletion-section:last-child, .export-section:last-child, .spec-info-section:last-child {
        border-bottom: none;
        margin-bottom: 0;
      }

      h4 {
        margin: 0 0 8px 0;
        font-size: 12px;
        font-weight: 600;
        color: #333;
      }

      .atom-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .atom-type-select, .atom-label-input, .relation-type-input, .atom-delete-select, .relation-delete-select, .custom-type-input {
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
      }

      .custom-type-input {
        resize: vertical;
        min-height: 60px;
        font-family: inherit;
      }

      .add-atom-btn, .add-relation-btn, .delete-atom-btn, .delete-relation-btn, .clear-all-btn, .export-json-btn {
        padding: 6px 12px;
        background: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      }

      .delete-atom-btn, .delete-relation-btn, .clear-all-btn {
        background: #dc3545;
      }

      .delete-atom-btn:hover, .delete-relation-btn:hover, .clear-all-btn:hover {
        background: #c82333;
      }

      .add-atom-btn:disabled, .add-relation-btn:disabled, .delete-atom-btn:disabled, .delete-relation-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .add-atom-btn:hover:not(:disabled), .add-relation-btn:hover:not(:disabled), .export-json-btn:hover {
        background: #005fa3;
      }

      .relation-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .atom-selector {
        margin-top: 8px;
      }

      .atom-selector label {
        display: block;
        font-size: 11px;
        font-weight: 500;
        margin-bottom: 4px;
        color: #555;
      }

      .atom-checkboxes {
        max-height: 100px;
        overflow-y: auto;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 6px;
        background: #fafafa;
      }

      .atom-checkbox-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 0;
        font-size: 11px;
      }

      .atom-checkbox-item input[type="checkbox"] {
        margin: 0;
      }

      .relation-atoms {
        margin-top: 8px;
      }

      .atom-positions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 8px;
      }

      .atom-position {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .atom-position label {
        font-size: 11px;
        font-weight: 500;
        color: #555;
      }

      .atom-position select {
        padding: 4px 6px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 11px;
      }

      .arity-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }

      .add-position-btn, .remove-position-btn {
        padding: 4px 8px;
        font-size: 10px;
        border: 1px solid #ddd;
        border-radius: 3px;
        background: #f8f9fa;
        cursor: pointer;
      }

      .add-position-btn:hover, .remove-position-btn:hover {
        background: #e9ecef;
      }

      .remove-position-btn:disabled {
        background: #f8f9fa;
        color: #6c757d;
        cursor: not-allowed;
      }

      .deletion-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .bulk-delete {
        border-top: 1px solid #eee;
        padding-top: 8px;
      }

      .type-info {
        color: #666;
        font-size: 10px;
      }

      .export-output {
        width: 100%;
        height: 60px;
        margin-top: 8px;
        padding: 6px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 10px;
        resize: vertical;
        background: #f8f9fa;
      }

      .spec-status {
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 3px;
        background: #f0f0f0;
        border: 1px solid #ddd;
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
        font-size: 10px;
      }

      .type-item {
        display: inline-block;
        background: #e9ecef;
        padding: 2px 6px;
        margin: 2px;
        border-radius: 3px;
        border: 1px solid #ced4da;
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
      
      if (layoutResult.error) {
        console.warn('⚠️ Constraint validation error:', layoutResult.error);
      } else {
        console.log('✅ Layout generated successfully');
      }
      
      // Render the layout
      console.log('🎨 Rendering layout...');
      await this.renderLayout(layoutResult.layout);
      
      console.log('✅ Constraints enforced and layout regenerated successfully');
    } catch (error) {
      console.error('❌ Failed to enforce constraints and regenerate layout:', error);
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
   * Export current data as JSON
   */
  private exportDataAsJSON(): void {
    try {
      console.log('📤 Exporting data instance as JSON...');
      
      const data = {
        atoms: this.dataInstance.getAtoms(),
        relations: this.dataInstance.getRelations()
      };

      const jsonString = JSON.stringify(data, null, 2);
      
      // Update export output
      const exportOutput = this.controlsContainer?.querySelector('.export-output') as HTMLTextAreaElement;
      if (exportOutput) {
        exportOutput.value = jsonString;
      }

      // Dispatch event
      this.dispatchEvent(new CustomEvent('data-exported', {
        detail: { data: jsonString, format: 'json' }
      }));

      console.log('✅ Data exported as JSON');
    } catch (error) {
      console.error('❌ Failed to export data:', error);
    }
  }

  /**
   * Set the data instance for this graph
   */
  setDataInstance(instance: IInputDataInstance): void {
    console.log('🔄 Setting new data instance');
    this.dataInstance = instance;
    
    // Refresh types from the new data instance
    this.refreshTypesFromDataInstance();
    
    // Listen for data instance changes to update the visualization
    instance.addEventListener('atomAdded', () => {
      console.log('📍 Atom added to instance - updating UI');
      this.refreshTypesFromDataInstance();
      this.updateDeletionSelects();
      this.updateAtomPositions();
    });

    instance.addEventListener('relationTupleAdded', () => {
      console.log('🔗 Relation added to instance - updating UI');
      this.refreshTypesFromDataInstance();
      this.updateDeletionSelects();
    });

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
      
      // Find the atom
      const atoms = this.dataInstance.getAtoms();
      const atomToDelete = atoms.find(atom => atom.id === atomId);
      
      if (!atomToDelete) {
        console.warn(`⚠️ Atom ${atomId} not found`);
        return;
      }

      // Remove the atom (this would need proper implementation in the data instance)
      // For now, we'll create a new instance without this atom
      const remainingAtoms = atoms.filter(atom => atom.id !== atomId);
      const relations = this.dataInstance.getRelations().filter(rel => 
        !rel.tuples.some(tuple => tuple.atoms.includes(atomId))
      );

      const newInstance = new JSONDataInstance({
        atoms: remainingAtoms,
        relations: relations,
        types: []
      });

      this.setDataInstance(newInstance);
      
      console.log(`✅ Atom removed from data instance: ${atomToDelete.label} (${atomToDelete.id})`);
      
      // Trigger constraint enforcement and layout regeneration
      await this.enforceConstraintsAndRegenerate();

      console.log(`🎉 Atom deletion completed: ${atomToDelete.label} (${atomToDelete.id})`);
      
      // Dispatch event
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
      this.dataInstance.removeRelationTuple(relationId, targetTuple);
      console.log(`✅ Relation tuple removed from data instance: ${relationId}: ${targetTuple.atoms.join(' → ')}`);
      
      // Trigger constraint enforcement and layout regeneration
      await this.enforceConstraintsAndRegenerate();

      console.log(`🎉 Relation tuple deletion completed: ${relationId}: ${targetTuple.atoms.join(' → ')}`);
      
      // Update the UI
      this.updateDeletionSelects();
      
      // Dispatch event
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