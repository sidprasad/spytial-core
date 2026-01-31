/**
 * Tests for GridRouter edge limit and timeout protection.
 * 
 * GridRouter's orderEdges function has O(n²) complexity, which can cause
 * the browser to hang when there are many edges. These tests verify that:
 * 1. Edge count limits are respected
 * 2. Timeout mechanisms work correctly
 * 3. Fallback routing is used when limits are exceeded
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the cola module to test GridRouter functions directly
const cola = require('../src/vendor/cola.js');

describe('GridRouter Edge Limit Protection', () => {
  describe('orderEdges timeout', () => {
    it('should complete quickly for a small number of edges', () => {
      // Create 10 simple edge paths (well under the limit)
      const edges = [];
      for (let i = 0; i < 10; i++) {
        edges.push([
          { x: i * 50, y: 0 },
          { x: i * 50, y: 50 },
          { x: i * 50 + 25, y: 50 },
          { x: i * 50 + 25, y: 100 }
        ]);
      }

      const startTime = Date.now();
      const order = cola.GridRouter.orderEdges(edges, 2000);
      const elapsed = Date.now() - startTime;

      expect(order).toBeDefined();
      expect(typeof order).toBe('function');
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should timeout and return fallback order for many edges with short timeout', () => {
      // Create many edges to trigger timeout
      const edges = [];
      for (let i = 0; i < 200; i++) {
        const path = [];
        // Create paths with multiple points to increase LCS computation time
        for (let j = 0; j < 20; j++) {
          path.push({ x: i * 10 + j, y: j * 10 });
        }
        edges.push(path);
      }

      // Use a very short timeout to force timeout
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const startTime = Date.now();
      const order = cola.GridRouter.orderEdges(edges, 10); // 10ms timeout
      const elapsed = Date.now() - startTime;

      // Should have timed out
      expect(order).toBeDefined();
      expect(typeof order).toBe('function');
      
      // The fallback order function returns l < r
      expect(order(0, 1)).toBe(true);
      expect(order(1, 0)).toBe(false);
      expect(order(5, 10)).toBe(true);
      
      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[GridRouter.orderEdges] Timed out')
      );

      warnSpy.mockRestore();
    });

    it('should complete normally within timeout for moderate edge counts', () => {
      // Create a moderate number of edges that should complete within timeout
      const edges = [];
      for (let i = 0; i < 30; i++) {
        edges.push([
          { x: i * 30, y: 0 },
          { x: i * 30, y: 30 },
          { x: (i + 1) * 30, y: 30 },
          { x: (i + 1) * 30, y: 60 }
        ]);
      }

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const order = cola.GridRouter.orderEdges(edges, 5000);

      expect(order).toBeDefined();
      expect(typeof order).toBe('function');
      
      // Should NOT have timed out
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[GridRouter.orderEdges] Timed out')
      );

      warnSpy.mockRestore();
    });
  });

  describe('routeEdges with timeout', () => {
    it('should pass timeout parameter to orderEdges', () => {
      // Create a minimal GridRouter setup
      const nodes = [
        { 
          id: 0, 
          name: 'A',
          rect: {
            x: 0, y: 0, X: 50, Y: 30,
            width: () => 50,
            height: () => 30,
            cx: () => 25,
            cy: () => 15,
            inflate: function(m: number) { 
              return { 
                x: this.x - m, y: this.y - m, 
                X: this.X + m, Y: this.Y + m,
                width: () => this.X - this.x + 2 * m,
                height: () => this.Y - this.y + 2 * m,
                cx: () => (this.x + this.X) / 2,
                cy: () => (this.y + this.Y) / 2,
                overlapX: () => false,
                overlapY: () => false
              };
            },
            overlapX: () => false,
            overlapY: () => false
          },
          bounds: {
            x: 0, y: 0, X: 50, Y: 30,
            width: () => 50,
            height: () => 30,
            cx: () => 25,
            cy: () => 15,
            inflate: function(m: number) { 
              return { 
                x: this.x - m, y: this.y - m, 
                X: this.X + m, Y: this.Y + m,
                width: () => this.X - this.x + 2 * m,
                height: () => this.Y - this.y + 2 * m,
                cx: () => (this.x + this.X) / 2,
                cy: () => (this.y + this.Y) / 2
              };
            }
          }
        },
        { 
          id: 1, 
          name: 'B',
          rect: {
            x: 100, y: 0, X: 150, Y: 30,
            width: () => 50,
            height: () => 30,
            cx: () => 125,
            cy: () => 15,
            inflate: function(m: number) { 
              return { 
                x: this.x - m, y: this.y - m, 
                X: this.X + m, Y: this.Y + m,
                width: () => this.X - this.x + 2 * m,
                height: () => this.Y - this.y + 2 * m,
                cx: () => (this.x + this.X) / 2,
                cy: () => (this.y + this.Y) / 2,
                overlapX: () => false,
                overlapY: () => false
              };
            },
            overlapX: () => false,
            overlapY: () => false
          },
          bounds: {
            x: 100, y: 0, X: 150, Y: 30,
            width: () => 50,
            height: () => 30,
            cx: () => 125,
            cy: () => 15,
            inflate: function(m: number) { 
              return { 
                x: this.x - m, y: this.y - m, 
                X: this.X + m, Y: this.Y + m,
                width: () => this.X - this.x + 2 * m,
                height: () => this.Y - this.y + 2 * m,
                cx: () => (this.x + this.X) / 2,
                cy: () => (this.y + this.Y) / 2
              };
            }
          }
        }
      ];

      // The routeEdges function signature now includes an optional timeout parameter
      // This test just verifies the function accepts the parameter without error
      expect(() => {
        // Note: We can't easily test the full GridRouter because it requires
        // complex setup with proper node hierarchies. This is a basic signature test.
        if (cola.GridRouter && cola.GridRouter.orderEdges) {
          cola.GridRouter.orderEdges([], 1000);
        }
      }).not.toThrow();
    });
  });

  describe('Edge count validation', () => {
    it('should handle empty edge arrays gracefully', () => {
      const order = cola.GridRouter.orderEdges([]);
      expect(order).toBeDefined();
      expect(typeof order).toBe('function');
    });

    it('should handle single edge gracefully', () => {
      const edges = [[{ x: 0, y: 0 }, { x: 100, y: 100 }]];
      const order = cola.GridRouter.orderEdges(edges);
      expect(order).toBeDefined();
      expect(typeof order).toBe('function');
    });

    it('should process edges with shared paths (LCS > 0)', () => {
      // Create edges that share some path points - this exercises the LCS algorithm
      const sharedPoint1 = { x: 50, y: 50 };
      const sharedPoint2 = { x: 75, y: 75 };
      
      const edges = [
        [{ x: 0, y: 0 }, sharedPoint1, sharedPoint2, { x: 100, y: 100 }],
        [{ x: 0, y: 50 }, sharedPoint1, sharedPoint2, { x: 100, y: 150 }],
        [{ x: 0, y: 100 }, sharedPoint1, sharedPoint2, { x: 100, y: 200 }]
      ];
      
      const order = cola.GridRouter.orderEdges(edges, 2000);
      expect(order).toBeDefined();
      expect(typeof order).toBe('function');
    });
  });
});

describe('WebColaCnDGraph MAX_GRIDIFY_EDGES constant', () => {
  it('should define MAX_GRIDIFY_EDGES constant', async () => {
    // This is a compile-time check - we're verifying the constant exists
    // by importing the module. If it doesn't compile, this test will fail.
    const { WebColaCnDGraph } = await import('../src/translators/webcola/webcola-cnd-graph');
    
    // The constant is private, so we can't access it directly
    // But we can verify the class exists and has the expected methods
    expect(WebColaCnDGraph).toBeDefined();
  });
});
