import type { Graph } from 'graphlib';
import parse from 'graphlib-dot';
import type { IDataInstance, IAtom, IType, IRelation, IInputDataInstance } from '../interfaces';

import { AlloyDatum, parseAlloyXML } from '../alloy/alloy-instance';
import { AlloyDataInstance } from '../alloy-data-instance';

/**
 * Simple DOT data instance implementation
 * Converts DOT graphs to the IDataInstance interface with proper type handling
 * Leverages type information from DOT annotations and builtin type detection
 */
export class DotDataInstance implements IInputDataInstance {


  private graph : Graph;
  constructor(dotSpec: string) {
  
    this.graph = parse.read(dotSpec);

  }


  reify() : string {
      // Convert the graph back to DOT format
      return parse.write(this.graph);
    }

  
  getAtoms(): readonly IAtom[] {
    const atoms: IAtom[] = [];
    this.graph.nodes().forEach((nodeId) => {
      const node = this.graph.node(nodeId);
      if (node && node.label) {
        atoms.push({
          id: nodeId,
          type: node.type || 'unknown',
          label: node.label
        });
      }
    });
    return atoms;
  }


  

 }
