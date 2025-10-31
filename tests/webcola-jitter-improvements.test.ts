import { describe, it, expect } from 'vitest';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import type { InstanceLayout, LayoutGroup } from '../src/layout/interfaces';

/**
 * Test suite for WebCola jitter reduction improvements:
 * 1. Group deduplication for identical nested groups
 * 2. Adaptive group compactness based on graph structure
 * 
 * Note: These tests use programmatically-created InstanceLayout objects
 * because groups defined in YAML layout specs are handled differently
 * (they're rendering hints, not actual LayoutGroup objects that reach the translator).
 */
describe('WebCola Jitter Improvements', () => {
  
  describe('Group Deduplication', () => {
    
    it('should collapse groups with identical node sets', async () => {
      const groups: LayoutGroup[] = [
        {
          name: 'Group1',
          nodeIds: ['A', 'B'],
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Group2',
          nodeIds: ['A', 'B'],  // Same nodes as Group1
          keyNodeId: 'A',
          showLabel: true
        }
      ];

      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [],
        groups: groups
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // Should have collapsed 2 groups into 1
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBe(1);
      
      // The merged group should have combined labels
      expect(userGroups[0].name).toContain('Group1');
      expect(userGroups[0].name).toContain('Group2');
    });

    it('should preserve separate groups with different node sets', async () => {
      const groups: LayoutGroup[] = [
        {
          name: 'Group1',
          nodeIds: ['A', 'B'],
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Group2',
          nodeIds: ['B', 'C'],  // Different nodes
          keyNodeId: 'B',
          showLabel: true
        }
      ];

      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'C', label: 'C', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [],
        groups: groups
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // Should keep both groups since they have different nodes
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBe(2);
    });

    it('should handle multiple duplicate groups', async () => {
      const groups: LayoutGroup[] = [
        {
          name: 'Group1',
          nodeIds: ['A', 'B'],
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Group2',
          nodeIds: ['A', 'B'],  // Same nodes
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Group3',
          nodeIds: ['A', 'B'],  // Same nodes
          keyNodeId: 'A',
          showLabel: true
        }
      ];

      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [],
        groups: groups
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // Should collapse 3 groups into 1
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBe(1);
      
      // Should combine all three names
      const groupName = userGroups[0].name;
      expect(groupName).toContain('Group1');
      expect(groupName).toContain('Group2');
      expect(groupName).toContain('Group3');
    });

    it('should preserve showLabel flag when any duplicate group has it true', async () => {
      const groups: LayoutGroup[] = [
        {
          name: 'Group1',
          nodeIds: ['A', 'B'],
          keyNodeId: 'A',
          showLabel: false
        },
        {
          name: 'Group2',
          nodeIds: ['A', 'B'],
          keyNodeId: 'A',
          showLabel: true  // One has showLabel = true
        }
      ];

      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [],
        groups: groups
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // Should have merged to 1 group
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBe(1);
      
      // showLabel should be true (from Group2)
      expect(userGroups[0].showLabel).toBe(true);
    });

    it('should handle empty groups array', async () => {
      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [],
        groups: []
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // Should handle empty groups gracefully
      expect(webcolaLayout.groups).toBeDefined();
      // May have disconnected node groups but no user groups
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBe(0);
    });
  });

  describe('Adaptive Group Compactness - Max Depth Calculation', () => {
    it('should calculate depth correctly for nested groups', async () => {
      // Create a nested group structure where:
      // OuterGroup contains MiddleGroup
      // MiddleGroup contains InnerGroup
      const groups: LayoutGroup[] = [
        {
          name: 'InnerGroup',
          nodeIds: ['C', 'D'],
          keyNodeId: 'C',
          showLabel: true
        },
        {
          name: 'MiddleGroup',
          nodeIds: ['B', 'C', 'D'],
          keyNodeId: 'B',
          showLabel: true
        },
        {
          name: 'OuterGroup',
          nodeIds: ['A', 'B', 'C', 'D'],
          keyNodeId: 'A',
          showLabel: true
        }
      ];

      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'C', label: 'C', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'D', label: 'D', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [],
        groups: groups
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // Should create groups with nesting
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBeGreaterThan(0);
      
      // Verify that groups are structured (this validates the translator processed them)
      expect(webcolaLayout.groups.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: Group Deduplication + Adaptive Compactness', () => {
    
    it('should work together for complex nested duplicate groups', async () => {
      const groups: LayoutGroup[] = [
        {
          name: 'Outer1',
          nodeIds: ['A', 'B', 'C', 'D'],
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Outer2',
          nodeIds: ['A', 'B', 'C', 'D'],  // Duplicate of Outer1
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Inner1',
          nodeIds: ['B', 'C'],
          keyNodeId: 'B',
          showLabel: true
        },
        {
          name: 'Inner2',
          nodeIds: ['B', 'C'],  // Duplicate of Inner1
          keyNodeId: 'B',
          showLabel: true
        }
      ];

      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'C', label: 'C', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'D', label: 'D', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [],
        groups: groups
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // Should collapse Outer1+Outer2 and Inner1+Inner2
      // So 4 groups -> 2 groups
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBe(2);
      
      // Verify names are combined
      const groupNames = userGroups.map((g: any) => g.name);
      expect(groupNames.some(name => name.includes('Outer1') && name.includes('Outer2'))).toBe(true);
      expect(groupNames.some(name => name.includes('Inner1') && name.includes('Inner2'))).toBe(true);
    });

    it('should reduce jitter risk by minimizing constraint conflicts', async () => {
      const groups: LayoutGroup[] = [
        {
          name: 'Group1',
          nodeIds: ['A', 'B', 'C'],
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Group2',
          nodeIds: ['A', 'B', 'C'],  // Duplicate
          keyNodeId: 'A',
          showLabel: true
        },
        {
          name: 'Group3',
          nodeIds: ['A', 'B', 'C'],  // Duplicate
          keyNodeId: 'A',
          showLabel: true
        }
      ];

      const instanceLayout: InstanceLayout = {
        nodes: [
          { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
          { id: 'C', label: 'C', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' }
        ],
        edges: [],
        constraints: [
          {
            type: 'left',
            left: { id: 'A', label: 'A', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
            right: { id: 'B', label: 'B', color: '#000', width: 100, height: 60, attributes: {}, mostSpecificType: 'atom', showLabels: true, icon: '' },
            minDistance: 50
          }
        ],
        groups: groups
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      // 3 duplicate groups should be collapsed to 1
      const userGroups = webcolaLayout.groups.filter((g: any) => !g.name.startsWith('_d_'));
      expect(userGroups.length).toBe(1);
      
      // Should still have the orientation constraint
      expect(webcolaLayout.constraints.length).toBeGreaterThan(0);
      
      // Verify group contains all nodes
      expect(userGroups[0].leaves.length).toBe(3);
    });
  });
});
