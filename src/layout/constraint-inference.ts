/**
 * Constraint Inference System
 * 
 * This module implements a synthesis system that infers spatial layout constraints
 * from user interactions and concrete node positions. Following the synthesis loop:
 * concrete → abstract → invariants → spec
 * 
 * Key concepts:
 * - UIAction: User interactions (drag, align button, etc.)
 * - Layout: Concrete positions of nodes after each action
 * - Predicate: Abstraction functions that convert positions to spatial facts
 * - AbstractFact: Spatial constraint with support/killed tracking
 * - TransferFunction: Updates facts based on action type
 */

import { LayoutNode } from "./interfaces";

/**
 * Pixel tolerance for spatial predicates.
 * Two positions within this distance are considered equal.
 */
export const DEFAULT_EPSILON = 5;

/**
 * Types of user interface actions that can trigger constraint inference.
 */
export type UIActionType = 
  | "drag"           // Dragging one or more nodes
  | "alignButton"    // Clicking align button (horizontal or vertical)
  | "distributeButton" // Clicking distribute button (horizontal or vertical)
  | "ringGesture"    // Gesture to create cyclic layout
  | "multiSelect";   // Selecting multiple nodes (no spatial change)

/**
 * Direction for alignment and distribution actions.
 */
export type ActionDirection = "horizontal" | "vertical";

/**
 * Represents a single user interaction event.
 */
export interface UIAction {
  /** Type of action performed */
  type: UIActionType;
  /** Timestamp when action occurred */
  timestamp: number;
  /** IDs of nodes affected by this action */
  atomIds: string[];
  /** Direction for align/distribute actions */
  direction?: ActionDirection;
}

/**
 * Concrete layout state at a specific point in time.
 * Maps node IDs to their x,y positions.
 */
export interface LayoutState {
  /** Timestamp of this layout state */
  timestamp: number;
  /** Map from node ID to position */
  positions: Map<string, { x: number; y: number }>;
}

/**
 * SpyTial primitive constraint types that can be inferred.
 */
export type PrimitiveType = 
  | "leftOf"      // a is to the left of b
  | "above"       // a is above b
  | "aligned_h"   // set S is horizontally aligned (same y)
  | "aligned_v"   // set S is vertically aligned (same x)
  | "ordered_h"   // set S maintains horizontal ordering
  | "ordered_v"   // set S maintains vertical ordering
  | "cyclic"      // set S forms a ring/cycle
  | "group";      // set S moves as a rigid body

/**
 * Abstract spatial fact/constraint with tracking information.
 */
export interface AbstractFact {
  /** Type of primitive constraint */
  type: PrimitiveType;
  /** Node IDs involved in this fact */
  atomIds: string[];
  /** Time indices where this fact held true */
  support: Set<number>;
  /** First time index where fact became false (undefined if still true) */
  killed?: number;
  /** Additional metadata specific to constraint type */
  metadata?: Record<string, unknown>;
}

/**
 * Result of applying a predicate at a specific time.
 */
export interface PredicateResult {
  /** Whether the predicate holds */
  holds: boolean;
  /** Optional metadata about the predicate evaluation */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration options for constraint inference.
 */
export interface InferenceConfig {
  /** Pixel tolerance for position comparisons */
  epsilon?: number;
  /** Minimum support count before considering a fact stable */
  minSupport?: number;
  /** Threshold for cyclic/ring detection (0-1) */
  cyclicThreshold?: number;
}

/**
 * Main class for constraint inference from user interactions.
 */
export class ConstraintInference {
  private epsilon: number;
  private minSupport: number;
  private cyclicThreshold: number;
  
  /** Trace of UI actions */
  private actions: UIAction[] = [];
  /** Layout states after each action */
  private layouts: LayoutState[] = [];
  /** Current set of abstract facts */
  private facts: Map<string, AbstractFact> = new Map();
  /** Currently selected nodes for set-level operations */
  private currentSelection: Set<string> = new Set();

  constructor(config: InferenceConfig = {}) {
    this.epsilon = config.epsilon ?? DEFAULT_EPSILON;
    this.minSupport = config.minSupport ?? 2;
    this.cyclicThreshold = config.cyclicThreshold ?? 0.8;
  }

  /**
   * Add a new UI action and layout state to the trace.
   * Automatically updates facts based on the action type.
   * 
   * @param action - The UI action performed
   * @param layout - The resulting layout state after the action
   */
  addAction(action: UIAction, layout: LayoutState): void {
    const timeIndex = this.actions.length;
    this.actions.push(action);
    this.layouts.push(layout);

    // Apply transfer function based on action type
    switch (action.type) {
      case "drag":
        this.handleDrag(action, timeIndex);
        break;
      case "alignButton":
        this.handleAlignButton(action, timeIndex);
        break;
      case "distributeButton":
        this.handleDistributeButton(action, timeIndex);
        break;
      case "ringGesture":
        this.handleRingGesture(action, timeIndex);
        break;
      case "multiSelect":
        this.handleMultiSelect(action, timeIndex);
        break;
    }
  }

  /**
   * Get all currently inferred facts.
   */
  getFacts(): AbstractFact[] {
    return Array.from(this.facts.values());
  }

  /**
   * Get facts that are currently stable (have sufficient support and not killed).
   */
  getStableFacts(): AbstractFact[] {
    return this.getFacts().filter(fact => 
      fact.support.size >= this.minSupport && fact.killed === undefined
    );
  }

  /**
   * Get the current layout state.
   */
  getCurrentLayout(): LayoutState | undefined {
    return this.layouts.length > 0 ? this.layouts[this.layouts.length - 1] : undefined;
  }

  /**
   * Clear all facts, actions, and layouts. Reset to initial state.
   */
  reset(): void {
    this.actions = [];
    this.layouts = [];
    this.facts.clear();
    this.currentSelection.clear();
  }

  // ============ Predicate Functions ============

  /**
   * Check if atom a is to the left of atom b at time t.
   * leftOf(a,b,t) := x[a,t] + ε < x[b,t]
   */
  private leftOf(a: string, b: string, t: number): PredicateResult {
    const layout = this.layouts[t];
    const posA = layout.positions.get(a);
    const posB = layout.positions.get(b);
    
    if (!posA || !posB) {
      return { holds: false };
    }
    
    return { holds: posA.x + this.epsilon < posB.x };
  }

  /**
   * Check if atom a is above atom b at time t.
   * above(a,b,t) := y[a,t] + ε < y[b,t]
   */
  private above(a: string, b: string, t: number): PredicateResult {
    const layout = this.layouts[t];
    const posA = layout.positions.get(a);
    const posB = layout.positions.get(b);
    
    if (!posA || !posB) {
      return { holds: false };
    }
    
    return { holds: posA.y + this.epsilon < posB.y };
  }

  /**
   * Check if set S is vertically aligned at time t.
   * aligned_v(S,t) := max{|x[a,t]-x[b,t]| : a,b∈S} ≤ ε
   */
  private alignedV(atomIds: string[], t: number): PredicateResult {
    const layout = this.layouts[t];
    const positions = atomIds.map(id => layout.positions.get(id)).filter(p => p !== undefined);
    
    if (positions.length < 2) {
      return { holds: false };
    }
    
    const xs = positions.map(p => p!.x);
    const maxDiff = Math.max(...xs) - Math.min(...xs);
    
    return { 
      holds: maxDiff <= this.epsilon,
      metadata: { maxDiff, avgX: xs.reduce((a, b) => a + b, 0) / xs.length }
    };
  }

  /**
   * Check if set S is horizontally aligned at time t.
   * aligned_h(S,t) := max{|y[a,t]-y[b,t]| : a,b∈S} ≤ ε
   */
  private alignedH(atomIds: string[], t: number): PredicateResult {
    const layout = this.layouts[t];
    const positions = atomIds.map(id => layout.positions.get(id)).filter(p => p !== undefined);
    
    if (positions.length < 2) {
      return { holds: false };
    }
    
    const ys = positions.map(p => p!.y);
    const maxDiff = Math.max(...ys) - Math.min(...ys);
    
    return { 
      holds: maxDiff <= this.epsilon,
      metadata: { maxDiff, avgY: ys.reduce((a, b) => a + b, 0) / ys.length }
    };
  }

  /**
   * Check if set S maintains horizontal ordering at time t.
   * ordered_h(S,t) := order_by_x(S,t) stable
   * 
   * This checks if the relative x-order of nodes is the same as in the previous state.
   */
  private orderedH(atomIds: string[], t: number): PredicateResult {
    if (t === 0 || atomIds.length < 2) {
      return { holds: true };
    }
    
    const currentLayout = this.layouts[t];
    const prevLayout = this.layouts[t - 1];
    
    // Get current and previous orderings
    const currentOrder = this.getHorizontalOrder(atomIds, currentLayout);
    const prevOrder = this.getHorizontalOrder(atomIds, prevLayout);
    
    // Check if orders match
    const holds = this.ordersMatch(currentOrder, prevOrder);
    
    return { holds };
  }

  /**
   * Check if set S maintains vertical ordering at time t.
   * ordered_v(S,t) := order_by_y(S,t) stable
   */
  private orderedV(atomIds: string[], t: number): PredicateResult {
    if (t === 0 || atomIds.length < 2) {
      return { holds: true };
    }
    
    const currentLayout = this.layouts[t];
    const prevLayout = this.layouts[t - 1];
    
    // Get current and previous orderings
    const currentOrder = this.getVerticalOrder(atomIds, currentLayout);
    const prevOrder = this.getVerticalOrder(atomIds, prevLayout);
    
    // Check if orders match
    const holds = this.ordersMatch(currentOrder, prevOrder);
    
    return { holds };
  }

  /**
   * Check if set S forms a cycle/ring at time t.
   * cyclic(S,t) := ring_score(S,t) ≥ τ
   * 
   * Ring score considers:
   * - Polygonality: how well nodes form a convex polygon
   * - Consistent circular order: nodes maintain order around center
   */
  private cyclic(atomIds: string[], t: number): PredicateResult {
    const layout = this.layouts[t];
    const positions = atomIds.map(id => layout.positions.get(id)).filter(p => p !== undefined);
    
    if (positions.length < 3) {
      return { holds: false };
    }
    
    const ringScore = this.computeRingScore(positions as Array<{ x: number; y: number }>);
    
    return { 
      holds: ringScore >= this.cyclicThreshold,
      metadata: { ringScore }
    };
  }

  /**
   * Check if set S moved as a rigid body at time t.
   * group(S,t) := S moved with identical translation within ε
   */
  private group(atomIds: string[], t: number): PredicateResult {
    if (t === 0 || atomIds.length < 2) {
      return { holds: false };
    }
    
    const currentLayout = this.layouts[t];
    const prevLayout = this.layouts[t - 1];
    
    // Compute translation for each atom
    const translations: Array<{ dx: number; dy: number }> = [];
    
    for (const id of atomIds) {
      const curr = currentLayout.positions.get(id);
      const prev = prevLayout.positions.get(id);
      
      if (!curr || !prev) {
        return { holds: false };
      }
      
      translations.push({ dx: curr.x - prev.x, dy: curr.y - prev.y });
    }
    
    // Check if all translations are approximately equal
    const firstTrans = translations[0];
    const allEqual = translations.every(trans => 
      Math.abs(trans.dx - firstTrans.dx) <= this.epsilon &&
      Math.abs(trans.dy - firstTrans.dy) <= this.epsilon
    );
    
    return { 
      holds: allEqual,
      metadata: { translation: firstTrans }
    };
  }

  // ============ Helper Functions ============

  /**
   * Get horizontal ordering of atoms (sorted by x coordinate).
   */
  private getHorizontalOrder(atomIds: string[], layout: LayoutState): string[] {
    return [...atomIds].sort((a, b) => {
      const posA = layout.positions.get(a);
      const posB = layout.positions.get(b);
      if (!posA || !posB) return 0;
      return posA.x - posB.x;
    });
  }

  /**
   * Get vertical ordering of atoms (sorted by y coordinate).
   */
  private getVerticalOrder(atomIds: string[], layout: LayoutState): string[] {
    return [...atomIds].sort((a, b) => {
      const posA = layout.positions.get(a);
      const posB = layout.positions.get(b);
      if (!posA || !posB) return 0;
      return posA.y - posB.y;
    });
  }

  /**
   * Check if two orderings match.
   */
  private ordersMatch(order1: string[], order2: string[]): boolean {
    if (order1.length !== order2.length) return false;
    return order1.every((id, i) => id === order2[i]);
  }

  /**
   * Compute ring score for a set of positions.
   * Higher score means positions form a better ring/cycle.
   */
  private computeRingScore(positions: Array<{ x: number; y: number }>): number {
    if (positions.length < 3) return 0;
    
    // Compute center of mass
    const center = {
      x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
      y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length
    };
    
    // Compute angles from center
    const angles = positions.map(p => Math.atan2(p.y - center.y, p.x - center.x));
    
    // Sort by angle to get circular order
    const sortedIndices = Array.from({ length: positions.length }, (_, i) => i).sort((i, j) => angles[i] - angles[j]);
    
    // Compute distances from center
    const distances = positions.map(p => 
      Math.sqrt(Math.pow(p.x - center.x, 2) + Math.pow(p.y - center.y, 2))
    );
    
    // Compute variance in distances (lower is better)
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDist, 2), 0) / distances.length;
    const normalizedVariance = variance / (avgDist * avgDist + 1);
    
    // Polygonality score: inverse of normalized variance
    const polygonality = 1 - Math.min(normalizedVariance, 1);
    
    // Angle uniformity: how evenly spaced the angles are
    const expectedAngleDiff = (2 * Math.PI) / positions.length;
    const angleDiffs = sortedIndices.map((_, i) => {
      const nextIdx = (i + 1) % sortedIndices.length;
      let diff = angles[sortedIndices[nextIdx]] - angles[sortedIndices[i]];
      if (diff < 0) diff += 2 * Math.PI;
      return diff;
    });
    const angleVariance = angleDiffs.reduce((sum, diff) => 
      sum + Math.pow(diff - expectedAngleDiff, 2), 0
    ) / angleDiffs.length;
    const angleUniformity = 1 - Math.min(angleVariance / (Math.PI * Math.PI), 1);
    
    // Combined score (weighted average)
    return 0.5 * polygonality + 0.5 * angleUniformity;
  }

  /**
   * Create a unique key for a fact.
   */
  private createFactKey(type: PrimitiveType, atomIds: string[]): string {
    const sortedIds = [...atomIds].sort();
    return `${type}:${sortedIds.join(',')}`;
  }

  /**
   * Add or update a fact in the facts map.
   */
  private updateFact(type: PrimitiveType, atomIds: string[], timeIndex: number, holds: boolean, metadata?: Record<string, unknown>): void {
    const key = this.createFactKey(type, atomIds);
    let fact = this.facts.get(key);
    
    if (!fact) {
      fact = {
        type,
        atomIds: [...atomIds],
        support: new Set(),
        metadata
      };
      this.facts.set(key, fact);
    }
    
    if (holds) {
      fact.support.add(timeIndex);
      // If fact was previously killed but now holds again, clear killed status
      if (fact.killed !== undefined && fact.killed < timeIndex) {
        delete fact.killed;
      }
    } else {
      // Mark as killed if it was previously supported but now doesn't hold
      if (fact.support.size > 0 && fact.killed === undefined) {
        fact.killed = timeIndex;
      }
    }
  }

  /**
   * Recompute facts that involve any of the given atom IDs.
   */
  private recomputeFactsForAtoms(atomIds: Set<string>, timeIndex: number): void {
    // Get all facts that involve any of the specified atoms
    const factsToRecompute = this.getFacts().filter(fact =>
      fact.atomIds.some(id => atomIds.has(id))
    );
    
    // Recompute each fact
    for (const fact of factsToRecompute) {
      let result: PredicateResult;
      
      switch (fact.type) {
        case "leftOf":
          if (fact.atomIds.length === 2) {
            result = this.leftOf(fact.atomIds[0], fact.atomIds[1], timeIndex);
          } else {
            continue;
          }
          break;
        case "above":
          if (fact.atomIds.length === 2) {
            result = this.above(fact.atomIds[0], fact.atomIds[1], timeIndex);
          } else {
            continue;
          }
          break;
        case "aligned_v":
          result = this.alignedV(fact.atomIds, timeIndex);
          break;
        case "aligned_h":
          result = this.alignedH(fact.atomIds, timeIndex);
          break;
        case "ordered_h":
          result = this.orderedH(fact.atomIds, timeIndex);
          break;
        case "ordered_v":
          result = this.orderedV(fact.atomIds, timeIndex);
          break;
        case "cyclic":
          result = this.cyclic(fact.atomIds, timeIndex);
          break;
        case "group":
          result = this.group(fact.atomIds, timeIndex);
          break;
        default:
          continue;
      }
      
      this.updateFact(fact.type, fact.atomIds, timeIndex, result.holds, result.metadata);
    }
  }

  // ============ Transfer Functions ============

  /**
   * Handle drag action: recompute facts for dragged atoms.
   */
  private handleDrag(action: UIAction, timeIndex: number): void {
    const draggedAtoms = new Set(action.atomIds);
    this.recomputeFactsForAtoms(draggedAtoms, timeIndex);
    
    // Also check for new pairwise relationships
    const layout = this.layouts[timeIndex];
    const allAtoms = Array.from(layout.positions.keys());
    
    for (const draggedId of action.atomIds) {
      for (const otherId of allAtoms) {
        if (draggedId === otherId) continue;
        
        // Check leftOf and above relationships
        const leftOfResult = this.leftOf(draggedId, otherId, timeIndex);
        this.updateFact("leftOf", [draggedId, otherId], timeIndex, leftOfResult.holds);
        
        const aboveResult = this.above(draggedId, otherId, timeIndex);
        this.updateFact("above", [draggedId, otherId], timeIndex, aboveResult.holds);
      }
    }
    
    // Check for group movement if multiple atoms dragged
    if (action.atomIds.length > 1) {
      const groupResult = this.group(action.atomIds, timeIndex);
      this.updateFact("group", action.atomIds, timeIndex, groupResult.holds, groupResult.metadata);
    }
  }

  /**
   * Handle align button: add aligned constraint for selected atoms.
   */
  private handleAlignButton(action: UIAction, timeIndex: number): void {
    const atomIds = action.atomIds;
    
    if (atomIds.length < 2) return;
    
    if (action.direction === "horizontal") {
      // Add horizontal alignment (same y coordinate)
      const result = this.alignedH(atomIds, timeIndex);
      this.updateFact("aligned_h", atomIds, timeIndex, result.holds, result.metadata);
      
      // Drop conflicting ordered_v if needed
      const orderedVKey = this.createFactKey("ordered_v", atomIds);
      const orderedVFact = this.facts.get(orderedVKey);
      if (orderedVFact && orderedVFact.killed === undefined) {
        orderedVFact.killed = timeIndex;
      }
    } else if (action.direction === "vertical") {
      // Add vertical alignment (same x coordinate)
      const result = this.alignedV(atomIds, timeIndex);
      this.updateFact("aligned_v", atomIds, timeIndex, result.holds, result.metadata);
      
      // Drop conflicting ordered_h if needed
      const orderedHKey = this.createFactKey("ordered_h", atomIds);
      const orderedHFact = this.facts.get(orderedHKey);
      if (orderedHFact && orderedHFact.killed === undefined) {
        orderedHFact.killed = timeIndex;
      }
    }
  }

  /**
   * Handle distribute button: add ordered constraint for selected atoms.
   */
  private handleDistributeButton(action: UIAction, timeIndex: number): void {
    const atomIds = action.atomIds;
    
    if (atomIds.length < 2) return;
    
    if (action.direction === "horizontal") {
      const result = this.orderedH(atomIds, timeIndex);
      this.updateFact("ordered_h", atomIds, timeIndex, result.holds);
    } else if (action.direction === "vertical") {
      const result = this.orderedV(atomIds, timeIndex);
      this.updateFact("ordered_v", atomIds, timeIndex, result.holds);
    }
  }

  /**
   * Handle ring gesture: add cyclic constraint for selected atoms.
   */
  private handleRingGesture(action: UIAction, timeIndex: number): void {
    const atomIds = action.atomIds;
    
    if (atomIds.length < 3) return;
    
    const result = this.cyclic(atomIds, timeIndex);
    this.updateFact("cyclic", atomIds, timeIndex, result.holds, result.metadata);
  }

  /**
   * Handle multi-select: cache selection for set-level operations.
   */
  private handleMultiSelect(action: UIAction, timeIndex: number): void {
    // Update current selection
    this.currentSelection = new Set(action.atomIds);
    
    // No spatial changes, but we can check for candidate facts
    if (action.atomIds.length >= 2) {
      // Check alignment
      const alignedHResult = this.alignedH(action.atomIds, timeIndex);
      const alignedVResult = this.alignedV(action.atomIds, timeIndex);
      
      if (alignedHResult.holds) {
        this.updateFact("aligned_h", action.atomIds, timeIndex, true, alignedHResult.metadata);
      }
      if (alignedVResult.holds) {
        this.updateFact("aligned_v", action.atomIds, timeIndex, true, alignedVResult.metadata);
      }
      
      // Check ordering
      const orderedHResult = this.orderedH(action.atomIds, timeIndex);
      const orderedVResult = this.orderedV(action.atomIds, timeIndex);
      
      if (orderedHResult.holds) {
        this.updateFact("ordered_h", action.atomIds, timeIndex, true);
      }
      if (orderedVResult.holds) {
        this.updateFact("ordered_v", action.atomIds, timeIndex, true);
      }
    }
    
    // Check for cyclic pattern if 3+ nodes
    if (action.atomIds.length >= 3) {
      const cyclicResult = this.cyclic(action.atomIds, timeIndex);
      if (cyclicResult.holds) {
        this.updateFact("cyclic", action.atomIds, timeIndex, true, cyclicResult.metadata);
      }
    }
  }
}
