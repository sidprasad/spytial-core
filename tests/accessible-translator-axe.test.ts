/**
 * axe-core accessibility audit of AccessibleTranslator HTML output.
 *
 * This is an automated baseline — it catches structural ARIA violations
 * (missing roles, invalid nesting, unlabelled regions, etc.) but cannot
 * evaluate whether the output is *useful* for screen reader users.
 * See todo/accessible-translator-evaluation.md for the full evaluation plan.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import axe from 'axe-core';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { AccessibleTranslator } from '../src/translators/accessible';
import type { InstanceLayout } from '../src/layout/interfaces';

// ─── Test Data: BST ────────────────────────────────────────────────────────

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
            id: 'Node<:left', name: 'left', types: ['Node', 'Node'],
            tuples: [
                { atoms: ['Node0', 'Node1'], types: ['Node', 'Node'] },
                { atoms: ['Node1', 'Node3'], types: ['Node', 'Node'] },
                { atoms: ['Node2', 'Node5'], types: ['Node', 'Node'] },
            ],
        },
        {
            id: 'Node<:right', name: 'right', types: ['Node', 'Node'],
            tuples: [
                { atoms: ['Node0', 'Node2'], types: ['Node', 'Node'] },
                { atoms: ['Node1', 'Node4'], types: ['Node', 'Node'] },
                { atoms: ['Node2', 'Node6'], types: ['Node', 'Node'] },
            ],
        },
        {
            id: 'Node<:val', name: 'val', types: ['Node', 'Int'],
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

const bstSpec = `
constraints:
  - orientation:
      selector: left
      directions: [left]
directives:
  - attribute:
      field: val
  - flag: hideDisconnectedBuiltIns
`;

const bstSpecWithGroup = `
constraints:
  - orientation:
      selector: left
      directions: [left]
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

/**
 * Insert HTML into the global jsdom document, run axe-core, clean up.
 * Uses the vitest jsdom environment so axe's instanceof checks work.
 */
async function auditHTML(html: string): Promise<axe.Result[]> {
    // Create a container in the global document
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    try {
        const results = await axe.run(container, {
            runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'best-practice'],
            },
        });
        return results.violations;
    } finally {
        document.body.removeChild(container);
    }
}

function formatViolations(violations: axe.Result[]): string {
    return violations.map(v =>
        `[${v.impact}] ${v.id}: ${v.description}\n` +
        v.nodes.map(n => `  - ${n.html.substring(0, 120)}`).join('\n')
    ).join('\n\n');
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('axe-core accessibility audit', () => {
    it('BST output has no WCAG 2.1 AA violations', async () => {
        const { layout } = createLayout(bstData, bstSpec);
        const translator = new AccessibleTranslator();
        const html = translator.translate(layout).toHTML();

        const violations = await auditHTML(html);

        if (violations.length > 0) {
            console.error('axe violations:\n' + formatViolations(violations));
        }
        expect(violations).toHaveLength(0);
    });

    it('BST with groups has no WCAG 2.1 AA violations', async () => {
        const { layout } = createLayout(bstData, bstSpecWithGroup);
        const translator = new AccessibleTranslator();
        const html = translator.translate(layout).toHTML();

        const violations = await auditHTML(html);

        if (violations.length > 0) {
            console.error('axe violations:\n' + formatViolations(violations));
        }
        expect(violations).toHaveLength(0);
    });

    it('empty layout has no violations', async () => {
        const emptyLayout: InstanceLayout = {
            nodes: [], edges: [], constraints: [], groups: [],
        };
        const translator = new AccessibleTranslator();
        const html = translator.translate(emptyLayout).toHTML();

        const violations = await auditHTML(html);
        expect(violations).toHaveLength(0);
    });

    it('single node has no violations', async () => {
        const singleData: IJsonDataInstance = {
            atoms: [{ id: 'A', type: 'Thing', label: 'OnlyNode' }],
            relations: [],
        };
        const { layout } = createLayout(singleData, 'constraints: []');
        const translator = new AccessibleTranslator();
        const html = translator.translate(layout).toHTML();

        const violations = await auditHTML(html);
        expect(violations).toHaveLength(0);
    });
});
