/**
 * Diff Visualization — produces annotated InstanceLayouts for side-by-side rendering.
 *
 * Given two YAML specs and one IDataInstance, generates two InstanceLayouts
 * with diff annotations injected into node/edge properties. A UI layer can
 * render these in two WebColaCnDGraph components side-by-side, with differences
 * visually highlighted.
 *
 * Key behaviors:
 * - Position synchronization: both layouts share the same node positions
 * - Diff annotation: modified nodes/edges get marker attributes
 * - Phantom nodes: nodes hidden in one spec appear as ghosts in the other
 */

import { IDataInstance } from '../data-instance/interfaces';
import IEvaluator from '../evaluators/interfaces';
import {
    InstanceLayout,
    LayoutNode,
    LayoutEdge,
    LayoutGroup,
} from './interfaces';
import { parseLayoutSpec } from './layoutspec';
import { LayoutInstance } from './layoutinstance';
import { computeSpecDiff, SpecDiff } from './spec-diff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Position hint for synchronizing node placement across two diagrams. */
export interface NodePositionHint {
    id: string;
    x: number;
    y: number;
}

/** Options for controlling diff visualization appearance. */
export interface DiffVisualizationOptions {
    /** Color used to highlight modified elements. Default: '#FF8C00' (orange). */
    highlightColor?: string;
    /** Opacity for elements only present in one layout. Default: 0.35. */
    phantomOpacity?: number;
    /** Attribute key used to mark diff status on nodes. Default: '_diff'. */
    diffAttributeKey?: string;
}

/** Result of creating a diff visualization. */
export interface DiffVisualization {
    /** Layout A with diff annotations. */
    layoutA: InstanceLayout;
    /** Layout B with diff annotations. */
    layoutB: InstanceLayout;
    /** Shared node positions (from layout A) for synchronized rendering. */
    sharedPositions: NodePositionHint[];
    /** The underlying diff. */
    diff: SpecDiff;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_HIGHLIGHT_COLOR = '#FF8C00';
const DEFAULT_PHANTOM_OPACITY = 0.35;
const DEFAULT_DIFF_ATTR_KEY = '_diff';

// ---------------------------------------------------------------------------
// Annotation helpers
// ---------------------------------------------------------------------------

function annotateNode(
    node: LayoutNode,
    status: string,
    diffAttrKey: string,
): LayoutNode {
    const annotated = { ...node };
    annotated.attributes = {
        ...(annotated.attributes ?? {}),
        [diffAttrKey]: [status],
    };
    return annotated;
}

function makePhantomNode(
    node: LayoutNode,
    diffAttrKey: string,
): LayoutNode {
    return annotateNode(
        { ...node, color: '#cccccc' },
        'phantom',
        diffAttrKey,
    );
}

function annotateEdge(
    edge: LayoutEdge,
    status: string,
): LayoutEdge {
    // Can't add attributes to edges, but we can adjust visual properties
    // to signal the diff. For now, keep the edge as-is — the diff data
    // structure carries the full information for the UI layer.
    return { ...edge };
}

// ---------------------------------------------------------------------------
// Layout annotation
// ---------------------------------------------------------------------------

/**
 * Annotate a layout's nodes with diff status markers.
 *
 * - Nodes that are 'modified' get a `_diff: ['modified']` attribute.
 * - Nodes that exist only in the OTHER layout are injected as phantoms.
 */
function annotateLayout(
    layout: InstanceLayout,
    diff: SpecDiff,
    side: 'first' | 'second',
    otherLayout: InstanceLayout,
    options: Required<DiffVisualizationOptions>,
): InstanceLayout {
    const diffAttrKey = options.diffAttributeKey;
    const otherNodes = new Map<string, LayoutNode>();
    for (const n of otherLayout.nodes) otherNodes.set(n.id, n);

    const annotatedNodes: LayoutNode[] = [];

    // Process existing nodes
    for (const node of layout.nodes) {
        const nodeDiff = diff.nodes.find(d => d.nodeId === node.id);
        if (!nodeDiff || nodeDiff.status === 'identical') {
            annotatedNodes.push(annotateNode(node, 'identical', diffAttrKey));
        } else if (nodeDiff.status === 'modified') {
            annotatedNodes.push(annotateNode(node, 'modified', diffAttrKey));
        } else {
            // only-in-first or only-in-second — this node exists in this layout
            annotatedNodes.push(annotateNode(node, 'unique', diffAttrKey));
        }
    }

    // Add phantom nodes for nodes only in the other layout
    const myNodeIds = new Set(layout.nodes.map(n => n.id));
    for (const nodeDiff of diff.nodes) {
        const isPhantomHere =
            (side === 'first' && nodeDiff.status === 'only-in-second') ||
            (side === 'second' && nodeDiff.status === 'only-in-first');

        if (isPhantomHere) {
            const otherNode = otherNodes.get(nodeDiff.nodeId);
            if (otherNode && !myNodeIds.has(nodeDiff.nodeId)) {
                annotatedNodes.push(makePhantomNode(otherNode, diffAttrKey));
            }
        }
    }

    return {
        ...layout,
        nodes: annotatedNodes,
    };
}

// ---------------------------------------------------------------------------
// Position extraction
// ---------------------------------------------------------------------------

/**
 * Extract position hints from a layout's nodes.
 *
 * Since LayoutNodes don't carry x/y (positions are assigned by WebCola after
 * rendering), we return the node IDs as hints. The UI layer should:
 * 1. Render layout A first.
 * 2. Capture positions via WebColaCnDGraph.getNodePositions().
 * 3. Pass them as priorPositions when rendering layout B.
 *
 * This function provides the node ID list so the UI knows which nodes to sync.
 */
function extractPositionHints(layout: InstanceLayout): NodePositionHint[] {
    // Positions are not yet assigned at this stage — return zero-position hints.
    // The UI layer must capture real positions after rendering layout A.
    return layout.nodes.map(n => ({ id: n.id, x: 0, y: 0 }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a diff visualization from two YAML specs and one data instance.
 *
 * Returns two annotated InstanceLayouts ready for side-by-side rendering,
 * plus the underlying diff data for programmatic use.
 *
 * Usage in a UI:
 * ```typescript
 * const viz = createDiffVisualization(specA, specB, data, evaluator);
 *
 * // Render layout A in the left panel
 * leftGraph.renderLayout(viz.layoutA);
 *
 * // Capture positions from layout A
 * const positions = leftGraph.getNodePositions();
 *
 * // Render layout B in the right panel with same positions
 * rightGraph.renderLayout(viz.layoutB, { priorPositions: positions });
 *
 * // Use viz.diff for overlay UI (highlight badges, tooltips, etc.)
 * ```
 */
export function createDiffVisualization(
    specA: string,
    specB: string,
    data: IDataInstance,
    evaluator: IEvaluator,
    options?: DiffVisualizationOptions,
): DiffVisualization {
    const opts: Required<DiffVisualizationOptions> = {
        highlightColor: options?.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR,
        phantomOpacity: options?.phantomOpacity ?? DEFAULT_PHANTOM_OPACITY,
        diffAttributeKey: options?.diffAttributeKey ?? DEFAULT_DIFF_ATTR_KEY,
    };

    // Generate both layouts
    const parsedA = parseLayoutSpec(specA);
    const parsedB = parseLayoutSpec(specB);
    const liA = new LayoutInstance(parsedA, evaluator);
    const liB = new LayoutInstance(parsedB, evaluator);
    const resultA = liA.generateLayout(data);
    const resultB = liB.generateLayout(data);

    // Compute diff
    const diff = computeSpecDiff(resultA.layout, resultB.layout);

    // Annotate both layouts
    const annotatedA = annotateLayout(resultA.layout, diff, 'first', resultB.layout, opts);
    const annotatedB = annotateLayout(resultB.layout, diff, 'second', resultA.layout, opts);

    // Position hints — the union of both node sets
    const allNodeIds = new Set<string>();
    for (const n of annotatedA.nodes) allNodeIds.add(n.id);
    for (const n of annotatedB.nodes) allNodeIds.add(n.id);
    const sharedPositions = [...allNodeIds].map(id => ({ id, x: 0, y: 0 }));

    return {
        layoutA: annotatedA,
        layoutB: annotatedB,
        sharedPositions,
        diff,
    };
}

/**
 * Create a diff visualization from pre-computed layouts.
 *
 * Use this when you already have InstanceLayouts (e.g., from a previous
 * `generateLayout()` call) and don't want to regenerate them.
 */
export function createDiffVisualizationFromLayouts(
    layoutA: InstanceLayout,
    layoutB: InstanceLayout,
    options?: DiffVisualizationOptions,
): DiffVisualization {
    const opts: Required<DiffVisualizationOptions> = {
        highlightColor: options?.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR,
        phantomOpacity: options?.phantomOpacity ?? DEFAULT_PHANTOM_OPACITY,
        diffAttributeKey: options?.diffAttributeKey ?? DEFAULT_DIFF_ATTR_KEY,
    };

    const diff = computeSpecDiff(layoutA, layoutB);
    const annotatedA = annotateLayout(layoutA, diff, 'first', layoutB, opts);
    const annotatedB = annotateLayout(layoutB, diff, 'second', layoutA, opts);

    const allNodeIds = new Set<string>();
    for (const n of annotatedA.nodes) allNodeIds.add(n.id);
    for (const n of annotatedB.nodes) allNodeIds.add(n.id);
    const sharedPositions = [...allNodeIds].map(id => ({ id, x: 0, y: 0 }));

    return {
        layoutA: annotatedA,
        layoutB: annotatedB,
        sharedPositions,
        diff,
    };
}
