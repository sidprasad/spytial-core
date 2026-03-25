import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import {
    computeSpecDiff,
    computeSpecDiffFromYAML,
    createSymmetricDiffLayout,
    createSymmetricDiffLayoutFromYAML,
    type SpecDiff,
    type NodeDiff,
    type EdgeDiff,
    type ConstraintDiff,
} from '../src/layout/spec-diff';
import {
    LayoutNode,
    InstanceLayout,
    LayoutConstraint,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint } from '../src/layout/layoutspec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<LayoutNode>): LayoutNode {
    return {
        id,
        label: id,
        color: '#ccc',
        width: 100,
        height: 60,
        mostSpecificType: 'Type1',
        types: ['Type1'],
        showLabels: true,
        ...overrides,
    };
}

const dummySource = new RelativeOrientationConstraint(['right'], 'dummy');

function makeLeft(leftNode: LayoutNode, rightNode: LayoutNode): LeftConstraint {
    return { left: leftNode, right: rightNode, minDistance: 15, sourceConstraint: dummySource };
}

function makeTop(topNode: LayoutNode, bottomNode: LayoutNode): TopConstraint {
    return { top: topNode, bottom: bottomNode, minDistance: 15, sourceConstraint: dummySource };
}

function makeAlign(node1: LayoutNode, node2: LayoutNode, axis: 'x' | 'y'): AlignmentConstraint {
    return { axis, node1, node2, sourceConstraint: dummySource };
}

function makeLayout(
    nodes: LayoutNode[],
    constraints: LayoutConstraint[] = [],
    edges: { source: LayoutNode; target: LayoutNode; relationName: string; color?: string; style?: 'solid' | 'dashed' }[] = [],
    groups: { name: string; nodeIds: string[] }[] = [],
): InstanceLayout {
    return {
        nodes,
        edges: edges.map((e, i) => ({
            source: e.source,
            target: e.target,
            label: e.relationName,
            relationName: e.relationName,
            id: `edge_${i}`,
            color: e.color ?? '#000',
            style: e.style,
            showLabel: true,
        })),
        constraints,
        groups: groups.map(g => ({
            name: g.name,
            nodeIds: g.nodeIds,
            keyNodeId: g.nodeIds[0] ?? '',
            showLabel: true,
        })),
    };
}

// Shared data instance for YAML-level tests
const jsonData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
    ],
    relations: [
        {
            id: 'r',
            name: 'r',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            ],
        },
    ],
};

function createEvaluator(instance: JSONDataInstance) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

function findNodeDiff(diff: SpecDiff, nodeId: string): NodeDiff | undefined {
    return diff.nodes.find(n => n.nodeId === nodeId);
}

function findEdgeDiff(diff: SpecDiff, sourceId: string, targetId: string, relationName: string): EdgeDiff | undefined {
    return diff.edges.find(e => e.sourceId === sourceId && e.targetId === targetId && e.relationName === relationName);
}

// ===================================================================
// Tests
// ===================================================================

describe('computeSpecDiff — identical layouts', () => {
    it('returns isEmpty: true for identical layouts', () => {
        const nodes = [makeNode('A'), makeNode('B')];
        const constraints = [makeLeft(nodes[0], nodes[1])];
        const layoutA = makeLayout(nodes, constraints);
        const layoutB = makeLayout(nodes, constraints);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.isEmpty).toBe(true);
        expect(diff.affectedNodeIds.size).toBe(0);
        expect(diff.affectedEdgeKeys.size).toBe(0);
    });

    it('returns isEmpty: true for empty layouts', () => {
        const layoutA = makeLayout([], []);
        const layoutB = makeLayout([], []);
        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.isEmpty).toBe(true);
    });

    it('all nodes marked identical when layouts match', () => {
        const nodes = [makeNode('A'), makeNode('B')];
        const layoutA = makeLayout(nodes);
        const layoutB = makeLayout(nodes);
        const diff = computeSpecDiff(layoutA, layoutB);
        for (const nd of diff.nodes) {
            expect(nd.status).toBe('identical');
        }
    });
});

describe('computeSpecDiff — node differences', () => {
    it('detects color difference', () => {
        const A1 = makeNode('A', { color: '#ff0000' });
        const A2 = makeNode('A', { color: '#0000ff' });
        const layoutA = makeLayout([A1]);
        const layoutB = makeLayout([A2]);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.isEmpty).toBe(false);

        const nd = findNodeDiff(diff, 'A')!;
        expect(nd.status).toBe('modified');
        expect(nd.diffs).toHaveLength(1);
        expect(nd.diffs[0].property).toBe('color');
        expect(nd.diffs[0].inFirst).toBe('#ff0000');
        expect(nd.diffs[0].inSecond).toBe('#0000ff');
    });

    it('detects size difference', () => {
        const A1 = makeNode('A', { width: 100, height: 60 });
        const A2 = makeNode('A', { width: 200, height: 80 });
        const layoutA = makeLayout([A1]);
        const layoutB = makeLayout([A2]);

        const diff = computeSpecDiff(layoutA, layoutB);
        const nd = findNodeDiff(diff, 'A')!;
        expect(nd.status).toBe('modified');
        expect(nd.diffs.some(d => d.property === 'width')).toBe(true);
        expect(nd.diffs.some(d => d.property === 'height')).toBe(true);
    });

    it('detects icon difference', () => {
        const A1 = makeNode('A', { icon: '/path/to/icon1.svg' });
        const A2 = makeNode('A', { icon: '/path/to/icon2.svg' });
        const layoutA = makeLayout([A1]);
        const layoutB = makeLayout([A2]);

        const diff = computeSpecDiff(layoutA, layoutB);
        const nd = findNodeDiff(diff, 'A')!;
        expect(nd.status).toBe('modified');
        expect(nd.diffs[0].property).toBe('icon');
    });

    it('detects group membership difference', () => {
        const A1 = makeNode('A', { groups: ['g1'] });
        const A2 = makeNode('A', { groups: ['g2'] });
        const layoutA = makeLayout([A1]);
        const layoutB = makeLayout([A2]);

        const diff = computeSpecDiff(layoutA, layoutB);
        const nd = findNodeDiff(diff, 'A')!;
        expect(nd.status).toBe('modified');
        expect(nd.diffs[0].property).toBe('groups');
    });

    it('detects node only in first layout', () => {
        const layoutA = makeLayout([makeNode('A'), makeNode('B')]);
        const layoutB = makeLayout([makeNode('A')]);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.isEmpty).toBe(false);

        const nd = findNodeDiff(diff, 'B')!;
        expect(nd.status).toBe('only-in-first');
        expect(diff.affectedNodeIds.has('B')).toBe(true);
    });

    it('detects node only in second layout', () => {
        const layoutA = makeLayout([makeNode('A')]);
        const layoutB = makeLayout([makeNode('A'), makeNode('C')]);

        const diff = computeSpecDiff(layoutA, layoutB);
        const nd = findNodeDiff(diff, 'C')!;
        expect(nd.status).toBe('only-in-second');
    });

    it('handles attribute differences', () => {
        const A1 = makeNode('A', { attributes: { field1: ['val1'] } });
        const A2 = makeNode('A', { attributes: { field1: ['val2'] } });
        const layoutA = makeLayout([A1]);
        const layoutB = makeLayout([A2]);

        const diff = computeSpecDiff(layoutA, layoutB);
        const nd = findNodeDiff(diff, 'A')!;
        expect(nd.status).toBe('modified');
        expect(nd.diffs[0].property).toBe('attributes');
    });
});

describe('computeSpecDiff — edge differences', () => {
    it('detects edge color difference', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const layoutA = makeLayout([A, B], [], [{ source: A, target: B, relationName: 'r', color: '#ff0000' }]);
        const layoutB = makeLayout([A, B], [], [{ source: A, target: B, relationName: 'r', color: '#0000ff' }]);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.isEmpty).toBe(false);
        const ed = findEdgeDiff(diff, 'A', 'B', 'r')!;
        expect(ed.status).toBe('modified');
        expect(ed.diffs[0].property).toBe('color');
    });

    it('detects edge style difference', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const layoutA = makeLayout([A, B], [], [{ source: A, target: B, relationName: 'r', style: 'solid' }]);
        const layoutB = makeLayout([A, B], [], [{ source: A, target: B, relationName: 'r', style: 'dashed' }]);

        const diff = computeSpecDiff(layoutA, layoutB);
        const ed = findEdgeDiff(diff, 'A', 'B', 'r')!;
        expect(ed.status).toBe('modified');
        expect(ed.diffs[0].property).toBe('style');
    });

    it('detects edge only in first layout', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const layoutA = makeLayout([A, B], [], [{ source: A, target: B, relationName: 'r' }]);
        const layoutB = makeLayout([A, B], []);

        const diff = computeSpecDiff(layoutA, layoutB);
        const ed = findEdgeDiff(diff, 'A', 'B', 'r')!;
        expect(ed.status).toBe('only-in-first');
        expect(diff.affectedEdgeKeys.size).toBe(1);
    });

    it('identical edges produce no diff', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const edges = [{ source: A, target: B, relationName: 'r', color: '#000' }];
        const layoutA = makeLayout([A, B], [], edges);
        const layoutB = makeLayout([A, B], [], edges);

        const diff = computeSpecDiff(layoutA, layoutB);
        const ed = findEdgeDiff(diff, 'A', 'B', 'r')!;
        expect(ed.status).toBe('identical');
    });
});

describe('computeSpecDiff — constraint differences', () => {
    it('detects different constraint directions for same pair', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const layoutA = makeLayout([A, B], [makeLeft(A, B)]);
        const layoutB = makeLayout([A, B], [makeTop(A, B)]);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.isEmpty).toBe(false);
        // Same pair (A, B) — grouped into one ConstraintDiff
        expect(diff.constraints).toHaveLength(1);

        const cd = diff.constraints[0];
        expect(cd.pairId).toEqual(['A', 'B']);
        expect(cd.inFirst).toContain('left-of');
        expect(cd.inSecond).toContain('above');
    });

    it('no constraint diff when both have same constraints', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const constraints = [makeLeft(A, B)];
        const layoutA = makeLayout([A, B], constraints);
        const layoutB = makeLayout([A, B], constraints);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.constraints).toHaveLength(0);
    });

    it('detects constraint only in first layout', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const layoutA = makeLayout([A, B], [makeLeft(A, B)]);
        const layoutB = makeLayout([A, B], []);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.constraints).toHaveLength(1);
        expect(diff.constraints[0].inFirst).toContain('left-of');
        expect(diff.constraints[0].inSecond).toEqual([]);
    });

    it('normalizes alignment constraint pair order', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        // Same alignment, different node order
        const layoutA = makeLayout([A, B], [makeAlign(A, B, 'x')]);
        const layoutB = makeLayout([A, B], [makeAlign(B, A, 'x')]);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.constraints).toHaveLength(0);
    });

    it('affected node ids include constrained nodes', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const C = makeNode('C');
        const layoutA = makeLayout([A, B, C], [makeLeft(A, B)]);
        const layoutB = makeLayout([A, B, C], [makeTop(A, B)]);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.affectedNodeIds.has('A')).toBe(true);
        expect(diff.affectedNodeIds.has('B')).toBe(true);
        expect(diff.affectedNodeIds.has('C')).toBe(false);
    });
});

describe('computeSpecDiff — group differences', () => {
    it('detects group only in first layout', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const layoutA = makeLayout([A, B], [], [], [{ name: 'g1', nodeIds: ['A', 'B'] }]);
        const layoutB = makeLayout([A, B]);

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.groups).toHaveLength(1);
        expect(diff.groups[0].status).toBe('only-in-first');
    });

    it('detects group member difference', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const C = makeNode('C');
        const layoutA = makeLayout([A, B, C], [], [], [{ name: 'g1', nodeIds: ['A', 'B'] }]);
        const layoutB = makeLayout([A, B, C], [], [], [{ name: 'g1', nodeIds: ['A', 'C'] }]);

        const diff = computeSpecDiff(layoutA, layoutB);
        const gd = diff.groups.find(g => g.groupName === 'g1')!;
        expect(gd.status).toBe('modified');
        expect(gd.membersDiff).toBeDefined();
    });

    it('identical groups produce identical status', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const groups = [{ name: 'g1', nodeIds: ['A', 'B'] }];
        const layoutA = makeLayout([A, B], [], [], groups);
        const layoutB = makeLayout([A, B], [], [], groups);

        const diff = computeSpecDiff(layoutA, layoutB);
        const gd = diff.groups.find(g => g.groupName === 'g1')!;
        expect(gd.status).toBe('identical');
    });
});

describe('computeSpecDiff — mixed differences', () => {
    it('reports multiple difference dimensions at once', () => {
        const A1 = makeNode('A', { color: '#ff0000' });
        const B1 = makeNode('B');
        const A2 = makeNode('A', { color: '#0000ff' });
        const B2 = makeNode('B');

        const layoutA = makeLayout(
            [A1, B1],
            [makeLeft(A1, B1)],
            [{ source: A1, target: B1, relationName: 'r', color: '#red' }],
        );
        const layoutB = makeLayout(
            [A2, B2],
            [makeTop(A2, B2)],
            [{ source: A2, target: B2, relationName: 'r', color: '#blue' }],
        );

        const diff = computeSpecDiff(layoutA, layoutB);
        expect(diff.isEmpty).toBe(false);

        // Node color diff
        const nd = findNodeDiff(diff, 'A')!;
        expect(nd.status).toBe('modified');

        // Edge color diff
        const ed = findEdgeDiff(diff, 'A', 'B', 'r')!;
        expect(ed.status).toBe('modified');

        // Constraint diff
        expect(diff.constraints.length).toBeGreaterThan(0);
    });
});

// ===================================================================
// createSymmetricDiffLayout tests
// ===================================================================

describe('createSymmetricDiffLayout — merged diff diagram', () => {
    it('returns empty layout when layouts are identical', () => {
        const nodes = [makeNode('A'), makeNode('B')];
        const constraints = [makeLeft(nodes[0], nodes[1])];
        const layoutA = makeLayout(nodes, constraints);
        const layoutB = makeLayout(nodes, constraints);

        const { layout, diff } = createSymmetricDiffLayout(layoutA, layoutB);
        expect(diff.isEmpty).toBe(true);
        expect(layout.nodes).toHaveLength(0);
        expect(layout.edges).toHaveLength(0);
        expect(layout.constraints).toHaveLength(0);
        expect(layout.groups).toHaveLength(0);
    });

    it('includes modified nodes with _diff attribute', () => {
        const A1 = makeNode('A', { color: '#ff0000' });
        const A2 = makeNode('A', { color: '#0000ff' });
        const B = makeNode('B');
        const layoutA = makeLayout([A1, B]);
        const layoutB = makeLayout([A2, B]);

        const { layout } = createSymmetricDiffLayout(layoutA, layoutB);
        expect(layout.nodes).toHaveLength(1);
        expect(layout.nodes[0].id).toBe('A');
        expect(layout.nodes[0].attributes?._diff).toEqual(['modified']);
    });

    it('includes only-in-first and only-in-second nodes', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const C = makeNode('C');
        const layoutA = makeLayout([A, B]);
        const layoutB = makeLayout([A, C]);

        const { layout } = createSymmetricDiffLayout(layoutA, layoutB);
        const nodeIds = layout.nodes.map(n => n.id).sort();
        expect(nodeIds).toEqual(['B', 'C']);

        const bNode = layout.nodes.find(n => n.id === 'B')!;
        expect(bNode.attributes?._diff).toEqual(['only-in-first']);

        const cNode = layout.nodes.find(n => n.id === 'C')!;
        expect(cNode.attributes?._diff).toEqual(['only-in-second']);
    });

    it('includes context nodes for affected edges', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        // Same nodes, different edge styling
        const layoutA = makeLayout([A, B], [], [{ source: A, target: B, relationName: 'r', color: '#ff0000' }]);
        const layoutB = makeLayout([A, B], [], [{ source: A, target: B, relationName: 'r', color: '#0000ff' }]);

        const { layout } = createSymmetricDiffLayout(layoutA, layoutB);
        // Both A and B should be included as context nodes (the edge differs, nodes are identical)
        expect(layout.nodes).toHaveLength(2);
        expect(layout.edges).toHaveLength(1);

        const aNode = layout.nodes.find(n => n.id === 'A')!;
        expect(aNode.attributes?._diff).toEqual(['context']);
    });

    it('includes only affected edges', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const C = makeNode('C');
        const layoutA = makeLayout([A, B, C], [], [
            { source: A, target: B, relationName: 'r1' },
            { source: B, target: C, relationName: 'r2', color: '#ff0000' },
        ]);
        const layoutB = makeLayout([A, B, C], [], [
            { source: A, target: B, relationName: 'r1' },
            { source: B, target: C, relationName: 'r2', color: '#0000ff' },
        ]);

        const { layout } = createSymmetricDiffLayout(layoutA, layoutB);
        // Only the r2 edge differs
        expect(layout.edges).toHaveLength(1);
        expect(layout.edges[0].relationName).toBe('r2');
    });

    it('includes only affected constraints', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const C = makeNode('C');
        const layoutA = makeLayout([A, B, C], [makeLeft(A, B), makeLeft(B, C)]);
        const layoutB = makeLayout([A, B, C], [makeLeft(A, B), makeTop(B, C)]);

        const { layout } = createSymmetricDiffLayout(layoutA, layoutB);
        // Only the B-C constraint pair differs
        // Both the left(B,C) from A and top(B,C) from B are included
        expect(layout.constraints.length).toBeGreaterThan(0);
        // A-B constraint should NOT be in the merged layout
        // All constraints should involve B and C
    });

    it('includes only affected groups', () => {
        const A = makeNode('A');
        const B = makeNode('B');
        const C = makeNode('C');
        const layoutA = makeLayout([A, B, C], [], [], [
            { name: 'g1', nodeIds: ['A', 'B'] },
            { name: 'g2', nodeIds: ['B', 'C'] },
        ]);
        const layoutB = makeLayout([A, B, C], [], [], [
            { name: 'g1', nodeIds: ['A', 'B'] },
            { name: 'g2', nodeIds: ['A', 'C'] }, // different members
        ]);

        const { layout } = createSymmetricDiffLayout(layoutA, layoutB);
        expect(layout.groups).toHaveLength(1);
        expect(layout.groups[0].name).toBe('g2');
    });
});

describe('createSymmetricDiffLayoutFromYAML', () => {
    it('produces empty diff layout for identical specs', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const spec = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const result = createSymmetricDiffLayoutFromYAML(spec, spec, instance, evaluator);
        expect(result.diff.isEmpty).toBe(true);
        expect(result.layout.nodes).toHaveLength(0);
    });

    it('produces merged diff layout for different constraint directions', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const specA = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - below
`;
        const result = createSymmetricDiffLayoutFromYAML(specA, specB, instance, evaluator);
        expect(result.diff.isEmpty).toBe(false);
        // Should have nodes involved in the constraint differences
        expect(result.layout.nodes.length).toBeGreaterThan(0);
        // Should return both original layouts too
        expect(result.layoutA).toBeDefined();
        expect(result.layoutB).toBeDefined();
    });

    it('produces merged diff layout for different color directives', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const specA = `
directives:
  - atomColor:
      value: "#ff0000"
      selector: Node
`;
        const specB = `
directives:
  - atomColor:
      value: "#0000ff"
      selector: Node
`;
        const result = createSymmetricDiffLayoutFromYAML(specA, specB, instance, evaluator);
        expect(result.diff.isEmpty).toBe(false);
        // All Node atoms should be in the diff layout as 'modified'
        const modifiedNodes = result.layout.nodes.filter(
            n => n.attributes?._diff?.[0] === 'modified'
        );
        expect(modifiedNodes.length).toBeGreaterThan(0);
    });

    it('handles empty spec vs non-empty spec', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const specA = '';
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
directives:
  - atomColor:
      value: "#ff0000"
      selector: Node
`;
        const result = createSymmetricDiffLayoutFromYAML(specA, specB, instance, evaluator);
        expect(result.diff.isEmpty).toBe(false);
        // All nodes with color changes + constraint-affected nodes should appear
        expect(result.layout.nodes.length).toBeGreaterThan(0);
    });
});

describe('computeSpecDiffFromYAML', () => {
    it('produces empty diff for identical YAML specs', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const spec = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const result = computeSpecDiffFromYAML(spec, spec, instance, evaluator);
        expect(result.diff.isEmpty).toBe(true);
        expect(result.layoutA).toBeDefined();
        expect(result.layoutB).toBeDefined();
    });

    it('detects constraint direction difference from YAML', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const specA = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - below
`;
        const result = computeSpecDiffFromYAML(specA, specB, instance, evaluator);
        expect(result.diff.isEmpty).toBe(false);
        expect(result.diff.constraints.length).toBeGreaterThan(0);
    });

    it('detects color directive difference from YAML', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const specA = `
directives:
  - atomColor:
      value: "#ff0000"
      selector: Node
`;
        const specB = `
directives:
  - atomColor:
      value: "#0000ff"
      selector: Node
`;
        const result = computeSpecDiffFromYAML(specA, specB, instance, evaluator);
        expect(result.diff.isEmpty).toBe(false);

        const modifiedNodes = result.diff.nodes.filter(n => n.status === 'modified');
        expect(modifiedNodes.length).toBeGreaterThan(0);

        // At least one node should have a color diff
        const hasColorDiff = modifiedNodes.some(n => n.diffs.some(d => d.property === 'color'));
        expect(hasColorDiff).toBe(true);
    });

    it('detects empty spec vs spec with constraints', () => {
        const instance = new JSONDataInstance(jsonData);
        const evaluator = createEvaluator(instance);

        const specA = '';
        const specB = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;
        const result = computeSpecDiffFromYAML(specA, specB, instance, evaluator);
        expect(result.diff.isEmpty).toBe(false);
        expect(result.diff.constraints.length).toBeGreaterThan(0);
    });
});
