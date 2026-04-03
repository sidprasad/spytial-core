import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { AccessibleTranslator, buildSpatialNavigationMap } from '../src/translators/accessible';
import type { InstanceLayout, LayoutNode, TopConstraint } from '../src/layout/interfaces';
import { RelativeOrientationConstraint } from '../src/layout/layoutspec';

// ─── Test Data: Binary Search Tree ─────────────────────────────────────────
//
//        Node(10)
//       /        \
//    Node(5)    Node(15)
//    /    \     /     \
// Node(3) Node(7) Node(12) Node(18)

const bstData: IJsonDataInstance = {
    atoms: [
        { id: 'Node0', type: 'Node', label: 'Node (10)' },
        { id: 'Node1', type: 'Node', label: 'Node (5)' },
        { id: 'Node2', type: 'Node', label: 'Node (15)' },
        { id: 'Node3', type: 'Node', label: 'Node (3)' },
        { id: 'Node4', type: 'Node', label: 'Node (7)' },
        { id: 'Node5', type: 'Node', label: 'Node (12)' },
        { id: 'Node6', type: 'Node', label: 'Node (18)' },
        { id: 'Int0', type: 'Int', label: '10' },
        { id: 'Int1', type: 'Int', label: '5' },
        { id: 'Int2', type: 'Int', label: '15' },
        { id: 'Int3', type: 'Int', label: '3' },
        { id: 'Int4', type: 'Int', label: '7' },
        { id: 'Int5', type: 'Int', label: '12' },
        { id: 'Int6', type: 'Int', label: '18' },
    ],
    relations: [
        {
            id: 'Node<:left',
            name: 'left',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['Node0', 'Node1'], types: ['Node', 'Node'] }, // 10 -> 5
                { atoms: ['Node1', 'Node3'], types: ['Node', 'Node'] }, // 5 -> 3
                { atoms: ['Node2', 'Node5'], types: ['Node', 'Node'] }, // 15 -> 12
            ],
        },
        {
            id: 'Node<:right',
            name: 'right',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['Node0', 'Node2'], types: ['Node', 'Node'] }, // 10 -> 15
                { atoms: ['Node1', 'Node4'], types: ['Node', 'Node'] }, // 5 -> 7
                { atoms: ['Node2', 'Node6'], types: ['Node', 'Node'] }, // 15 -> 18
            ],
        },
        {
            id: 'Node<:val',
            name: 'val',
            types: ['Node', 'Int'],
            tuples: [
                { atoms: ['Node0', 'Int0'], types: ['Node', 'Int'] },
                { atoms: ['Node1', 'Int1'], types: ['Node', 'Int'] },
                { atoms: ['Node2', 'Int2'], types: ['Node', 'Int'] },
                { atoms: ['Node3', 'Int3'], types: ['Node', 'Int'] },
                { atoms: ['Node4', 'Int4'], types: ['Node', 'Int'] },
                { atoms: ['Node5', 'Int5'], types: ['Node', 'Int'] },
                { atoms: ['Node6', 'Int6'], types: ['Node', 'Int'] },
            ],
        },
    ],
};

// Mirrors the real BST CND spec from sterling-ts/demos/bst/bst.cnd
const bstSpec = `
constraints:
  - orientation:
      selector: left
      directions:
        - left

directives:
  - attribute:
      field: val
  - flag: hideDisconnectedBuiltIns
`;

const bstSpecWithGroup = `
constraints:
  - orientation:
      selector: left
      directions:
        - left
  - group:
      selector: Node
      name: "BST Nodes"

directives:
  - attribute:
      field: val
  - flag: hideDisconnectedBuiltIns
`;

function createLayout(data: IJsonDataInstance, specStr: string) {
    const instance = new JSONDataInstance(data);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    const spec = parseLayoutSpec(specStr);
    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    return layoutInstance.generateLayout(instance);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('AccessibleTranslator', () => {
    describe('translate()', () => {
        it('produces an AccessibleLayout with all required fields', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const result = translator.translate(layout);

            expect(result).toHaveProperty('description');
            expect(result).toHaveProperty('navigation');
            expect(typeof result.toHTML).toBe('function');
            expect(typeof result.toAltText).toBe('function');
        });
    });

    describe('overview', () => {
        it('counts nodes, edges, and types correctly', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            // hideDisconnectedBuiltIns hides Int nodes, so only 7 Node nodes remain
            expect(description.overview.totalNodes).toBe(7);
            expect(description.overview.typesPresent).toContain('Node');
            expect(description.overview.summary).toContain('7 nodes');
        });

        it('produces "empty" summary for empty layout', () => {
            const emptyLayout: InstanceLayout = {
                nodes: [],
                edges: [],
                constraints: [],
                groups: [],
            };
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(emptyLayout);

            expect(description.overview.totalNodes).toBe(0);
            expect(description.overview.summary).toContain('empty');
        });
    });

    describe('type breakdown', () => {
        it('groups nodes by type', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const nodeType = description.types.find(t => t.typeName === 'Node');
            expect(nodeType).toBeDefined();
            expect(nodeType!.nodeCount).toBe(7);
            expect(nodeType!.nodeLabels).toContain('Node (10)');
            expect(nodeType!.nodeLabels).toContain('Node (3)');
        });
    });

    describe('node descriptions', () => {
        it('includes outgoing and incoming edges for tree structure', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            // Root node (10) should have left -> Node(5) and right -> Node(15) outgoing
            const root = description.nodes.find(n => n.label === 'Node (10)');
            expect(root).toBeDefined();

            const leftEdge = root!.outgoing.find(e => e.relation === 'left');
            expect(leftEdge).toBeDefined();
            expect(leftEdge!.connectedNodeLabel).toBe('Node (5)');

            const rightEdge = root!.outgoing.find(e => e.relation === 'right');
            expect(rightEdge).toBeDefined();
            expect(rightEdge!.connectedNodeLabel).toBe('Node (15)');

            // Node(5) should have incoming left edge from Node(10)
            const node5 = description.nodes.find(n => n.label === 'Node (5)');
            expect(node5).toBeDefined();
            const incomingLeft = node5!.incoming.find(e => e.relation === 'left');
            expect(incomingLeft).toBeDefined();
            expect(incomingLeft!.connectedNodeLabel).toBe('Node (10)');
        });

        it('generates readable summary', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const root = description.nodes.find(n => n.label === 'Node (10)');
            expect(root!.summary).toContain('Node (10)');
            expect(root!.summary).toContain('Node');
        });
    });

    describe('relationship summary', () => {
        it('aggregates edges by relation name', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const leftRel = description.relationships.find(r => r.relationName === 'left');
            expect(leftRel).toBeDefined();
            expect(leftRel!.edgeCount).toBe(3);
            expect(leftRel!.sourceTypes).toContain('Node');
            expect(leftRel!.targetTypes).toContain('Node');

            const rightRel = description.relationships.find(r => r.relationName === 'right');
            expect(rightRel).toBeDefined();
            expect(rightRel!.edgeCount).toBe(3);
        });
    });

    describe('spatial relationships', () => {
        it('extracts left-of from LeftConstraints', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            // The spec says left children are positioned to the left
            const leftOfRelationships = description.spatialRelationships.filter(
                sr => sr.kind === 'left-of'
            );
            expect(leftOfRelationships.length).toBeGreaterThan(0);

            // At least one should mention the left selector as reason
            const withLeftReason = leftOfRelationships.filter(sr => sr.reason === 'left');
            expect(withLeftReason.length).toBeGreaterThan(0);
        });

        it('includes the constraint reason (selector)', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const spatial = description.spatialRelationships[0];
            expect(spatial.reason).toBeTruthy();
            expect(spatial.description).toContain('is to the left of');
        });
    });

    describe('group descriptions', () => {
        it('describes groups with member labels', () => {
            const { layout } = createLayout(bstData, bstSpecWithGroup);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            if (description.groups.length > 0) {
                const group = description.groups[0];
                expect(group.nodeCount).toBeGreaterThan(0);
                expect(group.summary).toContain('contains');
            }
        });
    });
});

describe('SpatialNavigationMap', () => {
    describe('from constraints', () => {
        it('maps LeftConstraint to left/right neighbors in BST', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const navMap = buildSpatialNavigationMap(layout);

            // Node(5) is the left child of Node(10), so Node(5) should be to the left
            const rootNeighbors = navMap.getNeighbors('Node0');
            expect(rootNeighbors).toBeDefined();

            // Root should have Node(5) to its left (from the left constraint)
            if (rootNeighbors!.left) {
                expect(rootNeighbors!.left).toBe('Node1'); // Node(5)
            }
        });

        it('includes edge connectivity in neighbors', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const navMap = buildSpatialNavigationMap(layout);

            const rootNeighbors = navMap.getNeighbors('Node0');
            expect(rootNeighbors).toBeDefined();

            // Root should have outgoing left and right edges
            expect(rootNeighbors!.outgoing.length).toBeGreaterThan(0);
            const leftEdge = rootNeighbors!.outgoing.find(e => e.relation === 'left');
            expect(leftEdge).toBeDefined();
            expect(leftEdge!.nodeLabel).toBe('Node (5)');
        });

        it('returns undefined for non-existent nodes', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const navMap = buildSpatialNavigationMap(layout);
            expect(navMap.getNeighbors('NonExistent')).toBeUndefined();
        });
    });

    describe('navigation order', () => {
        it('produces an order containing all nodes', () => {
            const { layout } = createLayout(bstData, bstSpec);
            const navMap = buildSpatialNavigationMap(layout);

            expect(navMap.nodeOrder).toHaveLength(layout.nodes.length);
            for (const node of layout.nodes) {
                expect(navMap.nodeOrder).toContain(node.id);
            }
        });
    });

    describe('transitive reduction', () => {
        it('picks nearest neighbor, not transitive', () => {
            // Manually build: A left-of B left-of C
            const nodeA: LayoutNode = { id: 'A', label: 'A', color: 'black', width: 50, height: 50, mostSpecificType: 'T', types: ['T'], showLabels: true };
            const nodeB: LayoutNode = { id: 'B', label: 'B', color: 'black', width: 50, height: 50, mostSpecificType: 'T', types: ['T'], showLabels: true };
            const nodeC: LayoutNode = { id: 'C', label: 'C', color: 'black', width: 50, height: 50, mostSpecificType: 'T', types: ['T'], showLabels: true };

            const src = new RelativeOrientationConstraint(['above'], 'r');

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB, nodeC],
                edges: [],
                groups: [],
                constraints: [
                    { sourceConstraint: src, top: nodeA, bottom: nodeB, minDistance: 10 } as TopConstraint,
                    { sourceConstraint: src, top: nodeB, bottom: nodeC, minDistance: 10 } as TopConstraint,
                    { sourceConstraint: src, top: nodeA, bottom: nodeC, minDistance: 10 } as TopConstraint,
                ],
            };

            const navMap = buildSpatialNavigationMap(layout);

            // A's nearest below should be B (not C, which is transitively reachable via B)
            const neighborsA = navMap.getNeighbors('A');
            expect(neighborsA!.below).toBe('B');

            // B's nearest below should be C
            const neighborsB = navMap.getNeighbors('B');
            expect(neighborsB!.below).toBe('C');

            // C's nearest above should be B
            const neighborsC = navMap.getNeighbors('C');
            expect(neighborsC!.above).toBe('B');
        });
    });
});

describe('Accessible HTML output', () => {
    it('produces valid ARIA structure', () => {
        const { layout } = createLayout(bstData, bstSpec);
        const translator = new AccessibleTranslator();
        const html = translator.translate(layout).toHTML();

        expect(html).toContain('role="graphics-document"');
        expect(html).toContain('aria-roledescription="diagram"');
        expect(html).toContain('role="tree"');
        expect(html).toContain('role="treeitem"');
        expect(html).toContain('aria-roledescription="diagram node"');
    });

    it('includes data-nav attributes for spatial navigation', () => {
        const { layout } = createLayout(bstData, bstSpec);
        const translator = new AccessibleTranslator();
        const html = translator.translate(layout).toHTML();

        // Should have left/right nav attrs from the left orientation constraint
        const hasNavAttr = html.includes('data-nav-above') ||
            html.includes('data-nav-below') ||
            html.includes('data-nav-left') ||
            html.includes('data-nav-right');
        expect(hasNavAttr).toBe(true);
    });

    it('includes relationships table with left and right edges', () => {
        const { layout } = createLayout(bstData, bstSpec);
        const translator = new AccessibleTranslator();
        const html = translator.translate(layout).toHTML();

        expect(html).toContain('role="grid"');
        expect(html).toContain('Relationships');
        expect(html).toContain('left');
        expect(html).toContain('right');
    });

    it('escapes HTML in node labels', () => {
        const xssData: IJsonDataInstance = {
            atoms: [
                { id: 'A', type: 'T', label: '<script>alert("xss")</script>' },
            ],
            relations: [],
        };
        const { layout } = createLayout(xssData, 'constraints: []');
        const translator = new AccessibleTranslator();
        const html = translator.translate(layout).toHTML();

        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });
});

describe('Alt text output', () => {
    it('produces readable text with spatial relationships', () => {
        const { layout } = createLayout(bstData, bstSpec);
        const translator = new AccessibleTranslator();
        const alt = translator.translate(layout).toAltText();

        expect(alt).toContain('Diagram with');
        expect(alt).toContain('7 nodes');
        expect(alt).toContain('Node');
        expect(alt).toContain('is to the left of');
    });

    it('handles empty layout gracefully', () => {
        const emptyLayout: InstanceLayout = {
            nodes: [],
            edges: [],
            constraints: [],
            groups: [],
        };
        const translator = new AccessibleTranslator();
        const alt = translator.translate(emptyLayout).toAltText();

        expect(alt).toContain('empty');
    });
});
