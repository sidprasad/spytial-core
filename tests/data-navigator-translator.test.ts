import { describe, it, expect, beforeEach } from 'vitest';
import { 
  DataNavigatorTranslator, 
  createDataNavigatorTranslator,
  translateToDataNavigator 
} from '../src/translators/data-navigator/data-navigator-translator';
import { InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup } from '../src/layout/interfaces';

describe('DataNavigatorTranslator', () => {
  let sampleLayout: InstanceLayout;
  let translator: DataNavigatorTranslator;

  beforeEach(() => {
    // Create a sample layout for testing
    const node1: LayoutNode = {
      id: 'node1',
      label: 'Person A',
      color: '#FF6B35',
      width: 60,
      height: 40,
      mostSpecificType: 'Person',
      types: ['Person', 'Entity'],
      showLabels: true,
      attributes: {
        name: ['Alice'],
        age: ['30']
      },
      groups: ['group1']
    };

    const node2: LayoutNode = {
      id: 'node2',
      label: 'Person B',
      color: '#4ECDC4',
      width: 60,
      height: 40,
      mostSpecificType: 'Person',
      types: ['Person', 'Entity'],
      showLabels: true,
      attributes: {
        name: ['Bob'],
        age: ['25']
      },
      groups: ['group1']
    };

    const edge1: LayoutEdge = {
      source: node1,
      target: node2,
      label: 'knows',
      relationName: 'knows',
      id: 'edge1',
      color: '#333'
    };

    const group1: LayoutGroup = {
      name: 'group1',
      nodeIds: ['node1', 'node2'],
      keyNodeId: 'node1',
      showLabel: true
    };

    sampleLayout = {
      nodes: [node1, node2],
      edges: [edge1],
      constraints: [],
      groups: [group1]
    };

    translator = new DataNavigatorTranslator();
  });

  describe('Node Translation', () => {
    it('should translate CnD nodes to Data Navigator nodes', () => {
      const result = translator.translate(sampleLayout);

      expect(result.nodes).toBeDefined();
      expect(Object.keys(result.nodes)).toHaveLength(2);
      
      const node1Result = result.nodes['node1'];
      expect(node1Result).toBeDefined();
      expect(node1Result.id).toBe('node1');
      expect(node1Result.renderId).toBe('node1');
      expect(node1Result.renderingStrategy).toBe('outlineEach');
      expect(node1Result.type).toBe('Person');
      expect(node1Result.groups).toEqual(['group1']);
    });

    it('should create proper render objects with semantic properties', () => {
      const result = translator.translate(sampleLayout);

      expect(result.elementData).toBeDefined();
      const node1Element = result.elementData!['node1'];
      expect(node1Element).toBeDefined();
      expect(node1Element.semantics).toBeDefined();
      
      const semantics = node1Element.semantics!;
      expect(semantics.label).toContain('Person A');
      expect(semantics.label).toContain('Person');
      expect(semantics.label).toContain('name: Alice');
      expect(semantics.label).toContain('age: 30');
      expect(semantics.label).toContain('Member of groups: group1');
      expect(semantics.elementType).toBe('button');
      expect(semantics.role).toBe('button');
    });

    it('should include spatial properties when enabled', () => {
      const result = translator.translate(sampleLayout);

      const node1Element = result.elementData!['node1'];
      expect(node1Element.spatialProperties).toBeDefined();
      expect(node1Element.spatialProperties!.width).toBe(60);
      expect(node1Element.spatialProperties!.height).toBe(40);
    });

    it('should exclude spatial properties when disabled', () => {
      const translator = new DataNavigatorTranslator({
        includeSpatialProperties: false
      });
      const result = translator.translate(sampleLayout);

      const node1Element = result.elementData!['node1'];
      expect(node1Element.spatialProperties).toBeUndefined();
    });
  });

  describe('Edge Translation', () => {
    it('should translate CnD edges to Data Navigator edges', () => {
      const result = translator.translate(sampleLayout);

      expect(result.edges).toBeDefined();
      expect(Object.keys(result.edges)).toHaveLength(1);
      
      const edge1Result = result.edges['edge1'];
      expect(edge1Result).toBeDefined();
      expect(edge1Result.source).toBe('node1');
      expect(edge1Result.target).toBe('node2');
      expect(edge1Result.edgeId).toBe('edge1');
      expect(edge1Result.navigationRules).toContain('nav_edge1');
    });

    it('should update node edge lists', () => {
      const result = translator.translate(sampleLayout);

      expect(result.nodes['node1'].edges).toContain('edge1');
      expect(result.nodes['node2'].edges).toContain('edge1');
    });

    it('should create navigation rules for edges', () => {
      const result = translator.translate(sampleLayout);

      expect(result.navigationRules).toBeDefined();
      const navRule = result.navigationRules!['nav_edge1'];
      expect(navRule).toBeDefined();
      expect(navRule.direction).toBe('target');
      expect(navRule.key).toBe('knows');
    });
  });

  describe('Group Translation', () => {
    it('should translate CnD groups to Data Navigator dimensions', () => {
      const result = translator.translate(sampleLayout);

      expect(result.dimensions).toBeDefined();
      expect(Object.keys(result.dimensions!)).toHaveLength(1);
      
      const groupDimension = result.dimensions!['group_group1'];
      expect(groupDimension).toBeDefined();
      expect(groupDimension.nodeId).toBe('node1');
      expect(groupDimension.dimensionKey).toBe('group1');
      expect(groupDimension.behavior.extents).toBe('terminal');
      expect(groupDimension.behavior.childmostNavigation).toBe('within');
    });

    it('should create group navigation rules', () => {
      const result = translator.translate(sampleLayout);

      expect(result.navigationRules!['nav_sibling_next']).toBeDefined();
      expect(result.navigationRules!['nav_sibling_prev']).toBeDefined();
      expect(result.navigationRules!['nav_child_enter']).toBeDefined();
      expect(result.navigationRules!['nav_parent_exit']).toBeDefined();
    });

    it('should skip group translation when disabled', () => {
      const translator = new DataNavigatorTranslator({
        createDimensions: false
      });
      const result = translator.translate(sampleLayout);

      expect(result.dimensions).toBeUndefined();
    });
  });

  describe('Navigation Rules', () => {
    it('should skip navigation rule generation when disabled', () => {
      const translator = new DataNavigatorTranslator({
        generateNavigationRules: false
      });
      const result = translator.translate(sampleLayout);

      // Should only have edge-related navigation rules, not constraint-derived ones
      const ruleKeys = Object.keys(result.navigationRules || {});
      expect(ruleKeys.every(key => 
        key.startsWith('nav_edge') || 
        key.startsWith('nav_sibling') || 
        key.startsWith('nav_child') || 
        key.startsWith('nav_parent')
      )).toBe(true);
    });
  });

  describe('Custom Generators', () => {
    it('should use custom semantic generator', () => {
      const customSemanticGenerator = (node: LayoutNode) => ({
        label: `Custom: ${node.label}`,
        elementType: 'div',
        role: 'region'
      });

      const translator = new DataNavigatorTranslator({
        nodeSemanticGenerator: customSemanticGenerator
      });
      const result = translator.translate(sampleLayout);

      const node1Element = result.elementData!['node1'];
      expect(node1Element.semantics!.label).toBe('Custom: Person A');
      expect(node1Element.semantics!.elementType).toBe('div');
      expect(node1Element.semantics!.role).toBe('region');
    });

    it('should use custom spatial generator', () => {
      const customSpatialGenerator = (node: LayoutNode) => ({
        x: 100,
        y: 200,
        width: node.width * 2,
        height: node.height * 2
      });

      const translator = new DataNavigatorTranslator({
        spatialPropertyGenerator: customSpatialGenerator
      });
      const result = translator.translate(sampleLayout);

      const node1Element = result.elementData!['node1'];
      expect(node1Element.spatialProperties!.x).toBe(100);
      expect(node1Element.spatialProperties!.y).toBe(200);
      expect(node1Element.spatialProperties!.width).toBe(120); // 60 * 2
      expect(node1Element.spatialProperties!.height).toBe(80); // 40 * 2
    });
  });

  describe('Utility Functions', () => {
    it('should create translator with default options', () => {
      const translator = createDataNavigatorTranslator();
      expect(translator).toBeInstanceOf(DataNavigatorTranslator);
      
      const options = translator.getOptions();
      expect(options.includeSpatialProperties).toBe(true);
      expect(options.generateNavigationRules).toBe(true);
      expect(options.createDimensions).toBe(true);
    });

    it('should create translator with custom options', () => {
      const translator = createDataNavigatorTranslator({
        includeSpatialProperties: false,
        generateNavigationRules: false
      });
      
      const options = translator.getOptions();
      expect(options.includeSpatialProperties).toBe(false);
      expect(options.generateNavigationRules).toBe(false);
      expect(options.createDimensions).toBe(true); // default
    });

    it('should translate layout directly', () => {
      const result = translateToDataNavigator(sampleLayout);
      
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.navigationRules).toBeDefined();
      expect(result.elementData).toBeDefined();
      expect(result.dimensions).toBeDefined();
    });

    it('should translate layout with custom options', () => {
      const result = translateToDataNavigator(sampleLayout, {
        includeSpatialProperties: false
      });
      
      const node1Element = result.elementData!['node1'];
      expect(node1Element.spatialProperties).toBeUndefined();
    });
  });

  describe('Options Management', () => {
    it('should update translator options', () => {
      translator.updateOptions({
        includeSpatialProperties: false,
        generateNavigationRules: false
      });
      
      const options = translator.getOptions();
      expect(options.includeSpatialProperties).toBe(false);
      expect(options.generateNavigationRules).toBe(false);
      expect(options.createDimensions).toBe(true); // unchanged
    });
  });

  describe('Edge Cases', () => {
    it('should handle layout with no nodes', () => {
      const emptyLayout: InstanceLayout = {
        nodes: [],
        edges: [],
        constraints: [],
        groups: []
      };
      
      const result = translator.translate(emptyLayout);
      expect(Object.keys(result.nodes)).toHaveLength(0);
      expect(Object.keys(result.edges)).toHaveLength(0);
    });

    it('should handle layout with no groups', () => {
      const layoutWithoutGroups: InstanceLayout = {
        nodes: sampleLayout.nodes,
        edges: sampleLayout.edges,
        constraints: [],
        groups: []
      };
      
      const result = translator.translate(layoutWithoutGroups);
      expect(result.dimensions).toEqual({});
    });

    it('should handle nodes without attributes', () => {
      const nodeWithoutAttrs: LayoutNode = {
        id: 'simple-node',
        label: 'Simple',
        color: '#000',
        width: 50,
        height: 30,
        mostSpecificType: 'SimpleType', // Different from label to trigger type inclusion
        types: ['SimpleType'],
        showLabels: true
      };
      
      const simpleLayout: InstanceLayout = {
        nodes: [nodeWithoutAttrs],
        edges: [],
        constraints: [],
        groups: []
      };
      
      const result = translator.translate(simpleLayout);
      const nodeElement = result.elementData!['simple-node'];
      expect(nodeElement.semantics!.label).toBe('Simple (SimpleType)');
    });

    it('should handle edges without explicit IDs', () => {
      const edgeWithoutId: LayoutEdge = {
        source: sampleLayout.nodes[0],
        target: sampleLayout.nodes[1],
        label: 'test',
        relationName: 'test',
        id: '', // empty ID
        color: '#333'
      };
      
      const layoutWithAutoId: InstanceLayout = {
        nodes: sampleLayout.nodes,
        edges: [edgeWithoutId],
        constraints: [],
        groups: []
      };
      
      const result = translator.translate(layoutWithAutoId);
      const edgeKeys = Object.keys(result.edges);
      expect(edgeKeys).toHaveLength(1);
      expect(edgeKeys[0]).toMatch(/^edge_node1_node2$/);
    });
  });
});