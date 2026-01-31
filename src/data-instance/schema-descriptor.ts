/**
 * Schema Descriptor for IDataInstance
 * 
 * This module provides functions to generate schema-level descriptions of IDataInstance objects
 * in various formats (Alloy-like, SQL-like) that can be used for LLM consumption or documentation.
 * 
 * The descriptors describe the SHAPE of the data rather than instance-level data:
 * - Types and their hierarchies
 * - Relations with their arities (type signatures)
 * - No actual atom or tuple data
 * 
 * @example
 * ```typescript
 * import { generateAlloySchema, generateSQLSchema } from 'spytial-core';
 * 
 * // Generate Alloy-style schema
 * const alloySchema = generateAlloySchema(dataInstance);
 * // sig Node {
 * //   left: lone Node,
 * //   right: lone Node,
 * //   key: one Int
 * // }
 * 
 * // Generate SQL-style schema
 * const sqlSchema = generateSQLSchema(dataInstance);
 * // CREATE TABLE Node (id VARCHAR PRIMARY KEY);
 * // CREATE TABLE left (source_Node VARCHAR, target_Node VARCHAR);
 * ```
 */

import type { IDataInstance, IType, IRelation } from './interfaces';

/**
 * Options for schema generation
 */
export interface SchemaDescriptorOptions {
  /**
   * Whether to include built-in types (e.g., Int, String, seq/Int) in the schema.
   * Built-in types may clutter the schema for LLM consumption.
   * @default false
   */
  includeBuiltInTypes?: boolean;

  /**
   * Whether to include type hierarchies (extends relationships) in the output.
   * @default true
   */
  includeTypeHierarchy?: boolean;

  /**
   * Whether to include arity information (e.g., "one", "lone", "some", "set") in Alloy schemas.
   * Note: Actual arity cannot be precisely determined from the schema alone,
   * so this generates best-effort multiplicities.
   * @default false
   */
  includeArityHints?: boolean;
}

/**
 * Generate an Alloy-style schema description for an IDataInstance.
 * 
 * This produces a text representation similar to Alloy signatures with fields,
 * describing the types and relations in a declarative format.
 * 
 * @param dataInstance - The data instance to describe
 * @param options - Configuration options for schema generation
 * @returns Alloy-style schema as a string
 * 
 * @example
 * ```typescript
 * const schema = generateAlloySchema(instance);
 * // Output:
 * // sig Node {
 * //   left: lone Node,
 * //   right: lone Node,
 * //   key: one Int
 * // }
 * // 
 * // sig Int {}
 * ```
 * 
 * @remarks
 * When `includeArityHints` is true, arity multiplicities are currently set to 'set' (most permissive).
 * Precise arity detection ('one', 'lone', 'some') would require analyzing tuple cardinality patterns,
 * which is not yet implemented. This option is considered experimental.
 */
export function generateAlloySchema(
  dataInstance: IDataInstance,
  options: SchemaDescriptorOptions = {}
): string {
  const {
    includeBuiltInTypes = false,
    includeTypeHierarchy = true,
    includeArityHints = false
  } = options;

  const types = dataInstance.getTypes();
  const relations = dataInstance.getRelations();

  // Filter out built-in types if requested
  const filteredTypes = includeBuiltInTypes 
    ? types 
    : types.filter(t => !t.isBuiltin);

  const typeById = new Map(types.map(t => [t.id, t]));
  const filteredTypeIds = new Set(filteredTypes.map(t => t.id));

  const parseOwnerFromRelationId = (relation: IRelation): string | undefined => {
    const marker = '<:';
    const idx = relation.id.indexOf(marker);
    if (idx <= 0) return undefined;
    const owner = relation.id.slice(0, idx);
    const expected = `${owner}${marker}${relation.name}`;
    return relation.id === expected ? owner : undefined;
  };

  // Build a map of type -> field relations, plus a list of top-level relations
  const typeToRelations = new Map<string, IRelation[]>();
  const topLevelRelations: IRelation[] = [];

  for (const relation of relations) {
    if (relation.types.length === 0) {
      topLevelRelations.push(relation);
      continue;
    }

    const explicitOwner = parseOwnerFromRelationId(relation);
    const owner = explicitOwner ?? relation.types[0];
    const ownerType = owner ? typeById.get(owner) : undefined;
    const ownerIsBuiltin = ownerType?.isBuiltin ?? false;
    const ownerMatchesTypes0 = owner === relation.types[0];

    const isField = owner !== undefined
      && ownerMatchesTypes0
      && !ownerIsBuiltin
      && filteredTypeIds.has(owner);

    if (isField) {
      if (!typeToRelations.has(owner)) {
        typeToRelations.set(owner, []);
      }
      typeToRelations.get(owner)!.push(relation);
    } else {
      topLevelRelations.push(relation);
    }
  }

  const lines: string[] = [];

  // Generate sig declarations for each type
  for (const type of filteredTypes) {
    // Type hierarchy structure: type.types[0] is the type itself,
    // type.types[1...] are parent types from most specific to most general
    // Example: ['Student', 'Person', 'Object'] means Student extends Person extends Object
    const parentTypes = type.types.length > 1 ? type.types.slice(1) : [];
    const extendsClause = includeTypeHierarchy && parentTypes.length > 0
      ? ` extends ${parentTypes[0]}`  // Use immediate parent (most specific)
      : '';
    
    lines.push(`sig ${type.id}${extendsClause} {`);

    // Add fields (relations) for this type
    const relationsForType = typeToRelations.get(type.id) || [];
    for (const relation of relationsForType) {
      // Skip if this is a standalone relation with no parent type
      if (relation.types.length === 0) continue;

      // Determine arity hint if requested
      let arityHint = '';
      if (includeArityHints) {
        // EXPERIMENTAL: Arity detection requires analyzing tuple cardinality patterns
        // Currently defaults to 'set' (most permissive multiplicity)
        // Future: Detect 'one', 'lone', 'some' based on min/max tuple counts per source atom
        arityHint = 'set ';
      }

      // Determine target type(s)
      const targetTypes = relation.types.slice(1);
      const targetTypeStr = targetTypes.length > 0 
        ? targetTypes.join(' -> ') 
        : 'univ';

      lines.push(`  ${relation.name}: ${arityHint}${targetTypeStr}`);
    }

    lines.push('}');
    lines.push('');
  }

  // Handle top-level relations (not scoped to a specific sig)
  if (topLevelRelations.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('// Top-level relations');
    for (const relation of topLevelRelations) {
      let arityHint = '';
      if (includeArityHints) {
        arityHint = 'set ';
      }
      const typeStr = relation.types.length > 0 
        ? relation.types.join(' -> ') 
        : 'univ -> univ';
      lines.push(`rel ${relation.name}: ${arityHint}${typeStr}`);
    }
  }

  return lines.join('\n').trim();
}

/**
 * Generate a SQL-style schema description for an IDataInstance.
 * 
 * This produces CREATE TABLE statements for types and relations,
 * treating the data instance as a relational database schema.
 * 
 * @param dataInstance - The data instance to describe
 * @param options - Configuration options for schema generation
 * @returns SQL-style schema as a string
 * 
 * @example
 * ```typescript
 * const schema = generateSQLSchema(instance);
 * // Output:
 * // CREATE TABLE Node (
 * //   id VARCHAR PRIMARY KEY
 * // );
 * // 
 * // CREATE TABLE left (
 * //   source_Node VARCHAR REFERENCES Node(id),
 * //   target_Node VARCHAR REFERENCES Node(id)
 * // );
 * ```
 */
export function generateSQLSchema(
  dataInstance: IDataInstance,
  options: SchemaDescriptorOptions = {}
): string {
  const {
    includeBuiltInTypes = false,
    includeTypeHierarchy = true
  } = options;

  const types = dataInstance.getTypes();
  const relations = dataInstance.getRelations();

  // Filter out built-in types if requested
  const filteredTypes = includeBuiltInTypes 
    ? types 
    : types.filter(t => !t.isBuiltin);

  const lines: string[] = [];
  
  // Generate CREATE TABLE for each type (entity table)
  for (const type of filteredTypes) {
    lines.push(`CREATE TABLE ${type.id} (`);
    lines.push(`  id VARCHAR PRIMARY KEY`);

    // Add parent type reference if type hierarchy is included
    if (includeTypeHierarchy && type.types.length > 1) {
      // Type hierarchy structure: type.types[0] is the type itself,
      // type.types[1] is immediate parent (most specific parent type)
      const parentType = type.types[1];
      lines.push(`  -- extends ${parentType}`);
    }

    lines.push(`);`);
    lines.push('');
  }

  // Generate CREATE TABLE for each relation (relationship table)
  for (const relation of relations) {
    if (relation.types.length === 0) continue;

    // Skip relations where ALL types are built-in (not interesting for schema)
    // But keep relations that connect non-built-in types to built-in types (e.g., Node -> Int)
    if (!includeBuiltInTypes && relation.types.every(typeId => {
      const type = types.find(t => t.id === typeId);
      return type && type.isBuiltin;
    })) {
      continue;
    }

    lines.push(`CREATE TABLE ${relation.name} (`);

    // Generate columns for each position in the relation
    for (let i = 0; i < relation.types.length; i++) {
      const columnType = relation.types[i];
      const columnName = i === 0 ? 'source' : (i === 1 ? 'target' : `arg${i}`);
      const refClause = filteredTypes.some(t => t.id === columnType)
        ? ` REFERENCES ${columnType}(id)`
        : '';
      
      lines.push(`  ${columnName}_${columnType} VARCHAR${refClause}${i < relation.types.length - 1 ? ',' : ''}`);
    }

    lines.push(`);`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Generate a simplified text description of an IDataInstance schema.
 * 
 * This produces a human-readable summary that's easy for LLMs to parse and understand.
 * 
 * @param dataInstance - The data instance to describe
 * @param options - Configuration options for schema generation
 * @returns Plain text schema description
 * 
 * @example
 * ```typescript
 * const description = generateTextDescription(instance);
 * // Output:
 * // Types:
 * // - Node (5 atoms)
 * // - Int (3 atoms, built-in)
 * // 
 * // Relations:
 * // - left: Node -> Node (2 tuples)
 * // - right: Node -> Node (2 tuples)
 * // - key: Node -> Int (5 tuples)
 * ```
 */
export function generateTextDescription(
  dataInstance: IDataInstance,
  options: SchemaDescriptorOptions = {}
): string {
  const {
    includeBuiltInTypes = false
  } = options;

  const types = dataInstance.getTypes();
  const relations = dataInstance.getRelations();

  // Filter out built-in types if requested
  const filteredTypes = includeBuiltInTypes 
    ? types 
    : types.filter(t => !t.isBuiltin);

  const lines: string[] = [];
  
  // Describe types
  lines.push('Types:');
  for (const type of filteredTypes) {
    const atomCount = type.atoms.length;
    const builtinTag = type.isBuiltin ? ' (built-in)' : '';
    const parentInfo = type.types.length > 1 ? ` extends ${type.types.slice(1).join(', ')}` : '';
    lines.push(`- ${type.id}${parentInfo} (${atomCount} atom${atomCount !== 1 ? 's' : ''})${builtinTag}`);
  }

  lines.push('');
  lines.push('Relations:');
  
  // Describe relations
  for (const relation of relations) {
    // Skip relations involving only built-in types if requested
    if (!includeBuiltInTypes && relation.types.every(typeId => {
      const type = types.find(t => t.id === typeId);
      return type && type.isBuiltin;
    })) {
      continue;
    }

    const tupleCount = relation.tuples.length;
    const typeSignature = relation.types.length > 0 
      ? relation.types.join(' -> ') 
      : 'untyped';
    lines.push(`- ${relation.name}: ${typeSignature} (${tupleCount} tuple${tupleCount !== 1 ? 's' : ''})`);
  }

  return lines.join('\n');
}
