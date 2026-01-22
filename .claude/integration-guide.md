# Integrating Your Language with CnD-Core

This guide walks you through integrating a new language or data source with the CnD-Core layout system. You'll learn how to extract your data into the expected format and process it through the constraint-based layout pipeline.

## Overview: Two Integration Paths

### Path 1: JSONDataInstance (Quickest)
Best for: Testing, prototyping, languages with simple graph structures

**Process:** Extract your data → JSON format → JSONDataInstance → Layout

### Path 2: Custom IDataInstance (Production)
Best for: Production use, languages with complex semantics, performance-critical applications

**Process:** Extract your data → Custom IDataInstance implementation → Layout

---

## Path 1: Using JSONDataInstance

### Step 1: Extract Your Data Structure

You need to identify three things from your language's model/instance:

1. **Nodes** (atoms) - Individual entities in your graph
2. **Edges** (relations) - Connections between entities
3. **Types** (optional) - Categories of entities

### Step 2: Map to JSON Format

The expected JSON structure:

```typescript
{
  atoms: [
    {
      id: string,           // Unique identifier (required)
      type: string,         // Type/category name (required)
      label: string,        // Display label (required)
      labels?: {            // Optional: Special metadata displayed on node
        [key: string]: string[]
      }
    }
  ],
  relations: [
    {
      id: string,           // Unique identifier for this relation (required)
      name: string,         // Relation name used in selectors (required)
      types: string[],      // Ordered type signature, e.g., ["Person", "Company"] (required)
      tuples: [             // Actual connections (required)
        {
          atoms: string[],  // Ordered array of atom IDs, e.g., ["alice", "techcorp"]
          types: string[]   // Corresponding types, must match signature order
        }
      ]
    }
  ],
  types?: [                 // Optional: Auto-inferred if not provided
    {
      id: string,           // Type name (required if provided)
      types: string[],      // Type hierarchy from most general to specific
      atoms: IAtom[],       // Will be populated automatically
      isBuiltin: boolean    // True for primitive types (String, Int, etc.)
    }
  ]
}
```

### Step 3: Language-Specific Examples

#### Example 1: Alloy Model

**Input Alloy Instance:**
```alloy
sig Person {
  friends: set Person,
  employer: lone Company
}

sig Company {
  employees: set Person
}

inst {
  Person = {Alice, Bob}
  Company = {TechCorp}
  friends = {Alice->Bob}
  employer = {Alice->TechCorp, Bob->TechCorp}
}
```

**Extracted JSON:**
```json
{
  "atoms": [
    { "id": "Alice", "type": "Person", "label": "Alice" },
    { "id": "Bob", "type": "Person", "label": "Bob" },
    { "id": "TechCorp", "type": "Company", "label": "TechCorp" }
  ],
  "relations": [
    {
      "id": "friends",
      "name": "friends",
      "types": ["Person", "Person"],
      "tuples": [
        { "atoms": ["Alice", "Bob"], "types": ["Person", "Person"] }
      ]
    },
    {
      "id": "employer",
      "name": "employer",
      "types": ["Person", "Company"],
      "tuples": [
        { "atoms": ["Alice", "TechCorp"], "types": ["Person", "Company"] },
        { "atoms": ["Bob", "TechCorp"], "types": ["Person", "Company"] }
      ]
    }
  ]
}
```

#### Example 2: SQL Database Schema

**Input SQL:**
```sql
CREATE TABLE users (id INT, name VARCHAR, role VARCHAR);
CREATE TABLE follows (follower_id INT, followee_id INT);

-- Sample data
INSERT INTO users VALUES (1, 'alice', 'admin'), (2, 'bob', 'user');
INSERT INTO follows VALUES (1, 2);
```

**Extracted JSON:**
```json
{
  "atoms": [
    { 
      "id": "user_1", 
      "type": "User", 
      "label": "alice",
      "labels": { "role": ["admin"] }
    },
    { 
      "id": "user_2", 
      "type": "User", 
      "label": "bob",
      "labels": { "role": ["user"] }
    }
  ],
  "relations": [
    {
      "id": "follows",
      "name": "follows",
      "types": ["User", "User"],
      "tuples": [
        { "atoms": ["user_1", "user_2"], "types": ["User", "User"] }
      ]
    }
  ]
}
```

#### Example 3: AST / Program Structure

**Input Python Code:**
```python
class Calculator:
    def add(self, x, y):
        return x + y
```

**Extracted JSON (simplified AST):**
```json
{
  "atoms": [
    { "id": "Calculator_class", "type": "ClassDef", "label": "Calculator" },
    { "id": "add_method", "type": "FunctionDef", "label": "add" },
    { "id": "param_x", "type": "Parameter", "label": "x" },
    { "id": "param_y", "type": "Parameter", "label": "y" }
  ],
  "relations": [
    {
      "id": "contains",
      "name": "methods",
      "types": ["ClassDef", "FunctionDef"],
      "tuples": [
        { "atoms": ["Calculator_class", "add_method"], "types": ["ClassDef", "FunctionDef"] }
      ]
    },
    {
      "id": "params",
      "name": "parameters",
      "types": ["FunctionDef", "Parameter"],
      "tuples": [
        { "atoms": ["add_method", "param_x"], "types": ["FunctionDef", "Parameter"] },
        { "atoms": ["add_method", "param_y"], "types": ["FunctionDef", "Parameter"] }
      ]
    }
  ]
}
```

#### Example 4: Graph Database (Neo4j)

**Input Cypher:**
```cypher
CREATE (a:Person {name: 'Alice'})
CREATE (b:Person {name: 'Bob'})
CREATE (c:Company {name: 'TechCorp'})
CREATE (a)-[:WORKS_AT]->(c)
CREATE (b)-[:WORKS_AT]->(c)
CREATE (a)-[:KNOWS]->(b)
```

**Extracted JSON:**
```json
{
  "atoms": [
    { "id": "person_alice", "type": "Person", "label": "Alice" },
    { "id": "person_bob", "type": "Person", "label": "Bob" },
    { "id": "company_techcorp", "type": "Company", "label": "TechCorp" }
  ],
  "relations": [
    {
      "id": "works_at",
      "name": "worksAt",
      "types": ["Person", "Company"],
      "tuples": [
        { "atoms": ["person_alice", "company_techcorp"], "types": ["Person", "Company"] },
        { "atoms": ["person_bob", "company_techcorp"], "types": ["Person", "Company"] }
      ]
    },
    {
      "id": "knows",
      "name": "knows",
      "types": ["Person", "Person"],
      "tuples": [
        { "atoms": ["person_alice", "person_bob"], "types": ["Person", "Person"] }
      ]
    }
  ]
}
```

### Step 4: Create Data Instance

```typescript
import { JSONDataInstance } from 'spytial-core';

// From JSON string
const jsonString = '{"atoms": [...], "relations": [...]}';
const instance = new JSONDataInstance(jsonString);

// Or from JavaScript object
const jsonData = {
  atoms: [/* ... */],
  relations: [/* ... */]
};
const instance = new JSONDataInstance(jsonData);

// With options
const instance = new JSONDataInstance(jsonData, {
  mergeRelations: true,      // Merge relations with same name
  inferTypes: true,          // Auto-generate type definitions
  validateReferences: true,  // Validate atom references in tuples
  deduplicateAtoms: true    // Remove duplicate atom IDs
});
```

### Step 5: Define Layout Constraints

Write a layout specification in YAML (or parse from string):

```yaml
constraints:
  # Define spatial relationships
  - orientation:
      selector: "{x, y : Person | x.friends = y}"
      directions: [directlyLeft]
  
  # Group by type
  - group:
      selector: type
      name: "By Type"

directives:
  # Visual styling
  - color: {selector: Person, color: blue}
  - color: {selector: Company, color: green}
  - size: {selector: Person, width: 150, height: 75}
```

### Step 6: Generate Layout

```typescript
import { parseLayoutSpec, LayoutInstance, SGraphQueryEvaluator } from 'spytial-core/layout';

// Parse layout spec
const spec = parseLayoutSpec(layoutYaml);

// Create evaluator
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: instance });

// Generate layout
const layoutInstance = new LayoutInstance(spec, evaluator);
const result = layoutInstance.generateLayout(instance, {});

if (result.error) {
  console.error('Layout failed:', result.error.message);
  // Handle constraint conflicts (see troubleshooting.md)
} else {
  console.log('Layout successful');
  // result.layout contains nodes with x, y positions
  result.layout.nodes.forEach(node => {
    console.log(`${node.label}: (${node.x}, ${node.y})`);
  });
}
```

---

## Path 2: Custom IDataInstance Implementation

For production use or languages with complex semantics, implement the `IDataInstance` interface directly.

### Interface Definition

```typescript
interface IDataInstance {
  // Core data access
  getAtoms(): readonly IAtom[];
  getRelations(): readonly IRelation[];
  getTypes(): readonly IType[];
  getAtomType(id: string): IType;
  
  // Graph generation
  generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph;
  
  // Projections (filtering)
  applyProjections(atomIds: string[]): IDataInstance;
}

// For interactive/editable instances, implement IInputDataInstance:
interface IInputDataInstance extends IDataInstance {
  // Mutation operations
  addAtom(atom: IAtom): void;
  removeAtom(id: string): void;
  addRelationTuple(relationId: string, tuple: ITuple): void;
  removeRelationTuple(relationId: string, tuple: ITuple): void;
  
  // Event system
  addEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void;
  removeEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void;
  
  // Serialization
  reify(): unknown;  // Return native format
  
  // Merging
  addDataFrom(dataInstance: IDataInstance, unifyBuiltIns?: boolean): void;
}
```

### Example Implementation Template

```typescript
import { IDataInstance, IAtom, IRelation, IType } from 'spytial-core';
import { Graph } from 'graphlib';

export class MyLanguageDataInstance implements IDataInstance {
  private atoms: IAtom[];
  private relations: IRelation[];
  private types: IType[];
  
  constructor(nativeData: MyLanguageModel) {
    // Extract atoms from your native format
    this.atoms = this.extractAtoms(nativeData);
    
    // Extract relations
    this.relations = this.extractRelations(nativeData);
    
    // Build type hierarchy
    this.types = this.buildTypes(nativeData);
  }
  
  private extractAtoms(data: MyLanguageModel): IAtom[] {
    // Convert your native entities to IAtom format
    return data.entities.map(entity => ({
      id: entity.uniqueId,
      type: entity.typeName,
      label: entity.displayName,
      labels: entity.metadata ? { metadata: [entity.metadata] } : undefined
    }));
  }
  
  private extractRelations(data: MyLanguageModel): IRelation[] {
    // Convert your native connections to IRelation format
    return data.connections.map(conn => ({
      id: conn.relationId,
      name: conn.relationName,
      types: [conn.sourceType, conn.targetType],
      tuples: conn.edges.map(edge => ({
        atoms: [edge.source, edge.target],
        types: [conn.sourceType, conn.targetType]
      }))
    }));
  }
  
  private buildTypes(data: MyLanguageModel): IType[] {
    // Build type hierarchy with inheritance
    const typeMap = new Map<string, IType>();
    
    data.types.forEach(typeDef => {
      typeMap.set(typeDef.name, {
        id: typeDef.name,
        types: this.getTypeHierarchy(typeDef),  // [base, parent, child]
        atoms: this.atoms.filter(a => a.type === typeDef.name),
        isBuiltin: this.isBuiltinType(typeDef.name)
      });
    });
    
    return Array.from(typeMap.values());
  }
  
  // IDataInstance implementation
  
  getAtoms(): readonly IAtom[] {
    return this.atoms;
  }
  
  getRelations(): readonly IRelation[] {
    return this.relations;
  }
  
  getTypes(): readonly IType[] {
    return this.types;
  }
  
  getAtomType(id: string): IType {
    const atom = this.atoms.find(a => a.id === id);
    if (!atom) throw new Error(`Atom not found: ${id}`);
    
    const type = this.types.find(t => t.id === atom.type);
    if (!type) throw new Error(`Type not found: ${atom.type}`);
    
    return type;
  }
  
  generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph {
    const graph = new Graph({ directed: true, multigraph: true });
    
    // Add nodes
    this.atoms.forEach(atom => {
      graph.setNode(atom.id, {
        label: atom.label,
        type: atom.type
      });
    });
    
    // Add edges
    this.relations.forEach(relation => {
      relation.tuples.forEach(tuple => {
        if (tuple.atoms.length === 2) {
          graph.setEdge(tuple.atoms[0], tuple.atoms[1], {
            relation: relation.name
          });
        }
      });
    });
    
    // Filter disconnected nodes if requested
    if (hideDisconnected || hideDisconnectedBuiltIns) {
      const disconnected = graph.nodes().filter(nodeId => {
        const hasEdges = graph.inEdges(nodeId)?.length > 0 || 
                        graph.outEdges(nodeId)?.length > 0;
        if (hasEdges) return false;
        
        if (hideDisconnectedBuiltIns) {
          const atom = this.atoms.find(a => a.id === nodeId);
          const type = atom && this.types.find(t => t.id === atom.type);
          return type?.isBuiltin;
        }
        
        return hideDisconnected;
      });
      
      disconnected.forEach(nodeId => graph.removeNode(nodeId));
    }
    
    return graph;
  }
  
  applyProjections(atomIds: string[]): IDataInstance {
    // Create filtered instance with only specified atoms
    const atomIdSet = new Set(atomIds);
    
    const filteredAtoms = this.atoms.filter(a => atomIdSet.has(a.id));
    
    const filteredRelations = this.relations.map(rel => ({
      ...rel,
      tuples: rel.tuples.filter(t => 
        t.atoms.every(atomId => atomIdSet.has(atomId))
      )
    })).filter(rel => rel.tuples.length > 0);
    
    // Return new instance (implement constructor that takes extracted data)
    return new MyLanguageDataInstance(/* filtered data */);
  }
  
  // Helper methods specific to your language
  
  private getTypeHierarchy(typeDef: MyLanguageType): string[] {
    // Return type hierarchy from base to specific
    // e.g., for "Manager extends Person", return ["Person", "Manager"]
    const hierarchy: string[] = [];
    let current = typeDef;
    
    while (current) {
      hierarchy.push(current.name);
      current = current.parent;
    }
    
    return hierarchy.reverse();
  }
  
  private isBuiltinType(typeName: string): boolean {
    // Identify primitive/builtin types in your language
    return ['String', 'Int', 'Bool', 'Float'].includes(typeName);
  }
}
```

### Integration with Layout Pipeline

```typescript
// Create your data instance
const nativeModel = parseMyLanguage(sourceCode);
const dataInstance = new MyLanguageDataInstance(nativeModel);

// Use with layout system (same as JSONDataInstance)
const spec = parseLayoutSpec(layoutYaml);
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });

const layoutInstance = new LayoutInstance(spec, evaluator);
const result = layoutInstance.generateLayout(dataInstance, {});
```

---

## Complete Pipeline Walkthrough

### 1. Data Extraction Phase

**Input:** Your language's native model/instance/AST

**Process:**
```typescript
// Language-specific parsing
const nativeData = parseYourLanguage(sourceCode);

// Extract to IDataInstance
const dataInstance = new YourLanguageDataInstance(nativeData);
// OR use JSON path:
const jsonData = extractToJSON(nativeData);
const dataInstance = new JSONDataInstance(jsonData);
```

**Output:** `IDataInstance` with atoms, relations, types

### 2. Selector Evaluation Phase

**Input:** Layout spec with selectors + Data instance

**Process:**
```typescript
// Parse layout specification
const spec = parseLayoutSpec(layoutYaml);

// Create query evaluator
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });

// Evaluator processes selectors like:
// "{x, y : Person | x.friends = y}"
// Returns: [[alice, bob], [bob, charlie], ...]
```

**Output:** Tuples of matching atoms for each constraint

### 3. Constraint Generation Phase

**Input:** Evaluated selectors + Node dimensions

**Process:**
```typescript
const layoutInstance = new LayoutInstance(spec, evaluator);

// Internally converts selectors to typed constraints:
// - LeftConstraint: node1.x + node1.width <= node2.x
// - TopConstraint: node1.y + node1.height <= node2.y
// - AlignmentConstraint: node1.y === node2.y (horizontal)
// - BoundingBoxConstraint: member inside group boundary
```

**Output:** Typed layout constraints (LeftConstraint, AlignmentConstraint, etc.)

### 4. Constraint Solving Phase

**Input:** Typed constraints + Node dimensions

**Process:**
```typescript
// LayoutInstance.generateLayout() calls ConstraintValidator
const result = layoutInstance.generateLayout(dataInstance, {});

// Validator uses Kiwi.js (Cassowary algorithm) to:
// 1. Convert constraints to linear equations
// 2. Attempt to solve the system
// 3. If conflict: extract minimal IIS (Irreducible Infeasible Subset)
// 4. Report structured error with minimal conflicting set
```

**Output:** 
- **Success:** Layout with x, y positions for all nodes
- **Failure:** PositionalConstraintError with minimal conflicting constraints

### 5. Visual Rendering Phase

**Input:** Solved layout + Directives

**Process:**
```typescript
// Apply directives (colors, icons, sizes)
result.layout.nodes.forEach(node => {
  // Apply icon directive
  if (iconDirective.matches(node)) {
    node.icon = iconDirective.path;
  }
  
  // Apply color directive
  if (colorDirective.matches(node)) {
    node.color = colorDirective.color;
  }
});

// Render to SVG/Canvas/WebGL
```

**Output:** Visual representation of constrained graph layout

---

## Best Practices for Integration

### 1. ID Generation

Ensure atom IDs are **unique and stable**:

```typescript
// ❌ Bad: Non-unique or unstable IDs
{ id: "person", type: "Person", label: "Alice" }  // collision risk
{ id: Math.random().toString(), type: "Person", label: "Alice" }  // unstable

// ✅ Good: Unique and stable
{ id: "person_alice_123", type: "Person", label: "Alice" }
{ id: "user:alice@example.com", type: "User", label: "alice@example.com" }
```

### 2. Type Naming

Use consistent, hierarchical type names:

```typescript
// ❌ Bad: Inconsistent naming
{ type: "person" }  // lowercase
{ type: "COMPANY" }  // uppercase
{ type: "org.example.User" }  // package names

// ✅ Good: Consistent PascalCase
{ type: "Person" }
{ type: "Company" }
{ type: "User" }
```

### 3. Relation Naming

Make relation names match field accessors in selectors:

```typescript
// If your selector is: "{x, y : Person | x.friends = y}"
// Then relation name must be "friends":
{
  id: "friendship_relation",
  name: "friends",  // Used in selectors
  types: ["Person", "Person"],
  tuples: [...]
}
```

### 4. Handling Builtin Types

Mark primitive types as builtin:

```typescript
{
  id: "String",
  types: ["String"],
  atoms: [{ id: "str1", type: "String", label: "hello" }],
  isBuiltin: true  // Enables hideDisconnectedBuiltIns
}
```

### 5. Large Graphs

For graphs with 1000+ nodes:
- Filter irrelevant nodes before creating instance
- Use projections to focus on subsets
- Consider custom IDataInstance for lazy evaluation

```typescript
// Filter before creating instance
const relevantEntities = allEntities.filter(e => e.isRelevant);
const instance = new JSONDataInstance({
  atoms: relevantEntities.map(toAtom),
  relations: extractRelevantRelations(relevantEntities)
});
```

### 6. Error Handling

Validate your data before processing:

```typescript
function validateDataInstance(data: IJsonDataInstance): string[] {
  const errors: string[] = [];
  
  // Check for duplicate IDs
  const ids = new Set<string>();
  data.atoms.forEach(atom => {
    if (ids.has(atom.id)) {
      errors.push(`Duplicate atom ID: ${atom.id}`);
    }
    ids.add(atom.id);
  });
  
  // Validate relation references
  data.relations.forEach(rel => {
    rel.tuples.forEach(tuple => {
      tuple.atoms.forEach(atomId => {
        if (!ids.has(atomId)) {
          errors.push(`Relation ${rel.name} references unknown atom: ${atomId}`);
        }
      });
    });
  });
  
  return errors;
}
```

---

## Debugging Integration Issues

### Issue: "Selector returns no matches"

**Check:**
1. Relation names match field access in selector
2. Type names are correct (case-sensitive)
3. Tuples reference existing atom IDs

```typescript
// Debug selector evaluation
const result = evaluator.evaluateSGraphQuery(
  "{x, y : Person | x.friends = y}",
  dataInstance
);
console.log('Matches:', result.tuples);
```

### Issue: "Atoms not showing up"

**Check:**
1. Atoms have valid type
2. Not hidden by directives
3. Not filtered by hideDisconnected flag

```typescript
console.log('All atoms:', dataInstance.getAtoms());
console.log('All types:', dataInstance.getTypes());
```

### Issue: "Layout fails with constraint conflict"

**Check:**
1. Selectors creating conflicting constraints
2. Cycles in orientation constraints
3. Nodes aligned both horizontally and vertically

See [troubleshooting.md](./troubleshooting.md) for detailed error solutions.

---

## Next Steps

1. **Test with simple data** - Start with 2-3 nodes and 1-2 relations
2. **Add constraints incrementally** - Begin with orientation, add alignment/grouping
3. **Handle errors** - Implement proper error handling and user feedback
4. **Optimize** - Profile large datasets, consider custom IDataInstance
5. **Document selectors** - Provide examples for your language's relation names

See [examples.md](./examples.md) for complete working examples.
