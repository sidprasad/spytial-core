import { InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup, LayoutConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint, isBoundingBoxConstraint, isGroupBoundaryConstraint, TopConstraint, LeftConstraint, AlignmentConstraint, BoundingBoxConstraint, GroupBoundaryConstraint, ImplicitConstraint } from './interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint, GroupByField, GroupBySelector } from './layoutspec';


export type SourceConstraint = RelativeOrientationConstraint | CyclicOrientationConstraint | AlignConstraint | ImplicitConstraint | GroupByField | GroupBySelector;

export interface ErrorMessages {
    conflictingConstraint: string;
    conflictingSourceConstraint: string;
    minimalConflictingConstraints: Map<string, string[]>;
}

/**
 * Represents a constraint validation error with structured data
 * Provides detailed information about constraint conflicts for programmatic handling
 */
export interface ConstraintError  extends Error {
    /** Type of constraint error */
    readonly type: 'group-overlap' | 'positional-conflict' | 'unknown-constraint' | 'hidden-node-conflict';

    /** Human-readable error message */
    readonly message: string;

}

export function isPositionalConstraintError(error: unknown): error is PositionalConstraintError {
    return (error as PositionalConstraintError).type === 'positional-conflict';
}

export function isGroupOverlapError(error: unknown): error is GroupOverlapError {
    return (error as GroupOverlapError).type === 'group-overlap';
}

export interface PositionalConstraintError extends ConstraintError {
    type: 'positional-conflict';
    conflictingConstraint: LayoutConstraint;
    conflictingSourceConstraint: SourceConstraint;
    minimalConflictingSet: Map<SourceConstraint, LayoutConstraint[]>;
    maximalFeasibleSubset?: LayoutConstraint[];
    errorMessages?: ErrorMessages;
}

export interface GroupOverlapError extends ConstraintError {
    type: 'group-overlap';
    group1: LayoutGroup;
    group2: LayoutGroup;
    overlappingNodes: LayoutNode[];
}

/**
 * Error for when a hideAtom directive hides a node that is also referenced by layout constraints.
 * Reported in a table format similar to IIS conflicts.
 */
export interface HiddenNodeConflictError extends ConstraintError {
    type: 'hidden-node-conflict';
    /** Map of hidden node ID → the hideAtom selector that hid it */
    hiddenNodes: Map<string, string>;
    /** Map of source constraint → list of pairwise descriptions that were dropped */
    droppedConstraints: Map<string, string[]>;
    /** Structured error messages for UI rendering (same format as positional errors) */
    errorMessages: ErrorMessages;
}

export function isHiddenNodeConflictError(error: unknown): error is HiddenNodeConflictError {
    return (error as HiddenNodeConflictError)?.type === 'hidden-node-conflict';
}


// Tooltip text explaining what node IDs are
const ID_TOOLTIP_TEXT = "This is a unique identifier in the graph. Hover over graph nodes to see their IDs.";

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * @param str - String to escape
 * @returns Escaped string safe for HTML insertion
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Formats a node label for display in error messages.
 * Prioritizes showing attributes when available, with fallback to label and ID.
 *
 * @param node - The layout node to format
 * @returns Formatted label string, potentially with HTML for tooltips
 */
export function formatNodeLabel(node: LayoutNode): string {
    // Check if node has non-empty attributes with actual values
    const hasAttributes = node.attributes &&
        Object.entries(node.attributes).some(([_, values]) => values && values.length > 0);

    if (hasAttributes) {
        // Show attributes (truncated if needed) instead of ID
        const attrs = node.attributes || {};
        const attrEntries = Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b));

        // Format: label with key attributes shown
        // For single attribute with single value: "label (key: value)"
        // For multiple or complex: "label (key1: val1, key2: val2, ...)"
        const attributeParts: string[] = [];
        const maxAttributes = 2; // Show at most 2 attributes to avoid clutter
        const maxValueLength = 20; // Truncate long values

        for (let i = 0; i < Math.min(attrEntries.length, maxAttributes); i++) {
            const [key, values] = attrEntries[i];
            if (values && values.length > 0) {
                // Take first value, truncate if too long
                let value = values[0];
                if (value.length > maxValueLength) {
                    value = value.substring(0, maxValueLength) + '...';
                }
                // Escape HTML to prevent XSS
                attributeParts.push(`${escapeHtml(key)}: ${escapeHtml(value)}`);
            }
        }

        if (attrEntries.length > maxAttributes) {
            attributeParts.push('...');
        }

        if (attributeParts.length > 0) {
            // Escape label to prevent XSS
            return `${escapeHtml(node.label)} (${attributeParts.join(', ')})`;
        }
    }

    // No attributes present - show label with ID explanation
    // Use HTML title attribute for hover tooltip explaining what the ID is
    // Escape all user-provided values to prevent XSS
    if (node.label && node.label !== node.id) {
        // Format: label (id = X) where hovering explains the ID
        return `<span title="${ID_TOOLTIP_TEXT}">${escapeHtml(node.label)} (id = ${escapeHtml(node.id)})</span>`;
    }

    // Only ID available (label same as ID or no label)
    return `<span title="${ID_TOOLTIP_TEXT}">${escapeHtml(node.id)}</span>`;
}

// TODO:
export function orientationConstraintToString(constraint: LayoutConstraint) {
    const nodeLabel = formatNodeLabel;

    if (isTopConstraint(constraint)) {
        let tc = constraint as TopConstraint;
        return `${nodeLabel(tc.top)} must be above ${nodeLabel(tc.bottom)}`;
    }
    else if (isLeftConstraint(constraint)) {
        let lc = constraint as LeftConstraint;
        return `${nodeLabel(lc.left)} must be to the left of  ${nodeLabel(lc.right)}`;
    }
    else if (isAlignmentConstraint(constraint)) {
        let ac = constraint as AlignmentConstraint;
        let axis = ac.axis;
        let node1 = ac.node1;
        let node2 = ac.node2;

        if (axis === 'x') {
            return `${nodeLabel(node1)} must be vertically aligned with ${nodeLabel(node2)}`;
        }
        else if (axis === 'y') {
            return `${nodeLabel(node1)} must be horizontally aligned with ${nodeLabel(node2)}`;
        }

        return `${nodeLabel(node1)} must be aligned with ${nodeLabel(node2)} along the ${axis} axis`;
    }
    else if (isBoundingBoxConstraint(constraint)) {
        let bc = constraint as BoundingBoxConstraint;
        return `${nodeLabel(bc.node)} cannot be in group "${bc.group.name}".`;
    }
    else if (isGroupBoundaryConstraint(constraint)) {
        let gc = constraint as GroupBoundaryConstraint;
        const sideDescriptions: { [key: string]: string } = {
            'left': 'to the left of',
            'right': 'to the right of',
            'top': 'above',
            'bottom': 'below'
        };
        return `Group "${gc.groupA.name}" must be ${sideDescriptions[gc.side]} group "${gc.groupB.name}"`;
    }
    return `Unknown constraint type: ${constraint}`;
}


// ─── Validator Interface ────────────────────────────────────────────────────

/**
 * Common interface for all constraint validators.
 * Both the deprecated Kiwi-based ConstraintValidator and the standard
 * QualitativeConstraintValidator implement this interface.
 */
export interface IConstraintValidator {
    horizontallyAligned: LayoutNode[][];
    verticallyAligned: LayoutNode[][];
    validateConstraints(): ConstraintError | null;
    validatePositionalConstraints(): PositionalConstraintError | null;
    validateGroupConstraints(): GroupOverlapError | null;
    dispose(): void;
}
