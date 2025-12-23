import { AlloyInstance, getInstanceType, getInstanceRelation, getInstanceAtom } from './instance';
import { AlloyType, isAbstract, isBuiltin, isOne } from './type';
import { AlloyRelation } from './relation';
import { AlloyAtom } from './atom';

/**
 * Validation error severity levels
 */
export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

/**
 * Represents a validation issue found during reification
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  context?: {
    type?: string;
    relation?: string;
    atom?: string;
    tuple?: string[];
  };
}

/**
 * Result of validation containing all issues found
 */
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validates type consistency - ensures atoms in tuples match expected types
 */
function validateTypeConsistency(instance: AlloyInstance): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check each relation's tuples
  for (const relationId in instance.relations) {
    const relation = instance.relations[relationId];
    
    for (const tuple of relation.tuples) {
      // Verify tuple arity matches relation type signature
      if (tuple.atoms.length !== relation.types.length) {
        issues.push({
          severity: ValidationSeverity.ERROR,
          message: `Tuple arity mismatch in relation '${relation.name}': expected ${relation.types.length} atoms, got ${tuple.atoms.length}`,
          context: {
            relation: relation.name,
            tuple: tuple.atoms
          }
        });
        continue;
      }

      // Check each atom in the tuple against expected type
      for (let i = 0; i < tuple.atoms.length; i++) {
        const atomId = tuple.atoms[i];
        const expectedType = relation.types[i];
        const tupleType = tuple.types[i];

        // Validate tuple's declared type matches relation's expected type
        if (tupleType !== expectedType) {
          issues.push({
            severity: ValidationSeverity.ERROR,
            message: `Type mismatch in relation '${relation.name}' at position ${i}: expected '${expectedType}', got '${tupleType}'`,
            context: {
              relation: relation.name,
              atom: atomId,
              tuple: tuple.atoms
            }
          });
        }

        // Verify atom actually exists and has correct type
        try {
          const atom = getInstanceAtom(instance, atomId);
          const atomType = getInstanceType(instance, atom.type);
          
          // Check if atom's type is compatible with expected type
          // (considering type hierarchy)
          if (!atomType.types.includes(expectedType)) {
            issues.push({
              severity: ValidationSeverity.ERROR,
              message: `Atom '${atomId}' of type '${atom.type}' is not compatible with expected type '${expectedType}' in relation '${relation.name}'`,
              context: {
                relation: relation.name,
                atom: atomId,
                type: atom.type
              }
            });
          }
        } catch (error) {
          issues.push({
            severity: ValidationSeverity.ERROR,
            message: `Atom '${atomId}' referenced in relation '${relation.name}' does not exist`,
            context: {
              relation: relation.name,
              atom: atomId
            }
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validates multiplicity constraints (one, lone, some)
 */
function validateMultiplicity(instance: AlloyInstance): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check 'one' multiplicity constraint for types
  for (const typeId in instance.types) {
    const type = instance.types[typeId];
    
    if (isOne(type)) {
      if (type.atoms.length !== 1) {
        issues.push({
          severity: ValidationSeverity.ERROR,
          message: `Type '${type.id}' is declared as 'one' but has ${type.atoms.length} atom(s)`,
          context: {
            type: type.id
          }
        });
      }
    }
  }

  // Check abstract types don't have direct instances
  for (const typeId in instance.types) {
    const type = instance.types[typeId];
    
    if (isAbstract(type) && type.atoms.length > 0) {
      // Check if these atoms are only from subtypes
      const hasDirectInstances = type.atoms.some(atom => atom.type === type.id);
      if (hasDirectInstances) {
        issues.push({
          severity: ValidationSeverity.WARNING,
          message: `Abstract type '${type.id}' should not have direct instances`,
          context: {
            type: type.id
          }
        });
      }
    }
  }

  return issues;
}

/**
 * Validates proper use of builtin types
 */
function validateBuiltinTypes(instance: AlloyInstance): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check that builtin types are only used appropriately
  for (const typeId in instance.types) {
    const type = instance.types[typeId];
    
    if (isBuiltin(type)) {
      // Int and seq/Int should have specific patterns
      if (type.id === 'Int') {
        // Verify Int atoms follow integer pattern
        const nonIntegerAtoms = type.atoms.filter(atom => {
          const parsed = parseInt(atom.id);
          return isNaN(parsed) || parsed.toString() !== atom.id;
        });
        
        if (nonIntegerAtoms.length > 0) {
          issues.push({
            severity: ValidationSeverity.WARNING,
            message: `Type 'Int' contains non-integer atoms: ${nonIntegerAtoms.map(a => a.id).join(', ')}`,
            context: {
              type: type.id
            }
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validates relation definitions and usage
 */
function validateRelations(instance: AlloyInstance): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for empty relations that might indicate issues
  for (const relationId in instance.relations) {
    const relation = instance.relations[relationId];
    
    if (relation.types.length === 0) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        message: `Relation '${relation.name}' has no type signature`,
        context: {
          relation: relation.name
        }
      });
    }

    // Check if relation name follows proper format
    if (!relation.name || relation.name.trim().length === 0) {
      issues.push({
        severity: ValidationSeverity.ERROR,
        message: `Relation '${relationId}' has empty name`,
        context: {
          relation: relationId
        }
      });
    }
  }

  return issues;
}

/**
 * Performs comprehensive validation of an AlloyInstance before reification
 * 
 * @param instance The AlloyInstance to validate
 * @returns ValidationResult containing all issues found
 */
export function validateInstance(instance: AlloyInstance): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Run all validation checks
  issues.push(...validateTypeConsistency(instance));
  issues.push(...validateMultiplicity(instance));
  issues.push(...validateBuiltinTypes(instance));
  issues.push(...validateRelations(instance));

  // Determine if instance is valid (no errors, only warnings/info allowed)
  const hasErrors = issues.some(issue => issue.severity === ValidationSeverity.ERROR);

  return {
    isValid: !hasErrors,
    issues
  };
}

/**
 * Formats validation issues into a human-readable string
 */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return 'No validation issues found.';
  }

  const lines: string[] = [];
  const errors = issues.filter(i => i.severity === ValidationSeverity.ERROR);
  const warnings = issues.filter(i => i.severity === ValidationSeverity.WARNING);
  const infos = issues.filter(i => i.severity === ValidationSeverity.INFO);

  if (errors.length > 0) {
    lines.push(`Errors (${errors.length}):`);
    errors.forEach(issue => {
      lines.push(`  - ${issue.message}`);
      if (issue.context) {
        lines.push(`    Context: ${JSON.stringify(issue.context)}`);
      }
    });
  }

  if (warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`Warnings (${warnings.length}):`);
    warnings.forEach(issue => {
      lines.push(`  - ${issue.message}`);
    });
  }

  if (infos.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`Info (${infos.length}):`);
    infos.forEach(issue => {
      lines.push(`  - ${issue.message}`);
    });
  }

  return lines.join('\n');
}
