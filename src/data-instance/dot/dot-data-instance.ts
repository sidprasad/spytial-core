import { Graph } from 'graphlib';
import parse from 'graphlib-dot';
import type {
  IAtom,
  IType,
  IRelation,
  IInputDataInstance,
  ITuple,
  DataInstanceEventType,
  DataInstanceEventListener,
  DataInstanceEvent,
  IDataInstance,
} from '../interfaces';

// ─── Type Configuration ────────────────────────────────────────────────────────

/**
 * Descriptor for a single type in the DOT type system.
 *
 * DOT has no native types, so these descriptors define the type hierarchy
 * that gets layered on top of raw DOT graph data.
 *
 * @example
 * ```typescript
 * const personType: DotTypeDescriptor = {
 *   extends: 'Entity',  // Person extends Entity
 *   isBuiltin: false,
 * };
 * ```
 */
export interface DotTypeDescriptor {
  /**
   * Parent type ID. Omit for root types.
   * @example 'Entity'
   */
  extends?: string;

  /**
   * Whether this is a built-in/primitive type.
   * Built-in types are special: they can be hidden in graph views and are
   * excluded from schema generation.
   * @default false
   */
  isBuiltin?: boolean;
}

/**
 * Configuration for the DOT data instance's type system.
 *
 * DOT graphs have no native type system. This config lets you layer one on:
 * - **Declare hierarchies**: `Student extends Person extends Entity`
 * - **Mark builtins**: `Int`, `String`, etc.
 * - **Set the default**: what type do untyped nodes get?
 *
 * **If omitted entirely**, all nodes get type `"Node"` with a flat hierarchy
 * and `isBuiltin = false`. This is fine for simple visualization — you only
 * need this config when you care about type-aware features like projections,
 * schema generation, or constraint validation.
 *
 * @example Minimal config — just declare a hierarchy
 * ```typescript
 * const typeConfig: DotTypeConfig = {
 *   types: {
 *     Entity: {},                          // root type
 *     Person: { extends: 'Entity' },
 *     Student: { extends: 'Person' },
 *   }
 * };
 * ```
 *
 * @example Full config — hierarchy, builtins, and custom default
 * ```typescript
 * const typeConfig: DotTypeConfig = {
 *   types: {
 *     Entity: {},
 *     Person: { extends: 'Entity' },
 *     Int: { isBuiltin: true },
 *     String: { isBuiltin: true },
 *   },
 *   defaultType: 'Entity',
 *   builtinTypes: ['Int', 'String'],
 * };
 * ```
 */
export interface DotTypeConfig {
  /**
   * Type hierarchy declarations.
   * Keys are type IDs, values describe parent and builtin status.
   *
   * Types referenced in `extends` that are not themselves declared get created
   * automatically as root types with `isBuiltin: false`.
   */
  types?: Record<string, DotTypeDescriptor>;

  /**
   * The default type assigned to nodes with no explicit `type` attribute.
   * @default 'Node'
   */
  defaultType?: string;

  /**
   * Additional type names that should be treated as built-in.
   * This is a convenience — you can also set `isBuiltin: true` on individual
   * type descriptors. Both methods are merged.
   */
  builtinTypes?: string[];
}

/**
 * Options for constructing a DotDataInstance.
 */
export interface DotDataInstanceOptions {
  /**
   * Type configuration. If omitted, all nodes get type "Node".
   * See {@link DotTypeConfig} for full documentation.
   */
  typeConfig?: DotTypeConfig;

  /**
   * How to extract a node's type from the parsed DOT graph.
   *
   * - `'attribute'` (default): Read the `type` attribute on each node.
   *   e.g. `n1 [label="Alice" type="Person"]`
   *
   * - `'subgraph'`: Infer type from subgraph membership.
   *   Nodes inside `subgraph cluster_Person { ... }` get type `"Person"`.
   *   (The `cluster_` prefix is stripped.)
   *
   * - `'attribute+subgraph'`: Try attribute first, fall back to subgraph.
   */
  typeExtraction?: 'attribute' | 'subgraph' | 'attribute+subgraph';

  /**
   * The node attribute that holds the type name.
   * Only relevant when `typeExtraction` includes `'attribute'`.
   * @default 'type'
   */
  typeAttribute?: string;

  /**
   * The relation name used for edges that have no `label` attribute.
   * @default 'edge'
   */
  defaultRelationName?: string;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Standard edge name format. Used consistently for constructor-parsed edges
 * AND programmatically-added edges.
 */
function makeEdgeName(source: string, target: string, label: string): string {
  return `${source}→${target}:${label}`;
}

/**
 * Compute the full type hierarchy array for a type, walking up `extends` chains.
 * Returns `[self, parent, grandparent, …, root]`.
 *
 * Detects cycles and caps at a reasonable depth.
 */
function computeTypeHierarchy(
  typeId: string,
  descriptors: Record<string, DotTypeDescriptor>,
): string[] {
  const hierarchy: string[] = [typeId];
  const visited = new Set<string>([typeId]);
  let current = typeId;

  while (descriptors[current]?.extends) {
    const parent = descriptors[current].extends!;
    if (visited.has(parent)) {
      // Cycle detected — stop.
      break;
    }
    hierarchy.push(parent);
    visited.add(parent);
    current = parent;
  }

  return hierarchy;
}

/** Escape double quotes in DOT attribute values. */
function escapeLabel(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── DotDataInstance ───────────────────────────────────────────────────────────

/**
 * A robust `IInputDataInstance` backed by a DOT graph.
 *
 * ## Core DOT subset
 * Supports `digraph` and `graph` declarations, nodes with attributes,
 * labeled edges (label → relation name), and subgraphs.
 *
 * ## The types story
 *
 * DOT has no native type system. This implementation bridges DOT to the
 * `IDataInstance` type model with three layers:
 *
 * 1. **Type extraction** — each node's type is read from:
 *    - A node attribute (default: `type`), e.g. `n1 [type="Person"]`
 *    - Subgraph membership, e.g. `subgraph cluster_Person { n1 }`
 *    - Fallback: the configured `defaultType` (default: `"Node"`)
 *
 * 2. **Type hierarchy** — declared via {@link DotTypeConfig}:
 *    ```
 *    Student extends Person extends Entity
 *    → IType.types = ["Student", "Person", "Entity"]
 *    ```
 *    If no config is provided, every type has a flat hierarchy `[typeName]`.
 *
 * 3. **Built-in types** — opt-in via config. By default nothing is built-in.
 *    Built-in types can be hidden in graph views and excluded from schemas.
 *
 * ## Defaults (what DOT doesn't have to provide)
 *
 * | Feature              | Default                           |
 * |----------------------|-----------------------------------|
 * | Node type            | `"Node"`                          |
 * | Type hierarchy       | Flat: `[typeName]`                |
 * | `isBuiltin`          | `false` for all types             |
 * | Unlabeled edge name  | `"edge"`                          |
 * | Node label           | Node ID (if no `label` attribute) |
 *
 * @example Simplest usage — no config needed
 * ```typescript
 * const inst = new DotDataInstance('digraph { a -> b; b -> c; }');
 * inst.getAtoms();     // [{id:"a",type:"Node",label:"a"}, ...]
 * inst.getRelations(); // [{id:"edge",name:"edge",types:["Node","Node"],tuples:[...]}]
 * inst.getTypes();     // [{id:"Node",types:["Node"],atoms:[...],isBuiltin:false}]
 * ```
 *
 * @example With type annotations in DOT
 * ```typescript
 * const dot = `digraph {
 *   alice [label="Alice" type="Person"];
 *   bob   [label="Bob"   type="Person"];
 *   cs101 [label="CS 101" type="Course"];
 *   alice -> cs101 [label="enrolled"];
 *   bob   -> cs101 [label="enrolled"];
 * }`;
 * const inst = new DotDataInstance(dot);
 * inst.getTypes(); // Person and Course types, flat hierarchies
 * ```
 *
 * @example With full type config
 * ```typescript
 * const inst = new DotDataInstance(dot, {
 *   typeConfig: {
 *     types: {
 *       Entity: {},
 *       Person: { extends: 'Entity' },
 *       Course: { extends: 'Entity' },
 *       Int:    { isBuiltin: true },
 *     },
 *     defaultType: 'Entity',
 *   },
 * });
 * // Person type hierarchy: ["Person", "Entity"]
 * // Int type: isBuiltin = true
 * ```
 */
export class DotDataInstance implements IInputDataInstance {
  // ── Internal state ──────────────────────────────────────────────────────

  /** The source-of-truth graph, mutated only by add/remove operations. */
  private graph: Graph;

  /** Resolved options (with defaults applied). */
  private readonly opts: Required<DotDataInstanceOptions>;

  /** Resolved type descriptors (merged from config + auto-created). */
  private typeDescriptors: Record<string, DotTypeDescriptor>;

  /** Resolved set of built-in type names. */
  private builtinTypeNames: Set<string>;

  /**
   * Internal type registry. Keyed by type ID.
   * Maintained incrementally — updated on addAtom/removeAtom.
   */
  private typeRegistry = new Map<string, { atoms: Set<string> }>();

  /** Internal atom map for O(1) lookup. */
  private atomMap = new Map<string, IAtom>();

  /** Maps nodeId → subgraph-inferred type (populated during construction). */
  private subgraphTypeMap = new Map<string, string>();

  /** Event listeners for data instance changes. */
  private eventListeners = new Map<DataInstanceEventType, Set<DataInstanceEventListener>>();

  // ── Constructor ─────────────────────────────────────────────────────────

  constructor(dotSpec: string, options?: DotDataInstanceOptions) {
    // Resolve options with defaults.
    this.opts = {
      typeConfig: options?.typeConfig ?? {},
      typeExtraction: options?.typeExtraction ?? 'attribute',
      typeAttribute: options?.typeAttribute ?? 'type',
      defaultRelationName: options?.defaultRelationName ?? 'edge',
    };

    // Build the resolved type descriptors.
    const rawDescriptors = this.opts.typeConfig.types ?? {};
    this.typeDescriptors = { ...rawDescriptors };

    // Auto-create any types referenced in `extends` but not declared.
    for (const desc of Object.values(rawDescriptors)) {
      if (desc.extends && !this.typeDescriptors[desc.extends]) {
        this.typeDescriptors[desc.extends] = {};
      }
    }

    // Build the builtin set.
    this.builtinTypeNames = new Set<string>(this.opts.typeConfig.builtinTypes ?? []);
    for (const [id, desc] of Object.entries(this.typeDescriptors)) {
      if (desc.isBuiltin) {
        this.builtinTypeNames.add(id);
      }
    }

    // Parse the DOT graph.
    this.graph = parse.read(dotSpec);

    // Build the subgraph type map (for 'subgraph' extraction mode).
    if (
      this.opts.typeExtraction === 'subgraph' ||
      this.opts.typeExtraction === 'attribute+subgraph'
    ) {
      this.buildSubgraphTypeMap();
    }

    // Normalize edges: ensure consistent naming.
    // graphlib-dot parses edges without predictable names; we re-add them with our standard name.
    const parsedEdges = this.graph.edges();
    for (const edge of parsedEdges) {
      const edgeData = this.graph.edge(edge);
      const label =
        typeof edgeData === 'object' && edgeData?.label
          ? edgeData.label
          : typeof edgeData === 'string'
            ? edgeData
            : this.opts.defaultRelationName;

      // Remove and re-add with standard name.
      this.graph.removeEdge(edge);
      const name = makeEdgeName(edge.v, edge.w, label);
      this.graph.setEdge(edge.v, edge.w, label, name);
    }

    // Populate internal atom & type registries from parsed nodes.
    for (const nodeId of this.graph.nodes()) {
      const nodeData = this.graph.node(nodeId) ?? {};
      const type = this.resolveNodeType(nodeId, nodeData);
      const label =
        typeof nodeData === 'object' && nodeData.label
          ? nodeData.label
          : nodeId;

      const atom: IAtom = { id: nodeId, type, label };
      this.atomMap.set(nodeId, atom);
      this.registerAtomType(nodeId, type);
    }
  }

  // ── Type resolution ─────────────────────────────────────────────────────

  /**
   * Determine a node's type based on the extraction strategy and available data.
   */
  private resolveNodeType(
    nodeId: string,
    nodeData: Record<string, unknown>,
  ): string {
    const defaultType = this.opts.typeConfig.defaultType ?? 'Node';

    if (
      this.opts.typeExtraction === 'attribute' ||
      this.opts.typeExtraction === 'attribute+subgraph'
    ) {
      const attrType = nodeData?.[this.opts.typeAttribute];
      if (typeof attrType === 'string' && attrType.length > 0) {
        return attrType;
      }
    }

    if (
      this.opts.typeExtraction === 'subgraph' ||
      this.opts.typeExtraction === 'attribute+subgraph'
    ) {
      const subgraphType = this.subgraphTypeMap.get(nodeId);
      if (subgraphType) {
        return subgraphType;
      }
    }

    return defaultType;
  }

  /**
   * Build the subgraph → type map by inspecting the parsed graph's compound structure.
   * Convention: `subgraph cluster_Person { ... }` → nodes get type "Person".
   * The `cluster_` prefix is stripped.
   */
  private buildSubgraphTypeMap(): void {
    // graphlib compound graphs expose parent() for each node.
    if (!this.graph.isCompound()) return;

    for (const nodeId of this.graph.nodes()) {
      const parent = this.graph.parent(nodeId);
      if (parent) {
        const typeName = parent.startsWith('cluster_')
          ? parent.slice('cluster_'.length)
          : parent;
        this.subgraphTypeMap.set(nodeId, typeName);
      }
    }
  }

  /**
   * Register an atom in the type registry. Creates the type entry if needed.
   */
  private registerAtomType(atomId: string, typeId: string): void {
    let entry = this.typeRegistry.get(typeId);
    if (!entry) {
      entry = { atoms: new Set() };
      this.typeRegistry.set(typeId, entry);
      // Auto-register the type descriptor if not already known.
      if (!this.typeDescriptors[typeId]) {
        this.typeDescriptors[typeId] = {};
      }
    }
    entry.atoms.add(atomId);
  }

  /**
   * Unregister an atom from the type registry.
   */
  private unregisterAtomType(atomId: string, typeId: string): void {
    const entry = this.typeRegistry.get(typeId);
    if (entry) {
      entry.atoms.delete(atomId);
      // Don't remove the type entry even if empty — the type still exists in the schema.
    }
  }

  /**
   * Build the full `IType` for a type ID from the internal registry.
   */
  private buildIType(typeId: string): IType {
    const hierarchy = computeTypeHierarchy(typeId, this.typeDescriptors);
    const entry = this.typeRegistry.get(typeId);
    const atoms: IAtom[] = [];
    if (entry) {
      for (const atomId of entry.atoms) {
        const atom = this.atomMap.get(atomId);
        if (atom) atoms.push(atom);
      }
    }

    return {
      id: typeId,
      types: hierarchy,
      atoms,
      isBuiltin: this.builtinTypeNames.has(typeId),
    };
  }

  // ── IDataInstance implementation ────────────────────────────────────────

  getAtoms(): readonly IAtom[] {
    return Array.from(this.atomMap.values());
  }

  getAtomType(id: string): IType {
    const atom = this.atomMap.get(id);
    if (!atom) {
      throw new Error(`Atom with id "${id}" not found`);
    }
    return this.buildIType(atom.type);
  }

  getTypes(): readonly IType[] {
    const types: IType[] = [];
    for (const typeId of this.typeRegistry.keys()) {
      types.push(this.buildIType(typeId));
    }
    return types;
  }

  getRelations(): readonly IRelation[] {
    const relationMap = new Map<
      string,
      { types: Set<string>[]; tuples: ITuple[] }
    >();

    for (const edge of this.graph.edges()) {
      const label = this.graph.edge(edge) ?? this.opts.defaultRelationName;
      const sourceAtom = this.atomMap.get(edge.v);
      const targetAtom = this.atomMap.get(edge.w);

      if (!sourceAtom || !targetAtom) continue;

      const tuple: ITuple = {
        atoms: [edge.v, edge.w],
        types: [sourceAtom.type, targetAtom.type],
      };

      if (!relationMap.has(label)) {
        relationMap.set(label, {
          types: [new Set<string>(), new Set<string>()],
          tuples: [],
        });
      }

      const rel = relationMap.get(label)!;
      rel.tuples.push(tuple);
      rel.types[0].add(sourceAtom.type);
      rel.types[1].add(targetAtom.type);
    }

    const relations: IRelation[] = [];
    for (const [id, data] of relationMap) {
      relations.push({
        id,
        name: id,
        // Union of all types that appear in each column position.
        types: data.types.map((s) => Array.from(s).join('|')),
        tuples: data.tuples,
      });
    }
    return relations;
  }

  /**
   * Apply type-aware projections: keep only the specified atoms and their
   * connecting edges. Returns a **new** DotDataInstance (does not mutate this one).
   */
  applyProjections(atomIds: string[]): DotDataInstance {
    const keepSet = new Set(atomIds);

    // Build a new DOT string from the projected subset.
    const isDirected = this.graph.isDirected();
    const lines: string[] = [];
    lines.push(isDirected ? 'digraph {' : 'graph {');

    // Emit kept nodes with their attributes.
    for (const id of atomIds) {
      const atom = this.atomMap.get(id);
      if (!atom) continue;
      const nodeData = this.graph.node(id);
      const attrs: string[] = [];
      attrs.push(`label="${escapeLabel(atom.label)}"`);
      attrs.push(`${this.opts.typeAttribute}="${escapeLabel(atom.type)}"`);
      // Preserve other DOT attributes.
      if (typeof nodeData === 'object' && nodeData !== null) {
        for (const [k, v] of Object.entries(nodeData)) {
          if (k === 'label' || k === this.opts.typeAttribute) continue;
          attrs.push(`${k}="${escapeLabel(String(v))}"`);
        }
      }
      lines.push(`  "${escapeLabel(id)}" [${attrs.join(', ')}];`);
    }

    // Emit kept edges.
    const edgeOp = isDirected ? '->' : '--';
    for (const edge of this.graph.edges()) {
      if (keepSet.has(edge.v) && keepSet.has(edge.w)) {
        const label = this.graph.edge(edge) ?? this.opts.defaultRelationName;
        lines.push(
          `  "${escapeLabel(edge.v)}" ${edgeOp} "${escapeLabel(edge.w)}" [label="${escapeLabel(label)}"];`,
        );
      }
    }

    lines.push('}');

    return new DotDataInstance(lines.join('\n'), {
      ...this.opts,
    });
  }

  /**
   * Generate a graphlib Graph for visualization.
   *
   * **Does NOT mutate the internal graph.** Returns a fresh copy with
   * disconnected nodes optionally removed.
   */
  generateGraph(
    hideDisconnected: boolean,
    hideDisconnectedBuiltIns: boolean,
  ): Graph {
    const out = new Graph({
      directed: this.graph.isDirected(),
      multigraph: this.graph.isMultigraph(),
      compound: this.graph.isCompound(),
    });

    // Copy nodes.
    for (const nodeId of this.graph.nodes()) {
      const atom = this.atomMap.get(nodeId);
      if (!atom) continue;
      out.setNode(nodeId, {
        label: atom.label,
        type: atom.type,
      });
    }

    // Copy edges.
    for (const edge of this.graph.edges()) {
      out.setEdge(edge.v, edge.w, this.graph.edge(edge), edge.name);
    }

    // Optionally remove disconnected nodes (from the COPY, not the source graph).
    if (hideDisconnected || hideDisconnectedBuiltIns) {
      for (const nodeId of out.nodes()) {
        const inEdges = out.inEdges(nodeId) ?? [];
        const outEdges = out.outEdges(nodeId) ?? [];
        if (inEdges.length === 0 && outEdges.length === 0) {
          const atom = this.atomMap.get(nodeId);
          const isBuiltin = atom
            ? this.builtinTypeNames.has(atom.type)
            : false;

          if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
            out.removeNode(nodeId);
          }
        }
      }
    }

    return out;
  }

  // ── IInputDataInstance implementation ───────────────────────────────────

  addAtom(atom: IAtom): void {
    if (this.atomMap.has(atom.id)) {
      throw new Error(`Atom with id "${atom.id}" already exists`);
    }

    // Add to graphlib.
    this.graph.setNode(atom.id, {
      label: atom.label,
      [this.opts.typeAttribute]: atom.type,
    });

    // Add to internal registries.
    this.atomMap.set(atom.id, atom);
    this.registerAtomType(atom.id, atom.type);

    this.emitEvent({ type: 'atomAdded', data: { atom } });
  }

  removeAtom(id: string): void {
    const atom = this.atomMap.get(id);
    if (!atom) {
      throw new Error(`Atom with id "${id}" does not exist`);
    }

    // graphlib.removeNode also removes all incident edges.
    this.graph.removeNode(id);

    // Clean up internal registries.
    this.atomMap.delete(id);
    this.unregisterAtomType(id, atom.type);

    this.emitEvent({ type: 'atomRemoved', data: { atomId: id } });
  }

  addRelationTuple(relationId: string, t: ITuple): void {
    if (t.atoms.length < 2) {
      throw new Error('Tuple must have at least 2 atoms');
    }

    const source = t.atoms[0];
    const target = t.atoms[t.atoms.length - 1];
    const name = makeEdgeName(source, target, relationId);

    if (this.graph.hasEdge(source, target, name)) {
      throw new Error(
        `Relation tuple "${relationId}" from "${source}" to "${target}" already exists`,
      );
    }

    this.graph.setEdge(source, target, relationId, name);

    this.emitEvent({
      type: 'relationTupleAdded',
      data: { relationId, tuple: t },
    });
  }

  removeRelationTuple(relationId: string, t: ITuple): void {
    if (t.atoms.length < 2) {
      throw new Error('Tuple must have at least 2 atoms');
    }

    const source = t.atoms[0];
    const target = t.atoms[t.atoms.length - 1];
    const name = makeEdgeName(source, target, relationId);

    if (!this.graph.hasEdge(source, target, name)) {
      throw new Error(
        `Relation tuple "${relationId}" from "${source}" to "${target}" does not exist`,
      );
    }

    this.graph.removeEdge(source, target, name);

    this.emitEvent({
      type: 'relationTupleRemoved',
      data: { relationId, tuple: t },
    });
  }

  addEventListener(
    type: DataInstanceEventType,
    listener: DataInstanceEventListener,
  ): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: DataInstanceEventType,
    listener: DataInstanceEventListener,
  ): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  private emitEvent(event: DataInstanceEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in data instance event listener:', error);
        }
      }
    }
  }

  /**
   * Serialize back to DOT format.
   * Preserves type annotations as node attributes and edge labels as relation names.
   */
  reify(): string {
    const isDirected = this.graph.isDirected();
    const lines: string[] = [];
    lines.push(isDirected ? 'digraph {' : 'graph {');

    // Emit nodes with full attributes.
    for (const [id, atom] of this.atomMap) {
      const attrs: string[] = [];
      attrs.push(`label="${escapeLabel(atom.label)}"`);
      attrs.push(`${this.opts.typeAttribute}="${escapeLabel(atom.type)}"`);

      // Preserve any extra graphlib node attributes.
      const nodeData = this.graph.node(id);
      if (typeof nodeData === 'object' && nodeData !== null) {
        for (const [k, v] of Object.entries(nodeData)) {
          if (k === 'label' || k === this.opts.typeAttribute) continue;
          attrs.push(`${k}="${escapeLabel(String(v))}"`);
        }
      }

      lines.push(`  "${escapeLabel(id)}" [${attrs.join(', ')}];`);
    }

    // Emit edges.
    const edgeOp = isDirected ? '->' : '--';
    for (const edge of this.graph.edges()) {
      const label = this.graph.edge(edge) ?? this.opts.defaultRelationName;
      lines.push(
        `  "${escapeLabel(edge.v)}" ${edgeOp} "${escapeLabel(edge.w)}" [label="${escapeLabel(label)}"];`,
      );
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Add atoms and relations from another data instance.
   *
   * When `unifyBuiltIns` is true, atoms whose type is built-in and whose label
   * matches an existing atom's label are merged (not duplicated).
   *
   * @returns true if the merge succeeded without conflicts, false otherwise.
   */
  addFromDataInstance(
    dataInstance: IDataInstance,
    unifyBuiltIns: boolean,
  ): boolean {
    const idRemap = new Map<string, string>();
    let hasConflict = false;

    // Phase 1: Register types from the source.
    for (const srcType of dataInstance.getTypes()) {
      if (!this.typeDescriptors[srcType.id]) {
        // Import the hierarchy: if the source type has a parent, register it.
        if (srcType.types.length > 1) {
          this.typeDescriptors[srcType.id] = {
            extends: srcType.types[1],
            isBuiltin: srcType.isBuiltin,
          };
        } else {
          this.typeDescriptors[srcType.id] = {
            isBuiltin: srcType.isBuiltin,
          };
        }
        if (srcType.isBuiltin) {
          this.builtinTypeNames.add(srcType.id);
        }
      }
    }

    // Phase 2: Add atoms.
    for (const srcAtom of dataInstance.getAtoms()) {
      const isBuiltin = this.builtinTypeNames.has(srcAtom.type);

      if (unifyBuiltIns && isBuiltin) {
        // Find existing atom with same label and type to unify with.
        const existing = Array.from(this.atomMap.values()).find(
          (a) => a.type === srcAtom.type && a.label === srcAtom.label,
        );
        if (existing) {
          idRemap.set(srcAtom.id, existing.id);
          continue;
        }
      }

      if (this.atomMap.has(srcAtom.id)) {
        // Conflict: atom ID already exists. Remap with a suffix.
        let newId = srcAtom.id;
        let counter = 1;
        while (this.atomMap.has(newId)) {
          newId = `${srcAtom.id}_${counter++}`;
        }
        idRemap.set(srcAtom.id, newId);
        hasConflict = true;
        this.addAtom({ ...srcAtom, id: newId });
      } else {
        idRemap.set(srcAtom.id, srcAtom.id);
        this.addAtom(srcAtom);
      }
    }

    // Phase 3: Add relation tuples.
    for (const srcRel of dataInstance.getRelations()) {
      for (const tuple of srcRel.tuples) {
        const remappedAtoms = tuple.atoms.map(
          (a) => idRemap.get(a) ?? a,
        );
        const remappedTuple: ITuple = {
          atoms: remappedAtoms,
          types: tuple.types,
        };

        try {
          this.addRelationTuple(srcRel.id, remappedTuple);
        } catch {
          // Duplicate tuple — skip.
          hasConflict = true;
        }
      }
    }

    return !hasConflict;
  }

  // ── Convenience accessors ──────────────────────────────────────────────

  /**
   * Get the resolved type descriptor map (including auto-created types).
   * Useful for debugging the type hierarchy.
   */
  getTypeDescriptors(): Readonly<Record<string, DotTypeDescriptor>> {
    return this.typeDescriptors;
  }

  /**
   * Check if a type is an ancestor of another type.
   *
   * @example
   * ```typescript
   * inst.typeIsOfType('Student', 'Entity'); // true if Student extends ... extends Entity
   * ```
   */
  typeIsOfType(typeId: string, potentialAncestor: string): boolean {
    const hierarchy = computeTypeHierarchy(typeId, this.typeDescriptors);
    return hierarchy.includes(potentialAncestor);
  }

  /**
   * Get the top-level (most general) type for a given type.
   */
  getTopLevelTypeId(typeId: string): string {
    const hierarchy = computeTypeHierarchy(typeId, this.typeDescriptors);
    return hierarchy[hierarchy.length - 1];
  }

  /**
   * Get the number of nodes in the graph.
   */
  get nodeCount(): number {
    return this.atomMap.size;
  }

  /**
   * Get the number of edges in the graph.
   */
  get edgeCount(): number {
    return this.graph.edgeCount();
  }
}
  
