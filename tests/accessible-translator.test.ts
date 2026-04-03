import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { AccessibleTranslator, buildSpatialNavigationMap } from '../src/translators/accessible';
import type { InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup, TopConstraint, LeftConstraint, AlignmentConstraint } from '../src/layout/interfaces';
import { RelativeOrientationConstraint, AlignConstraint } from '../src/layout/layoutspec';

// ─── Test Data ─────────────────────────────────────────────────────────────

const familyData: IJsonDataInstance = {
    atoms: [
        { id: 'Alice0', type: 'Person', label: 'Alice' },
        { id: 'Bob0', type: 'Person', label: 'Bob' },
        { id: 'Carol0', type: 'Person', label: 'Carol' },
        { id: 'NYC0', type: 'City', label: 'NYC' },
        { id: 'SF0', type: 'City', label: 'SF' },
    ],
    relations: [
        {
            id: 'Person<:parent',
            name: 'parent',
            types: ['Person', 'Person'],
            tuples: [
                { atoms: ['Bob0', 'Alice0'], types: ['Person', 'Person'] },
                { atoms: ['Carol0', 'Alice0'], types: ['Person', 'Person'] },
            ],
        },
        {
            id: 'Person<:livesIn',
            name: 'livesIn',
            types: ['Person', 'City'],
            tuples: [
                { atoms: ['Alice0', 'NYC0'], types: ['Person', 'City'] },
                { atoms: ['Bob0', 'SF0'], types: ['Person', 'City'] },
            ],
        },
    ],
};

const familySpec = `
constraints:
  - orientation:
      selector: parent
      directions:
        - above
`;

const familySpecWithAlign = `
constraints:
  - orientation:
      selector: parent
      directions:
        - above
  - align:
      selector: Person.parent
      direction: horizontal
`;

const familySpecWithGroup = `
constraints:
  - orientation:
      selector: parent
      directions:
        - above
  - group:
      selector: Person
      name: "People"
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
            const { layout } = createLayout(familyData, familySpec);
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
            const { layout } = createLayout(familyData, familySpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            expect(description.overview.totalNodes).toBe(5);
            expect(description.overview.typesPresent).toContain('Person');
            expect(description.overview.typesPresent).toContain('City');
            expect(description.overview.summary).toContain('5 nodes');
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
            const { layout } = createLayout(familyData, familySpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const personType = description.types.find(t => t.typeName === 'Person');
            const cityType = description.types.find(t => t.typeName === 'City');

            expect(personType).toBeDefined();
            expect(personType!.nodeCount).toBe(3);
            expect(personType!.nodeLabels).toContain('Alice');
            expect(personType!.nodeLabels).toContain('Bob');

            expect(cityType).toBeDefined();
            expect(cityType!.nodeCount).toBe(2);
        });
    });

    describe('node descriptions', () => {
        it('includes outgoing and incoming edges', () => {
            const { layout } = createLayout(familyData, familySpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const bob = description.nodes.find(n => n.label === 'Bob');
            expect(bob).toBeDefined();

            // Bob has parent -> Alice (outgoing) and livesIn -> SF (outgoing)
            const parentEdge = bob!.outgoing.find(e => e.relation === 'parent');
            expect(parentEdge).toBeDefined();
            expect(parentEdge!.connectedNodeLabel).toBe('Alice');

            // Alice should have incoming parent edges from Bob and Carol
            const alice = description.nodes.find(n => n.label === 'Alice');
            expect(alice).toBeDefined();
            const incomingParent = alice!.incoming.filter(e => e.relation === 'parent');
            expect(incomingParent.length).toBe(2);
        });

        it('generates readable summary', () => {
            const { layout } = createLayout(familyData, familySpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const alice = description.nodes.find(n => n.label === 'Alice');
            expect(alice!.summary).toContain('Alice');
            expect(alice!.summary).toContain('Person');
        });
    });

    describe('relationship summary', () => {
        it('aggregates edges by relation name', () => {
            const { layout } = createLayout(familyData, familySpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const parentRel = description.relationships.find(r => r.relationName === 'parent');
            expect(parentRel).toBeDefined();
            expect(parentRel!.edgeCount).toBe(2);
            expect(parentRel!.sourceTypes).toContain('Person');
            expect(parentRel!.targetTypes).toContain('Person');
        });
    });

    describe('spatial relationships', () => {
        it('extracts above/below from TopConstraints', () => {
            const { layout } = createLayout(familyData, familySpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            // The spec says parent is "above", so Alice should be above Bob and Carol
            const aboveRelationships = description.spatialRelationships.filter(
                sr => sr.kind === 'above'
            );
            expect(aboveRelationships.length).toBeGreaterThan(0);

            // At least one should mention the parent selector as reason
            const withParentReason = aboveRelationships.filter(sr => sr.reason === 'parent');
            expect(withParentReason.length).toBeGreaterThan(0);
        });

        it('includes the constraint reason (selector)', () => {
            const { layout } = createLayout(familyData, familySpec);
            const translator = new AccessibleTranslator();
            const { description } = translator.translate(layout);

            const spatial = description.spatialRelationships[0];
            expect(spatial.reason).toBeTruthy();
            expect(spatial.description).toContain('is above');
        });
    });

    describe('group descriptions', () => {
        it('describes groups with member labels', () => {
            const { layout } = createLayout(familyData, familySpecWithGroup);
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
        it('maps TopConstraint to above/below neighbors', () => {
            const { layout } = createLayout(familyData, familySpec);
            const navMap = buildSpatialNavigationMap(layout);

            // Alice should be above Bob (parent constraint)
            // So Alice should have Bob (or Carol) below
            const aliceNeighbors = navMap.getNeighbors('Alice0');
            expect(aliceNeighbors).toBeDefined();

            // At least one of Bob or Carol should be below Alice
            const belowAlice = aliceNeighbors!.below;
            if (belowAlice) {
                expect(['Bob0', 'Carol0']).toContain(belowAlice);
            }

            // Bob should have Alice above
            const bobNeighbors = navMap.getNeighbors('Bob0');
            expect(bobNeighbors).toBeDefined();
            expect(bobNeighbors!.above).toBe('Alice0');
        });

        it('includes edge connectivity in neighbors', () => {
            const { layout } = createLayout(familyData, familySpec);
            const navMap = buildSpatialNavigationMap(layout);

            const bobNeighbors = navMap.getNeighbors('Bob0');
            expect(bobNeighbors).toBeDefined();

            // Bob should have outgoing edges (parent -> Alice, livesIn -> SF)
            expect(bobNeighbors!.outgoing.length).toBeGreaterThan(0);
            const parentEdge = bobNeighbors!.outgoing.find(e => e.relation === 'parent');
            expect(parentEdge).toBeDefined();
        });

        it('returns undefined for non-existent nodes', () => {
            const { layout } = createLayout(familyData, familySpec);
            const navMap = buildSpatialNavigationMap(layout);
            expect(navMap.getNeighbors('NonExistent')).toBeUndefined();
        });
    });

    describe('navigation order', () => {
        it('produces an order containing all nodes', () => {
            const { layout } = createLayout(familyData, familySpec);
            const navMap = buildSpatialNavigationMap(layout);

            expect(navMap.nodeOrder).toHaveLength(5);
            for (const node of layout.nodes) {
                expect(navMap.nodeOrder).toContain(node.id);
            }
        });
    });

    describe('transitive reduction', () => {
        it('picks nearest neighbor, not transitive', () => {
            // Manually build a layout with A above B above C
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
        const { layout } = createLayout(familyData, familySpec);
        const translator = new AccessibleTranslator();
        const result = translator.translate(layout);
        const html = result.toHTML();

        expect(html).toContain('role="graphics-document"');
        expect(html).toContain('aria-roledescription="diagram"');
        expect(html).toContain('role="tree"');
        expect(html).toContain('role="treeitem"');
        expect(html).toContain('aria-roledescription="diagram node"');
    });

    it('includes data-nav attributes for spatial navigation', () => {
        const { layout } = createLayout(familyData, familySpec);
        const translator = new AccessibleTranslator();
        const result = translator.translate(layout);
        const html = result.toHTML();

        // Should have at least one data-nav attribute (from orientation constraints)
        const hasNavAttr = html.includes('data-nav-above') ||
            html.includes('data-nav-below') ||
            html.includes('data-nav-left') ||
            html.includes('data-nav-right');
        expect(hasNavAttr).toBe(true);
    });

    it('includes relationships table', () => {
        const { layout } = createLayout(familyData, familySpec);
        const translator = new AccessibleTranslator();
        const html = result(translator, layout);

        expect(html).toContain('role="grid"');
        expect(html).toContain('Relationships');
        expect(html).toContain('parent');
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
        const { layout } = createLayout(familyData, familySpec);
        const translator = new AccessibleTranslator();
        const result = translator.translate(layout);
        const alt = result.toAltText();

        expect(alt).toContain('Diagram with');
        expect(alt).toContain('5 nodes');
        expect(alt).toContain('Person');
        expect(alt).toContain('is above');
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

// Helper for tests that were using wrong pattern
function result(translator: AccessibleTranslator, layout: InstanceLayout): string {
    return translator.translate(layout).toHTML();
}
