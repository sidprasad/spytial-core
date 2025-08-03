/**
 * Cyclic Constraint Translation - Lean Function Specification
 * 
 * This module provides a formal, functional specification of how cyclic 
 * orientation constraints are translated into elementary positional constraints.
 */

export type NodeId = string;
export type Position = { x: number; y: number };
export type Fragment = NodeId[];

export interface PositionalConstraint {
  type: 'left' | 'top' | 'align-x' | 'align-y';
  node1: NodeId;
  node2: NodeId;
  minDistance?: number;
}

export interface CyclicConstraint {
  direction: 'clockwise' | 'counterclockwise';
  fragments: Fragment[];
}

/**
 * Core translation function: translates a cyclic constraint into a disjunction
 * of positional constraint sets, one for each possible perturbation.
 * 
 * @param constraint - The cyclic constraint to translate
 * @param minRadius - Minimum radius for circular positioning (default: 100)
 * @param minSeparation - Minimum separation distance (default: 15)
 * @returns Array of constraint sets, representing the disjunction
 */
export function translateCyclicConstraint(
  constraint: CyclicConstraint,
  minRadius: number = 100,
  minSeparation: number = 15
): PositionalConstraint[][] {
  
  return constraint.fragments.flatMap(fragment => 
    generatePerturbations(fragment, constraint.direction, minRadius, minSeparation)
  );
}

/**
 * Generates all possible perturbations (rotational offsets) for a fragment.
 * Each perturbation represents a different circular arrangement.
 * 
 * @param fragment - Array of node IDs forming a cycle/path
 * @param direction - Rotation direction
 * @param minRadius - Radius for circular positioning  
 * @param minSeparation - Minimum node separation
 * @returns Array of constraint sets, one per perturbation
 */
function generatePerturbations(
  fragment: Fragment,
  direction: 'clockwise' | 'counterclockwise',
  minRadius: number,
  minSeparation: number
): PositionalConstraint[][] {
  
  // Handle direction by reversing fragment for counterclockwise
  const orderedFragment = direction === 'counterclockwise' 
    ? [...fragment].reverse() 
    : fragment;
    
  // Generate one constraint set per perturbation (rotational offset)
  return Array.from({ length: orderedFragment.length }, (_, perturbation) => 
    generateConstraintsForPerturbation(orderedFragment, perturbation, minRadius, minSeparation)
  );
}

/**
 * Generates positional constraints for a specific perturbation of a fragment.
 * 
 * @param fragment - Ordered array of node IDs
 * @param perturbation - Rotational offset (0 to fragment.length - 1)
 * @param minRadius - Radius for circular positioning
 * @param minSeparation - Minimum node separation
 * @returns Set of positional constraints for this arrangement
 */
function generateConstraintsForPerturbation(
  fragment: Fragment,
  perturbation: number,
  minRadius: number,
  minSeparation: number
): PositionalConstraint[] {
  
  // Calculate circular positions with perturbation offset
  const positions = calculateCircularPositions(fragment, perturbation, minRadius);
  
  // Generate pairwise constraints between all nodes
  const constraints: PositionalConstraint[] = [];
  
  for (let i = 0; i < fragment.length; i++) {
    for (let j = i + 1; j < fragment.length; j++) {
      const node1 = fragment[i];
      const node2 = fragment[j];
      const pos1 = positions[node1];
      const pos2 = positions[node2];
      
      // Generate horizontal constraints
      constraints.push(...generateHorizontalConstraints(node1, node2, pos1, pos2, minSeparation));
      
      // Generate vertical constraints  
      constraints.push(...generateVerticalConstraints(node1, node2, pos1, pos2, minSeparation));
    }
  }
  
  return constraints;
}

/**
 * Calculates circular positions for nodes with given perturbation offset.
 * 
 * @param fragment - Array of node IDs
 * @param perturbation - Rotational offset
 * @param radius - Circle radius
 * @returns Map from node ID to position
 */
function calculateCircularPositions(
  fragment: Fragment,
  perturbation: number,
  radius: number
): Record<NodeId, Position> {
  
  const angleStep = (2 * Math.PI) / fragment.length;
  const positions: Record<NodeId, Position> = {};
  
  fragment.forEach((nodeId, index) => {
    const angle = (index + perturbation) * angleStep;
    positions[nodeId] = {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    };
  });
  
  return positions;
}

/**
 * Generates horizontal constraints (left-of or x-alignment) between two nodes.
 */
function generateHorizontalConstraints(
  node1: NodeId,
  node2: NodeId,
  pos1: Position,
  pos2: Position,
  minSeparation: number
): PositionalConstraint[] {
  
  const tolerance = 1e-6;
  const deltaX = pos1.x - pos2.x;
  
  if (Math.abs(deltaX) <= tolerance) {
    // Nodes are vertically aligned
    return [{
      type: 'align-x',
      node1,
      node2
    }];
  } else if (deltaX > tolerance) {
    // node1 is to the right of node2
    return [{
      type: 'left',
      node1: node2,
      node2: node1,
      minDistance: minSeparation
    }];
  } else {
    // node1 is to the left of node2
    return [{
      type: 'left',
      node1: node1,
      node2: node2,
      minDistance: minSeparation
    }];
  }
}

/**
 * Generates vertical constraints (above or y-alignment) between two nodes.
 */
function generateVerticalConstraints(
  node1: NodeId,
  node2: NodeId,
  pos1: Position,
  pos2: Position,
  minSeparation: number
): PositionalConstraint[] {
  
  const tolerance = 1e-6;
  const deltaY = pos1.y - pos2.y;
  
  if (Math.abs(deltaY) <= tolerance) {
    // Nodes are horizontally aligned
    return [{
      type: 'align-y',
      node1,
      node2
    }];
  } else if (deltaY > tolerance) {
    // node1 is above node2
    return [{
      type: 'top',
      node1: node2,
      node2: node1,
      minDistance: minSeparation
    }];
  } else {
    // node1 is below node2
    return [{
      type: 'top',
      node1: node1,
      node2: node2,
      minDistance: minSeparation
    }];
  }
}

/**
 * Semantic interpretation: A cyclic constraint is satisfied if ANY of its
 * generated constraint sets is satisfiable by the constraint solver.
 * 
 * Formally: satisfies(cyclicConstraint) ≡ ∃cs ∈ translateCyclicConstraint(cyclicConstraint) : satisfiable(cs)
 * 
 * This creates a disjunction over all possible perturbations and fragments.
 */
export function cyclicConstraintSemantics(constraint: CyclicConstraint): string {
  return `
Semantic Interpretation:
  
A cyclic constraint C is satisfied iff there exists at least one satisfiable 
constraint set in its translation:

  satisfies(C) ≡ ∃cs ∈ translateCyclicConstraint(C) : satisfiable(cs)

This creates a disjunction:
  
  C ≡ ⋁(cs ∈ translateCyclicConstraint(C)) satisfiable(cs)

Where each constraint set cs represents a specific geometric arrangement 
(perturbation) of the cyclic relationship.
`;
}

/**
 * Example usage and demonstration of the disjunctive semantics:
 */
export function demonstrateSemantics(): void {
  const cyclicConstraint: CyclicConstraint = {
    direction: 'clockwise',
    fragments: [['A', 'B', 'C']]  // A → B → C → A (cycle)
  };
  
  const constraintSets = translateCyclicConstraint(cyclicConstraint);
  
  console.log(`Generated ${constraintSets.length} constraint sets (disjuncts):`);
  
  constraintSets.forEach((cs, index) => {
    console.log(`\nPerturbation ${index}:`);
    cs.forEach(constraint => {
      console.log(`  ${constraint.type}: ${constraint.node1} → ${constraint.node2}`);
    });
  });
  
  console.log(cyclicConstraintSemantics(cyclicConstraint));
}