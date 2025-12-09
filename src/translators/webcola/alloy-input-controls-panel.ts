/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlloyInputControlsAPI, AlloyValidationError } from './alloy-input-graph';
import { IAtom, IType, IRelation } from '../../data-instance/interfaces';

/**
 * Configuration for AlloyInputControlsPanel
 */
export interface AlloyInputControlsPanelConfig {
  /** Show atom creation section */
  showAtomCreation?: boolean;
  /** Show relation creation section */
  showRelationCreation?: boolean;
  /** Show deletion section */
  showDeletion?: boolean;
  /** Show export section */
  showExport?: boolean;
  /** Show validation section */
  showValidation?: boolean;
  /** Custom CSS class for the container */
  className?: string;
  /** Whether to show the panel header */
  showHeader?: boolean;
  /** Panel title */
  title?: string;
}

const DEFAULT_CONFIG: AlloyInputControlsPanelConfig = {
  showAtomCreation: true,
  showRelationCreation: true,
  showDeletion: true,
  showExport: true,
  showValidation: true,
  showHeader: true,
  title: 'Alloy Instance Editor',
};

/**
 * Standalone Input Controls Panel for AlloyInputGraph
 * 
 * This component can be mounted anywhere (React drawer, sidebar, modal, etc.)
 * and communicates with AlloyInputGraph via the AlloyInputControlsAPI.
 * 
 * Usage:
 * ```javascript
 * const graph = document.querySelector('alloy-input-graph');
 * const api = graph.getInputControlsAPI();
 * 
 * // Create and mount the controls panel
 * const panel = new AlloyInputControlsPanel(api);
 * document.getElementById('my-drawer').appendChild(panel.getElement());
 * 
 * // Or render to HTML string for SSR/template engines
 * const html = AlloyInputControlsPanel.renderToHTML(api);
 * ```
 */
export class AlloyInputControlsPanel {
  private api: AlloyInputControlsAPI;
  private config: AlloyInputControlsPanelConfig;
  private container: HTMLDivElement;
  private unsubscribe: (() => void) | null = null;
  
  // Form state
  private selectedAtomType: string = '';
  private atomLabel: string = '';
  private selectedRelation: string = '';
  private relationAtomSelections: string[] = ['', ''];

  constructor(api: AlloyInputControlsAPI, config: Partial<AlloyInputControlsPanelConfig> = {}) {
    this.api = api;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.container = document.createElement('div');
    this.container.className = `alloy-input-controls-panel ${this.config.className || ''}`;
    
    this.render();
    this.bindEvents();
    
    // Subscribe to instance changes
    this.unsubscribe = this.api.onInstanceChange(() => {
      this.refreshUI();
    });
  }

  /**
   * Get the DOM element for this panel
   */
  public getElement(): HTMLDivElement {
    return this.container;
  }

  /**
   * Destroy the panel and clean up event listeners
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.container.remove();
  }

  /**
   * Render the panel HTML
   */
  private render(): void {
    this.container.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.config.showHeader ? this.renderHeader() : ''}
      <div class="aip-content">
        ${this.config.showAtomCreation ? this.renderAtomCreation() : ''}
        ${this.config.showRelationCreation ? this.renderRelationCreation() : ''}
        ${this.config.showDeletion ? this.renderDeletion() : ''}
        ${this.config.showValidation ? this.renderValidation() : ''}
        ${this.config.showExport ? this.renderExport() : ''}
      </div>
    `;
  }

  private renderHeader(): string {
    return `
      <div class="aip-header">
        <h3>${this.config.title}</h3>
      </div>
    `;
  }

  private renderAtomCreation(): string {
    const types = this.api.getAvailableTypes();
    const typeOptions = types.map(t => `<option value="${t.id}">${t.id}</option>`).join('');
    
    return `
      <div class="aip-section" data-section="atom-creation">
        <h4>Add Atom</h4>
        <div class="aip-form">
          <div class="aip-field">
            <label>Type</label>
            <select class="aip-atom-type-select">
              <option value="">Select type...</option>
              ${typeOptions}
            </select>
          </div>
          <div class="aip-field">
            <label>Label</label>
            <input type="text" class="aip-atom-label-input" placeholder="Enter label...">
          </div>
          <button class="aip-btn aip-btn-primary aip-add-atom-btn" disabled>Add Atom</button>
        </div>
        <div class="aip-info">ID will be auto-generated (e.g., Person0)</div>
      </div>
    `;
  }

  private renderRelationCreation(): string {
    const relations = this.api.getAvailableRelations();
    const atoms = this.api.getCurrentAtoms();
    
    const relationOptions = relations.map(r => 
      `<option value="${r.id}" data-arity="${r.types.length}" data-types="${r.types.join(',')}">${r.name} (${r.types.join(' → ')})</option>`
    ).join('');
    
    const atomOptions = atoms.map(a => 
      `<option value="${a.id}">${a.label} : ${a.type}</option>`
    ).join('');

    return `
      <div class="aip-section" data-section="relation-creation">
        <h4>Add Relation</h4>
        <div class="aip-form">
          <div class="aip-field">
            <label>Relation</label>
            <select class="aip-relation-select">
              <option value="">Select relation...</option>
              ${relationOptions}
            </select>
          </div>
          <div class="aip-relation-atoms">
            <div class="aip-atom-positions">
              <!-- Atom position selects will be dynamically generated -->
            </div>
            <div class="aip-type-hint"></div>
          </div>
          <button class="aip-btn aip-btn-primary aip-add-relation-btn" disabled>Add Relation</button>
        </div>
      </div>
    `;
  }

  private renderDeletion(): string {
    const atoms = this.api.getCurrentAtoms();
    const relations = this.api.getAvailableRelations();
    
    const atomOptions = atoms.map(a => 
      `<option value="${a.id}">${a.label} : ${a.type}</option>`
    ).join('');

    // Build tuple options from existing tuples
    const tupleOptions: string[] = [];
    for (const relation of relations) {
      for (const tuple of relation.tuples) {
        const label = `${relation.name}(${tuple.atoms.join(', ')})`;
        tupleOptions.push(`<option value="${relation.id}:${tuple.atoms.join(',')}">${label}</option>`);
      }
    }

    return `
      <div class="aip-section" data-section="deletion">
        <h4>Delete Items</h4>
        <div class="aip-form">
          <div class="aip-field">
            <label>Delete Atom</label>
            <div class="aip-inline">
              <select class="aip-delete-atom-select">
                <option value="">Select atom...</option>
                ${atomOptions}
              </select>
              <button class="aip-btn aip-btn-danger aip-delete-atom-btn" disabled>Delete</button>
            </div>
          </div>
          <div class="aip-field">
            <label>Delete Relation Tuple</label>
            <div class="aip-inline">
              <select class="aip-delete-tuple-select">
                <option value="">Select tuple...</option>
                ${tupleOptions.join('')}
              </select>
              <button class="aip-btn aip-btn-danger aip-delete-tuple-btn" disabled>Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderValidation(): string {
    return `
      <div class="aip-section" data-section="validation">
        <h4>Validation</h4>
        <div class="aip-validation-status">
          <span class="aip-status-icon">○</span>
          <span class="aip-status-text">Not validated</span>
        </div>
        <div class="aip-validation-errors"></div>
        <button class="aip-btn aip-btn-secondary aip-validate-btn">Validate Instance</button>
      </div>
    `;
  }

  private renderExport(): string {
    return `
      <div class="aip-section" data-section="export">
        <h4>Export</h4>
        <div class="aip-export-buttons">
          <button class="aip-btn aip-btn-secondary aip-export-json-btn">Export JSON</button>
          <button class="aip-btn aip-btn-primary aip-reify-btn">Reify to Forge</button>
        </div>
        <textarea class="aip-export-output" readonly placeholder="Output will appear here..."></textarea>
      </div>
    `;
  }

  /**
   * Bind event handlers
   */
  private bindEvents(): void {
    // Atom creation
    const atomTypeSelect = this.container.querySelector('.aip-atom-type-select') as HTMLSelectElement;
    const atomLabelInput = this.container.querySelector('.aip-atom-label-input') as HTMLInputElement;
    const addAtomBtn = this.container.querySelector('.aip-add-atom-btn') as HTMLButtonElement;

    atomTypeSelect?.addEventListener('change', () => {
      this.selectedAtomType = atomTypeSelect.value;
      this.updateAddAtomButtonState();
    });

    atomLabelInput?.addEventListener('input', () => {
      this.atomLabel = atomLabelInput.value;
      this.updateAddAtomButtonState();
    });

    addAtomBtn?.addEventListener('click', async () => {
      if (this.selectedAtomType && this.atomLabel) {
        const result = await this.api.addAtom(this.selectedAtomType, this.atomLabel);
        if (result.success) {
          atomLabelInput.value = '';
          this.atomLabel = '';
          this.updateAddAtomButtonState();
          this.showSuccess('Atom added successfully');
        } else {
          this.showError(result.error || 'Failed to add atom');
        }
      }
    });

    // Relation creation
    const relationSelect = this.container.querySelector('.aip-relation-select') as HTMLSelectElement;
    const addRelationBtn = this.container.querySelector('.aip-add-relation-btn') as HTMLButtonElement;

    relationSelect?.addEventListener('change', () => {
      this.selectedRelation = relationSelect.value;
      this.updateRelationAtomSelectors();
      this.updateAddRelationButtonState();
    });

    addRelationBtn?.addEventListener('click', async () => {
      if (this.selectedRelation && this.relationAtomSelections.every(s => s)) {
        const result = await this.api.addRelationTuple(this.selectedRelation, this.relationAtomSelections);
        if (result.success) {
          this.showSuccess('Relation tuple added successfully');
          // Reset selections
          this.relationAtomSelections = this.relationAtomSelections.map(() => '');
          this.updateRelationAtomSelectors();
        } else {
          this.showError(result.error || 'Failed to add relation tuple');
        }
      }
    });

    // Deletion
    const deleteAtomSelect = this.container.querySelector('.aip-delete-atom-select') as HTMLSelectElement;
    const deleteAtomBtn = this.container.querySelector('.aip-delete-atom-btn') as HTMLButtonElement;
    const deleteTupleSelect = this.container.querySelector('.aip-delete-tuple-select') as HTMLSelectElement;
    const deleteTupleBtn = this.container.querySelector('.aip-delete-tuple-btn') as HTMLButtonElement;

    deleteAtomSelect?.addEventListener('change', () => {
      deleteAtomBtn.disabled = !deleteAtomSelect.value;
    });

    deleteAtomBtn?.addEventListener('click', async () => {
      if (deleteAtomSelect.value) {
        const result = await this.api.removeAtom(deleteAtomSelect.value);
        if (result.success) {
          this.showSuccess('Atom deleted successfully');
        } else {
          this.showError(result.error || 'Failed to delete atom');
        }
      }
    });

    deleteTupleSelect?.addEventListener('change', () => {
      deleteTupleBtn.disabled = !deleteTupleSelect.value;
    });

    deleteTupleBtn?.addEventListener('click', async () => {
      if (deleteTupleSelect.value) {
        const [relationId, atomsStr] = deleteTupleSelect.value.split(':');
        const atomIds = atomsStr.split(',');
        const result = await this.api.removeRelationTuple(relationId, atomIds);
        if (result.success) {
          this.showSuccess('Relation tuple deleted successfully');
        } else {
          this.showError(result.error || 'Failed to delete relation tuple');
        }
      }
    });

    // Validation
    const validateBtn = this.container.querySelector('.aip-validate-btn') as HTMLButtonElement;
    validateBtn?.addEventListener('click', () => {
      const result = this.api.validateInstance();
      this.displayValidationResult(result.valid, result.errors);
    });

    // Export
    const exportJsonBtn = this.container.querySelector('.aip-export-json-btn') as HTMLButtonElement;
    const reifyBtn = this.container.querySelector('.aip-reify-btn') as HTMLButtonElement;
    const exportOutput = this.container.querySelector('.aip-export-output') as HTMLTextAreaElement;

    exportJsonBtn?.addEventListener('click', () => {
      const json = this.api.exportJSON();
      exportOutput.value = json;
    });

    reifyBtn?.addEventListener('click', () => {
      const result = this.api.reifyInstance();
      if (result.success) {
        exportOutput.value = result.result || '';
        this.displayValidationResult(true, []);
      } else {
        exportOutput.value = `// Validation failed:\n${result.errors?.map(e => `// - ${e.message}`).join('\n')}`;
        this.displayValidationResult(false, result.errors || []);
      }
    });
  }

  /**
   * Update the add atom button state
   */
  private updateAddAtomButtonState(): void {
    const addAtomBtn = this.container.querySelector('.aip-add-atom-btn') as HTMLButtonElement;
    if (addAtomBtn) {
      addAtomBtn.disabled = !this.selectedAtomType || !this.atomLabel.trim();
    }
  }

  /**
   * Update the add relation button state
   */
  private updateAddRelationButtonState(): void {
    const addRelationBtn = this.container.querySelector('.aip-add-relation-btn') as HTMLButtonElement;
    if (addRelationBtn) {
      addRelationBtn.disabled = !this.selectedRelation || !this.relationAtomSelections.every(s => s);
    }
  }

  /**
   * Update the relation atom selectors based on selected relation
   */
  private updateRelationAtomSelectors(): void {
    const positionsContainer = this.container.querySelector('.aip-atom-positions') as HTMLDivElement;
    const typeHint = this.container.querySelector('.aip-type-hint') as HTMLDivElement;
    const relationSelect = this.container.querySelector('.aip-relation-select') as HTMLSelectElement;
    
    if (!positionsContainer || !relationSelect) return;

    const selectedOption = relationSelect.selectedOptions[0];
    if (!selectedOption || !selectedOption.value) {
      positionsContainer.innerHTML = '';
      typeHint.textContent = '';
      this.relationAtomSelections = [];
      return;
    }

    const arity = parseInt(selectedOption.dataset.arity || '2', 10);
    const types = (selectedOption.dataset.types || '').split(',');
    
    // Initialize atom selections array
    this.relationAtomSelections = new Array(arity).fill('');

    // Get atoms that match each position's type
    const atoms = this.api.getCurrentAtoms();
    
    let html = '';
    for (let i = 0; i < arity; i++) {
      const expectedType = types[i];
      // Filter atoms to those compatible with this position's type
      const compatibleAtoms = atoms.filter(a => this.isAtomCompatible(a, expectedType));
      
      const atomOptions = compatibleAtoms.map(a => 
        `<option value="${a.id}">${a.label} : ${a.type}</option>`
      ).join('');

      html += `
        <div class="aip-atom-position">
          <label>Position ${i + 1} (${expectedType})</label>
          <select class="aip-position-select" data-position="${i}">
            <option value="">Select atom...</option>
            ${atomOptions}
          </select>
        </div>
      `;
    }
    
    positionsContainer.innerHTML = html;
    typeHint.textContent = `Expected types: ${types.join(' → ')}`;

    // Bind position select events
    const positionSelects = positionsContainer.querySelectorAll('.aip-position-select');
    positionSelects.forEach((select) => {
      select.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const position = parseInt(target.dataset.position || '0', 10);
        this.relationAtomSelections[position] = target.value;
        this.updateAddRelationButtonState();
      });
    });
  }

  /**
   * Check if an atom is compatible with an expected type
   */
  private isAtomCompatible(atom: IAtom, expectedType: string): boolean {
    if (atom.type === expectedType) return true;
    
    // Check type hierarchy
    const types = this.api.getAvailableTypes();
    const atomType = types.find(t => t.id === atom.type);
    if (atomType && atomType.types.includes(expectedType)) {
      return true;
    }
    
    return false;
  }

  /**
   * Display validation result
   */
  private displayValidationResult(valid: boolean, errors: AlloyValidationError[]): void {
    const statusIcon = this.container.querySelector('.aip-status-icon') as HTMLSpanElement;
    const statusText = this.container.querySelector('.aip-status-text') as HTMLSpanElement;
    const errorsContainer = this.container.querySelector('.aip-validation-errors') as HTMLDivElement;

    if (statusIcon && statusText) {
      if (valid) {
        statusIcon.textContent = '✓';
        statusIcon.className = 'aip-status-icon aip-status-valid';
        statusText.textContent = 'Instance is valid';
      } else {
        statusIcon.textContent = '✗';
        statusIcon.className = 'aip-status-icon aip-status-invalid';
        statusText.textContent = `${errors.length} validation error(s)`;
      }
    }

    if (errorsContainer) {
      if (errors.length > 0) {
        errorsContainer.innerHTML = errors.map(e => `
          <div class="aip-error-item">
            <strong>${e.type}:</strong> ${e.message}
          </div>
        `).join('');
      } else {
        errorsContainer.innerHTML = '';
      }
    }
  }

  /**
   * Refresh the UI (called when instance changes)
   */
  private refreshUI(): void {
    console.log('[AlloyInputControlsPanel] refreshUI called - updating all options');
    // Re-render sections that depend on current instance state
    this.updateAtomTypeOptions();
    this.updateAtomOptions();
    this.updateRelationAtomSelectors();
    this.updateDeletionOptions();
  }

  private updateAtomTypeOptions(): void {
    const atomTypeSelect = this.container.querySelector('.aip-atom-type-select') as HTMLSelectElement;
    if (!atomTypeSelect) return;

    const types = this.api.getAvailableTypes();
    const currentValue = atomTypeSelect.value;
    
    atomTypeSelect.innerHTML = `
      <option value="">Select type...</option>
      ${types.map(t => `<option value="${t.id}" ${t.id === currentValue ? 'selected' : ''}>${t.id}</option>`).join('')}
    `;
  }

  private updateAtomOptions(): void {
    // Update any selects that show atoms
    const atoms = this.api.getCurrentAtoms();
    const atomOptions = atoms.map(a => 
      `<option value="${a.id}">${a.label} : ${a.type}</option>`
    ).join('');

    // This will be called after updateRelationAtomSelectors handles the relation form
  }

  private updateDeletionOptions(): void {
    const deleteAtomSelect = this.container.querySelector('.aip-delete-atom-select') as HTMLSelectElement;
    const deleteTupleSelect = this.container.querySelector('.aip-delete-tuple-select') as HTMLSelectElement;
    
    if (deleteAtomSelect) {
      const atoms = this.api.getCurrentAtoms();
      deleteAtomSelect.innerHTML = `
        <option value="">Select atom...</option>
        ${atoms.map(a => `<option value="${a.id}">${a.label} : ${a.type}</option>`).join('')}
      `;
    }

    if (deleteTupleSelect) {
      const relations = this.api.getAvailableRelations();
      const tupleOptions: string[] = [];
      for (const relation of relations) {
        for (const tuple of relation.tuples) {
          const label = `${relation.name}(${tuple.atoms.join(', ')})`;
          tupleOptions.push(`<option value="${relation.id}:${tuple.atoms.join(',')}">${label}</option>`);
        }
      }
      deleteTupleSelect.innerHTML = `
        <option value="">Select tuple...</option>
        ${tupleOptions.join('')}
      `;
    }
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    // Could implement a toast/notification system
    console.log('✓', message);
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    // Could implement a toast/notification system
    console.error('✗', message);
  }

  /**
   * Get styles for the panel
   */
  private getStyles(): string {
    return `
      .alloy-input-controls-panel {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #333;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        overflow: hidden;
      }

      .aip-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
      }

      .aip-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }

      .aip-content {
        padding: 12px;
        max-height: 500px;
        overflow-y: auto;
      }

      .aip-section {
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid #eee;
      }

      .aip-section:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }

      .aip-section h4 {
        margin: 0 0 12px 0;
        font-size: 12px;
        font-weight: 600;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .aip-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .aip-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .aip-field label {
        font-size: 11px;
        font-weight: 500;
        color: #666;
      }

      .aip-field select,
      .aip-field input {
        padding: 8px 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
        background: #fff;
      }

      .aip-field select:focus,
      .aip-field input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
      }

      .aip-inline {
        display: flex;
        gap: 8px;
      }

      .aip-inline select {
        flex: 1;
      }

      .aip-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .aip-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .aip-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .aip-btn-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
      }

      .aip-btn-secondary {
        background: #f0f0f0;
        color: #333;
      }

      .aip-btn-secondary:hover:not(:disabled) {
        background: #e5e5e5;
      }

      .aip-btn-danger {
        background: #dc3545;
        color: white;
      }

      .aip-btn-danger:hover:not(:disabled) {
        background: #c82333;
      }

      .aip-info {
        font-size: 10px;
        color: #888;
        margin-top: 4px;
      }

      .aip-relation-atoms {
        margin-top: 8px;
      }

      .aip-atom-positions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .aip-atom-position {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .aip-atom-position label {
        font-size: 11px;
        font-weight: 500;
        color: #666;
      }

      .aip-atom-position select {
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 11px;
      }

      .aip-type-hint {
        font-size: 10px;
        color: #888;
        margin-top: 4px;
        font-style: italic;
      }

      .aip-validation-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #f8f9fa;
        border-radius: 4px;
        margin-bottom: 8px;
      }

      .aip-status-icon {
        font-size: 16px;
        color: #888;
      }

      .aip-status-icon.aip-status-valid {
        color: #28a745;
      }

      .aip-status-icon.aip-status-invalid {
        color: #dc3545;
      }

      .aip-validation-errors {
        margin-bottom: 8px;
      }

      .aip-error-item {
        padding: 6px 10px;
        background: #fff5f5;
        border-left: 3px solid #dc3545;
        margin-bottom: 4px;
        font-size: 11px;
        color: #721c24;
      }

      .aip-export-buttons {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }

      .aip-export-output {
        width: 100%;
        height: 120px;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 10px;
        resize: vertical;
        background: #f8f9fa;
      }
    `;
  }
}

/**
 * Create a React-compatible component wrapper for AlloyInputControlsPanel
 * This can be used in React applications with useRef
 */
export function createAlloyInputControlsPanel(
  api: AlloyInputControlsAPI,
  config?: Partial<AlloyInputControlsPanelConfig>
): AlloyInputControlsPanel {
  return new AlloyInputControlsPanel(api, config);
}

/**
 * Render AlloyInputControlsPanel to an HTML string (for SSR or template engines)
 */
export function renderAlloyInputControlsPanelHTML(
  api: AlloyInputControlsAPI,
  config?: Partial<AlloyInputControlsPanelConfig>
): string {
  const panel = new AlloyInputControlsPanel(api, config);
  return panel.getElement().outerHTML;
}
