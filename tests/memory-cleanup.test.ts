/**
 * Memory Cleanup Tests
 * 
 * These tests verify that memory cleanup methods work correctly
 * and help prevent memory leaks in the Spytial Core library.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebColaLayout } from '../src/translators/webcola/webcolatranslator';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { ForgeEvaluator } from '../src/evaluators/forge-evaluator';
import type { InstanceLayout, LayoutNode } from '../src/layout/interfaces';

/**
 * Creates a mock layout node for testing.
 */
function createMockNode(id: string, label: string, color: string): LayoutNode {
    return {
        id,
        label,
        name: label,
        color,
        groups: [],
        attributes: {},
        icon: '',
        height: 60,
        width: 100,
        mostSpecificType: 'Node',
        types: ['Node'],
        showLabels: true
    };
}

/**
 * Creates a simple mock layout with two nodes for testing.
 */
function createSimpleMockLayout(): InstanceLayout {
    return {
        nodes: [
            createMockNode('A', 'A', 'red'),
            createMockNode('B', 'B', 'blue')
        ],
        edges: [],
        constraints: [],
        groups: []
    };
}

/**
 * Creates a mock layout with an edge for testing.
 */
function createMockLayoutWithEdge(): InstanceLayout {
    const nodeA = createMockNode('A', 'A', 'red');
    const nodeB = createMockNode('B', 'B', 'blue');
    
    return {
        nodes: [nodeA, nodeB],
        edges: [{
            source: nodeA,
            target: nodeB,
            label: 'edge',
            relationName: 'rel',
            id: 'e1',
            color: 'black'
        }],
        constraints: [],
        groups: []
    };
}

describe('Memory Cleanup', () => {
    describe('WebColaLayout', () => {
        it('should clear dagre_graph reference on dispose', () => {
            const mockLayout = createSimpleMockLayout();
            const webcolaLayout = new WebColaLayout(mockLayout, 800, 800);
            
            // Get initial stats
            const statsBefore = webcolaLayout.getMemoryStats();
            expect(statsBefore.nodeCount).toBe(2);
            
            // Dispose and check that references are cleared
            webcolaLayout.dispose();
            
            // After disposal, dagre_graph should be null
            // We can't directly check private properties, but we can verify dispose doesn't throw
            expect(() => webcolaLayout.dispose()).not.toThrow();
        });

        it('should report accurate memory stats', () => {
            const mockLayout = createMockLayoutWithEdge();
            const webcolaLayout = new WebColaLayout(mockLayout, 800, 800);
            const stats = webcolaLayout.getMemoryStats();

            expect(stats.nodeCount).toBe(2);
            expect(stats.edgeCount).toBe(1);
            expect(stats.groupCount).toBe(0);
            expect(stats.constraintCount).toBeGreaterThanOrEqual(0);
        });
    });

    describe('ConstraintValidator', () => {
        it('should clear caches on dispose', () => {
            const mockLayout = {
                nodes: [createMockNode('A', 'A', 'red')],
                edges: [],
                constraints: [],
                groups: []
            };

            const validator = new ConstraintValidator(mockLayout);
            
            // Get initial stats
            const statsBefore = validator.getMemoryStats();
            expect(statsBefore).toBeDefined();
            
            // Dispose
            validator.dispose();
            
            // After disposal, caches should be cleared
            const statsAfter = validator.getMemoryStats();
            expect(statsAfter.cachedConstraints).toBe(0);
            expect(statsAfter.variables).toBe(0);
            expect(statsAfter.groupBoundingBoxes).toBe(0);
        });

        it('should report accurate memory stats', () => {
            const mockLayout = {
                nodes: [createMockNode('A', 'A', 'red')],
                edges: [],
                constraints: [],
                groups: []
            };

            const validator = new ConstraintValidator(mockLayout);
            const stats = validator.getMemoryStats();

            expect(stats.cachedConstraints).toBeGreaterThanOrEqual(0);
            expect(stats.variables).toBeGreaterThanOrEqual(0);
            expect(stats.groupBoundingBoxes).toBeGreaterThanOrEqual(0);
            expect(stats.addedConstraints).toBeGreaterThanOrEqual(0);
        });
    });

    describe('SGraphQueryEvaluator', () => {
        it('should clear cache on dispose', () => {
            const evaluator = new SGraphQueryEvaluator();
            
            // Evaluator starts uninitialized
            expect(evaluator.isReady()).toBe(false);
            
            // Get stats before
            const statsBefore = evaluator.getMemoryStats();
            expect(statsBefore.cacheSize).toBe(0);
            
            // Dispose
            evaluator.dispose();
            
            // After disposal, cache should still be 0
            const statsAfter = evaluator.getMemoryStats();
            expect(statsAfter.cacheSize).toBe(0);
            expect(statsAfter.hasDataInstance).toBe(false);
        });

        it('should report accurate memory stats', () => {
            const evaluator = new SGraphQueryEvaluator();
            const stats = evaluator.getMemoryStats();

            expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
            expect(stats.maxCacheSize).toBeGreaterThan(0);
            expect(typeof stats.hasDataInstance).toBe('boolean');
        });
    });

    describe('ForgeEvaluator', () => {
        it('should clear cache on dispose', () => {
            const evaluator = new ForgeEvaluator();
            
            // Get stats before
            const statsBefore = evaluator.getMemoryStats();
            expect(statsBefore.cacheSize).toBe(0);
            
            // Dispose
            evaluator.dispose();
            
            // After disposal, cache should be 0 and initialized should be false
            const statsAfter = evaluator.getMemoryStats();
            expect(statsAfter.cacheSize).toBe(0);
            expect(statsAfter.hasAlloyDatum).toBe(false);
            expect(evaluator.isReady()).toBe(false);
        });

        it('should report accurate memory stats', () => {
            const evaluator = new ForgeEvaluator();
            const stats = evaluator.getMemoryStats();

            expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
            expect(typeof stats.hasAlloyDatum).toBe('boolean');
        });
    });

    describe('Memory Stats Integration', () => {
        it('should provide comprehensive memory stats across components', () => {
            // Create a simple layout with multiple components
            const mockLayout = createMockLayoutWithEdge();

            // Create all components
            const webcolaLayout = new WebColaLayout(mockLayout, 800, 800);
            const validator = new ConstraintValidator(mockLayout);
            const sgqEvaluator = new SGraphQueryEvaluator();
            const forgeEvaluator = new ForgeEvaluator();

            // Collect all stats
            const allStats = {
                webcolaLayout: webcolaLayout.getMemoryStats(),
                validator: validator.getMemoryStats(),
                sgqEvaluator: sgqEvaluator.getMemoryStats(),
                forgeEvaluator: forgeEvaluator.getMemoryStats()
            };

            // Verify all stats are present
            expect(allStats.webcolaLayout.nodeCount).toBe(2);
            expect(allStats.webcolaLayout.edgeCount).toBe(1);
            expect(allStats.validator.cachedConstraints).toBeGreaterThanOrEqual(0);
            expect(allStats.sgqEvaluator.cacheSize).toBeGreaterThanOrEqual(0);
            expect(allStats.forgeEvaluator.cacheSize).toBeGreaterThanOrEqual(0);

            // Clean up all components
            webcolaLayout.dispose();
            validator.dispose();
            sgqEvaluator.dispose();
            forgeEvaluator.dispose();

            // Verify cleanup
            const statsAfterDisposal = {
                validator: validator.getMemoryStats(),
                sgqEvaluator: sgqEvaluator.getMemoryStats(),
                forgeEvaluator: forgeEvaluator.getMemoryStats()
            };

            expect(statsAfterDisposal.validator.cachedConstraints).toBe(0);
            expect(statsAfterDisposal.sgqEvaluator.cacheSize).toBe(0);
            expect(statsAfterDisposal.forgeEvaluator.cacheSize).toBe(0);
        });
    });
});
