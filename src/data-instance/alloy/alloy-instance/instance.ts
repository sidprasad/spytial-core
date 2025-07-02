/**
 * Alloy Instance module for handling Alloy model instances.
 * 
 * 
 * // PErhaps this needs to be removed?
 */

export interface AlloyAtom {
  id: string;
  signature: string;
  label?: string;
  fields?: Record<string, unknown>;
}

export interface AlloyRelation {
  name: string;
  signature: string;
  tuples: Array<string[]>;
  arity: number;
}

export interface AlloySignature {
  name: string;
  atoms: AlloyAtom[];
  isAbstract?: boolean;
  isOne?: boolean;
  extends?: string;
}

export interface AlloyInstanceData {
  signatures: AlloySignature[];
  relations: AlloyRelation[];
  commands?: string[];
  bitwidth?: number;
}

export interface InstanceConfig {
  validateTuples?: boolean;
  strictMode?: boolean;
}

/**
 * Main AlloyInstance class for handling Alloy model instances
 */
export class AlloyInstance {
  private signatures: Map<string, AlloySignature> = new Map();
  private relations: Map<string, AlloyRelation> = new Map();
  private atoms: Map<string, AlloyAtom> = new Map();
  private config: InstanceConfig;

  constructor(config: InstanceConfig = {}) {
    this.config = {
      validateTuples: true,
      strictMode: false,
      ...config,
    };
  }

  /**
   * Add a signature to the instance
   */
  addSignature(signature: AlloySignature): void {
    this.signatures.set(signature.name, signature);
    
    // Add all atoms from this signature
    signature.atoms.forEach(atom => {
      this.atoms.set(atom.id, atom);
    });
  }

  /**
   * Add a relation to the instance
   */
  addRelation(relation: AlloyRelation): void {
    if (this.config.validateTuples) {
      this.validateRelationTuples(relation);
    }
    
    this.relations.set(relation.name, relation);
  }

  /**
   * Add an atom to a signature
   */
  addAtom(atom: AlloyAtom): void {
    this.atoms.set(atom.id, atom);
    
    // Add to signature if it exists
    const signature = this.signatures.get(atom.signature);
    if (signature) {
      if (!signature.atoms.find(a => a.id === atom.id)) {
        signature.atoms.push(atom);
      }
    } else if (this.config.strictMode) {
      throw new Error(`Signature ${atom.signature} not found`);
    }
  }





  /**
   * Get a signature by name
   */
  getSignature(name: string): AlloySignature | undefined {
    return this.signatures.get(name);
  }

  /**
   * Get a relation by name
   */
  getRelation(name: string): AlloyRelation | undefined {
    return this.relations.get(name);
  }

  /**
   * Get an atom by ID
   */
  getAtom(id: string): AlloyAtom | undefined {
    return this.atoms.get(id);
  }

  /**
   * Get all signatures
   */
  getSignatures(): AlloySignature[] {
    return Array.from(this.signatures.values());
  }

  /**
   * Get all relations
   */
  getRelations(): AlloyRelation[] {
    return Array.from(this.relations.values());
  }

  /**
   * Get all atoms
   */
  getAtoms(): AlloyAtom[] {
    return Array.from(this.atoms.values());
  }

  /**
   * Get atoms by signature
   */
  getAtomsBySignature(signature: string): AlloyAtom[] {
    return Array.from(this.atoms.values()).filter(atom => atom.signature === signature);
  }

  /**
   * Evaluate a relation with given atoms
   */
  evaluateRelation(relationName: string, atoms: string[]): boolean {
    const relation = this.relations.get(relationName);
    if (!relation) return false;
    
    return relation.tuples.some(tuple => 
      tuple.length === atoms.length && 
      tuple.every((atom, index) => atom === atoms[index])
    );
  }

  /**
   * Get all tuples for a relation
   */
  getRelationTuples(relationName: string): Array<string[]> {
    const relation = this.relations.get(relationName);
    return relation ? relation.tuples : [];
  }

  /**
   * Export instance data
   */
  toData(): AlloyInstanceData {
    return {
      signatures: this.getSignatures(),
      relations: this.getRelations(),
    };
  }

  /**
   * Load instance from data
   */
  fromData(data: AlloyInstanceData): void {
    this.clear();
    
    data.signatures.forEach(signature => this.addSignature(signature));
    data.relations.forEach(relation => this.addRelation(relation));
  }

  /**
   * Clear the instance
   */
  clear(): void {
    this.signatures.clear();
    this.relations.clear();
    this.atoms.clear();
  }

  /**
   * Get instance statistics
   */
  getStats() {
    return {
      signatureCount: this.signatures.size,
      relationCount: this.relations.size,
      atomCount: this.atoms.size,
      totalTuples: Array.from(this.relations.values()).reduce(
        (sum, rel) => sum + rel.tuples.length, 
        0
      ),
    };
  }

  /**
   * Validate relation tuples against known atoms
   */
  private validateRelationTuples(relation: AlloyRelation): void {
    relation.tuples.forEach((tuple, index) => {
      if (tuple.length !== relation.arity) {
        throw new Error(
          `Tuple ${index} in relation ${relation.name} has incorrect arity: expected ${relation.arity}, got ${tuple.length}`
        );
      }
      
      tuple.forEach(atomId => {
        if (!this.atoms.has(atomId)) {
          throw new Error(
            `Atom ${atomId} in relation ${relation.name} not found in instance`
          );
        }
      });
    });
  }



  /** Remove Atoms */
  removeAtom(atomId: string): void {
    if (this.atoms.has(atomId)) {
      this.atoms.delete(atomId);
      
      // Remove from all signatures
      this.signatures.forEach(signature => {
        signature.atoms = signature.atoms.filter(atom => atom.id !== atomId);
      });

      // And remove from all relations
      this.relations.forEach(relation => {
        relation.tuples = relation.tuples.filter(tuple => !tuple.includes(atomId));
      });


    } else if (this.config.strictMode) {
      throw new Error(`Atom ${atomId} not found in instance`);
    }
  }



  /** Remove Relation Tuple */
  removeRelationTuple(relationName: string, tuple: string[]): void {
    const relation = this.relations.get(relationName);
    if (!relation) {
      throw new Error(`Relation ${relationName} not found`);
    }

    const index = relation.tuples.findIndex(t => t.length === tuple.length && t.every((atom, i) => atom === tuple[i]));
    if (index === -1) {
      throw new Error(`Tuple ${tuple.join(', ')} not found in relation ${relationName}`);
    }

    relation.tuples.splice(index, 1);
  }

}

/**
 * Factory function to create an AlloyInstance
 */
export const createAlloyInstance = (config?: InstanceConfig): AlloyInstance => {
  return new AlloyInstance(config);
};

// Utility functions
export const isValidAtom = (atom: AlloyAtom): boolean => {
  return (
    typeof atom.id === 'string' &&
    atom.id.length > 0 &&
    typeof atom.signature === 'string' &&
    atom.signature.length > 0
  );
};

export const isValidRelation = (relation: AlloyRelation): boolean => {
  return (
    typeof relation.name === 'string' &&
    relation.name.length > 0 &&
    typeof relation.arity === 'number' &&
    relation.arity > 0 &&
    Array.isArray(relation.tuples)
  );
};

export const parseAlloyXML = (_xmlContent: string): AlloyInstanceData => {
  // Placeholder for XML parsing logic
  // In a real implementation, you would parse the Alloy XML format
  throw new Error('XML parsing not implemented yet');
};
