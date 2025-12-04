/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebColaCnDGraph } from './webcola-cnd-graph';
import { IAtom, ITuple, IRelation, IType, DataInstanceEventListener } from '../../data-instance/interfaces';
import { AlloyDataInstance } from '../../data-instance/alloy-data-instance';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { ConstraintError } from '../../layout/constraint-validator';

/**
 * Validation error for type mismatches in Alloy instances
 */
export interface AlloyValidationError {
  type: 'type-mismatch' | 'arity-mismatch' | 'unknown-relation' | 'unknown-type' | 'duplicate-atom';
  message: string;
  details: {
    relationId?: string;
    expectedTypes?: string[];
    actualTypes?: string[];
    atomId?: string;
    position?: number;
  };
}

/**
 * Validation result returned by validateInstance()
 */
export interface AlloyValidationResult {
  valid: boolean;
  errors: AlloyValidationError[];
}

/**
 * Interface for external input controls that can communicate with AlloyInputGraph
 */
export interface AlloyInputControlsAPI {
  /** Get available types from the schema */
  getAvailableTypes(): readonly IType[];
  /** Get available relations from the schema */
  getAvailableRelations(): readonly IRelation[];
  /** Get current atoms in the instance */
  getCurrentAtoms(): readonly IAtom[];
  /** Add an atom with type validation */
  addAtom(type: string, label: string): Promise<{ success: boolean; atom?: IAtom; error?: string }>;
  /** Add a relation tuple with type validation */
  addRelationTuple(relationId: string, atomIds: string[]): Promise<{ success: boolean; error?: string }>;
  /** Remove an atom */
  removeAtom(atomId: string): Promise<{ success: boolean; error?: string }>;
  /** Remove a relation tuple */
  removeRelationTuple(relationId: string, atomIds: string[]): Promise<{ success: boolean; error?: string }>;
  /** Validate the current instance against schema */
  validateInstance(): AlloyValidationResult;
  /** Reify the instance (convert to Forge INST syntax) - validates first */
  reifyInstance(): { success: boolean; result?: string; errors?: AlloyValidationError[] };
  /** Export instance as JSON */
  exportJSON(): string;
  /** Subscribe to instance changes */
  onInstanceChange(callback: () => void): () => void;
}

/**
 * Alloy Input Graph Custom Element
 * 
 * A specialized version of WebColaCnDGraph designed for Forge/Alloy workflows:
 * 
 * Key differences from StructuredInputGraph:
 * 1. Input controls are SEPARATE and mountable elsewhere (via getInputControlsAPI())
 * 2. Type-aware validation using AlloyDataInstance's schema information
 * 3. Validation occurs at reify() time, not construction time
 * 4. Leverages Alloy's type system for arity and type checking
 * 
 * Usage:
 * ```javascript
 * const graph = document.querySelector('alloy-input-graph');
 * const api = graph.getInputControlsAPI();
 * 
 * // Mount controls elsewhere
 * myDrawer.innerHTML = createAlloyInputControls(api);
 * 
 * // Or use the API programmatically
 * await api.addAtom('Person', 'Alice');
 * await api.addRelationTuple('friend', ['Person0', 'Person1']);
 * 
 * // Validate and reify
 * const result = api.reifyInstance();
 * if (result.success) {
 *   console.log(result.result); // Forge INST syntax
 * }
 * ```
 * 
 * Events Fired:
 * - 'atom-added': { atom: IAtom }
 * - 'atom-removed': { atomId: string }
 * - 'relation-added': { relationId: string, tuple: ITuple }
 * - 'relation-removed': { relationId: string, tuple: ITuple }
 * - 'validation-error': { errors: AlloyValidationError[] }
 * - 'instance-validated': { result: AlloyValidationResult }
 * - 'constraint-error': { error: ConstraintError }
 * - 'layout-updated': { }
 */
export class AlloyInputGraph extends WebColaCnDGraph {
  private dataInstance!: AlloyDataInstance;
  private evaluator: SGraphQueryEvaluator | null = null;
  private layoutInstance: LayoutInstance | null = null;
  private cndSpecString: string = '';
  private currentConstraintError: ConstraintError | null = null;
  private instanceChangeCallbacks: Set<() => void> = new Set();
  
  // Track event listeners to prevent duplicates
  private dataInstanceEventHandlers = {
    atomAdded: null as DataInstanceEventListener | null,
    atomRemoved: null as DataInstanceEventListener | null,
    relationTupleAdded: null as DataInstanceEventListener | null,
    relationTupleRemoved: null as DataInstanceEventListener | null,
  };

  constructor(dataInstance?: AlloyDataInstance) {
    super();
    
    if (dataInstance) {
      this.setDataInstance(dataInstance);
    }
    
    // Listen for edge events from parent WebColaCnDGraph
    this.addEventListener('edge-creation-requested', this.handleEdgeCreationRequest.bind(this) as unknown as EventListener);
    this.addEventListener('edge-modification-requested', this.handleEdgeModificationRequest.bind(this) as unknown as EventListener);
    this.addEventListener('edge-reconnection-requested', this.handleEdgeReconnectionRequest.bind(this) as unknown as EventListener);
  }

  /**
   * Observed attributes for this custom element
   */
  static get observedAttributes(): string[] {
    return ['cnd-spec'];
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
    }
  }

  /**
   * Set the AlloyDataInstance for this graph
   * This is the primary way to initialize the graph with data
   */
  public setDataInstance(instance: AlloyDataInstance): void {
    // Clean up old event listeners
    this.removeDataInstanceEventListeners();
    
    this.dataInstance = instance;
    
    // Set up new event listeners
    this.setupDataInstanceEventListeners();
    
    // Update visualization
    this.refreshVisualization();
  }

  /**
   * Get the current AlloyDataInstance
   */
  public getDataInstance(): AlloyDataInstance | null {
    return this.dataInstance || null;
  }

  /**
   * Get the Input Controls API for external UI integration
   * This allows mounting input controls anywhere (React drawer, separate panel, etc.)
   */
  public getInputControlsAPI(): AlloyInputControlsAPI {
    return {
      getAvailableTypes: () => this.getAvailableTypes(),
      getAvailableRelations: () => this.getAvailableRelations(),
      getCurrentAtoms: () => this.getCurrentAtoms(),
      addAtom: (type, label) => this.addAtomWithValidation(type, label),
      addRelationTuple: (relationId, atomIds) => this.addRelationTupleWithValidation(relationId, atomIds),
      removeAtom: (atomId) => this.removeAtomSafe(atomId),
      removeRelationTuple: (relationId, atomIds) => this.removeRelationTupleSafe(relationId, atomIds),
      validateInstance: () => this.validateInstance(),
      reifyInstance: () => this.reifyWithValidation(),
      exportJSON: () => this.exportAsJSON(),
      onInstanceChange: (callback) => this.subscribeToChanges(callback),
    };
  }

  // ==================== Type Information Methods ====================

  /**
   * Get available types from the schema (excluding built-ins by default)
   */
  private getAvailableTypes(): readonly IType[] {
    if (!this.dataInstance) return [];
    return this.dataInstance.getTypes().filter(t => !t.isBuiltin);
  }

  /**
   * Get available relations from the schema
   */
  private getAvailableRelations(): readonly IRelation[] {
    if (!this.dataInstance) return [];
    return this.dataInstance.getRelations();
  }

  /**
   * Get current atoms in the instance
   */
  private getCurrentAtoms(): readonly IAtom[] {
    if (!this.dataInstance) return [];
    return this.dataInstance.getAtoms();
  }

  // ==================== Atom Operations ====================

  /**
   * Add an atom with type validation
   */
  private async addAtomWithValidation(type: string, label: string): Promise<{ success: boolean; atom?: IAtom; error?: string }> {
    if (!this.dataInstance) {
      return { success: false, error: 'No data instance available' };
    }

    // Check if type exists in schema
    const availableTypes = this.getAvailableTypes();
    const typeExists = availableTypes.some(t => t.id === type);
    
    if (!typeExists) {
      // Allow adding to custom types, but note it may fail validation at reify time
      console.warn(`Type "${type}" not found in schema. Adding anyway - will be validated at reify time.`);
    }

    // Generate unique atom ID
    const atomId = this.generateAtomId(type);

    const atom: IAtom = {
      id: atomId,
      type: type,
      label: label || atomId,
    };

    try {
      this.dataInstance.addAtom(atom);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('atom-added', { detail: { atom } }));
      
      // Refresh visualization
      await this.refreshVisualization();
      
      // Notify change subscribers
      this.notifyInstanceChange();
      
      return { success: true, atom };
    } catch (error) {
      return { success: false, error: `Failed to add atom: ${error}` };
    }
  }

  /**
   * Remove an atom safely
   */
  private async removeAtomSafe(atomId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.dataInstance) {
      return { success: false, error: 'No data instance available' };
    }

    try {
      this.dataInstance.removeAtom(atomId);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('atom-removed', { detail: { atomId } }));
      
      // Refresh visualization
      await this.refreshVisualization();
      
      // Notify change subscribers
      this.notifyInstanceChange();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to remove atom: ${error}` };
    }
  }

  // ==================== Relation Operations ====================

  /**
   * Add a relation tuple with type validation
   */
  private async addRelationTupleWithValidation(
    relationId: string, 
    atomIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.dataInstance) {
      return { success: false, error: 'No data instance available' };
    }

    // Find the relation in schema
    const relation = this.getAvailableRelations().find(r => r.id === relationId || r.name === relationId);
    
    if (!relation) {
      // Allow adding to unknown relations - will be validated at reify time
      console.warn(`Relation "${relationId}" not found in schema. Adding anyway - will be validated at reify time.`);
    }

    // Check arity matches
    if (relation && atomIds.length !== relation.types.length) {
      return { 
        success: false, 
        error: `Arity mismatch: relation "${relationId}" expects ${relation.types.length} atoms, got ${atomIds.length}` 
      };
    }

    // Get atom types for the tuple
    const atoms = this.getCurrentAtoms();
    const tupleTypes: string[] = [];
    
    for (const atomId of atomIds) {
      const atom = atoms.find(a => a.id === atomId);
      if (!atom) {
        return { success: false, error: `Atom "${atomId}" not found` };
      }
      tupleTypes.push(atom.type);
    }

    // Create the tuple
    const tuple: ITuple = {
      atoms: atomIds,
      types: tupleTypes,
    };

    try {
      this.dataInstance.addRelationTuple(relation?.id || relationId, tuple);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('relation-added', { 
        detail: { relationId: relation?.id || relationId, tuple } 
      }));
      
      // Refresh visualization
      await this.refreshVisualization();
      
      // Notify change subscribers
      this.notifyInstanceChange();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to add relation tuple: ${error}` };
    }
  }

  /**
   * Remove a relation tuple safely
   */
  private async removeRelationTupleSafe(
    relationId: string, 
    atomIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.dataInstance) {
      return { success: false, error: 'No data instance available' };
    }

    // Get atom types for the tuple
    const atoms = this.getCurrentAtoms();
    const tupleTypes: string[] = [];
    
    for (const atomId of atomIds) {
      const atom = atoms.find(a => a.id === atomId);
      if (atom) {
        tupleTypes.push(atom.type);
      }
    }

    const tuple: ITuple = {
      atoms: atomIds,
      types: tupleTypes,
    };

    try {
      this.dataInstance.removeRelationTuple(relationId, tuple);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('relation-removed', { 
        detail: { relationId, tuple } 
      }));
      
      // Refresh visualization
      await this.refreshVisualization();
      
      // Notify change subscribers
      this.notifyInstanceChange();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to remove relation tuple: ${error}` };
    }
  }

  // ==================== Validation Methods ====================

  /**
   * Validate the current instance against the schema
   * This checks:
   * 1. All atoms have valid types
   * 2. All relation tuples have correct arity
   * 3. All relation tuple atoms match expected types
   */
  public validateInstance(): AlloyValidationResult {
    const errors: AlloyValidationError[] = [];

    if (!this.dataInstance) {
      return { valid: true, errors: [] };
    }

    const availableTypes = this.dataInstance.getTypes();
    const availableRelations = this.getAvailableRelations();
    const atoms = this.getCurrentAtoms();

    // Check atoms have valid types
    for (const atom of atoms) {
      const typeExists = availableTypes.some(t => t.id === atom.type);
      if (!typeExists) {
        errors.push({
          type: 'unknown-type',
          message: `Atom "${atom.id}" has unknown type "${atom.type}"`,
          details: { atomId: atom.id },
        });
      }
    }

    // Check relation tuples
    for (const relation of this.dataInstance.getRelations()) {
      const schemaRelation = availableRelations.find(r => r.id === relation.id);
      
      for (const tuple of relation.tuples) {
        // Check arity
        if (schemaRelation && tuple.atoms.length !== schemaRelation.types.length) {
          errors.push({
            type: 'arity-mismatch',
            message: `Relation "${relation.name}" tuple has wrong arity: expected ${schemaRelation.types.length}, got ${tuple.atoms.length}`,
            details: {
              relationId: relation.id,
              expectedTypes: schemaRelation.types,
              actualTypes: tuple.types,
            },
          });
          continue;
        }

        // Check type compatibility at each position
        if (schemaRelation) {
          for (let i = 0; i < tuple.atoms.length; i++) {
            const atomId = tuple.atoms[i];
            const atom = atoms.find(a => a.id === atomId);
            
            if (!atom) continue;
            
            const expectedType = schemaRelation.types[i];
            const actualType = atom.type;
            
            // Check if actual type is a subtype of expected type
            if (!this.isSubtype(actualType, expectedType)) {
              errors.push({
                type: 'type-mismatch',
                message: `Type mismatch in relation "${relation.name}" at position ${i}: expected "${expectedType}", got "${actualType}"`,
                details: {
                  relationId: relation.id,
                  expectedTypes: [expectedType],
                  actualTypes: [actualType],
                  position: i,
                  atomId: atomId,
                },
              });
            }
          }
        }
      }
    }

    const result: AlloyValidationResult = {
      valid: errors.length === 0,
      errors,
    };

    // Dispatch validation event
    this.dispatchEvent(new CustomEvent('instance-validated', { detail: { result } }));

    if (!result.valid) {
      this.dispatchEvent(new CustomEvent('validation-error', { detail: { errors } }));
    }

    return result;
  }

  /**
   * Check if a type is a subtype of another type
   * Uses the type hierarchy from AlloyDataInstance
   */
  private isSubtype(childType: string, parentType: string): boolean {
    if (childType === parentType) return true;
    
    // Get the type hierarchy
    const types = this.dataInstance?.getTypes() || [];
    const childTypeInfo = types.find(t => t.id === childType);
    
    if (!childTypeInfo) return false;
    
    // Check if parentType is in the type hierarchy
    return childTypeInfo.types.includes(parentType);
  }

  // ==================== Reify Methods ====================

  /**
   * Reify the instance to Forge INST syntax with validation
   * Returns errors if validation fails
   */
  public reifyWithValidation(): { success: boolean; result?: string; errors?: AlloyValidationError[] } {
    const validation = this.validateInstance();
    
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    if (!this.dataInstance) {
      return { success: false, errors: [{ 
        type: 'unknown-type', 
        message: 'No data instance available',
        details: {} 
      }] };
    }

    try {
      const result = this.dataInstance.reify();
      return { success: true, result: result as string };
    } catch (error) {
      return { 
        success: false, 
        errors: [{ 
          type: 'unknown-type', 
          message: `Reify failed: ${error}`,
          details: {} 
        }] 
      };
    }
  }

  // ==================== Export Methods ====================

  /**
   * Export the current instance as JSON
   */
  private exportAsJSON(): string {
    if (!this.dataInstance) {
      return JSON.stringify({ atoms: [], relations: [] }, null, 2);
    }

    const atoms = this.getCurrentAtoms();
    const relations = this.dataInstance.getRelations();

    return JSON.stringify({
      atoms: atoms.map(a => ({ id: a.id, type: a.type, label: a.label })),
      relations: relations.map(r => ({
        id: r.id,
        name: r.name,
        types: r.types,
        tuples: r.tuples.map(t => ({ atoms: t.atoms, types: t.types })),
      })),
    }, null, 2);
  }

  // ==================== Change Notification ====================

  /**
   * Subscribe to instance changes
   * Returns an unsubscribe function
   */
  private subscribeToChanges(callback: () => void): () => void {
    this.instanceChangeCallbacks.add(callback);
    return () => {
      this.instanceChangeCallbacks.delete(callback);
    };
  }

  /**
   * Notify all subscribers of instance changes
   */
  private notifyInstanceChange(): void {
    this.instanceChangeCallbacks.forEach(cb => {
      try {
        cb();
      } catch (error) {
        console.error('Error in instance change callback:', error);
      }
    });
  }

  // ==================== Internal Helper Methods ====================

  /**
   * Generate a unique atom ID for a given type
   */
  private generateAtomId(type: string): string {
    const existingAtoms = this.getCurrentAtoms().filter(a => a.type === type);
    let index = existingAtoms.length;
    let candidateId = `${type}${index}`;
    
    // Ensure uniqueness
    while (this.getCurrentAtoms().some(a => a.id === candidateId)) {
      index++;
      candidateId = `${type}${index}`;
    }
    
    return candidateId;
  }

  /**
   * Set up event listeners on the data instance
   */
  private setupDataInstanceEventListeners(): void {
    if (!this.dataInstance) return;

    this.dataInstanceEventHandlers.atomAdded = (event) => {
      this.refreshVisualization();
      this.notifyInstanceChange();
    };
    
    this.dataInstanceEventHandlers.atomRemoved = (event) => {
      this.refreshVisualization();
      this.notifyInstanceChange();
    };
    
    this.dataInstanceEventHandlers.relationTupleAdded = (event) => {
      this.refreshVisualization();
      this.notifyInstanceChange();
    };
    
    this.dataInstanceEventHandlers.relationTupleRemoved = (event) => {
      this.refreshVisualization();
      this.notifyInstanceChange();
    };

    this.dataInstance.addEventListener('atomAdded', this.dataInstanceEventHandlers.atomAdded);
    this.dataInstance.addEventListener('atomRemoved', this.dataInstanceEventHandlers.atomRemoved);
    this.dataInstance.addEventListener('relationTupleAdded', this.dataInstanceEventHandlers.relationTupleAdded);
    this.dataInstance.addEventListener('relationTupleRemoved', this.dataInstanceEventHandlers.relationTupleRemoved);
  }

  /**
   * Remove event listeners from the data instance
   */
  private removeDataInstanceEventListeners(): void {
    if (!this.dataInstance) return;

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

  /**
   * Parse and apply a CnD specification
   */
  private parseCnDSpec(specString: string): void {
    if (!specString) return;

    try {
      this.cndSpecString = specString;
      
      this.dispatchEvent(new CustomEvent('spec-loaded', { detail: { spec: specString } }));
      
      // Re-render with the new spec
      this.refreshVisualization();
    } catch (error) {
      console.error('Failed to parse CnD spec:', error);
    }
  }

  /**
   * Refresh the visualization
   */
  private async refreshVisualization(): Promise<void> {
    if (!this.dataInstance) {
      console.warn('[AlloyInputGraph] refreshVisualization: no dataInstance');
      return;
    }

    try {
      console.log('[AlloyInputGraph] refreshVisualization starting...');
      
      // Generate the graph from the data instance
      const graph = this.dataInstance.generateGraph(false, true);
      console.log('[AlloyInputGraph] Generated graph:', {
        nodeCount: graph.nodeCount(),
        edgeCount: graph.edgeCount(),
        nodes: graph.nodes(),
        edges: graph.edges()
      });
      
      // Create and initialize evaluator for the current data instance
      this.evaluator = new SGraphQueryEvaluator();
      this.evaluator.initialize({
        sourceData: this.dataInstance
      });
      
      // Parse layout spec (use empty if none provided)
      const layoutSpec = parseLayoutSpec(this.cndSpecString || 'constraints:\n');
      console.log('[AlloyInputGraph] Layout spec parsed');
      
      // Create layout instance (layoutSpec, evaluator, instanceNum)
      this.layoutInstance = new LayoutInstance(layoutSpec, this.evaluator, 0);
      
      // Generate the layout
      const layoutResult = this.layoutInstance.generateLayout(this.dataInstance, {});
      console.log('[AlloyInputGraph] Layout result:', {
        hasLayout: !!layoutResult.layout,
        hasError: !!layoutResult.error,
        error: layoutResult.error
      });
      
      if (layoutResult.error) {
        console.warn('Layout generation had errors:', layoutResult.error);
        this.currentConstraintError = layoutResult.error;
        this.dispatchEvent(new CustomEvent('constraint-error', { detail: { error: layoutResult.error } }));
      } else {
        this.currentConstraintError = null;
      }
      
      // Render the layout using the parent class method
      if (layoutResult.layout) {
        console.log('[AlloyInputGraph] Calling renderLayout with:', {
          nodes: layoutResult.layout.nodes?.length,
          edges: layoutResult.layout.edges?.length
        });
        await this.renderLayout(layoutResult.layout);
        console.log('[AlloyInputGraph] renderLayout completed');
      } else {
        console.warn('[AlloyInputGraph] No layout to render');
      }
      
      this.dispatchEvent(new CustomEvent('layout-updated', { detail: {} }));
      
    } catch (error) {
      console.error('Failed to refresh visualization:', error);
    }
  }

  // ==================== Edge Event Handlers ====================

  /**
   * Handle edge creation requests from the graph
   */
  private handleEdgeCreationRequest(event: CustomEvent): void {
    const { sourceId, targetId, relationName } = event.detail;
    
    if (relationName && sourceId && targetId) {
      this.addRelationTupleWithValidation(relationName, [sourceId, targetId]);
    }
  }

  /**
   * Handle edge modification requests from the graph
   */
  private handleEdgeModificationRequest(event: CustomEvent): void {
    // Handle edge modifications (e.g., changing relation type)
    const { edgeId, newRelationName, sourceId, targetId } = event.detail;
    // Implementation depends on how edge modifications work in your system
  }

  /**
   * Handle edge reconnection requests from the graph
   */
  private handleEdgeReconnectionRequest(event: CustomEvent): void {
    const { oldSourceId, oldTargetId, newSourceId, newTargetId, relationName } = event.detail;
    
    if (relationName) {
      // Remove old tuple
      this.removeRelationTupleSafe(relationName, [oldSourceId, oldTargetId]);
      // Add new tuple
      this.addRelationTupleWithValidation(relationName, [newSourceId, newTargetId]);
    }
  }
}

// Register the custom element
if (typeof window !== 'undefined' && window.customElements) {
  if (!window.customElements.get('alloy-input-graph')) {
    window.customElements.define('alloy-input-graph', AlloyInputGraph);
  }
}
