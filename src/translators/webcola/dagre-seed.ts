import * as dagre from 'dagre';
import type { LayoutNode } from '../../layout/interfaces';

export interface DagreSeedEdge {
  source: string;
  target: string;
  bidirectional?: boolean;
}

const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Seed the displayed graph deterministically. No solver constraints or locks. */
export function computeDagreSeed(nodes: LayoutNode[], edges: DagreSeedEdge[], viewport?: { width: number; height: number }) {
  const orderedNodes = [...nodes].sort((a, b) => compareIds(a.id, b.id));
  const orderedEdges = edges.map(edge => {
    // A double-headed connection has no authored direction. Give DAGRE one
    // stable representative, independent of the renderer's node indices.
    const reverse = edge.bidirectional && compareIds(edge.source, edge.target) > 0;
    const source = reverse ? edge.target : edge.source;
    const target = reverse ? edge.source : edge.target;
    return { source, target };
  }).sort((a, b) => compareIds(a.source, b.source) || compareIds(a.target, b.target));

  const layout = (rankdir: 'TB' | 'LR') => {
    const graph = new dagre.graphlib.Graph({ multigraph: true });
    graph.setGraph({ nodesep: 50, ranksep: 100, rankdir });
    graph.setDefaultEdgeLabel(() => ({}));
    for (const node of orderedNodes) graph.setNode(node.id, { width: node.width, height: node.height });
    for (const edge of orderedEdges) graph.setEdge(edge.source, edge.target);
    dagre.layout(graph);
    return graph;
  };

  const tb = layout('TB');
  if (!viewport || nodes.length < 2 || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
      viewport.width <= 0 || viewport.height <= 0) return tb;
  // Bounds reflect topology and actual box sizes. Fit each candidate like the
  // camera (no zoom beyond 1:1), then compare the fraction of viewport it fills.
  const coverage = (graph: dagre.graphlib.Graph) => {
    const { width, height } = graph.graph();
    const scale = Math.min(1, viewport.width / width!, viewport.height / height!);
    return (width! * scale / viewport.width) * (height! * scale / viewport.height);
  };
  const tbCoverage = coverage(tb);
  if (tbCoverage === 1) return tb;
  const lr = layout('LR');
  // Bias toward the established direction when the gain is small.
  return coverage(lr) > tbCoverage * 1.1 ? lr : tb;
}
