/* eslint-disable @typescript-eslint/no-explicit-any */
import { StructuredInputGraph } from './structured-input-graph';
import { IAtom, ITuple, IRelation, IType } from '../../data-instance/interfaces';
import { AlloyDataInstance } from '../../data-instance/alloy-data-instance';

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
 * This API allows you to mount controls anywhere (React drawer, separate panel, etc.)
 */
export interface AlloyInputControlsAPI {
  /** Get available types from the schema */
  getAvailableTypes(): readonly IType[];
  /** Get available relations from the schema */
  getAvailableRelations(): readonly IRelation[];
  /** Get current atoms in the instance */
  getCurrentAtoms(): readonly IAtom[];
  /** Add an atom with type validation - label becomes the ID in Alloy */
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
 * Extends StructuredInputGraph with Alloy/Forge-specific behavior:
 * 
 * Key differences from StructuredInputGraph:
 * 1. Input controls are SEPARATE and embeddable elsewhere (via getInputControlsAPI())
 *    - No hovering controls panel - just the graph visualization
 * 2. Label = ID (no auto-generation) - in Alloy, atom labels ARE their identifiers
 *    - Warnings/errors on duplicate IDs
 * 3. Type-aware validation using AlloyDataInstance's schema information
 * 4. Validation occurs at reify() time for flexible editing
 * 
 * Usage:
 * ```javascript
 * const graph = document.querySelector('alloy-input-graph');
 * const api = graph.getInputControlsAPI();
 * 
 * // Mount controls elsewhere in your UI
 * myDrawer.innerHTML = createAlloyInputControls(api);
 * 
 * // Or use the API programmatically
 * await api.addAtom('Person', 'Alice');  // Creates atom with id='Alice', type='Person'
 * await api.addRelationTuple('friend', ['Alice', 'Bob']);
 * 
 * // Validate and reify
 * const result = api.reifyInstance();
 * if (result.success) {
 *   console.log(result.result); // Forge INST syntax
 * }
 * ```
 * 
 * Events Fired (in addition to StructuredInputGraph events):
 * - 'validation-error': { errors: AlloyValidationError[] }
 * - 'instance-validated': { result: AlloyValidationResult }
 */
export class AlloyInputGraph extends StructuredInputGraph {
  private instanceChangeCallbacks: Set<() => void> = new Set();

  constructor(dataInstance?: AlloyDataInstance) {
    // Call parent with no data instance - we'll set it ourselves
    super();
    
    if (dataInstance) {
      this.setDataInstance(dataInstance);
    }
  }

  /**
   * Override: Don't create the built-in controls UI
   * Alloy uses external/embeddable controls via getInputControlsAPI()
   */
  protected override initializeStructuredInput(): void {
    // Don't call super - we don't want the hovering controls panel
    // The graph will be controlled via the API
    console.log('[AlloyInputGraph] Skipping built-in controls - use getInputControlsAPI() instead');
  }

  /**
   * Override: Don't create the controls interface
   * Controls are external in AlloyInputGraph
   */
  protected override createControlsInterface(): void {
    // No-op - controls are external
  }

  /**
   * Override: In Alloy/Forge, the label IS the ID - no auto-generation
   * Returns the label directly, or throws if it would create a duplicate
   */
  protected override generateAtomId(type: string): string {
    // This method is called by the parent's addAtomFromForm
    // For Alloy, we don't use this - see addAtomWithValidation instead
    throw new Error('AlloyInputGraph uses label as ID - use addAtom() via getInputControlsAPI()');
  }

  /**
   * Get the Input Controls API for external UI integration
   * This allows mounting input controls anywhere (React drawer, separate panel, etc.)
   */
  public getInputControlsAPI(): AlloyInputControlsAPI {
    return {
      getAvailableTypes: () => this.getAvailableTypesFromSchema(),
      getAvailableRelations: () => this.getAvailableRelationsFromSchema(),
      getCurrentAtoms: () => this.getCurrentAtomsFromInstance(),
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

  // ==================== Type/Schema Information Methods ====================

  /**
   * Get available types from the AlloyDataInstance schema (excluding built-ins)
   */
  private getAvailableTypesFromSchema(): readonly IType[] {
    if (!this.dataInstance) return [];
    
    // Check if this is an AlloyDataInstance with getTypes()
    if ('getTypes' in this.dataInstance && typeof (this.dataInstance as any).getTypes === 'function') {
      return ((this.dataInstance as AlloyDataInstance).getTypes() || []).filter(t => !t.isBuiltin);
    }
    
    // Fallback: derive types from existing atoms
    const typeSet = new Set<string>();
    this.dataInstance.getAtoms().forEach(a => typeSet.add(a.type));
    return Array.from(typeSet).map(id => ({ id, name: id, isBuiltin: false }));
  }

  /**
   * Get available relations from the schema
   */
  private getAvailableRelationsFromSchema(): readonly IRelation[] {
    if (!this.dataInstance) return [];
    return this.dataInstance.getRelations();
  }

  /**
   * Get current atoms in the instance
   */
  private getCurrentAtomsFromInstance(): readonly IAtom[] {
    if (!this.dataInstance) return [];
    return this.dataInstance.getAtoms();
  }

  // ==================== Atom Operations ====================

  /**
   * Add an atom with Alloy-specific behavior: label = ID
   * Warns/errors on duplicate IDs
   */
  private async addAtomWithValidation(
    type: string, 
    label: string
  ): Promise<{ success: boolean; atom?: IAtom; error?: string }> {
    if (!this.dataInstance) {
      return { success: false, error: 'No data instance available' };
    }

    if (!label || label.trim() === '') {
      return { success: false, error: 'Label is required (it will be used as the atom ID)' };
    }

    const atomId = label.trim();

    // Check if atom with this ID already exists
    if (this.getCurrentAtomsFromInstance().some(a => a.id === atomId)) {
      return { success: false, error: `Atom with ID "${atomId}" already exists. In Alloy, labels must be unique.` };
    }

    // Check if type exists in schema (warn but don't block)
    const availableTypes = this.getAvailableTypesFromSchema();
    const typeExists = availableTypes.some(t => t.id === type);
    
    if (!typeExists && availableTypes.length > 0) {
      console.warn(`[AlloyInputGraph] Type "${type}" not found in schema. Adding anyway - will be validated at reify time.`);
    }

    // In Alloy/Forge, the label IS the ID
    const atom: IAtom = {
      id: atomId,
      type: type,
      label: atomId,
    };

    try {
      this.dataInstance.addAtom(atom);
      console.log(`[AlloyInputGraph] Atom added: ${atom.id} (${atom.type})`);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('atom-added', { detail: { atom } }));
      
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
      console.log(`[AlloyInputGraph] Atom removed: ${atomId}`);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('atom-removed', { detail: { atomId } }));
      
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
    const relation = this.getAvailableRelationsFromSchema().find(
      r => r.id === relationId || r.name === relationId
    );
    
    if (!relation) {
      console.warn(`[AlloyInputGraph] Relation "${relationId}" not found in schema. Adding anyway - will be validated at reify time.`);
    }

    // Check arity matches
    if (relation && atomIds.length !== relation.types.length) {
      return { 
        success: false, 
        error: `Arity mismatch: relation "${relationId}" expects ${relation.types.length} atoms, got ${atomIds.length}` 
      };
    }

    // Get atom types for the tuple
    const atoms = this.getCurrentAtomsFromInstance();
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
      console.log(`[AlloyInputGraph] Relation tuple added: ${relationId}(${atomIds.join(', ')})`);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('relation-added', { 
        detail: { relationId: relation?.id || relationId, tuple } 
      }));
      
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
    const atoms = this.getCurrentAtomsFromInstance();
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
      console.log(`[AlloyInputGraph] Relation tuple removed: ${relationId}(${atomIds.join(', ')})`);
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('relation-removed', { 
        detail: { relationId, tuple } 
      }));
      
      // Notify change subscribers
      this.notifyInstanceChange();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to remove relation tuple: ${error}` };
    }
  }

  // ==================== Validation & Reification ====================

  /**
   * Validate the current instance against the schema
   */
  public validateInstance(): AlloyValidationResult {
    const errors: AlloyValidationError[] = [];
    
    if (!this.dataInstance) {
      return { valid: false, errors: [{ 
        type: 'unknown-type', 
        message: 'No data instance available',
        details: {}
      }]};
    }

    const availableTypes = this.getAvailableTypesFromSchema();
    const availableRelations = this.getAvailableRelationsFromSchema();
    const atoms = this.getCurrentAtomsFromInstance();

    // Check for duplicate atom IDs (shouldn't happen but verify)
    const seenIds = new Set<string>();
    for (const atom of atoms) {
      if (seenIds.has(atom.id)) {
        errors.push({
          type: 'duplicate-atom',
          message: `Duplicate atom ID: "${atom.id}"`,
          details: { atomId: atom.id }
        });
      }
      seenIds.add(atom.id);
    }

    // Check atom types exist in schema (if we have schema info)
    if (availableTypes.length > 0) {
      for (const atom of atoms) {
        const typeExists = availableTypes.some(t => t.id === atom.type);
        if (!typeExists) {
          errors.push({
            type: 'unknown-type',
            message: `Atom "${atom.id}" has unknown type "${atom.type}"`,
            details: { atomId: atom.id }
          });
        }
      }
    }

    // Check relation tuples
    const relations = this.dataInstance.getRelations();
    for (const relation of relations) {
      const schemaRelation = availableRelations.find(r => r.id === relation.id || r.name === relation.name);
      
      if (!schemaRelation && availableRelations.length > 0) {
        errors.push({
          type: 'unknown-relation',
          message: `Unknown relation: "${relation.id || relation.name}"`,
          details: { relationId: relation.id || relation.name }
        });
        continue;
      }

      if (schemaRelation) {
        for (const tuple of relation.tuples) {
          // Check arity
          if (tuple.atoms.length !== schemaRelation.types.length) {
            errors.push({
              type: 'arity-mismatch',
              message: `Relation "${relation.name}" expects ${schemaRelation.types.length} atoms, got ${tuple.atoms.length}`,
              details: { 
                relationId: relation.id,
                expectedTypes: schemaRelation.types,
                actualTypes: tuple.types
              }
            });
          }

          // Check type compatibility (basic check - could be more sophisticated with subtypes)
          for (let i = 0; i < tuple.atoms.length && i < schemaRelation.types.length; i++) {
            const expectedType = schemaRelation.types[i];
            const actualType = tuple.types?.[i];
            
            if (actualType && expectedType !== actualType) {
              // This is a soft warning - Alloy has subtyping
              console.warn(`[AlloyInputGraph] Type mismatch in relation "${relation.name}" position ${i}: expected "${expectedType}", got "${actualType}"`);
            }
          }
        }
      }
    }

    const result = { valid: errors.length === 0, errors };
    
    this.dispatchEvent(new CustomEvent('instance-validated', { detail: { result } }));
    
    if (!result.valid) {
      this.dispatchEvent(new CustomEvent('validation-error', { detail: { errors } }));
    }

    return result;
  }

  /**
   * Reify the instance into Forge INST syntax
   * Validates first - returns errors if validation fails
   */
  public reifyWithValidation(): { success: boolean; result?: string; errors?: AlloyValidationError[] } {
    const validation = this.validateInstance();
    
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    try {
      const instSyntax = this.generateForgeInstSyntax();
      return { success: true, result: instSyntax };
    } catch (error) {
      return { 
        success: false, 
        errors: [{ 
          type: 'unknown-type', 
          message: `Reification failed: ${error}`,
          details: {}
        }]
      };
    }
  }

  /**
   * Generate Forge INST syntax from the current instance
   */
  private generateForgeInstSyntax(): string {
    if (!this.dataInstance) return '';

    const atoms = this.getCurrentAtomsFromInstance();
    const relations = this.dataInstance.getRelations();

    const lines: string[] = ['inst generated {'];

    // Group atoms by type
    const atomsByType = new Map<string, string[]>();
    for (const atom of atoms) {
      if (!atomsByType.has(atom.type)) {
        atomsByType.set(atom.type, []);
      }
      atomsByType.get(atom.type)!.push(atom.id);
    }

    // Output type declarations
    for (const [type, atomIds] of atomsByType) {
      lines.push(`  ${type} = \`${atomIds.join(' + \`')}\``);
    }

    // Output relations
    for (const relation of relations) {
      if (relation.tuples.length > 0) {
        const tupleStrings = relation.tuples.map(tuple => 
          `\`${tuple.atoms.join('->')}\``
        );
        lines.push(`  ${relation.name} = ${tupleStrings.join(' + ')}`);
      }
    }

    lines.push('}');
    
    return lines.join('\n');
  }

  /**
   * Export instance as JSON
   */
  public exportAsJSON(): string {
    if (!this.dataInstance) return '{}';
    
    return JSON.stringify({
      atoms: this.getCurrentAtomsFromInstance(),
      relations: this.dataInstance.getRelations().map(r => ({
        id: r.id,
        name: r.name,
        tuples: r.tuples
      }))
    }, null, 2);
  }

  // ==================== Change Subscription ====================

  /**
   * Subscribe to instance changes
   */
  private subscribeToChanges(callback: () => void): () => void {
    this.instanceChangeCallbacks.add(callback);
    return () => this.instanceChangeCallbacks.delete(callback);
  }

  /**
   * Notify all subscribers of instance changes
   */
  private notifyInstanceChange(): void {
    this.instanceChangeCallbacks.forEach(cb => {
      try {
        cb();
      } catch (e) {
        console.error('[AlloyInputGraph] Error in change callback:', e);
      }
    });
  }
}

// Register the custom element
if (typeof window !== 'undefined' && window.customElements) {
  if (!window.customElements.get('alloy-input-graph')) {
    window.customElements.define('alloy-input-graph', AlloyInputGraph);
  }
}
