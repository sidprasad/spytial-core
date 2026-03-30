/**
 * Constraint DSL for concise validator testing.
 *
 * Syntax:
 *   A <x B          — A left of B
 *   A <y B          — A above B
 *   A =x B          — A aligned with B on x-axis (same column)
 *   A =y B          — A aligned with B on y-axis (same row)
 *   [A <x B | A =x B]   — disjunction
 *   {G: A, B, C}    — group G containing A, B, C
 *   {!G: A, B}      — negated group
 *
 * Multiple items separated by commas (top-level):
 *   'A <x B, B <x C, A =y C'
 *
 * Usage:
 *   sat('A <x B, B <x C')
 *   unsat('A <x B, B <x A')
 *   const r = solve('A <x B, [A <y B | B <y A]')
 */

import { expect } from 'vitest';
import { QualitativeConstraintValidator } from '../../src/layout/qualitative-constraint-validator';
import { ConstraintValidator } from '../../src/layout/constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    LayoutConstraint,
} from '../../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../../src/layout/layoutspec';
import type { ConstraintError, IConstraintValidator } from '../../src/layout/constraint-types';

// ─── Internals ──────────────────────────────────────────────────────────────

const SRC = new RelativeOrientationConstraint(['left'], 'dsl');
const GBF = new GroupByField('type', 0, 1, 'type');

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 60;

type NodeDims = Record<string, [number, number]>;

function makeNode(id: string, width: number, height: number): LayoutNode {
    return {
        id, label: id, color: 'black', groups: [], attributes: {},
        width, height, mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

function leftOf(a: LayoutNode, b: LayoutNode): LeftConstraint {
    return { left: a, right: b, minDistance: 15, sourceConstraint: SRC };
}

function aboveOf(a: LayoutNode, b: LayoutNode): TopConstraint {
    return { top: a, bottom: b, minDistance: 15, sourceConstraint: SRC };
}

function alignOnX(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'x', node1: a, node2: b, sourceConstraint: SRC };
}

function alignOnY(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'y', node1: a, node2: b, sourceConstraint: SRC };
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Tokenize a spec string into top-level items, respecting brackets and braces.
 * Splits on commas that are NOT inside [...] or {...}.
 */
function splitTopLevel(spec: string): string[] {
    const items: string[] = [];
    let depth = 0;
    let current = '';

    for (const ch of spec) {
        if (ch === '[' || ch === '{') depth++;
        else if (ch === ']' || ch === '}') depth--;

        if (ch === ',' && depth === 0) {
            items.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) items.push(current.trim());
    return items;
}

/** Parse a single atomic constraint like "A <x B" or "A =y C". */
function parseAtomicConstraint(
    token: string,
    nodeMap: Map<string, LayoutNode>,
    dims: NodeDims,
): LayoutConstraint {
    // Match: IDENT OP IDENT  where OP is <x, <y, =x, =y
    const match = token.match(/^(\w+)\s*(<x|<y|=x|=y)\s*(\w+)$/);
    if (!match) throw new Error(`Invalid constraint: "${token}"`);

    const [, aId, op, bId] = match;
    const a = getOrCreateNode(aId, nodeMap, dims);
    const b = getOrCreateNode(bId, nodeMap, dims);

    switch (op) {
        case '<x': return leftOf(a, b);
        case '<y': return aboveOf(a, b);
        case '=x': return alignOnX(a, b);
        case '=y': return alignOnY(a, b);
        default: throw new Error(`Unknown operator: ${op}`);
    }
}

/** Parse a disjunction like "[A <x B | A =x B]". */
function parseDisjunction(
    token: string,
    nodeMap: Map<string, LayoutNode>,
    dims: NodeDims,
): DisjunctiveConstraint {
    // Strip brackets
    const inner = token.slice(1, -1).trim();
    const alternatives = inner.split('|').map(alt => {
        // Each alternative may be a conjunction of constraints separated by '&'
        const parts = alt.trim().split('&').map(p => p.trim());
        return parts.map(p => parseAtomicConstraint(p, nodeMap, dims));
    });

    return new DisjunctiveConstraint(SRC, alternatives);
}

/** Parse a group like "{G: A, B, C}" or "{!G: A, B}". */
function parseGroup(
    token: string,
    nodeMap: Map<string, LayoutNode>,
    dims: NodeDims,
): LayoutGroup {
    // Strip braces
    const inner = token.slice(1, -1).trim();
    const colonIdx = inner.indexOf(':');
    if (colonIdx === -1) throw new Error(`Invalid group syntax: "${token}" — expected {Name: node1, node2, ...}`);

    let name = inner.slice(0, colonIdx).trim();
    let negated = false;

    if (name.startsWith('!')) {
        negated = true;
        name = name.slice(1).trim();
    }

    const memberIds = inner.slice(colonIdx + 1).split(',').map(s => s.trim()).filter(Boolean);

    // Ensure all member nodes exist
    for (const id of memberIds) {
        getOrCreateNode(id, nodeMap, dims);
    }

    return {
        name,
        nodeIds: memberIds,
        keyNodeId: memberIds[0],
        showLabel: true,
        sourceConstraint: GBF,
        negated,
    };
}

function getOrCreateNode(id: string, nodeMap: Map<string, LayoutNode>, dims: NodeDims): LayoutNode {
    if (!nodeMap.has(id)) {
        const [w, h] = dims[id] ?? [DEFAULT_WIDTH, DEFAULT_HEIGHT];
        nodeMap.set(id, makeNode(id, w, h));
    }
    return nodeMap.get(id)!;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface SolveResult {
    sat: boolean;
    error: ConstraintError | null;
    validator: IConstraintValidator;
    layout: InstanceLayout;
}

/**
 * Parse a DSL string into an InstanceLayout.
 *
 * Nodes are auto-created from identifiers in constraints.
 * Custom dimensions can be provided: `{ A: [50, 30], B: [80, 60] }`
 */
export function parseConstraintSpec(spec: string, dims: NodeDims = {}): InstanceLayout {
    const nodeMap = new Map<string, LayoutNode>();
    const constraints: LayoutConstraint[] = [];
    const disjunctions: DisjunctiveConstraint[] = [];
    const groups: LayoutGroup[] = [];

    if (!spec.trim()) {
        return { nodes: [], edges: [], constraints: [], groups: [] };
    }

    const items = splitTopLevel(spec);

    for (const item of items) {
        if (item.startsWith('[')) {
            disjunctions.push(parseDisjunction(item, nodeMap, dims));
        } else if (item.startsWith('{')) {
            groups.push(parseGroup(item, nodeMap, dims));
        } else {
            constraints.push(parseAtomicConstraint(item, nodeMap, dims));
        }
    }

    return {
        nodes: [...nodeMap.values()],
        edges: [],
        constraints,
        groups,
        disjunctiveConstraints: disjunctions.length > 0 ? disjunctions : undefined,
    };
}

/**
 * Clone a layout so each validator gets its own copy (validators mutate layouts).
 */
export function cloneLayout(layout: InstanceLayout): InstanceLayout {
    return {
        nodes: layout.nodes,
        edges: layout.edges,
        constraints: [...layout.constraints],
        groups: layout.groups,
        disjunctiveConstraints: layout.disjunctiveConstraints
            ? layout.disjunctiveConstraints.map(d =>
                new DisjunctiveConstraint(d.sourceConstraint, d.alternatives.map(a => [...a])))
            : undefined,
    };
}

/**
 * Run the qualitative constraint validator on a DSL spec string.
 */
export function solve(spec: string, dims: NodeDims = {}): SolveResult {
    const layout = parseConstraintSpec(spec, dims);
    const layoutCopy = cloneLayout(layout);
    const validator = new QualitativeConstraintValidator(layoutCopy);
    const error = validator.validateConstraints();
    return { sat: error === null, error, validator, layout };
}

/**
 * Run the Kiwi constraint validator on a DSL spec string.
 * Useful for comparison testing.
 */
export function solveKiwi(spec: string, dims: NodeDims = {}): SolveResult {
    const layout = parseConstraintSpec(spec, dims);
    const layoutCopy = cloneLayout(layout);
    const validator = new ConstraintValidator(layoutCopy);
    const error = validator.validateConstraints();
    return { sat: error === null, error, validator, layout };
}

/**
 * Assert that a constraint spec is satisfiable.
 */
export function sat(spec: string, dims: NodeDims = {}): SolveResult {
    const result = solve(spec, dims);
    expect(result.sat, `Expected SAT but got UNSAT for: ${spec}\n  Error: ${result.error?.message}`).toBe(true);
    return result;
}

/**
 * Assert that a constraint spec is unsatisfiable.
 */
export function unsat(spec: string, dims: NodeDims = {}): SolveResult {
    const result = solve(spec, dims);
    expect(result.sat, `Expected UNSAT but got SAT for: ${spec}`).toBe(false);
    return result;
}

// ─── Layout description (for PBT failure messages) ──────────────────────────

export function describeConstraint(c: LayoutConstraint): string {
    if ('left' in c && 'right' in c) {
        return `${(c as LeftConstraint).left.id} <x ${(c as LeftConstraint).right.id}`;
    }
    if ('top' in c && 'bottom' in c) {
        return `${(c as TopConstraint).top.id} <y ${(c as TopConstraint).bottom.id}`;
    }
    if ('axis' in c && 'node1' in c) {
        const ac = c as AlignmentConstraint;
        return `${ac.node1.id} =${ac.axis} ${ac.node2.id}`;
    }
    return JSON.stringify(c);
}

export function describeLayout(layout: InstanceLayout): string {
    const lines: string[] = [];
    lines.push(`Nodes: [${layout.nodes.map(n => `${n.id}(${n.width}x${n.height})`).join(', ')}]`);
    if (layout.constraints.length > 0) {
        lines.push(`Constraints: ${layout.constraints.map(describeConstraint).join(', ')}`);
    }
    if (layout.disjunctiveConstraints?.length) {
        for (const d of layout.disjunctiveConstraints) {
            const alts = d.alternatives.map(a => a.map(describeConstraint).join(' & ')).join(' | ');
            lines.push(`Disjunction: [${alts}]`);
        }
    }
    if (layout.groups.length > 0) {
        lines.push(`Groups: ${layout.groups.map(g => `{${g.negated ? '!' : ''}${g.name}: ${g.nodeIds.join(', ')}}`).join(', ')}`);
    }
    return lines.join('\n  ');
}

// ─── Constraint builders (for PBT generators) ──────────────────────────────

export { makeNode, leftOf, aboveOf, alignOnX, alignOnY, SRC, GBF };
