/**
 * @fileoverview
 * Tests for DOT data instance implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { read } from 'graphlib-dot';
import { 
  DotDataInstance, 
  createDotDataInstanceFromGraph, 
  createExampleDotGraph,
  isDotDataInstance,
  type DotConfig 
} from '../src/data-instance/dot/dot-data-instance';

describe('DotDataInstance', () => {
  let sampleGraph: ReturnType<typeof createExampleDotGraph>;
  let dataInstance: DotDataInstance;

  beforeEach(() => {
    sampleGraph = createExampleDotGraph();
    dataInstance = createDotDataInstanceFromGraph(sampleGraph) as DotDataInstance;
  });

  describe('Constructor and Basic Properties', () => {
    it('should create instance with default config', () => {
      expect(dataInstance).toBeInstanceOf(DotDataInstance);
      expect(isDotDataInstance(dataInstance)).toBe(true);
    });

    it('should create instance with custom config', () => {
      const config: Partial<DotConfig> = {
        defaultNodeType: 'CustomNode',
        createTypesFromShapes: false
      };
      
      const customInstance = createDotDataInstanceFromGraph(sampleGraph, config) as DotDataInstance;
      expect(isDotDataInstance(customInstance)).toBe(true);
    });
  });

  describe('Types', () => {
    it('should return all types', () => {
      const types = dataInstance.getTypes();
      expect(types.length).toBeGreaterThan(0);
      
      // Should have default node type
      const nodeType = types.find(t => t.id === 'Node');
      expect(nodeType).toBeDefined();
      expect(nodeType?.isBuiltin).toBe(false);
    });

    it('should create types from shapes when configured', () => {
      const types = dataInstance.getTypes();
      
      // Should have shape-based types
      const boxType = types.find(t => t.id === 'box');
      const ellipseType = types.find(t => t.id === 'ellipse');
      
      expect(boxType).toBeDefined();
      expect(ellipseType).toBeDefined();
    });

    it('should get atom type correctly', () => {
      const atomType = dataInstance.getAtomType('A');
      expect(atomType).toBeDefined();
      expect(atomType?.id).toBe('box'); // From example graph
    });
  });

  describe('Atoms', () => {
    it('should return all atoms', () => {
      const atoms = dataInstance.getAtoms();
      expect(atoms.length).toBe(3); // A, B, C from example
      
      const atomIds = atoms.map(a => a.id);
      expect(atomIds).toContain('A');
      expect(atomIds).toContain('B');
      expect(atomIds).toContain('C');
    });

    it('should assign correct types to atoms', () => {
      const atoms = dataInstance.getAtoms();
      
      const atomA = atoms.find(a => a.id === 'A');
      const atomB = atoms.find(a => a.id === 'B');
      const atomC = atoms.find(a => a.id === 'C');
      
      expect(atomA?.type).toBe('box');
      expect(atomB?.type).toBe('ellipse');
      expect(atomC?.type).toBe('diamond');
    });
  });

  describe('Relations', () => {
    it('should return all relations', () => {
      const relations = dataInstance.getRelations();
      expect(relations.length).toBeGreaterThan(0);
      
      // Should have default edge relation
      const edgeRelation = relations.find(r => r.id === 'edge');
      expect(edgeRelation).toBeDefined();
      expect(edgeRelation?.types.length).toBe(2);
    });
  });

  describe('Tuples', () => {
    it('should return tuples through relations', () => {
      const relations = dataInstance.getRelations();
      const edgeRelation = relations.find(r => r.id === 'edge');
      
      expect(edgeRelation).toBeDefined();
      expect(edgeRelation?.tuples.length).toBe(2); // A->B and B->C from example
      
      // Check specific tuples
      const tupleAB = edgeRelation?.tuples.find(t => 
        t.atoms.includes('A') && t.atoms.includes('B')
      );
      const tupleBC = edgeRelation?.tuples.find(t => 
        t.atoms.includes('B') && t.atoms.includes('C')
      );
      
      expect(tupleAB).toBeDefined();
      expect(tupleBC).toBeDefined();
    });
  });

  describe('Projections', () => {
    it('should apply projections correctly', () => {
      const projected = dataInstance.applyProjections(['A', 'B']);
      
      const atoms = projected.getAtoms();
      const atomIds = atoms.map(a => a.id);
      
      expect(atomIds).toContain('A');
      expect(atomIds).toContain('B');
      expect(atomIds).not.toContain('C');
    });

    it('should filter edges in projections', () => {
      const projected = dataInstance.applyProjections(['A', 'B']);
      const relations = projected.getRelations();
      
      // Should have edge relation for A->B connection
      const edgeRelation = relations.find(r => r.id === 'edge');
      expect(edgeRelation).toBeDefined();
      expect(edgeRelation?.tuples.length).toBe(1);
      expect(edgeRelation?.tuples[0].atoms).toEqual(['A', 'B']);
    });
  });

  describe('Graph Generation', () => {
    it('should generate graph representation', () => {
      const graph = dataInstance.generateGraph();
      
      expect(graph.nodeCount()).toBe(3);
      expect(graph.edgeCount()).toBe(2);
      expect(graph.isDirected()).toBe(true);
    });

    it('should handle disconnected node filtering', () => {
      // Create graph with disconnected node
      const graphWithDisconnected = createExampleDotGraph();
      graphWithDisconnected.setNode('isolated', { label: 'Isolated' });
      
      const instance = createDotDataInstanceFromGraph(graphWithDisconnected) as DotDataInstance;
      const filteredGraph = instance.generateGraph(true, false);
      
      expect(filteredGraph.hasNode('isolated')).toBe(false);
    });
  });
});

describe('DOT Parsing Integration', () => {
  const sampleDotText = `
    digraph test {
      rankdir=TB;
      
      A [label="Node A", shape=box, type="Entity"];
      B [label="Node B", shape=ellipse, type="Entity"];
      C [label="Relation C", shape=diamond, type="Relation"];
      
      A -> B [label="connects", weight=1.0];
      B -> C [label="belongs_to", weight=2.0];
    }
  `;

  it('should parse DOT text correctly', () => {
    const graph = read(sampleDotText);
    expect(graph.nodeCount()).toBe(3);
    expect(graph.edgeCount()).toBe(2);
  });

  it('should create data instance from parsed graph', () => {
    const graph = read(sampleDotText);
    const dataInstance = createDotDataInstanceFromGraph(graph);
    
    expect(isDotDataInstance(dataInstance)).toBe(true);
    expect(dataInstance.getAtoms().length).toBe(3);
    
    // Check relations have tuples
    const relations = dataInstance.getRelations();
    const edgeRelation = relations.find(r => r.id === 'edge');
    expect(edgeRelation?.tuples.length).toBe(2);
  });

  it('should preserve node attributes', () => {
    const graph = read(sampleDotText);
    const nodeA = graph.node('A');
    
    expect(nodeA.label).toBe('Node A');
    expect(nodeA.shape).toBe('box');
    expect(nodeA.type).toBe('Entity');
  });

  it('should preserve edge attributes', () => {
    const graph = read(sampleDotText);
    const edgeAB = graph.edge('A', 'B');
    
    expect(edgeAB.label).toBe('connects');
    expect(edgeAB.weight).toBe('1.0');
  });
});

describe('Configuration Options', () => {
  let sampleGraph: ReturnType<typeof createExampleDotGraph>;

  beforeEach(() => {
    sampleGraph = createExampleDotGraph();
  });

  it('should respect includeNodeAttributes config', () => {
    const config: Partial<DotConfig> = {
      includeNodeAttributes: true
    };
    
    const dataInstance = createDotDataInstanceFromGraph(sampleGraph, config);
    const relations = dataInstance.getRelations();
    
    // Should have attribute relations
    const labelRelation = relations.find(r => r.id === 'node_label');
    expect(labelRelation).toBeDefined();
  });

  it('should respect includeEdgeAttributes config', () => {
    const config: Partial<DotConfig> = {
      includeEdgeAttributes: true
    };
    
    const dataInstance = createDotDataInstanceFromGraph(sampleGraph, config);
    const relations = dataInstance.getRelations();
    
    // Should have edge attribute relations
    const weightRelation = relations.find(r => r.id === 'edge_weight');
    expect(weightRelation).toBeDefined();
  });

  it('should respect createTypesFromShapes config', () => {
    const config: Partial<DotConfig> = {
      createTypesFromShapes: false
    };
    
    const dataInstance = createDotDataInstanceFromGraph(sampleGraph, config);
    const types = dataInstance.getTypes();
    
    // Should only have default type, not shape-based types
    expect(types.length).toBe(1);
    expect(types[0].id).toBe('Node');
  });

  it('should use custom nodeTypeAttribute', () => {
    // Add type attribute to nodes
    sampleGraph.setNode('A', { 
      ...sampleGraph.node('A'), 
      customType: 'SpecialEntity' 
    });
    
    const config: Partial<DotConfig> = {
      nodeTypeAttribute: 'customType',
      createTypesFromShapes: false
    };
    
    const dataInstance = createDotDataInstanceFromGraph(sampleGraph, config);
    
    // Should create type for custom attribute
    const types = dataInstance.getTypes();
    const specialType = types.find(t => t.id === 'SpecialEntity');
    expect(specialType).toBeDefined();
  });
});
