/**
 * SpecDocument — the single source of truth for the Spytial spec editor.
 *
 * Holds the parsed spec (constraints, directives, preserved comments/unknown
 * nodes) and exposes mutation methods that each record exactly one undo step,
 * a full undo/redo history stack, change events via `subscribe`, and
 * round-trippable YAML via `toYaml`/`fromYaml`/`replaceFromYaml`.
 *
 * Invariants:
 *  - Every mutation that changes state pushes the prior state onto the undo
 *    stack and clears the redo stack.
 *  - `replaceFromYaml` throws `SpecParseError` (with line/column) on bad YAML
 *    WITHOUT mutating state.
 *  - `getState()` returns a frozen snapshot; callers cannot mutate internals.
 *  - Round-trip: `SpecDocument.fromYaml(doc.toYaml())` is semantically identical
 *    (params, comments, unknown nodes).
 *
 * This module is framework-agnostic — no React.
 */

import {
  defaultParamsFor,
  getDefinition,
} from './registry';
import {
  parseYamlToState,
  serializeStateToYaml,
  SpecParseError,
} from './yaml-codec';
import { validateState } from './diagnostics';
import { newId } from './id';
import type {
  Diagnostic,
  ItemKind,
  SpecDocumentState,
  SpecItem,
} from './types';
import type { DomainSchema } from '../domain/domain-schema';

export { SpecParseError } from './yaml-codec';

type Listener = (state: SpecDocumentState) => void;

/**
 * Normalize a comment to its round-trip-stable form: trim each line, drop
 * blank lines, and return undefined for an empty result. The YAML codec emits
 * one `# <line>` per line and trims on parse, so storing the trimmed form keeps
 * `fromYaml(toYaml(doc))` byte-stable.
 */
function normalizeComment(comment: string | undefined): string | undefined {
  if (comment === undefined) {
    return undefined;
  }
  const lines = comment
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

// ---- deep clone (state is plain JSON-ish data: strings/numbers/bools/arrays/maps) ----

function cloneItem(item: SpecItem): SpecItem {
  return {
    id: item.id,
    kind: item.kind,
    type: item.type,
    params: cloneValue(item.params) as Record<string, unknown>,
    ...(item.comment !== undefined ? { comment: item.comment } : {}),
    ...(item.raw !== undefined ? { raw: cloneValue(item.raw) } : {}),
  };
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => cloneValue(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = cloneValue(v);
    }
    return out;
  }
  return value;
}

function cloneState(state: SpecDocumentState): SpecDocumentState {
  return {
    constraints: state.constraints.map(cloneItem),
    directives: state.directives.map(cloneItem),
    ...(state.headerComment !== undefined ? { headerComment: state.headerComment } : {}),
    ...(state.otherSections !== undefined
      ? {
          otherSections: state.otherSections.map((section) => ({
            key: section.key,
            value: cloneValue(section.value),
          })),
        }
      : {}),
  };
}

function freezeState(state: SpecDocumentState): Readonly<SpecDocumentState> {
  state.constraints.forEach((i) => {
    Object.freeze(i.params);
    Object.freeze(i);
  });
  state.directives.forEach((i) => {
    Object.freeze(i.params);
    Object.freeze(i);
  });
  Object.freeze(state.constraints);
  Object.freeze(state.directives);
  if (state.otherSections !== undefined) {
    state.otherSections.forEach((section) => Object.freeze(section));
    Object.freeze(state.otherSections);
  }
  return Object.freeze(state);
}

export class SpecDocument {
  private state: SpecDocumentState;
  private readonly undoStack: SpecDocumentState[] = [];
  private readonly redoStack: SpecDocumentState[] = [];
  private readonly listeners = new Set<Listener>();
  /** cached frozen view of `state`, invalidated on every mutation */
  private frozen?: Readonly<SpecDocumentState>;

  constructor(state?: SpecDocumentState) {
    this.state = state ? cloneState(state) : { constraints: [], directives: [] };
  }

  /** Parse YAML into a new document. Throws `SpecParseError` with line info. */
  static fromYaml(yaml: string): SpecDocument {
    const state = parseYamlToState(yaml);
    return new SpecDocument(state);
  }

  /** Deterministic, comment-preserving YAML for the current state. */
  toYaml(): string {
    return serializeStateToYaml(this.state);
  }

  /** A frozen snapshot of the current state (safe to hand to React). */
  getState(): Readonly<SpecDocumentState> {
    if (!this.frozen) {
      this.frozen = freezeState(cloneState(this.state));
    }
    return this.frozen;
  }

  // ---- mutations (each records one undo step) ----------------------------

  /** Add a new item of `type` (params seeded from FieldSpec defaults). */
  addItem(kind: ItemKind, type: string): SpecItem {
    const def = getDefinition(type);
    if (!def) {
      throw new Error(`Cannot add unknown ${kind} type "${type}".`);
    }
    if (def.kind !== kind) {
      throw new Error(
        `Type "${type}" is a ${def.kind}, not a ${kind}.`,
      );
    }
    this.pushUndo();
    const item: SpecItem = {
      id: newId(),
      kind,
      type,
      params: defaultParamsFor(type),
    };
    if (kind === 'constraint') {
      this.state.constraints.push(item);
    } else {
      this.state.directives.push(item);
    }
    this.commit();
    return cloneItem(item);
  }

  /**
   * Patch an item's params/comment/type. `params` is shallow-merged into the
   * existing params (set a key to `undefined` to remove it). Changing `type`
   * does NOT reset params — the caller is responsible for supplying compatible
   * params (the builder reseeds defaults on type change at the UI layer).
   */
  updateItem(
    id: string,
    patch: Partial<Pick<SpecItem, 'params' | 'comment' | 'type'>>,
  ): void {
    const found = this.find(id);
    if (!found) {
      return;
    }
    this.pushUndo();
    const { item } = found;
    if (patch.type !== undefined) {
      item.type = patch.type;
    }
    if (patch.params !== undefined) {
      const merged: Record<string, unknown> = { ...item.params };
      for (const [key, value] of Object.entries(patch.params)) {
        if (value === undefined) {
          delete merged[key];
        } else {
          merged[key] = value;
        }
      }
      item.params = merged;
    }
    if ('comment' in patch) {
      // Normalize so the stored comment matches what survives a YAML round trip
      // (the codec trims each comment line on parse). Empty -> no comment.
      const normalized = normalizeComment(patch.comment);
      if (normalized === undefined) {
        delete item.comment;
      } else {
        item.comment = normalized;
      }
    }
    this.commit();
  }

  /**
   * Duplicate an item in place: a deep params/comment copy with a fresh id,
   * inserted directly after the original. ONE undo step — composing
   * addItem + updateItem + moveItem at the UI layer recorded three, so a
   * single Undo after Duplicate left a half-reverted copy behind (PR review
   * finding). Returns the clone, or null if the id is unknown.
   */
  duplicateItem(id: string): SpecItem | null {
    const found = this.find(id);
    if (!found) {
      return null;
    }
    this.pushUndo();
    const copy: SpecItem = { ...cloneItem(found.item), id: newId() };
    const list =
      found.kind === 'constraint' ? this.state.constraints : this.state.directives;
    list.splice(found.index + 1, 0, copy);
    this.commit();
    return cloneItem(copy);
  }

  /** Remove an item by id. No-op if not found. */
  removeItem(id: string): void {
    const found = this.find(id);
    if (!found) {
      return;
    }
    this.pushUndo();
    const list =
      found.kind === 'constraint' ? this.state.constraints : this.state.directives;
    list.splice(found.index, 1);
    this.commit();
  }

  /**
   * Move an item to `toIndex` within its own section (constraints or
   * directives). `toIndex` is clamped to a valid range.
   */
  moveItem(id: string, toIndex: number): void {
    const found = this.find(id);
    if (!found) {
      return;
    }
    const list =
      found.kind === 'constraint' ? this.state.constraints : this.state.directives;
    const clamped = Math.max(0, Math.min(toIndex, list.length - 1));
    if (clamped === found.index) {
      return; // no-op move records no undo step
    }
    this.pushUndo();
    const [item] = list.splice(found.index, 1);
    list.splice(clamped, 0, item);
    this.commit();
  }

  /**
   * Replace the entire document from YAML (code-view edits). Throws
   * `SpecParseError` on parse error WITHOUT mutating state. On success this is
   * a single undo step.
   */
  replaceFromYaml(yaml: string): void {
    const next = parseYamlToState(yaml); // throws before any mutation
    this.pushUndo();
    this.state = next;
    this.commit();
  }

  // ---- history -----------------------------------------------------------

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) {
      return;
    }
    this.redoStack.push(cloneState(this.state));
    this.state = prev;
    this.commit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) {
      return;
    }
    this.undoStack.push(cloneState(this.state));
    this.state = next;
    this.commit();
  }

  // ---- validation --------------------------------------------------------

  /** Structural (+ domain, in WP2) diagnostics for the current state. */
  validate(domain?: DomainSchema): Diagnostic[] {
    return validateState(this.state, domain);
  }

  // ---- events ------------------------------------------------------------

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---- internals ---------------------------------------------------------

  private pushUndo(): void {
    this.undoStack.push(cloneState(this.state));
    this.redoStack.length = 0;
  }

  private commit(): void {
    this.frozen = undefined;
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private find(
    id: string,
  ): { item: SpecItem; index: number; kind: ItemKind } | undefined {
    const ci = this.state.constraints.findIndex((i) => i.id === id);
    if (ci !== -1) {
      return { item: this.state.constraints[ci], index: ci, kind: 'constraint' };
    }
    const di = this.state.directives.findIndex((i) => i.id === id);
    if (di !== -1) {
      return { item: this.state.directives[di], index: di, kind: 'directive' };
    }
    return undefined;
  }
}
