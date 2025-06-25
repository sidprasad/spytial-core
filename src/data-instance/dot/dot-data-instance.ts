import type { Graph } from 'graphlib';
import parse from 'graphlib-dot';
import type { IDataInstance, IAtom, IType, IRelation } from '../interfaces';
import {dotToAlloyXMLString} from './dot-to-alloy-xml';
import { AlloyDatum, parseAlloyXML } from '../alloy/alloy-instance';
import { AlloyDataInstance } from '../alloy-data-instance';

/**
 * Simple DOT data instance implementation
 * Converts DOT graphs to the IDataInstance interface with proper type handling
 * Leverages type information from DOT annotations and builtin type detection
 */
export class DotDataInstance implements IDataInstance {
  private readonly alloyDatum : AlloyDatum;
  private readonly alloyDataInstance: AlloyDataInstance; 


  constructor(dotSpec: string) {
    const alloyXMLString = dotToAlloyXMLString(dotSpec);
    this.alloyDatum = parseAlloyXML(alloyXMLString);

    // Assumption
    const ai = this.alloyDatum.instances[0];
    this.alloyDataInstance = new AlloyDataInstance(ai);

  }

  public getAtomType(id: string): IType {
    return this.alloyDataInstance.getAtomType(id);
  }

  public getTypes(): readonly IType[] {
    return this.alloyDataInstance.getTypes();
  }

  public getAtoms(): readonly IAtom[] {
    return this.alloyDataInstance.getAtoms();
  }

  public getRelations(): readonly IRelation[] {
    return this.alloyDataInstance.getRelations();
  }

  public applyProjections(atomIds: string[]): IDataInstance {
    const projectedInstance : AlloyDataInstance = this.alloyDataInstance.applyProjections(atomIds);
    
    return  projectedInstance;
  }

  public generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph {
    console.log('Generating graph from DOT data instance with hideDisconnected:', hideDisconnected, 'hideDisconnectedBuiltIns:', hideDisconnectedBuiltIns);
    return this.alloyDataInstance.generateGraph(hideDisconnected, hideDisconnectedBuiltIns);
  }

}