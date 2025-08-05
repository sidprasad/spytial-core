/**
 * Cyclic Constraint Translation to Layout Constraints
 * 
 * This module provides a clean mathematical specification of how cyclic 
 * orientation constraints are translated into concrete LayoutConstraint types:
 * - LeftConstraint: left/right relationships
 * - TopConstraint: above/below relationships  
 * - AlignmentConstraint: horizontal/vertical alignment
 */

export type NodeId = string;
export type Position = { x: number; y: number };
export type Fragment = NodeId[];

/**
 * Layout constraint types - these match the actual interfaces in interfaces.ts
 */
export interface LeftConstraint {
  type: 'left';
  left: NodeId;
  right: NodeId;
  minDistance: number;
}

export interface TopConstraint {
  type: 'top';
  top: NodeId;
  bottom: NodeId;
  minDistance: number;
}

export interface AlignmentConstraint {
  type: 'alignment';
  axis: 'x' | 'y';
  node1: NodeId;
  node2: NodeId;
}

export type LayoutConstraint = LeftConstraint | TopConstraint | AlignmentConstraint;

export interface CyclicConstraint {
  direction: 'clockwise' | 'counterclockwise';
  fragments: Fragment[];
}

/**
 * Core translation function that mirrors the actual implementation in layoutinstance.ts
 * 
 * Translates a cyclic constraint into disjunctive sets of layout constraints.
 * Each constraint set represents one possible circular arrangement (perturbation).
 * 
 * @param constraint - The cyclic constraint to translate
 * @param minRadius - Minimum radius for circular positioning (default: 100)
 * @param minSepWidth - Minimum horizontal separation (default: 15)
 * @param minSepHeight - Minimum vertical separation (default: 15)
 * @returns Array of constraint sets representing the disjunction
 */
export function translateCyclicConstraint(
  constraint: CyclicConstraint,
  minRadius: number = 100,
  minSepWidth: number = 15,
  minSepHeight: number = 15
): LayoutConstraint[][] {
  
  return constraint.fragments.flatMap(fragment => 
    translateFragment(fragment, constraint.direction, minRadius, minSepWidth, minSepHeight)
  );
}

/**
 * Translates a single fragment into multiple constraint sets (one per perturbation).
 * 
 * This function mirrors getCyclicConstraintForFragment() in layoutinstance.ts
 */
function translateFragment(
  fragment: Fragment,
  direction: 'clockwise' | 'counterclockwise',
  minRadius: number,
  minSepWidth: number,
  minSepHeight: number
): LayoutConstraint[][] {
  
  // Handle direction by reversing fragment for counterclockwise
  const orderedFragment = direction === 'counterclockwise' 
    ? [...fragment].reverse() 
    : fragment;
    
  // Generate one constraint set per perturbation (rotational offset)
  return Array.from({ length: orderedFragment.length }, (_, perturbation) => 
    generateConstraintsForPerturbation(orderedFragment, perturbation, minRadius, minSepWidth, minSepHeight)
  );
}

/**
 * Generates layout constraints for a specific perturbation of a fragment.
 * 
 * This exactly mirrors the logic in getCyclicConstraintForFragment():
 * - Calculate circular positions with perturbation offset
 * - Generate pairwise constraints between all nodes
 * - Apply positioning rules to create LeftConstraint, TopConstraint, AlignmentConstraint
 */
function generateConstraintsForPerturbation(
  fragment: Fragment,
  perturbationIdx: number,
  minRadius: number,
  minSepWidth: number,
  minSepHeight: number
): LayoutConstraint[] {
  
  if (fragment.length <= 2) {
    return []; // No constraints needed for two-node fragments
  }
  
  // Calculate circular positions (mirrors layoutinstance.ts logic)
  const angleStep = (2 * Math.PI) / fragment.length;
  const positions: Record<NodeId, Position> = {};
  
  for (let i = 0; i < fragment.length; i++) {
    const theta = (i + perturbationIdx) * angleStep;
    positions[fragment[i]] = {
      x: minRadius * Math.cos(theta),
      y: minRadius * Math.sin(theta)
    };
  }
  
  // Generate pairwise constraints (mirrors the nested loops in layoutinstance.ts)
  const constraints: LayoutConstraint[] = [];
  
  for (let k = 0; k < fragment.length; k++) {
    for (let j = 0; j < fragment.length; j++) {
      if (k !== j) {
        const node1 = fragment[k];
        const node2 = fragment[j];
        const node1_pos = positions[node1];
        const node2_pos = positions[node2];
        
        // Horizontal constraints (exact logic from layoutinstance.ts)
        if (node1_pos.x > node2_pos.x) {
          constraints.push({
            type: 'left',
            left: node2,
            right: node1,
            minDistance: minSepWidth
          });
        } else if (node1_pos.x < node2_pos.x) {
          constraints.push({
            type: 'left',
            left: node1,
            right: node2,
            minDistance: minSepWidth
          });
        } else {
          // Same x-axis: ensure same X constraint (alignment)
          constraints.push({
            type: 'alignment',
            axis: 'x',
            node1,
            node2
          });
        }
        
        // Vertical constraints (exact logic from layoutinstance.ts)
        if (node1_pos.y > node2_pos.y) {
          constraints.push({
            type: 'top',
            top: node2,
            bottom: node1,
            minDistance: minSepHeight
          });
        } else if (node1_pos.y < node2_pos.y) {
          constraints.push({
            type: 'top',
            top: node1,
            bottom: node2,
            minDistance: minSepHeight
          });
        } else {
          // Same y-axis: ensure same Y constraint (alignment)
          constraints.push({
            type: 'alignment',
            axis: 'y',
            node1,
            node2
          });
        }
      }
    }
  }
  
  return constraints;
}

/**
 * Lean-style function specification showing the formal mapping:
 * 
 * | CyclicConstraint.clockwise fragments    => translateFragments(fragments, identity)
 * | CyclicConstraint.counterclockwise fragments => translateFragments(fragments, reverse)
 * 
 * where translateFragments produces:
 * | Constraint.left a b                 => LeftConstraint(a, b, minDistance)
 * | Constraint.above a b                => TopConstraint(a, b, minDistance)
 * | Constraint.horizontally_aligned a b => AlignmentConstraint(a, b, axis: "x")
 * | Constraint.vertically_aligned a b   => AlignmentConstraint(a, b, axis: "y")
 */
export function leanStyleTranslation(constraint: CyclicConstraint): string {
  return `
Lean-style Translation:

CyclicConstraint → LayoutConstraint[][]

| CyclicConstraint.clockwise fragments    ⟹ translateFragments(fragments, identity)
| CyclicConstraint.counterclockwise fragments ⟹ translateFragments(fragments, reverse)

where for each fragment perturbation:
| Constraint.left a b                 ⟹ LeftConstraint(left: a, right: b, minDistance: ${15})
| Constraint.above a b                ⟹ TopConstraint(top: a, bottom: b, minDistance: ${15})  
| Constraint.horizontally_aligned a b ⟹ AlignmentConstraint(node1: a, node2: b, axis: "x")
| Constraint.vertically_aligned a b   ⟹ AlignmentConstraint(node1: a, node2: b, axis: "y")

Disjunctive Semantics:
  satisfies(CyclicConstraint) ≡ ∃cs ∈ translateCyclicConstraint(constraint) : satisfiable(cs)
  
This creates a disjunction over all possible circular arrangements.

Generated ${constraint.fragments.reduce((sum, frag) => sum + frag.length, 0)} constraint sets total.
`;
}

/**
 * Example demonstrating the complete translation for a triangle cycle
 */
export function demonstrateTriangleTranslation(): void {
  const cyclicConstraint: CyclicConstraint = {
    direction: 'clockwise',
    fragments: [['A', 'B', 'C']]  // A → B → C → A (cycle)
  };
  
  const constraintSets = translateCyclicConstraint(cyclicConstraint);
  
  console.log(`Triangle Cycle Translation:`);
  console.log(`Input: ${JSON.stringify(cyclicConstraint)}`);
  console.log(`Generated ${constraintSets.length} perturbations:\n`);
  
  constraintSets.forEach((cs, index) => {
    console.log(`Perturbation ${index}:`);
    
    const leftConstraints = cs.filter(c => c.type === 'left') as LeftConstraint[];
    const topConstraints = cs.filter(c => c.type === 'top') as TopConstraint[];
    const alignConstraints = cs.filter(c => c.type === 'alignment') as AlignmentConstraint[];
    
    leftConstraints.forEach(c => console.log(`  LeftConstraint(${c.left}, ${c.right})`));
    topConstraints.forEach(c => console.log(`  TopConstraint(${c.top}, ${c.bottom})`));
    alignConstraints.forEach(c => console.log(`  AlignmentConstraint(${c.node1}, ${c.node2}, ${c.axis})`));
    
    console.log('');
  });
  
  console.log(leanStyleTranslation(cyclicConstraint));
}