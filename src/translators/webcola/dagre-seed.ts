import * as dagre from 'dagre';
import type { LayoutNode } from '../../layout/interfaces';

export type DagreRankDirection = 'TB' | 'LR';

export interface DagreSeedEdge {
  source: string;
  target: string;
  bidirectional?: boolean;
}

const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Seed the displayed graph deterministically. No solver constraints or locks. */
export function computeDagreSeed(nodes: LayoutNode[], edges: DagreSeedEdge[], direction: DagreRankDirection = 'TB') {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ nodesep: 50, ranksep: 100, rankdir: direction });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of [...nodes].sort((a, b) => compareIds(a.id, b.id))) {
    graph.setNode(node.id, { width: node.width, height: node.height });
  }
  const ordered = edges.map(edge => {
    // A double-headed connection has no authored direction. Give DAGRE one
    // stable representative, independent of the renderer's node indices.
    const reverse = edge.bidirectional && compareIds(edge.source, edge.target) > 0;
    const source = reverse ? edge.target : edge.source;
    const target = reverse ? edge.source : edge.target;
    return { source, target };
  }).sort((a, b) => compareIds(a.source, b.source) || compareIds(a.target, b.target));
  for (const edge of ordered) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);
  return graph;
}
