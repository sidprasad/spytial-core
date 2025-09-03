/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebColaCnDGraph } from './webcola-cnd-graph';
import { IInputDataInstance, IAtom, ITuple } from '../../data-instance/interfaces';

/**
 * A parsed CnD specification that extracts type information
 */
export interface ParsedCnDSpec {
  /** Available atom types extracted from the spec */
  atomTypes: string[];
  /** Available relation types extracted from the spec */
  relationTypes: string[];
  /** Type hierarchies if available */
  typeHierarchies?: Record<string, string[]>;
}

/**
 * Structured Input Graph Custom Element
 * Extends WebColaCnDGraph to provide structured input capabilities
 * 
 * Features:
 * - All WebColaCnDGraph functionality (edge creation, visualization, etc.)
 * - CnDSpec-driven atom type selection
 * - Block-based structured input interface
 * - Auto-generated unique atom IDs with user-provided labels
 * - Type hierarchy auto-construction
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
 * - 'spec-parsed': When CnD spec is successfully parsed
 *   * event.detail: { spec: ParsedCnDSpec }
 */
export class StructuredInputGraph extends WebColaCnDGraph {
  private parsedSpec: ParsedCnDSpec | null = null;
  private dataInstance: IInputDataInstance | null = null;
  private controlsContainer: HTMLDivElement | null = null;

  constructor() {
    super();
    
    // Add structured input specific initialization
    this.initializeStructuredInput();
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
              <input type="text" class="atom-label-input" placeholder="Enter label..." aria-label="Atom label">
              <button class="add-atom-btn" disabled>Add Atom</button>
            </div>
            <div class="type-info">
              <small>ID will be auto-generated</small>
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

      .atom-creation-section, .deletion-section, .export-section, .spec-info-section {
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

      .atom-type-select, .atom-label-input, .atom-delete-select, .relation-delete-select {
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
      }

      .add-atom-btn, .delete-atom-btn, .delete-relation-btn, .clear-all-btn, .export-json-btn {
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

      .add-atom-btn:disabled, .delete-atom-btn:disabled, .delete-relation-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .add-atom-btn:hover:not(:disabled), .export-json-btn:hover {
        background: #005fa3;
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
    const labelInput = this.controlsContainer.querySelector('.atom-label-input') as HTMLInputElement;
    const addBtn = this.controlsContainer.querySelector('.add-atom-btn') as HTMLButtonElement;

    const updateAddButtonState = () => {
      addBtn.disabled = !typeSelect.value || !labelInput.value.trim();
    };

    typeSelect?.addEventListener('change', updateAddButtonState);
    labelInput?.addEventListener('input', updateAddButtonState);

    addBtn?.addEventListener('click', () => {
      this.addAtomFromForm(typeSelect.value, labelInput.value.trim());
      labelInput.value = '';
      updateAddButtonState();
      this.updateDeletionSelects(); // Update deletion dropdowns
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

    deleteAtomBtn?.addEventListener('click', () => {
      this.deleteAtom(atomDeleteSelect.value);
      this.updateDeletionSelects();
      updateDeleteButtonStates();
    });

    deleteRelationBtn?.addEventListener('click', () => {
      this.deleteRelation(relationDeleteSelect.value);
      this.updateDeletionSelects();
      updateDeleteButtonStates();
    });

    clearAllBtn?.addEventListener('click', () => {
      this.clearAllItems();
      this.updateDeletionSelects();
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
   * Parse CnD specification to extract type information
   */
  private parseCnDSpec(specString: string): void {
    try {
      // Simple parsing for now - in a real implementation this would use a proper YAML/CnD parser
      const spec: ParsedCnDSpec = this.extractTypesFromSpec(specString);
      this.parsedSpec = spec;
      
      this.updateTypeSelector();
      this.updateSpecInfo();
      
      // Force reload the graph with new spec
      this.reloadGraphWithSpec(specString);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('spec-parsed', {
        detail: { spec }
      }));
    } catch (error) {
      console.error('Failed to parse CnD spec:', error);
      this.updateSpecInfo('error', error instanceof Error ? error.message : 'Parse error');
    }
  }

  /**
   * Reload graph with new specification
   */
  private reloadGraphWithSpec(specString: string): void {
    try {
      // Set the cnd-spec attribute on the parent WebColaCnDGraph
      this.setAttribute('cnd-spec', specString);
      
      // If we have access to rerenderGraph method from parent, call it
      if (typeof (this as any).rerenderGraph === 'function') {
        (this as any).rerenderGraph();
      }
      
      // Force a layout update if current data exists
      if (this.dataInstance) {
        // Clear and re-add atoms to trigger relayout
        const atoms = this.dataInstance.getAtoms();
        const relations = this.dataInstance.getRelations();
        
        // Create fresh data instance
        const freshInstance = new (window as any).CndCore.JSONDataInstance({
          atoms: atoms,
          relations: relations,
          types: []
        });
        
        this.setDataInstance(freshInstance);
      }
      
      console.log('✅ Graph reloaded with new spec');
    } catch (error) {
      console.error('Failed to reload graph with new spec:', error);
    }
  }

  /**
   * Extract type information from CnD spec string
   * This is a simplified parser - in practice you'd use a proper CnD spec parser
   */
  private extractTypesFromSpec(specString: string): ParsedCnDSpec {
    const atomTypes = new Set<string>();
    const relationTypes = new Set<string>();

    // Extract from nodes section
    const nodeMatches = specString.match(/nodes:\s*\n([\s\S]*?)(?=\n\w|$)/);
    if (nodeMatches) {
      const nodesSection = nodeMatches[1];
      const nodeLines = nodesSection.match(/- \{ id: "([^"]+)", type: "([^"]+)"/g);
      nodeLines?.forEach(line => {
        const match = line.match(/type: "([^"]+)"/);
        if (match) atomTypes.add(match[1]);
      });
    }

    // Extract from edges section
    const edgeMatches = specString.match(/edges:\s*\n([\s\S]*?)(?=\n\w|$)/);
    if (edgeMatches) {
      const edgesSection = edgeMatches[1];
      const edgeLines = edgesSection.match(/- \{ id: "([^"]+)", type: "([^"]+)"/g);
      edgeLines?.forEach(line => {
        const match = line.match(/type: "([^"]+)"/);
        if (match) relationTypes.add(match[1]);
      });
    }

    // Add some default types if none found
    if (atomTypes.size === 0) {
      atomTypes.add('Entity');
      atomTypes.add('Person');
      atomTypes.add('Object');
    }
    if (relationTypes.size === 0) {
      relationTypes.add('relation');
      relationTypes.add('connects');
    }

    return {
      atomTypes: Array.from(atomTypes),
      relationTypes: Array.from(relationTypes),
      typeHierarchies: {} // Could implement hierarchy extraction here
    };
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
    if (!typeSelect || !this.parsedSpec) return;

    // Clear existing options (except the first one)
    while (typeSelect.children.length > 1) {
      typeSelect.removeChild(typeSelect.lastChild!);
    }

    // Add atom types
    this.parsedSpec.atomTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeSelect.appendChild(option);
    });
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

    if (this.parsedSpec) {
      specStatus.textContent = `Loaded: ${this.parsedSpec.atomTypes.length} atom types, ${this.parsedSpec.relationTypes.length} relation types`;
      
      typeList.innerHTML = this.parsedSpec.atomTypes.map(type => 
        `<span class="type-item">${type}</span>`
      ).join('');
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
  private addAtomFromForm(type: string, label: string): void {
    if (!type || !label || !this.dataInstance) return;

    try {
      const atomId = this.generateAtomId(type);
      const atom: IAtom = {
        id: atomId,
        type: type,
        label: label
      };

      this.dataInstance.addAtom(atom);

      // Dispatch event
      this.dispatchEvent(new CustomEvent('atom-added', {
        detail: { atom }
      }));

      console.log(`✅ Added atom: ${atom.label} (${atom.id}:${atom.type})`);
    } catch (error) {
      console.error('Failed to add atom:', error);
    }
  }

  /**
   * Export current data as JSON
   */
  private exportDataAsJSON(): void {
    if (!this.dataInstance) {
      console.warn('No data instance available for export');
      return;
    }

    try {
      const data = {
        atoms: this.dataInstance.getAtoms(),
        relations: this.dataInstance.getRelations(),
        timestamp: new Date().toISOString()
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
      console.error('Failed to export data:', error);
    }
  }

  /**
   * Set the data instance for this graph
   */
  setDataInstance(instance: IInputDataInstance): void {
    this.dataInstance = instance;
    
    // Listen for data instance changes to update the visualization
    instance.addEventListener('atomAdded', () => {
      // In a real implementation, this would trigger a layout update
      console.log('Atom added to instance');
      this.updateDeletionSelects();
    });

    instance.addEventListener('relationTupleAdded', () => {
      // In a real implementation, this would trigger a layout update
      console.log('Relation added to instance');
      this.updateDeletionSelects();
    });

    // Initial update of deletion selects
    this.updateDeletionSelects();
  }

  /**
   * Update the deletion dropdown selects with current atoms and relations
   */
  private updateDeletionSelects(): void {
    if (!this.dataInstance || !this.controlsContainer) return;

    const atomDeleteSelect = this.controlsContainer.querySelector('.atom-delete-select') as HTMLSelectElement;
    const relationDeleteSelect = this.controlsContainer.querySelector('.relation-delete-select') as HTMLSelectElement;

    if (atomDeleteSelect) {
      // Clear existing options (except first)
      while (atomDeleteSelect.children.length > 1) {
        atomDeleteSelect.removeChild(atomDeleteSelect.lastChild!);
      }

      // Add current atoms
      const atoms = this.dataInstance.getAtoms();
      atoms.forEach(atom => {
        const option = document.createElement('option');
        option.value = atom.id;
        option.textContent = `${atom.label} (${atom.id}:${atom.type})`;
        atomDeleteSelect.appendChild(option);
      });
    }

    if (relationDeleteSelect) {
      // Clear existing options (except first)
      while (relationDeleteSelect.children.length > 1) {
        relationDeleteSelect.removeChild(relationDeleteSelect.lastChild!);
      }

      // Add current relations
      const relations = this.dataInstance.getRelations();
      relations.forEach((relation, index) => {
        const option = document.createElement('option');
        option.value = index.toString();
        option.textContent = `${relation.type}: ${relation.tuple.join(' → ')}`;
        relationDeleteSelect.appendChild(option);
      });
    }
  }

  /**
   * Delete an atom by ID
   */
  private deleteAtom(atomId: string): void {
    if (!this.dataInstance || !atomId) return;

    try {
      // Find the atom
      const atoms = this.dataInstance.getAtoms();
      const atomToDelete = atoms.find(atom => atom.id === atomId);
      
      if (!atomToDelete) {
        console.warn(`Atom ${atomId} not found`);
        return;
      }

      // Remove the atom (this would need proper implementation in the data instance)
      // For now, we'll create a new instance without this atom
      const remainingAtoms = atoms.filter(atom => atom.id !== atomId);
      const relations = this.dataInstance.getRelations().filter(rel => 
        !rel.tuple.includes(atomId)
      );

      const newInstance = new (window as any).CndCore.JSONDataInstance({
        atoms: remainingAtoms,
        relations: relations,
        types: []
      });

      this.setDataInstance(newInstance);
      this.reloadGraphWithCurrentData();

      console.log(`✅ Deleted atom: ${atomToDelete.label} (${atomToDelete.id})`);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('atom-deleted', {
        detail: { atom: atomToDelete }
      }));
    } catch (error) {
      console.error('Failed to delete atom:', error);
    }
  }

  /**
   * Delete a relation by index
   */
  private deleteRelation(relationIndex: string): void {
    if (!this.dataInstance || !relationIndex) return;

    try {
      const relations = this.dataInstance.getRelations();
      const index = parseInt(relationIndex, 10);
      
      if (index < 0 || index >= relations.length) {
        console.warn(`Relation index ${index} out of range`);
        return;
      }

      const relationToDelete = relations[index];
      const remainingRelations = relations.filter((_, i) => i !== index);

      const newInstance = new (window as any).CndCore.JSONDataInstance({
        atoms: this.dataInstance.getAtoms(),
        relations: remainingRelations,
        types: []
      });

      this.setDataInstance(newInstance);
      this.reloadGraphWithCurrentData();

      console.log(`✅ Deleted relation: ${relationToDelete.type}: ${relationToDelete.tuple.join(' → ')}`);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('relation-deleted', {
        detail: { relation: relationToDelete }
      }));
    } catch (error) {
      console.error('Failed to delete relation:', error);
    }
  }

  /**
   * Clear all atoms and relations
   */
  private clearAllItems(): void {
    if (!this.dataInstance) return;

    try {
      const newInstance = new (window as any).CndCore.JSONDataInstance({
        atoms: [],
        relations: [],
        types: []
      });

      this.setDataInstance(newInstance);
      this.reloadGraphWithCurrentData();

      console.log('✅ Cleared all atoms and relations');
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('all-items-cleared', {
        detail: {}
      }));
    } catch (error) {
      console.error('Failed to clear all items:', error);
    }
  }

  /**
   * Reload graph with current data (for deletion updates)
   */
  private reloadGraphWithCurrentData(): void {
    try {
      // If we have access to rerenderGraph method from parent, call it
      if (typeof (this as any).rerenderGraph === 'function') {
        (this as any).rerenderGraph();
      }
      
      console.log('✅ Graph reloaded with current data');
    } catch (error) {
      console.error('Failed to reload graph with current data:', error);
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
  setCnDSpec(spec: string): void {
    this.setAttribute('cnd-spec', spec);
  }

  /**
   * Get the parsed specification
   */
  getParsedSpec(): ParsedCnDSpec | null {
    return this.parsedSpec;
  }
}