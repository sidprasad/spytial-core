import { describe, it, expect } from 'vitest';
import { ConstraintValidator, orientationConstraintToString, PositionalConstraintError } from '../src/layout/constraint-validator';
import { 
    InstanceLayout, 
    LayoutNode, 
    LeftConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint } from '../src/layout/layoutspec';

describe('IIS Reporting Format', () => {
    
    // Helper to create a node with attributes
    function createNodeWithAttributes(id: string, label: string, attributes?: Record<string, string[]>): LayoutNode {
        return {
            id,
            label,
            color: 'black',
            groups: [],
            attributes: attributes || {},
            width: 100,
            height: 60,
            mostSpecificType: 'Node',
            types: ['Node'],
            showLabels: true,
        };
    }

    // Helper to create a left constraint
    function createLeftConstraint(left: LayoutNode, right: LayoutNode, source: any): LeftConstraint {
        return {
            left,
            right,
            minDistance: 15,
            sourceConstraint: source,
        };
    }

    it('should show attributes in error messages when present', () => {
        // Create nodes with attributes
        const nodeA = createNodeWithAttributes('atom1', 'Person', {
            'name': ['Alice'],
            'age': ['30']
        });
        const nodeB = createNodeWithAttributes('atom2', 'Person', {
            'name': ['Bob']
        });

        const source1 = new RelativeOrientationConstraint(['left'], 'A->B');
        const constraint = createLeftConstraint(nodeA, nodeB, source1);

        const errorMessage = orientationConstraintToString(constraint);
        
        // Should include attributes in the display
        expect(errorMessage).toContain('Person');
        expect(errorMessage).toContain('name: Alice');
        // Should not show bare IDs when attributes are present
        expect(errorMessage).not.toContain('atom1');
        expect(errorMessage).not.toContain('atom2');
    });

    it('should truncate long attribute values', () => {
        const nodeA = createNodeWithAttributes('atom1', 'Document', {
            'content': ['This is a very long content string that should be truncated in the display']
        });
        const nodeB = createNodeWithAttributes('atom2', 'Document', {
            'title': ['Short title']
        });

        const source = new RelativeOrientationConstraint(['left'], 'A->B');
        const constraint = createLeftConstraint(nodeA, nodeB, source);

        const errorMessage = orientationConstraintToString(constraint);
        
        // Should truncate long values
        expect(errorMessage).toContain('...');
        expect(errorMessage).not.toContain('This is a very long content string that should be truncated in the display');
    });

    it('should limit number of attributes shown', () => {
        const nodeA = createNodeWithAttributes('atom1', 'Person', {
            'name': ['Alice'],
            'age': ['30'],
            'city': ['New York'],
            'country': ['USA']
        });
        const nodeB = createNodeWithAttributes('atom2', 'Person', {
            'name': ['Bob']
        });

        const source = new RelativeOrientationConstraint(['left'], 'A->B');
        const constraint = createLeftConstraint(nodeA, nodeB, source);

        const errorMessage = orientationConstraintToString(constraint);
        
        // Should show ellipsis for additional attributes
        expect(errorMessage).toContain('...');
        // Should show at most 2 attributes plus ellipsis
        const attrMatches = errorMessage.match(/:/g);
        // At most 4 colons (2 per node, max 2 attributes per node)
        expect(attrMatches ? attrMatches.length : 0).toBeLessThanOrEqual(4);
    });

    it('should show id with explanation when no attributes present', () => {
        const nodeA = createNodeWithAttributes('atom1', 'Node A', {});
        const nodeB = createNodeWithAttributes('atom2', 'Node B', {});

        const source = new RelativeOrientationConstraint(['left'], 'A->B');
        const constraint = createLeftConstraint(nodeA, nodeB, source);

        const errorMessage = orientationConstraintToString(constraint);
        
        // Should show label with ID and tooltip
        expect(errorMessage).toContain('Node A');
        expect(errorMessage).toContain('id = atom1');
        expect(errorMessage).toContain('title=');
        expect(errorMessage).toContain('unique identifier');
    });

    it('should handle nodes with only id (no label)', () => {
        const nodeA = createNodeWithAttributes('atom1', 'atom1', {});
        const nodeB = createNodeWithAttributes('atom2', 'atom2', {});

        const source = new RelativeOrientationConstraint(['left'], 'A->B');
        const constraint = createLeftConstraint(nodeA, nodeB, source);

        const errorMessage = orientationConstraintToString(constraint);
        
        // Should show ID with tooltip when label equals ID
        expect(errorMessage).toContain('atom1');
        expect(errorMessage).toContain('atom2');
        expect(errorMessage).toContain('title=');
        expect(errorMessage).toContain('unique identifier');
    });

    it('should generate proper IIS error with attributes in full constraint validation', () => {
        // Create a cycle with nodes that have attributes
        const nodeA = createNodeWithAttributes('atom1', 'Person', { 'name': ['Alice'] });
        const nodeB = createNodeWithAttributes('atom2', 'Person', { 'name': ['Bob'] });
        const nodeC = createNodeWithAttributes('atom3', 'Person', { 'name': ['Charlie'] });

        const source1 = new RelativeOrientationConstraint(['left'], 'A->B');
        const source2 = new RelativeOrientationConstraint(['left'], 'B->C');
        const source3 = new RelativeOrientationConstraint(['left'], 'C->A'); // Creates cycle

        const constraints: LeftConstraint[] = [
            createLeftConstraint(nodeA, nodeB, source1),
            createLeftConstraint(nodeB, nodeC, source2),
            createLeftConstraint(nodeC, nodeA, source3),
        ];

        const layout: InstanceLayout = {
            nodes: [nodeA, nodeB, nodeC],
            edges: [],
            constraints: constraints,
            groups: [],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        // Should fail due to cycle
        expect(error).not.toBeNull();
        expect(error?.type).toBe('positional-conflict');

        if (error && 'message' in error) {
            const errorMessage = error.message;
            // Error message should include attribute information
            expect(errorMessage).toContain('name:');
            // Should show Person labels
            expect(errorMessage).toContain('Person');
        }
    });
});
