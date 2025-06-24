import type { Graph } from 'graphlib';
import parse from 'graphlib-dot';

/**
 * Escape special XML characters in strings for safe XML output
 * 
 * @param str - String to escape for XML
 * @returns XML-safe string with escaped characters
 */
function xmlEscape(str: string): string {
  return str.replace(/[<>&"']/g, (char) => {
    const escapeMap: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;'
    };
    return escapeMap[char] || char;
  });
}

/**
 * Convert DOT specification to well-formed Alloy XML string
 * Generates proper Alloy instance XML with required built-in signatures
 * and correctly formatted field types using ID references
 * 
 * @param dotSpec - DOT graph specification as string
 * @returns Well-formed Alloy XML string with proper instance structure
 * @throws {Error} When DOT specification cannot be parsed
 * 
 * @example
 * ```typescript
 * const dotText = `digraph { A -> B [label="connects"]; }`;
 * const alloyXml = dotToAlloyXMLString(dotText);
 * // Returns properly formatted Alloy XML with built-in signatures
 * ```
 */
export function dotToAlloyXMLString(dotSpec: string): string {
  let graph: Graph;
  
  try {
    graph = parse.read(dotSpec) as Graph;
  } catch (error) {
    throw new Error(`Failed to parse DOT specification: ${(error as Error).message}`);
  }

  const nodes = graph.nodes();
  const edges = graph.edges();

  // Initialize XML with declaration and alloy root element
  let xml = '<?xml version="1.0"?>\n';
  xml += '<alloy>\n';
  
  // Add instance element with required attributes for Alloy compatibility
  xml += '  <instance bitwidth="4" maxseq="7" command="Run Default for 4 but 8 int, 4 seq" filename="">\n';

  // Always include required built-in signatures with consistent IDs and hierarchy
  xml += '    <sig label="seq/Int" ID="0" parentID="1" builtin="yes">\n';
  xml += '    </sig>\n';
  
  xml += '    <sig label="Int" ID="1" parentID="2" builtin="yes">\n';
  xml += '    </sig>\n';
  
  xml += '    <sig label="univ" ID="2" builtin="yes">\n';
  xml += '    </sig>\n';

  // Collect and categorize node types from DOT attributes
  const nodeTypes = new Map<string, Set<string>>();
  const sigIdMap = new Map<string, number>(); // Track signature IDs for type references
  let nextSigId = 3; // Start after built-in signatures

  // Process all nodes to determine their types
  for (const nodeId of nodes) {
    const nodeData = graph.node(nodeId) || {};
    
    // Determine node type from DOT attributes with fallback to default
    let nodeType = 'Node';
    
    if (nodeData.type) {
      nodeType = String(nodeData.type);
    } else if (nodeData.shape) {
      nodeType = String(nodeData.shape);
    }
    
    if (!nodeTypes.has(nodeType)) {
      nodeTypes.set(nodeType, new Set());
    }
    nodeTypes.get(nodeType)!.add(nodeId);
  }

  // Generate signature definitions for each unique node type
  for (const [typeName, nodeIds] of nodeTypes) {
    const sigId = nextSigId++;
    sigIdMap.set(typeName, sigId);
    
    xml += `    <sig label="${xmlEscape(typeName)}" ID="${sigId}" parentID="2">\n`;
    
    // Add atom elements for all nodes of this type
    for (const nodeId of nodeIds) {
      xml += `      <atom label="${xmlEscape(nodeId)}"/>\n`;
    }
    
    xml += '    </sig>\n';
  }

  // Group edges by their label/type for field generation
  const edgeGroups = new Map<string, Array<{ source: string; target: string }>>();

  for (const edge of edges) {
    const edgeData = graph.edge(edge) || {};
    const label = (edgeData.label && String(edgeData.label).trim()) || 'edges';
    
    if (!edgeGroups.has(label)) {
      edgeGroups.set(label, []);
    }
    
    edgeGroups.get(label)!.push({
      source: edge.v,
      target: edge.w
    });
  }

  // Generate field definitions for each edge group with proper type references
  for (const [fieldName, edgeList] of edgeGroups) {
    const fieldId = nextSigId++;
    xml += `    <field label="${xmlEscape(fieldName)}" ID="${fieldId}" parentID="2">\n`;
    
    // Add tuple elements first (as shown in your example)
    for (const edge of edgeList) {
      xml += '      <tuple>\n';
      xml += `        <atom label="${xmlEscape(edge.source)}"/>\n`;
      xml += `        <atom label="${xmlEscape(edge.target)}"/>\n`;
      xml += '      </tuple>\n';
    }
    
    // Add types section with ID references to univ (ID=2) for binary relations
    xml += '      <types>\n';
    xml += '        <type ID="2"/>\n'; // univ for source
    xml += '        <type ID="2"/>\n'; // univ for target
    xml += '      </types>\n';
    
    xml += '    </field>\n';
  }

  // Close instance and alloy root elements
  xml += '  </instance>\n';
  xml += '</alloy>\n';

  return xml;
}

// Example usage (uncomment to use as CLI):
// import { readFileSync } from 'fs';
// const dotInput = readFileSync('input.dot', 'utf-8');
// console.log(dotToAlloyXMLString(dotInput));
