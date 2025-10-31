import { Graph, Edge } from 'graphlib';
import { IAtom, IDataInstance, IType } from '../data-instance/interfaces';
import { PositionalConstraintError, GroupOverlapError, isPositionalConstraintError, isGroupOverlapError } from './constraint-validator';


import {
    LayoutNode, LayoutEdge, LayoutConstraint, InstanceLayout,
    LeftConstraint, TopConstraint, AlignmentConstraint, LayoutGroup,
    ImplicitConstraint, DisjunctiveConstraint, isLeftConstraint, isTopConstraint, isAlignmentConstraint
} from './interfaces';

import {
    LayoutSpec,
    RelativeOrientationConstraint, CyclicOrientationConstraint,
    GroupByField, GroupBySelector, AlignConstraint
} from './layoutspec';


import IEvaluator from '../evaluators/interfaces';
import { ColorPicker } from './colorpicker';
import { type ConstraintError, ConstraintValidator } from './constraint-validator';
const UNIVERSAL_TYPE = "univ";

/**
 * Strategy for adding alignment edges to prevent WebCola from falling into bad local minima.
 * 
 * - `never`: Never add alignment edges (maximum performance, may result in suboptimal layouts)
 * - `direct`: Only add alignment edges when nodes have no direct edge between them
 * - `connected`: Only add alignment edges when nodes are not connected via any path (default, best balance)
 */
export enum AlignmentEdgeStrategy {
    /** Never add alignment edges - maximum performance but may result in poor layouts */
    NEVER = 'never',
    /** Add alignment edges only when no direct edge exists between nodes */
    DIRECT = 'direct',
    /** Add alignment edges only when nodes are not connected via any path (default) */
    CONNECTED = 'connected'
}


// Should create a NEW list when it returns.
function removeDuplicateConstraints(constraints: LayoutConstraint[]): LayoutConstraint[] {
    const uniqueConstraints: LayoutConstraint[] = [];
    const seen = new Set<string>();
    
    for (const constraint of constraints) {
        let key: string;
        
        if (isLeftConstraint(constraint)) {
            // For left constraints: left_node_id|right_node_id|minDistance
            key = `left|${constraint.left.id}|${constraint.right.id}|${constraint.minDistance}`;
        } else if (isTopConstraint(constraint)) {
            // For top constraints: top_node_id|bottom_node_id|minDistance
            key = `top|${constraint.top.id}|${constraint.bottom.id}|${constraint.minDistance}`;
        } else if (isAlignmentConstraint(constraint)) {
            // For alignment constraints: axis|node1_id|node2_id (order normalized)
            const [node1, node2] = [constraint.node1.id, constraint.node2.id].sort();
            key = `align|${constraint.axis}|${node1}|${node2}`;
        } else {
            // Fallback for unknown constraint types - include all in case they're different
            key = `unknown|${JSON.stringify(constraint)}`;
        }
        
        if (!seen.has(key)) {
            seen.add(key);
            uniqueConstraints.push(constraint);
        }
    }
    
    return uniqueConstraints;
}

class LayoutNodePath {
    constructor(
        public Path: LayoutNode[],
        public LoopsTo: LayoutNode | undefined
    ) { }

    /**
     * Expands the path by unrolling the loop `repeat` times.
     * If there is no loop, returns the plain path.
     */
    expand(repeat: number): string[] {
        const ids = this.Path.map(n => n.id);

        if (!this.LoopsTo) return ids;

        const loopStart = ids.findIndex(id => id === this.LoopsTo!.id);
        if (loopStart === -1) return ids;

        const prefix = ids.slice(0, loopStart);
        const loop = ids.slice(loopStart);
        return prefix.concat(...Array(repeat).fill(loop));
    }

    /**
     * Returns true if `this` is a superpath that contains `other` as a subpath (after unrolling).
     */
    isSubpathOf(other: LayoutNodePath): boolean {
        const thisUnrolled = this.expand(2);
        const otherUnrolled = other.expand(1);

        if (otherUnrolled.length > thisUnrolled.length) return false;

        for (let i = 0; i <= thisUnrolled.length - otherUnrolled.length; i++) {
            if (otherUnrolled.every((v, j) => v === thisUnrolled[i + j])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns true if two paths are equivalent (each is a subpath of the other).
     */
    static areEquivalent(p1: LayoutNodePath, p2: LayoutNodePath): boolean {
        return p1.isSubpathOf(p2) && p2.isSubpathOf(p1);
    }
}


export class LayoutInstance {


    readonly hideThisEdge = "_h_"
    static DISCONNECTED_PREFIX = "_d_"


    readonly DEFAULT_NODE_ICON_PATH: string = '';
    readonly DEFAULT_NODE_HEIGHT = 60;
    readonly DEFAULT_NODE_WIDTH = 100;

    private readonly _layoutSpec: LayoutSpec;

    public readonly minSepHeight = 15;
    public readonly minSepWidth = 15;

    private evaluator: IEvaluator;
    private instanceNum: number;

    private readonly alignmentEdgeStrategy: AlignmentEdgeStrategy;


    /**
     * Constructs a new `LayoutInstance` object.
     *
     * @param layoutSpec - The layout specification that defines constraints, directives, and other layout-related configurations.
     * @param evaluator - An evaluator instance used to evaluate selectors and constraints within the layout specification.
     * @param instNum - The instance number (default is 0), used to differentiate between multiple instances of the same layout.
     * @param addAlignmentEdges - Deprecated. Use alignmentEdgeStrategy instead. A boolean flag indicating whether alignment edges should be added (default is `true`, equivalent to 'connected' strategy).
     * @param alignmentEdgeStrategy - Strategy for adding alignment edges (default is `AlignmentEdgeStrategy.CONNECTED`). Takes precedence over addAlignmentEdges if provided.
     *
     * The `LayoutInstance` class is responsible for generating a layout for a given data instance based on the provided layout specification.
     * It applies constraints, directives, and projections to produce a structured layout that can be rendered using a graph visualization library.
     */
    constructor(
        layoutSpec: LayoutSpec, 
        evaluator: IEvaluator, 
        instNum: number = 0, 
        addAlignmentEdges: boolean = true,
        alignmentEdgeStrategy?: AlignmentEdgeStrategy
    ) {
        this.instanceNum = instNum;
        this.evaluator = evaluator;
        this._layoutSpec = layoutSpec;
        
        // Handle backward compatibility: if alignmentEdgeStrategy is provided, use it
        // Otherwise, convert boolean addAlignmentEdges to strategy
        if (alignmentEdgeStrategy !== undefined) {
            this.alignmentEdgeStrategy = alignmentEdgeStrategy;
        } else {
            this.alignmentEdgeStrategy = addAlignmentEdges 
                ? AlignmentEdgeStrategy.CONNECTED 
                : AlignmentEdgeStrategy.NEVER;
        }
    }

    get projectedSigs(): string[] {
        if (!this._layoutSpec.directives.projections) {
            return [];
        }
        return this._layoutSpec.directives.projections.map((projection) => projection.sig);
    }

    get hideDisconnected(): boolean {
        return this._layoutSpec.directives.hideDisconnected || false;
    }

    get hideDisconnectedBuiltIns(): boolean {
        return this._layoutSpec.directives.hideDisconnectedBuiltIns || false;
    }



    /**
     * Gets GroupByField constraints that apply to a specific field and atoms.
     * @param fieldName - The field name to match.
     * @param sourceAtom - The source atom ID.
     * @param targetAtom - The target atom ID.
     * @returns Array of matching GroupByField constraints.
     */
    private getConstraintsRelatedToField(fieldName: string, sourceAtom: string, targetAtom: string): GroupByField[] {
        const groupByFieldConstraints = this._layoutSpec.constraints.grouping.byfield;
        
        let fieldConstraints = groupByFieldConstraints.filter((d) => {
            if (d.field !== fieldName) {
                return false;
            }
            
            if (!d.selector) {
                // Legacy constraint without selector applies to all edges with this field
                return true;
            }
            
            try {
                const selectorResult = this.evaluator.evaluate(d.selector, { instanceIndex: this.instanceNum });
                const selectedAtoms = selectorResult.selectedAtoms();
                
                // Check if source atom is selected by the selector
                return selectedAtoms.includes(sourceAtom);
            } catch (error) {
                console.warn(`Failed to evaluate group by field selector "${d.selector}":`, error);
                return false;
            }
        });
        return fieldConstraints;
    }

    isAttributeField(fieldId: string, sourceAtom?: string, targetAtom?: string): boolean {
        const matchingDirectives = this._layoutSpec.directives.attributes.filter((ad) => ad.field === fieldId);
        
        if (matchingDirectives.length === 0) {
            return false;
        }
        
        // If no atoms provided or no selector-based directives, use legacy behavior
        if (!sourceAtom || !targetAtom) {
            return matchingDirectives.some(ad => !ad.selector);
        }
        
        // Check selector-based directives
        for (const directive of matchingDirectives) {
            if (!directive.selector) {
                // Legacy directive without selector matches any atoms
                return true;
            }
            
            try {
                const selectorResult = this.evaluator.evaluate(directive.selector, { instanceIndex: this.instanceNum });
                const selectedAtoms = selectorResult.selectedAtoms();
                
                // Check if source atom is selected by the selector
                if (selectedAtoms.includes(sourceAtom)) {
                    return true;
                }
            } catch (error) {
                console.warn(`Failed to evaluate attribute selector "${directive.selector}":`, error);
                // Continue to next directive on error
            }
        }
        
        return false;
    }

    isHiddenField(fieldId: string, sourceAtom?: string, targetAtom?: string): boolean {
        const matchingDirectives = this._layoutSpec.directives.hiddenFields.filter((hd) => hd.field === fieldId);
        
        if (matchingDirectives.length === 0) {
            return false;
        }
        
        // If no atoms provided or no selector-based directives, use legacy behavior
        if (!sourceAtom || !targetAtom) {
            return matchingDirectives.some(hd => !hd.selector);
        }
        
        // Check selector-based directives
        for (const directive of matchingDirectives) {
            if (!directive.selector) {
                // Legacy directive without selector matches any atoms
                return true;
            }
            
            try {
                const selectorResult = this.evaluator.evaluate(directive.selector, { instanceIndex: this.instanceNum });
                const selectedAtoms = selectorResult.selectedAtoms();
                
                // Check if source atom is selected by the selector
                if (selectedAtoms.includes(sourceAtom)) {
                    return true;
                }
            } catch (error) {
                console.warn(`Failed to evaluate hidden field selector "${directive.selector}":`, error);
                // Continue to next directive on error
            }
        }
        
        return false;
    }


    /**
     * Generates groups based on the specified graph.
     * @param g - The graph, which will be modified to remove the edges that are used to generate groups.
     * @param a - The ORIGINAL (pre-projection) Data Instance.
     * @returns A record of groups.
     */
    private generateGroups(g: Graph, a: IDataInstance): LayoutGroup[] {

        //let groupingConstraints : GroupingConstraint[] = this._layoutSpec.constraints.grouping;


        let groupByFieldConstraints: GroupByField[] = this._layoutSpec.constraints.grouping.byfield;
        let groupBySelectorConstraints: GroupBySelector[] = this._layoutSpec.constraints.grouping.byselector;


        if (!groupByFieldConstraints && !groupBySelectorConstraints) {
            return [];
        }

        let groups: LayoutGroup[] = [];

        // First we go through the group by selector constraints.
        for (var gc of groupBySelectorConstraints) {

            let selector = gc.selector;
            let selectorRes = this.evaluator.evaluate(selector, { instanceIndex: this.instanceNum });


            // Now, we should support both unary and binary selectors.

            // First try binary, if none are selected, then try unary.
            let selectedTwoples: string[][] = selectorRes.selectedTwoples();

            if (selectedTwoples.length > 0) {

                function constructGroupEdgeID(edgelabel: string, src : string, tgt: string): string {
                    return `_g_0_1_` + edgelabel + `:` + src + `->` + tgt;
                }

                // The first element of each tuple is the key (i.e. groupOn)
                // The second element is the element to add to the group (i.e. addToGroup)

                // The name of the group is the relation name ':' the key node.

                for (var t of selectedTwoples) {

                    // Here, it should be the ID and the label of the node.



                    let groupOn = t[0];
                    let addToGroup = t[1];

                    let groupOnLabel =  g.node(groupOn)?.label || groupOn;
                    if(groupOnLabel != groupOn) {
                        groupOnLabel = groupOnLabel + ":" + groupOn;
                    }
                    let groupName = `${gc.name}[${groupOnLabel}]`;

                    // Check if the group already exists
                    let existingGroup: LayoutGroup | undefined = groups.find((group) => group.name === groupName);

                    if (existingGroup) {
                        existingGroup.nodeIds.push(addToGroup);
                    }
                    else {
                        let newGroup: LayoutGroup =
                        {
                            name: groupName,
                            nodeIds: [addToGroup],
                            keyNodeId: groupOn,
                            showLabel: true,
                            sourceConstraint: gc
                        };
                        groups.push(newGroup);

                        // NOW if we have the GroupBySelector addEdge flag set, we should add an edge between the keyNode and the new node.
                        if(gc.addEdge) {

                            const edgeId = constructGroupEdgeID(groupName, groupOn, addToGroup);
                            g.setEdge(groupOn, addToGroup, groupName, edgeId);
                        }

                    }
                }




            }
            else {
                let selectedElements: string[] = selectorRes.selectedAtoms();

                // Nothing to do if there are no selected elements, or 
                // if things are typed weirdly.
                if (selectedElements.length === 0) {
                    continue;
                }

                let keyNode = selectedElements[0]; // TODO: WAIT, THERE IS NO KEY NODE

                // Question: Does **just** having LayoutGroup work? Like what does a keyNode even mean?
                let newGroup: LayoutGroup = {
                    name: gc.name,
                    nodeIds: selectedElements,
                    keyNodeId: keyNode, //// TODO: I think introducing this random keynode could be a problem. Not sure why or when though.
                    showLabel: true,
                    sourceConstraint: gc
                };
                groups.push(newGroup);
            }
        }


        // Now we go through the group by field constraints.

        let graphEdges = [...g.edges()];


        graphEdges.forEach((edge) => {
            const edgeId = edge.name;
            const relName = this.getRelationName(g, edge);


            let relatedConstraints = this.getConstraintsRelatedToField(relName, edge.v, edge.w);

            if (relatedConstraints.length === 0) {
                return;
            }

            // let edgeLabel = this.getEdgeLabel(g, edge); // Unused for now


            relatedConstraints.forEach((c) => {

                const groupOn = c.groupOn; // This is the part of the relation tuple that is the key.
                const addToGroup = c.addToGroup; // This is the part of the relation tuple that is IN the group.


                const potentialTuples = this.getFieldTuplesForSourceAndTarget(a, relName, edge.v, edge.w);
                if (!potentialTuples || potentialTuples.length === 0) {
                    return;
                }


                for (var thisTuple of potentialTuples) {
                    let arity = thisTuple?.length || 0;
                    if (arity < 2 || (groupOn < 0 || groupOn >= arity) || (addToGroup < 0 || addToGroup >= arity)) {
                        throw new Error(`Invalid grouping. groupOn=${groupOn} and addToGroup=${addToGroup} for ${arity}-ary relation ${relName}. These must be between 0 and ${arity - 1}.`);
                    }
                    // Now get the element of edge

                    // let sourceInGraph = thisTuple[0]; // Unused for now
                    // let targetInGraph = thisTuple[arity - 1]; // Unused for now

                    let key = thisTuple[groupOn];
                    let toAdd = thisTuple[addToGroup];


                    let labelString = thisTuple.map((s, idx) => {
                        if (idx === groupOn) {
                            return s;
                        }
                        else return "_";
                    }).join(",");

                    let groupName = `${relName}[${labelString}]`; // TODO: THis?

                    // Check if the group already exists
                    let existingGroup: LayoutGroup | undefined = groups.find((group) => group.name === groupName);

                    if (existingGroup) {
                        existingGroup.nodeIds.push(toAdd);
                        // But also remove this edge from the graph.
                        g.removeEdge(edge.v, edge.w, edgeId);
                    }
                    else {

                        let newGroup: LayoutGroup =
                        {
                            name: groupName,
                            nodeIds: [toAdd],
                            keyNodeId: key, // What if the key is in the graph?
                            showLabel: true, // For now
                            sourceConstraint: c
                        };
                        groups.push(newGroup);

                        const groupEdgePrefix = `_g_${groupOn}_${addToGroup}_`;
                        const newId = groupEdgePrefix + edgeId;
                        g.removeEdge(edge.v, edge.w, edgeId);
                        g.setEdge(edge.v, edge.w, groupName, newId);
                    }
                }
            });
        });




        
        return groups;
    }

    /**
     * Generates groups based on the specified graph.
     * @param g - The graph, which will be modified to remove the edges that are used to determine attributes.
     * @returns A record of attributes
     */
    private generateAttributesAndRemoveEdges(g: Graph): Record<string, Record<string, string[]>> {
        // Node : [] of attributes
        let attributes: Record<string, Record<string, string[]>> = {};

        let graphEdges = [...g.edges()];
        // Go through all edge labels in the graph

        graphEdges.forEach((edge) => {
            const edgeId = edge.name;
            const relName = this.getRelationName(g, edge);
            const sourceAtom = edge.v;
            const targetAtom = edge.w;
            const isAttributeRel = this.isAttributeField(relName, sourceAtom, targetAtom);
            const isHiddenRel = this.isHiddenField(relName, sourceAtom, targetAtom);

            if (isHiddenRel && isAttributeRel) {
                throw new Error(`${relName} cannot be both an attribute and a hidden field.`);
            }

            if (isHiddenRel) {
                // If the field is a hidden field, we should remove the edge from the graph.
                g.removeEdge(edge.v, edge.w, edgeId);
                return;
            }

            if (isAttributeRel) {

                // If the field is an attribute field, we should add the attribute to the source node's
                // attributes field.

                const attributeKey = this.getEdgeLabel(g, edge);
                let source = edge.v;
                let target = edge.w;

                // Really, we should be pushing the target node's LABEL.
                let targetLabel = g.node(target)?.label || target; // Use the node's label or the node ID if no label exists.

                let nodeAttributes = attributes[source] || {};

                if (!nodeAttributes[attributeKey]) {
                    nodeAttributes[attributeKey] = [];
                    attributes[source] = nodeAttributes;
                }
                nodeAttributes[attributeKey].push(targetLabel);

                // Now remove the edge from the graph
                g.removeEdge(edge.v, edge.w, edgeId);
            }
        });

        return attributes;
    }

    /**
    * Modifies the graph to remove extraneous nodes (ex. those to be hidden)
    * @param g - The graph, which will be modified to remove extraneous nodes.
    */
    private ensureNoExtraNodes(g: Graph, a: IDataInstance) {

        let nodes = [...g.nodes()];


        nodes.forEach((node) => {


            // Check if builtin
            try {
                const type = a.getAtomType(node);
                const isAtomBuiltin = type?.isBuiltin || false;

                let inEdges = g.inEdges(node) || [];
                let outEdges = g.outEdges(node) || [];
                const isDisconnected = inEdges.length === 0 && outEdges.length === 0;


                // Legacy hiding logic for backwards compatibility
                const hideLegacy = isDisconnected && ((this.hideDisconnectedBuiltIns && isAtomBuiltin) || this.hideDisconnected);

                // New selector-based hiding logic
                let hideBySelector = false;
                const hiddenAtomDirectives = this._layoutSpec.directives.hiddenAtoms;
                for (const directive of hiddenAtomDirectives) {
                    try {
                        const selectorResult = this.evaluator.evaluate(directive.selector, { instanceIndex: this.instanceNum });
                        const selectedAtoms = selectorResult.selectedAtoms();
                        if (selectedAtoms.includes(node)) {
                            hideBySelector = true;
                            break;
                        }
                    } catch (error) {
                        console.error(`Failed to evaluate hideAtom selector "${directive.selector}":`, error);
                    }
                }

                const hideNode = hideLegacy || hideBySelector;

                if (hideNode) {
                    g.removeNode(node);
                }

            } catch (error) {
                console.error("Failed to identify node type. Defaulting to showing node.", error);
            }
        });
    }


    private getMostSpecificType(node: string, a: IDataInstance): string {
        let allTypes = this.getNodeTypes(node, a);
        let mostSpecificType = allTypes[0];
        return mostSpecificType;
    }

    private getNodeTypes(node: string, a: IDataInstance): string[] {
        let type = a.getAtomType(node);
        let allTypes = type?.types || [];
        allTypes = allTypes.concat(UNIVERSAL_TYPE);
        return allTypes;
    }


    public getRelationName(g: Graph, edge: Edge): string {
        let relNameRaw = this.getEdgeLabel(g, edge);

        try {

            let relName = relNameRaw.split("[")[0];
            return relName;
        }
        catch {
            console.warn(`Failed to parse relation name from edge label: ${relNameRaw}. Defaulting to empty string.`);
            return relNameRaw;
        }
    }

    private getEdgeLabel(g: Graph, edge: Edge): string {
        return g.edge(edge.v, edge.w, edge.name);
    }


    private applyLayoutProjections(ai: IDataInstance, projections: Record<string, string>): { projectedInstance: IDataInstance, finalProjectionChoices: { type: string, projectedAtom: string, atoms: string[] }[] } {

        let projectedSigs: string[] = this.projectedSigs;

        let projectedTypes: IType[] = projectedSigs.map((sig) => ai.getAtomType(sig));


        // Now we should have a map from each type to its atoms
        let atomsPerProjectedType: Record<string, string[]> = {};
        projectedTypes.forEach((type) => {
            atomsPerProjectedType[type.id] = type.atoms.map((atom) => atom.id);
        });




        let projectedAtomIds: string[] = [];

        Object.entries(atomsPerProjectedType).forEach(([typeId, atomIds]) => {


            // TODO: Here, we need to actually get a user to select the atom from a dropdown. If none is selected, we should default to the first atom.

            if (atomIds.length > 0) {


                // Check if projections[typeId] exists
                if (projections[typeId]) {
                    projectedAtomIds.push(projections[typeId]);
                }
                else {
                    let to_project = atomIds[0];
                    projections[typeId] = to_project;
                    projectedAtomIds.push(to_project);
                }
            }
        });

        // finalProjectionChoices : { type : string, projectedAtom : string, atoms : string[]} 
        let finalProjectionChoices = Object.entries(projections)

            .filter(([typeId]) => projectedSigs.includes(typeId)) // This is crucial for scenarios where the projection is changed.

            .map(([typeId, atomId]) => {
                let atoms = atomsPerProjectedType[typeId];
                return { type: typeId, projectedAtom: atomId, atoms: atoms };
            });

        let projectedInstance = ai.applyProjections(projectedAtomIds);
        return { projectedInstance, finalProjectionChoices };
    }

    /**
     * Generates the layout for the given data instance and projections.
     * @param a - The data instance to generate the layout for.
     * @param projections - ...
     * @returns An object containing the layout, projection data, and (optionally) an error to be surfaced to the user.
     * @throws {ConstraintError} If the layout cannot be generated due to unsatisfiable constraints and error isn't caught to be surfaced to the user.
     */
    public generateLayout(
        a: IDataInstance,
        projections: Record<string, string>
    ): {
        layout: InstanceLayout,
        projectionData: { type: string, projectedAtom: string, atoms: string[] }[],
        error: ConstraintError | null
    } {

        /** Here, we calculate some of the presentational directive choices */
        let projectionResult = this.applyLayoutProjections(a, projections);
        let ai = projectionResult.projectedInstance;
        let projectionData = projectionResult.finalProjectionChoices;

        let g: Graph = ai.generateGraph(this.hideDisconnected, this.hideDisconnectedBuiltIns);

        const attributes = this.generateAttributesAndRemoveEdges(g);
        let nodeIconMap = this.getNodeIconMap(g);
        let nodeColorMap = this.getNodeColorMap(g, ai);
        let nodeSizeMap = this.getNodeSizeMap(g);

        // This is where we add the inferred edges to the graph.
        this.addinferredEdges(g);


        /// Groups have to happen here ///
        let groups = this.generateGroups(g, a);
        this.ensureNoExtraNodes(g, a);

        let dcN = this.getDisconnectedNodes(g);



        /// NOW, we should get the nodes back with their IDs.



        let layoutNodes: LayoutNode[] = g.nodes().map((nodeId) => {

            let nodeMetadata = g.node(nodeId);
            // If the node has a label, we can use it.
            // Otherwise, we can use the nodeId as the label.
            let label = nodeMetadata?.label || nodeId; 
            let color = nodeColorMap[nodeId] || "black";
            let iconDetails = nodeIconMap[nodeId];
            let iconPath = iconDetails.path;
            let showLabels = iconDetails.showLabels;

            let { height, width } = nodeSizeMap[nodeId] || { height: this.DEFAULT_NODE_HEIGHT, width: this.DEFAULT_NODE_WIDTH };

            const mostSpecificType = this.getMostSpecificType(nodeId, a);
            const allTypes = this.getNodeTypes(nodeId, a);

            let nodeGroups = groups
                .filter((group) => group.nodeIds.includes(nodeId))
                .map((group) => group.name);
            let nodeAttributes = attributes[nodeId] || {};

            return {
                id: nodeId,
                label: label,
                name: label,
                color: color,
                groups: nodeGroups,
                attributes: nodeAttributes,
                icon: iconPath,
                height: height,
                width: width,
                mostSpecificType: mostSpecificType,
                types: allTypes,
                showLabels: showLabels
            };
        });

        ///////////// CONSTRAINTS ////////////


        let constraints: LayoutConstraint[] = this.applyRelativeOrientationConstraints(layoutNodes, g);
        const orientationConstraintCount = constraints.length;
        
        constraints = constraints.concat(this.applyAlignConstraints(layoutNodes, g));
        const alignConstraintCount = constraints.length - orientationConstraintCount;
        
        console.log(`Generated ${orientationConstraintCount} orientation constraints and ${alignConstraintCount} alignment constraints (deduped + transitive reduction applied)`);
        
        // Prune redundant alignment edges after all have been added
        this.pruneRedundantAlignmentEdges(g);
        
        // Constraints NOW holds the conjuctive CORE of layout constraints.
        constraints = removeDuplicateConstraints(constraints);


        let layoutEdges: LayoutEdge[] = g.edges().map((edge) => {

            const edgeId = edge.name;
            const edgeLabel: string = g.edge(edge.v, edge.w, edgeId);
            let source = layoutNodes.find((node) => node.id === edge.v);
            let target = layoutNodes.find((node) => node.id === edge.w);
            let relName = this.getRelationName(g, edge);
            let color = this.getEdgeColor(relName, edge.v, edge.w, edgeId);

            // Skip edges with missing source or target nodes
            if (!source || !target || !edgeId) {
                return null;
            }

            let e: LayoutEdge = {
                source: source,
                target: target,
                label: edgeLabel,
                relationName: relName,
                id: edgeId,
                color: color,
            };
            return e;
        }).filter((edge): edge is LayoutEdge => edge !== null);

        // Build cyclic constraint disjunctions
        const cyclicDisjunctions = this.buildCyclicDisjunctions(layoutNodes);

        // Create layout with conjunctive constraints and disjunctive constraints
        let layout: InstanceLayout = { 
            nodes: layoutNodes, 
            edges: layoutEdges, 
            constraints: constraints, 
            groups: groups,
            disjunctiveConstraints: cyclicDisjunctions 
        };

        // Validate all constraints (conjunctive + disjunctive) in one pass
        const validator = new ConstraintValidator(layout);
        const constraintError = validator.validateConstraints();

        if (constraintError) {
            if ((constraintError as PositionalConstraintError).minimalConflictingSet) {
                return this.handlePositionalConstraintError(
                    constraintError as PositionalConstraintError,
                    layout,
                    projectionData
                );
            }

            if ((constraintError as GroupOverlapError).overlappingNodes) {
                return this.handleGroupOverlapError(
                    constraintError as GroupOverlapError,
                    layout,
                    projectionData
                );
            }

            throw constraintError;
        }

        // Update constraints with those added by the validator
        // (includes chosen alternatives from disjunctions and implicit alignment constraints)
        constraints = layout.constraints;

        // Filter out all edges that are hidden
        layoutEdges = layoutEdges.filter((edge) => !edge.id.startsWith(this.hideThisEdge));

        // And now make sure that all the disconnected nodes (as identified)
        // have some padding around them.
        let dcnGroups = dcN.map((node) => {
            return this.singletonGroup(node);
        }
        );
        groups = groups.concat(dcnGroups);

        // Update the layout with final groups
        layout.nodes = layoutNodes;
        layout.edges = layoutEdges;
        layout.constraints = constraints;
        layout.groups = groups;

        return { layout, projectionData, error: null };
    }

    /**
     * Helper function to handle positional constraint errors by creating a layout with conflicting constraints removed
     * @returns An object containing the layout with error metadata, projection data, and the error itself.
     */
    private handlePositionalConstraintError(
        error: PositionalConstraintError,
        layout: InstanceLayout,
        projectionData: { type: string, projectedAtom: string, atoms: string[] }[]
    ): {
        layout: InstanceLayout,
        projectionData: { type: string, projectedAtom: string, atoms: string[] }[],
        error: ConstraintError
    } {
        const minimalConflictingSet = error.minimalConflictingSet;
        // If the error is a positional constraint error, we can try to return the last known good layout by removing all conflicting constraints.
        const layoutWithErrorMetadata: InstanceLayout = {
            nodes: layout.nodes,
            edges: layout.edges,
            // FIXME: This is a hacky way to remove the conflicting constraints.
            // There is some inconsistency between what the graph shows and what the error message shows.
            constraints: layout.constraints.filter(c =>
                ![...minimalConflictingSet.values()].flat().includes(c)
            ),
            groups: layout.groups,
            conflictingConstraints: [...minimalConflictingSet.values()].flat()
        };
        return {
            layout: layoutWithErrorMetadata,
            projectionData,
            error: error
        };
    }

    /**
     * Helper function to handle group overlap errors by creating a layout with overlapping nodes metadata
     * @returns An object containing the layout with error metadata, projection data, and the error itself.
     */
    private handleGroupOverlapError(
        error: GroupOverlapError,
        layout: InstanceLayout,
        projectionData: { type: string, projectedAtom: string, atoms: string[] }[]
    ): {
        layout: InstanceLayout,
        projectionData: { type: string, projectedAtom: string, atoms: string[] }[],
        error: ConstraintError
    } {
        // If the error is a group overlap error, we can return the error as is.
        // const layoutWithErrorMetadata: InstanceLayout = {
        //     nodes: layout.nodes,
        //     edges: layout.edges,
        //     constraints: layout.constraints,
        //     groups: layout.groups,
        //     overlappingNodes: error.overlappingNodes,
        // }

        // Get overlapping groups
        const overlappingGroupNames = error.overlappingNodes.map(node => node.groups).flat();
        const overlappingGroups = layout.groups.filter(group =>
            overlappingGroupNames.includes(group.name)
        );

        // Get relevant nodes, which are nodes in the overlapping groups
        const relevantNodeIds = overlappingGroups.flatMap(group => group.nodeIds)
        const relevantNodes = layout.nodes.filter(node => relevantNodeIds.includes(node.id));

        // Only edges containing overlapping nodes
        const edgesWithRelevantNodes = layout.edges.filter(edge =>
            relevantNodes.some(node => edge.source.id === node.id) && relevantNodes.some(node => edge.target.id === node.id)
        );
        
        const layoutWithErrorMetadata: InstanceLayout = {
            nodes: relevantNodes,
            edges: edgesWithRelevantNodes,
            constraints: layout.constraints,
            groups: overlappingGroups,
            overlappingNodes: error.overlappingNodes,
        }
        return { 
            layout: layoutWithErrorMetadata, 
            projectionData, 
            error: error 
        };
    }

    /**
     * Applies the cyclic orientation constraints to the layout nodes.
     * @param layoutNodes - The layout nodes to which the constraints will be applied.
     * @throws {ConstraintError} If the layout cannot be satisfied with the cyclic constraints.
     * @returns An array of layout constraints.
     */
    /**
     * Builds disjunctive constraints for cyclic orientation constraints.
     * Each cyclic fragment generates a disjunction with N alternatives (perturbations),
     * where N is the number of nodes in the fragment.
     * 
     * @param layoutNodes - The layout nodes to which the constraints will be applied.
     * @returns Array of DisjunctiveConstraint instances, one per cyclic fragment.
     */
    private buildCyclicDisjunctions(layoutNodes: LayoutNode[]): DisjunctiveConstraint[] {
        const cyclicConstraints = this._layoutSpec.constraints.orientation.cyclic;
        const disjunctions: DisjunctiveConstraint[] = [];

        // For each cyclic constraint, extract fragments
        for (const [, c] of cyclicConstraints.entries()) {
            let selectedTuples: string[][] = this.evaluator.evaluate(c.selector, { instanceIndex: this.instanceNum }).selectedTwoples();
            let nextNodeMap: Map<LayoutNode, LayoutNode[]> = new Map<LayoutNode, LayoutNode[]>();
            
            // Build nextNodeMap from selected tuples
            selectedTuples.forEach((tuple) => {
                let sourceNodeId = tuple[0];
                let targetNodeId = tuple[1];

                let srcN = layoutNodes.find((node) => node.id === sourceNodeId);
                let tgtN = layoutNodes.find((node) => node.id === targetNodeId);

                // Skip if either node is not found
                if (!srcN || !tgtN) {
                    return;
                }

                if (nextNodeMap.has(srcN)) {
                    nextNodeMap.get(srcN)!.push(tgtN);
                }
                else {
                    nextNodeMap.set(srcN, [tgtN]);
                }
            });

            let relatedNodeFragments = this.getFragmentsToConstrain(nextNodeMap);
            let relatedNodeIds = relatedNodeFragments.map((p) => p.Path.map((node) => node.id));

            // Apply counterclockwise reversal if needed
            if (c.direction === "counterclockwise") {
                relatedNodeIds = relatedNodeIds.map((fragment) => fragment.reverse());
            }

            // For each fragment, create a disjunction with N perturbations
            relatedNodeIds.forEach((fragment) => {
                const fragmentLength = fragment.length;
                
                // Fragments with 2 or fewer nodes don't need disjunctions
                if (fragmentLength <= 2) {
                    return;
                }

                // Generate all perturbations (rotations) of this fragment
                const alternatives: LayoutConstraint[][] = [];
                for (let perturbation = 0; perturbation < fragmentLength; perturbation++) {
                    const constraintsForPerturbation = this.getCyclicConstraintForFragment(
                        fragment,
                        layoutNodes,
                        perturbation,
                        c
                    );
                    alternatives.push(constraintsForPerturbation);
                }

                // Create the disjunctive constraint
                const disjunction = new DisjunctiveConstraint(c, alternatives);
                disjunctions.push(disjunction);
            });
        }

        return disjunctions;
    }

    private getCyclicConstraintForFragment(fragment: string[],
        layoutNodes: LayoutNode[],
        perturbationIdx: number,
        c: RelativeOrientationConstraint | CyclicOrientationConstraint | ImplicitConstraint): LayoutConstraint[] {
        const minRadius = 100;


        if (fragment.length <= 2) {
            return []; // No constraints needed for a two-node fragment.
        }

        const angleStep = (2 * Math.PI) / fragment.length;

        let fragmentNodePositions: Record<string, { x: number, y: number }> = {};

        for (var i = 0; i < fragment.length; i++) {
            let theta = (i + perturbationIdx) * angleStep;
            let x = minRadius * Math.cos(theta);
            let y = minRadius * Math.sin(theta);
            fragmentNodePositions[fragment[i]] = { x: x, y: y };
        }

        let fragmentConstraintsForCurrentOffset: LayoutConstraint[] = [];
        for (var k = 0; k < fragment.length; k++) {
            for (var j = 0; j < fragment.length; j++) {
                if (k !== j) {
                    let node1 = fragment[k];
                    let node2 = fragment[j];
                    let node1_pos = fragmentNodePositions[node1];
                    let node2_pos = fragmentNodePositions[node2];

                    if (node1_pos.x > node2_pos.x) {
                        fragmentConstraintsForCurrentOffset.push(this.leftConstraint(node2, node1, this.minSepWidth, layoutNodes, c));
                    }
                    else if (node1_pos.x < node2_pos.x) {
                        fragmentConstraintsForCurrentOffset.push(this.leftConstraint(node1, node2, this.minSepWidth, layoutNodes, c));
                    }
                    else {
                        // If they are on the same x-axis, we need to ensure that they are not on top of each other
                        fragmentConstraintsForCurrentOffset.push(this.ensureSameXConstraint(node1, node2, layoutNodes, c));
                    }

                    if (node1_pos.y > node2_pos.y) {
                        fragmentConstraintsForCurrentOffset.push(this.topConstraint(node2, node1, this.minSepHeight, layoutNodes, c));
                    }
                    else if (node1_pos.y < node2_pos.y) {
                        fragmentConstraintsForCurrentOffset.push(this.topConstraint(node1, node2, this.minSepHeight, layoutNodes, c));
                    }
                    else {
                        // If they are on the same y-axis, we need to ensure that they are not on top of each other
                        fragmentConstraintsForCurrentOffset.push(this.ensureSameYConstraint(node1, node2, layoutNodes, c));
                    }
                }
            }

        }

        return fragmentConstraintsForCurrentOffset;
    }




    private getAllPaths(nextNodeMap: Map<LayoutNode, LayoutNode[]>): LayoutNodePath[] {

        const allPaths: LayoutNodePath[] = [];

        const visited = new Set<LayoutNode>(); // To track visited nodes in the current path

        function dfs(currentNode: LayoutNode, path: LayoutNode[]): void {
            // Add the current node to the path
            path.push(currentNode);

            // If the current node has no outgoing edges, add the path to allPaths
            const neighbors = nextNodeMap.get(currentNode);
            if (!nextNodeMap.has(currentNode) || !neighbors || neighbors.length === 0) {

                let lnp = new LayoutNodePath(path, undefined);
                allPaths.push(lnp);
            } else {
                // Recursively visit all neighbors
                for (const neighbor of neighbors) {
                    if (!path.includes(neighbor)) {
                        // Continue DFS if the neighbor is not already in the path
                        dfs(neighbor, [...path]); // Pass a copy of the path to avoid mutation
                    } else {

                        let lnp = new LayoutNodePath(path, neighbor);
                        // If the neighbor is already in the path, we have a cycle
                        allPaths.push(lnp);
                    }
                }
            }
        }

        // Start DFS from each node in the map
        for (const startNode of nextNodeMap.keys()) {
            if (!visited.has(startNode)) { // Since we have already documented the paths from this node.
                dfs(startNode, []);
            }
        }

        return allPaths;
    }

    private getFragmentsToConstrain(nextNodeMap: Map<LayoutNode, LayoutNode[]>): LayoutNodePath[] {
        // Ensure allPaths are instances of the LayoutNodePath class
        const allPaths: LayoutNodePath[] = this.getAllPaths(nextNodeMap);

        // Step 1: Remove equivalent paths (keep only one representative per equivalence class)
        const nonEquivalentPaths: LayoutNodePath[] = allPaths.filter((p, i) => {
            return !allPaths.some((p2, j) => j < i && LayoutNodePath.areEquivalent(p, p2));
        });

        // Step 2: Remove paths that are strict subpaths of others
        const nonSubsumedPaths: LayoutNodePath[] = nonEquivalentPaths.filter((p, i) => {
            return !nonEquivalentPaths.some((p2, j) => i !== j && p2.isSubpathOf(p));
        });

        return nonSubsumedPaths;
    }



    /**
     * Applies the relative orientation constraints to the layout nodes.
     * Includes transitive reduction: if a < b and b < c exist, don't add a < c.
     * @param layoutNodes - The layout nodes to which the constraints will be applied.
     * @returns An array of layout constraints.
     */
    applyRelativeOrientationConstraints(layoutNodes: LayoutNode[], g: Graph): LayoutConstraint[] {

        let constraints: LayoutConstraint[] = [];
        let relativeOrientationConstraints = this._layoutSpec.constraints.orientation.relative;
        
        // Track generated constraints to avoid duplicates
        // Key format: "type:node1:node2:distance" (e.g., "left:a:b:15")
        const generatedConstraints = new Set<string>();
        
        // Track transitive relationships for left/right and top/bottom
        // Maps: node → set of nodes it's left of / above
        const leftOfGraph = new Map<string, Set<string>>();
        const aboveGraph = new Map<string, Set<string>>();

        relativeOrientationConstraints.forEach((c: RelativeOrientationConstraint) => {

            let directions = c.directions;
            let selector = c.selector;

            let selectorRes = this.evaluator.evaluate(selector, { instanceIndex: this.instanceNum });
            let selectedTuples: string[][] = selectorRes.selectedTwoples();

            // For each tuple, we need to apply the constraints
            selectedTuples.forEach((tuple) => {
                let sourceNodeId = tuple[0];
                let targetNodeId = tuple[1];

                directions.forEach((direction) => {
                    // Add alignment edge for ALL orientation constraints if enabled AND edge doesn't already exist in the graph
                    if (this.shouldAddAlignmentEdge(g, sourceNodeId, targetNodeId)) {
                        const alignmentEdgeLabel = `_alignment_${sourceNodeId}_${targetNodeId}_`;
                        g.setEdge(sourceNodeId, targetNodeId, alignmentEdgeLabel, alignmentEdgeLabel);
                    }

                    if (direction == "left") {
                        const key = `left:${targetNodeId}:${sourceNodeId}:${this.minSepWidth}`;
                        // Check if transitively implied: is there a path targetNodeId -> ... -> sourceNodeId?
                        if (!generatedConstraints.has(key) && !this.hasTransitivePath(leftOfGraph, targetNodeId, sourceNodeId)) {
                            generatedConstraints.add(key);
                            this.addToTransitiveGraph(leftOfGraph, targetNodeId, sourceNodeId);
                            constraints.push(this.leftConstraint(targetNodeId, sourceNodeId, this.minSepWidth, layoutNodes, c));
                        }
                    }
                    else if (direction == "above") {
                        const key = `top:${targetNodeId}:${sourceNodeId}:${this.minSepHeight}`;
                        if (!generatedConstraints.has(key) && !this.hasTransitivePath(aboveGraph, targetNodeId, sourceNodeId)) {
                            generatedConstraints.add(key);
                            this.addToTransitiveGraph(aboveGraph, targetNodeId, sourceNodeId);
                            constraints.push(this.topConstraint(targetNodeId, sourceNodeId, this.minSepHeight, layoutNodes, c));
                        }
                    }
                    else if (direction == "right") {
                        const key = `left:${sourceNodeId}:${targetNodeId}:${this.minSepWidth}`;
                        if (!generatedConstraints.has(key) && !this.hasTransitivePath(leftOfGraph, sourceNodeId, targetNodeId)) {
                            generatedConstraints.add(key);
                            this.addToTransitiveGraph(leftOfGraph, sourceNodeId, targetNodeId);
                            constraints.push(this.leftConstraint(sourceNodeId, targetNodeId, this.minSepWidth, layoutNodes, c));
                        }
                    }
                    else if (direction == "below") {
                        const key = `top:${sourceNodeId}:${targetNodeId}:${this.minSepHeight}`;
                        if (!generatedConstraints.has(key) && !this.hasTransitivePath(aboveGraph, sourceNodeId, targetNodeId)) {
                            generatedConstraints.add(key);
                            this.addToTransitiveGraph(aboveGraph, sourceNodeId, targetNodeId);
                            constraints.push(this.topConstraint(sourceNodeId, targetNodeId, this.minSepHeight, layoutNodes, c));
                        }
                    }
                    else if (direction == "directlyLeft") {
                        const leftKey = `left:${targetNodeId}:${sourceNodeId}:${this.minSepWidth}`;
                        const alignKey = `align-y:${targetNodeId}:${sourceNodeId}`;
                        if (!generatedConstraints.has(leftKey) && !this.hasTransitivePath(leftOfGraph, targetNodeId, sourceNodeId)) {
                            generatedConstraints.add(leftKey);
                            this.addToTransitiveGraph(leftOfGraph, targetNodeId, sourceNodeId);
                            constraints.push(this.leftConstraint(targetNodeId, sourceNodeId, this.minSepWidth, layoutNodes, c));
                        }
                        if (!generatedConstraints.has(alignKey)) {
                            generatedConstraints.add(alignKey);
                            constraints.push(this.ensureSameYConstraint(targetNodeId, sourceNodeId, layoutNodes, c));
                        }
                    }
                    else if (direction == "directlyAbove") {
                        const topKey = `top:${targetNodeId}:${sourceNodeId}:${this.minSepHeight}`;
                        const alignKey = `align-x:${targetNodeId}:${sourceNodeId}`;
                        if (!generatedConstraints.has(topKey) && !this.hasTransitivePath(aboveGraph, targetNodeId, sourceNodeId)) {
                            generatedConstraints.add(topKey);
                            this.addToTransitiveGraph(aboveGraph, targetNodeId, sourceNodeId);
                            constraints.push(this.topConstraint(targetNodeId, sourceNodeId, this.minSepHeight, layoutNodes, c));
                        }
                        if (!generatedConstraints.has(alignKey)) {
                            generatedConstraints.add(alignKey);
                            constraints.push(this.ensureSameXConstraint(targetNodeId, sourceNodeId, layoutNodes, c));
                        }
                    }
                    else if (direction == "directlyRight") {
                        const leftKey = `left:${sourceNodeId}:${targetNodeId}:${this.minSepWidth}`;
                        const alignKey = `align-y:${targetNodeId}:${sourceNodeId}`;
                        if (!generatedConstraints.has(leftKey) && !this.hasTransitivePath(leftOfGraph, sourceNodeId, targetNodeId)) {
                            generatedConstraints.add(leftKey);
                            this.addToTransitiveGraph(leftOfGraph, sourceNodeId, targetNodeId);
                            constraints.push(this.leftConstraint(sourceNodeId, targetNodeId, this.minSepWidth, layoutNodes, c));
                        }
                        if (!generatedConstraints.has(alignKey)) {
                            generatedConstraints.add(alignKey);
                            constraints.push(this.ensureSameYConstraint(targetNodeId, sourceNodeId, layoutNodes, c));
                        }
                    }
                    else if (direction == "directlyBelow") {
                        const topKey = `top:${sourceNodeId}:${targetNodeId}:${this.minSepHeight}`;
                        const alignKey = `align-x:${targetNodeId}:${sourceNodeId}`;
                        if (!generatedConstraints.has(topKey) && !this.hasTransitivePath(aboveGraph, sourceNodeId, targetNodeId)) {
                            generatedConstraints.add(topKey);
                            this.addToTransitiveGraph(aboveGraph, sourceNodeId, targetNodeId);
                            constraints.push(this.topConstraint(sourceNodeId, targetNodeId, this.minSepHeight, layoutNodes, c));
                        }
                        if (!generatedConstraints.has(alignKey)) {
                            generatedConstraints.add(alignKey);
                            constraints.push(this.ensureSameXConstraint(targetNodeId, sourceNodeId, layoutNodes, c));
                        }
                    }
                });
            });
        });

        return constraints;
    }
    
    /**
     * Checks if there's a transitive path from source to target in the graph.
     * Used to detect redundant constraints via transitivity.
     * @param graph - Map of node to its reachable nodes
     * @param source - Source node
     * @param target - Target node
     * @returns True if path exists (BFS)
     */
    private hasTransitivePath(graph: Map<string, Set<string>>, source: string, target: string): boolean {
        const sourceReachable = graph.get(source);
        if (!sourceReachable) return false;
        
        // Direct connection
        if (sourceReachable.has(target)) return true;
        
        // BFS to find transitive path
        const visited = new Set<string>([source]);
        const queue = Array.from(sourceReachable);
        
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === target) return true;
            if (visited.has(current)) continue;
            visited.add(current);
            
            const neighbors = graph.get(current);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * Adds an edge to the transitive graph and updates transitive closure incrementally.
     * @param graph - Map of node to its reachable nodes
     * @param from - Source node
     * @param to - Target node
     */
    private addToTransitiveGraph(graph: Map<string, Set<string>>, from: string, to: string): void {
        // Add direct edge
        if (!graph.has(from)) {
            graph.set(from, new Set());
        }
        graph.get(from)!.add(to);
        
        // Update transitive closure: all nodes that reach 'from' can now also reach anything 'to' can reach
        const toReachable = graph.get(to) || new Set<string>();
        
        // Find all nodes that can reach 'from'
        for (const [node, reachable] of graph.entries()) {
            if (node === from || reachable.has(from)) {
                // This node can reach 'from', so it can also reach 'to' and everything 'to' reaches
                reachable.add(to);
                for (const transitiveTarget of toReachable) {
                    reachable.add(transitiveTarget);
                }
            }
        }
    }

    /**
     * Applies the align constraints to the layout nodes.
     * @param layoutNodes - The layout nodes to which the constraints will be applied.
     * @returns An array of layout constraints.
     */
    applyAlignConstraints(layoutNodes: LayoutNode[], g: Graph): LayoutConstraint[] {
        let constraints: LayoutConstraint[] = [];
        let alignConstraints = this._layoutSpec.constraints.alignment;
        
        // Track generated alignment constraints to avoid duplicates
        // Use normalized key (sorted node IDs) since alignment is symmetric
        const generatedAlignments = new Set<string>();

        alignConstraints.forEach((c: AlignConstraint) => {
            let direction = c.direction;
            let selector = c.selector;

            let selectorRes = this.evaluator.evaluate(selector, { instanceIndex: this.instanceNum });
            let selectedTuples: string[][] = selectorRes.selectedTwoples();

            // For each tuple, apply the alignment constraint
            selectedTuples.forEach((tuple) => {
                let sourceNodeId = tuple[0];
                let targetNodeId = tuple[1];

                // Add alignment edge for align constraints if enabled AND edge doesn't already exist in the graph
                if (this.shouldAddAlignmentEdge(g, sourceNodeId, targetNodeId)) {
                    const alignmentEdgeLabel = `_alignment_${sourceNodeId}_${targetNodeId}_`;
                    g.setEdge(sourceNodeId, targetNodeId, alignmentEdgeLabel, alignmentEdgeLabel);
                }

                if (direction === "horizontal") {
                    // Horizontal alignment means same Y coordinate
                    // Normalize node order for key (alignment is symmetric)
                    const [node1, node2] = [sourceNodeId, targetNodeId].sort();
                    const key = `align-y:${node1}:${node2}`;
                    if (!generatedAlignments.has(key)) {
                        generatedAlignments.add(key);
                        constraints.push(this.ensureSameYConstraint(sourceNodeId, targetNodeId, layoutNodes, c));
                    }
                } else if (direction === "vertical") {
                    // Vertical alignment means same X coordinate
                    const [node1, node2] = [sourceNodeId, targetNodeId].sort();
                    const key = `align-x:${node1}:${node2}`;
                    if (!generatedAlignments.has(key)) {
                        generatedAlignments.add(key);
                        constraints.push(this.ensureSameXConstraint(sourceNodeId, targetNodeId, layoutNodes, c));
                    }
                }
            });
        });

        return constraints;
    }




    /**
     * Checks if there's already a direct edge (bidirectional) between two nodes in the graph.
     * @param g - The graph to check
     * @param sourceNodeId - First node ID
     * @param targetNodeId - Second node ID
     * @returns true if there's already an edge between the nodes
     */
    /**
     * Checks if two nodes should have an alignment edge added based on the current strategy.
     * 
     * @param g - The graph to check
     * @param sourceNodeId - First node ID
     * @param targetNodeId - Second node ID
     * @returns true if an alignment edge should be added (nodes are not connected according to strategy)
     */
    private shouldAddAlignmentEdge(g: Graph, sourceNodeId: string, targetNodeId: string): boolean {
        // If strategy is NEVER, never add alignment edges
        if (this.alignmentEdgeStrategy === AlignmentEdgeStrategy.NEVER) {
            return false;
        }

        // Check for direct edge
        const hasDirectEdge = this.hasDirectEdgeBetween(g, sourceNodeId, targetNodeId);
        
        // If strategy is DIRECT, only check for direct edges
        if (this.alignmentEdgeStrategy === AlignmentEdgeStrategy.DIRECT) {
            return !hasDirectEdge;
        }

        // Strategy is CONNECTED: check if nodes are connected via any path
        // If they have a direct edge, they're connected
        if (hasDirectEdge) {
            return false;
        }

        // Check if connected via any path (including alignment edges)
        return !this.isConnectedViaPath(g, sourceNodeId, targetNodeId);
    }

    /**
     * Checks if there's a direct edge between two nodes (either direction).
     * 
     * @param g - The graph to check
     * @param sourceNodeId - First node ID
     * @param targetNodeId - Second node ID
     * @returns true if there's a direct edge between the nodes
     */
    private hasDirectEdgeBetween(g: Graph, sourceNodeId: string, targetNodeId: string): boolean {
        // Direct edge check (either direction). Prefer graphlib.hasEdge if available.
        return (typeof (g as any).hasEdge === 'function' && ((g as any).hasEdge(sourceNodeId, targetNodeId) || (g as any).hasEdge(targetNodeId, sourceNodeId)))
            ||
            // fallback to scanning in/out edges (handles multi-edges)
            ((g.inEdges(sourceNodeId) || []).some(e => e.v === targetNodeId) ||
             (g.outEdges(sourceNodeId) || []).some(e => e.w === targetNodeId) ||
             (g.inEdges(targetNodeId) || []).some(e => e.v === sourceNodeId) ||
             (g.outEdges(targetNodeId) || []).some(e => e.w === sourceNodeId));
    }

    /**
     * Checks if two nodes are connected via any path in the graph.
     * This is used to determine whether to add alignment edges for WebCola.
     * 
     * Performance optimization: We skip alignment edges when nodes are already
     * connected via any path (not just directly connected). This significantly
     * reduces the number of constraints for large graphs while maintaining good
     * layout quality, as connected nodes are less likely to fall into bad local minima.
     * 
     * Note: This follows ALL edges including alignment edges (edges with _alignment_ prefix).
     * This ensures we don't add redundant alignment edges when nodes are already connected
     * via other alignment edges.
     * 
     * @param g - The graph to check
     * @param sourceNodeId - First node ID
     * @param targetNodeId - Second node ID
     * @param excludeEdge - Optional edge to exclude from the connectivity check (for pruning)
     * @returns true if there's any path between the nodes (treating graph as undirected)
     */
    private isConnectedViaPath(g: Graph, sourceNodeId: string, targetNodeId: string, excludeEdge?: { v: string, w: string, name?: string }): boolean {
        // BFS treating graph as undirected (follow predecessors and successors)
        const visited = new Set<string>();
        const queue: string[] = [sourceNodeId];

        while (queue.length > 0) {
            const cur = queue.shift()!;
            if (cur === targetNodeId) {
                return true; // Connected via path
            }
            if (visited.has(cur)) continue;
            visited.add(cur);

            // Get all edges from current node
            const outEdges = g.outEdges(cur) || [];
            const inEdges = g.inEdges(cur) || [];
            
            // Process all edges, excluding the specified edge if provided
            for (const edge of [...outEdges, ...inEdges]) {
                // Skip the excluded edge if specified
                if (excludeEdge && 
                    ((edge.v === excludeEdge.v && edge.w === excludeEdge.w && edge.name === excludeEdge.name) ||
                     (edge.v === excludeEdge.w && edge.w === excludeEdge.v && edge.name === excludeEdge.name))) {
                    continue;
                }
                
                // Add the neighbor to the queue
                const neighbor = edge.v === cur ? edge.w : edge.v;
                if (!visited.has(neighbor)) {
                    queue.push(neighbor);
                }
            }
        }

        return false; // Not connected
    }

    /**
     * Prunes redundant alignment edges from the graph after all alignment edges have been added.
     * An alignment edge is redundant if removing it doesn't disconnect the nodes it connects.
     * 
     * This is useful for the case where alignment constraints create cycles or multiple paths,
     * and some edges can be removed without affecting connectivity.
     * 
     * Example: If a→b→c→a forms a cycle of alignment edges, one edge can be removed.
     * 
     * @param g - The graph containing alignment edges
     */
    private pruneRedundantAlignmentEdges(g: Graph): void {
        // Only prune if strategy is CONNECTED (otherwise we might break the intended behavior)
        if (this.alignmentEdgeStrategy !== AlignmentEdgeStrategy.CONNECTED) {
            return;
        }

        // Collect all alignment edges
        const alignmentEdges = g.edges().filter(edge => {
            const edgeId = edge.name;
            return edgeId && edgeId.includes('_alignment_');
        });

        // Track which edges we've removed
        const removedEdges: typeof alignmentEdges = [];

        // Try to remove each alignment edge
        for (const edge of alignmentEdges) {
            // Check if nodes are still connected without this edge
            if (this.isConnectedViaPath(g, edge.v, edge.w, edge)) {
                // Nodes are still connected, so this edge is redundant
                g.removeEdge(edge.v, edge.w, edge.name);
                removedEdges.push(edge);
            }
        }

        // Log pruning statistics if any edges were removed
        if (removedEdges.length > 0) {
            console.log(`Pruned ${removedEdges.length} redundant alignment edges out of ${alignmentEdges.length} total alignment edges`);
        }
    }

    private getDisconnectedNodes(g: Graph): string[] {
        let inNodes = g.edges().map(edge => edge.w);
        let outNodes = g.edges().map(edge => edge.v);

        // All nodes in the graph
        let allNodes = new Set(g.nodes());
        let allConnectedNodes = new Set([...inNodes, ...outNodes]);
        let disconnectedNodes = [...allNodes].filter(node => !allConnectedNodes.has(node));
        return disconnectedNodes;
    }



    private getNodeFromId(nodeId: string, layoutNodes: LayoutNode[]): LayoutNode {
        let node = layoutNodes.find((node) => node.id === nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found in graph. Did you hide it? If this is a built-in type, try removing any visibility flags.`);
        }
        return node;
    }


    private leftConstraint(leftId: string, rightId: string, minDistance: number, layoutNodes: LayoutNode[], sourceConstraint: RelativeOrientationConstraint | CyclicOrientationConstraint | ImplicitConstraint): LeftConstraint {

        let left = this.getNodeFromId(leftId, layoutNodes);
        let right = this.getNodeFromId(rightId, layoutNodes);
        return { left: left, right: right, minDistance: minDistance, sourceConstraint: sourceConstraint };
    }

    private topConstraint(topId: string, bottomId: string, minDistance: number, layoutNodes: LayoutNode[], sourceConstraint: RelativeOrientationConstraint | CyclicOrientationConstraint | ImplicitConstraint): TopConstraint {

        let top = this.getNodeFromId(topId, layoutNodes);
        let bottom = this.getNodeFromId(bottomId, layoutNodes);

        return { top: top, bottom: bottom, minDistance: minDistance, sourceConstraint: sourceConstraint };
    }

    private ensureSameYConstraint(node1Id: string, node2Id: string, layoutNodes: LayoutNode[], sourceConstraint: RelativeOrientationConstraint | CyclicOrientationConstraint | AlignConstraint | ImplicitConstraint): AlignmentConstraint {

        let node1 = this.getNodeFromId(node1Id, layoutNodes);
        let node2 = this.getNodeFromId(node2Id, layoutNodes);

        return { axis: "y", node1: node1, node2: node2, sourceConstraint: sourceConstraint };
    }

    private ensureSameXConstraint(node1Id: string, node2Id: string, layoutNodes: LayoutNode[], sourceConstraint: RelativeOrientationConstraint | CyclicOrientationConstraint | AlignConstraint | ImplicitConstraint): AlignmentConstraint {

        let node1 = this.getNodeFromId(node1Id, layoutNodes);
        let node2 = this.getNodeFromId(node2Id, layoutNodes);

        return { axis: "x", node1: node1, node2: node2, sourceConstraint: sourceConstraint };
    }

    private singletonGroup(nodeId: string): LayoutGroup {

        let groupName = `${LayoutInstance.DISCONNECTED_PREFIX}${nodeId}`;

        return {
            name: groupName,
            nodeIds: [nodeId],
            keyNodeId: nodeId,
            showLabel: false
        }
    }



    private getNodeSizeMap(g: Graph): Record<string, { width: number; height: number }> {
        let nodeSizeMap: Record<string, { width: number; height: number }> = {};
        const DEFAULT_SIZE = { width: this.DEFAULT_NODE_WIDTH, height: this.DEFAULT_NODE_HEIGHT };

        // Apply size directives first
        let sizeDirectives = this._layoutSpec.directives.sizes;
        sizeDirectives.forEach((sizeDirective) => {
            let selectedNodes = this.evaluator.evaluate(sizeDirective.selector, { instanceIndex: this.instanceNum }).selectedAtoms();
            let width = sizeDirective.width;
            let height = sizeDirective.height;

            selectedNodes.forEach((nodeId) => {

                if (nodeSizeMap[nodeId]) {

                    const existingSize = nodeSizeMap[nodeId];
                    if (existingSize.width !== width || existingSize.height !== height) {
                        throw new Error(
                            `Size Conflict: "${nodeId}" cannot have multiple sizes: ${JSON.stringify(existingSize)}, ${JSON.stringify({ width, height })}.`
                        );
                    }
                }

                nodeSizeMap[nodeId] = { width: width, height: height };
            });
        });

        // Set default sizes for nodes that do not have a size set
        let graphNodes = [...g.nodes()];
        graphNodes.forEach((nodeId) => {
            if (!nodeSizeMap[nodeId]) {
                nodeSizeMap[nodeId] = DEFAULT_SIZE;
            }
        });

        return nodeSizeMap;
    }


    private getNodeColorMap(g: Graph, a: IDataInstance): Record<string, string> {
        let nodeColorMap: Record<string, string> = {};

        // Start by getting the default signature colors
        let sigColors = this.getSigColors(a);

        // Apply color directives first
        let colorDirectives = this._layoutSpec.directives.atomColors;
        colorDirectives.forEach((colorDirective) => {
            let selected = this.evaluator.evaluate(colorDirective.selector, { instanceIndex: this.instanceNum }).selectedAtoms();
            let color = colorDirective.color;

            selected.forEach((nodeId) => {
                if (nodeColorMap[nodeId]) {
                    const existingColor = nodeColorMap[nodeId];
                    if (existingColor !== color) {
                        throw new Error(
                            `Color Conflict: "${nodeId}" cannot have multiple colors: ${existingColor}, ${color}.`
                        );
                    }
                }
                nodeColorMap[nodeId] = color;
            });
        });

        // Set default colors for nodes that do not have a color set
        let graphNodes = [...g.nodes()];
        graphNodes.forEach((nodeId) => {
            if (!nodeColorMap[nodeId]) {
                let mostSpecificType = this.getMostSpecificType(nodeId, a);
                nodeColorMap[nodeId] = sigColors[mostSpecificType];
            }
        });

        return nodeColorMap;
    }

    private getNodeIconMap(g: Graph): Record<string, { path: string, showLabels: boolean }> {
        let nodeIconMap: Record<string, { path: string, showLabels: boolean }> = {};
        const DEFAULT_ICON = this.DEFAULT_NODE_ICON_PATH;

        // Apply icon directives first
        let iconDirectives = this._layoutSpec.directives.icons;
        iconDirectives.forEach((iconDirective) => {
            let selected = this.evaluator.evaluate(iconDirective.selector, { instanceIndex: this.instanceNum }).selectedAtoms();
            let iconPath = iconDirective.path;

            selected.forEach((nodeId) => {
                if (nodeIconMap[nodeId]) {
                    const existingIcon = nodeIconMap[nodeId];
                    if (existingIcon.path !== iconPath || existingIcon.showLabels !== iconDirective.showLabels) {
                        throw new Error(
                            `Icon Conflict: "${nodeId}" cannot have multiple icons: ${JSON.stringify(existingIcon)}, ${JSON.stringify({ path: iconPath, showLabels: iconDirective.showLabels })}.`
                        );
                    }
                }
                nodeIconMap[nodeId] = { path: iconPath, showLabels: iconDirective.showLabels };
            });
        });

        // Set default icons for nodes that do not have an icon set
        let graphNodes = [...g.nodes()];
        graphNodes.forEach((nodeId) => {
            if (!nodeIconMap[nodeId]) {
                nodeIconMap[nodeId] = { path: DEFAULT_ICON, showLabels: true };
            }
        });

        return nodeIconMap;
    }

    /**
     * Gets the color for a specific edge based on directives.
     * @param relName - The relation name of the edge.
     * @param sourceAtom - The source atom ID.
     * @param targetAtom - The target atom ID.
     * @param edgeId - The edge ID (optional, used to identify inferred edges).
     * @returns The color for the edge, or "black" as default.
     */
    private getEdgeColor(relName: string, sourceAtom: string, targetAtom: string, edgeId?: string): string {
        // Check for inferred edge colors first
        const inferredEdgePrefix = "_inferred_";
        if (edgeId && edgeId.includes(inferredEdgePrefix)) {
            const inferredEdges = this._layoutSpec.directives.inferredEdges;
            for (const directive of inferredEdges) {
                // Check if this edge ID belongs to this inferred edge directive
                if (edgeId.includes(`${inferredEdgePrefix}<:${directive.name}`)) {
                    // If a color is specified, use it
                    if (directive.color) {
                        return directive.color;
                    }
                    // Otherwise, fall through to use default color
                    break;
                }
            }
        }

        const colorDirectives = this._layoutSpec.directives.edgeColors;
        
        for (const directive of colorDirectives) {
            if (directive.field !== relName) {
                continue;
            }
            
            if (!directive.selector) {
                // Legacy directive without selector applies to all edges with this field
                return directive.color;
            }
            
            try {
                const selectorResult = this.evaluator.evaluate(directive.selector, { instanceIndex: this.instanceNum });
                const selectedAtoms = selectorResult.selectedAtoms();
                
                // Check if source atom is selected by the selector
                if (selectedAtoms.includes(sourceAtom)) {
                    return directive.color;
                }
            } catch (error) {
                console.warn(`Failed to evaluate edge color selector "${directive.selector}":`, error);
                // Continue to next directive on error
            }
        }
        
        return "black"; // Default color
    }

    /**
     * Obtains the default sig colors for each sig type.
     * @param ai - The Alloy instance to get the sig colors for.
     * @returns a Record mapping sig types to their colors.
     */
    private getSigColors(ai: IDataInstance): Record<string, string> {
        let sigColors: Record<string, string> = {};

        let types = ai.getTypes();
        let colorPicker = new ColorPicker(types.length);
        types.forEach((type) => {
            sigColors[type.id] = colorPicker.getNextColor();
        });
        return sigColors;
    }

    private getFieldTuples(a: IDataInstance, fieldName: string): string[][] {

        let relations = a.getRelations();
        let vals = Object.values(relations);
        let field = Object.values(relations).find((rel) => rel.name === fieldName);


        if (!field) {
            return [];
        }

        let fieldTuples = field.tuples.map((tuple) => {
            return tuple.atoms;
        });
        return fieldTuples;
    }

    private getFieldTuplesForSourceAndTarget(a: IDataInstance, fieldName: string, src: string, tgt: string): string[][] {

        let fieldTuples = this.getFieldTuples(a, fieldName);
        let filteredTuples = fieldTuples.filter((tuple) => {
            let arity = tuple.length;
            if (arity < 1) {
                return false;
            }
            return tuple[0] === src && tuple[arity - 1] === tgt;
        });

        return filteredTuples;

    }

    // g is an inout parameter. I.E. it will be modified.
    private addinferredEdges(g: Graph) {

        const inferredEdgePrefix = "_inferred_";
        let inferredEdges = this._layoutSpec.directives.inferredEdges;
        inferredEdges.forEach((he) => {


            let res = this.evaluator.evaluate(he.selector, { instanceIndex: this.instanceNum });

            let selectedTuples: string[][] = res.selectedTuplesAll();
            let edgeIdPrefix = `${inferredEdgePrefix}<:${he.name}`;

            selectedTuples.forEach((tuple) => {

                let n = tuple.length;

                let sourceNodeId = tuple[0];
                let targetNodeId = tuple[n - 1];

               let edgeLabel = he.name;

                // Use node labels for middle nodes instead of IDs
                if (n > 2) {
                    // Get labels for middle nodes
                    let middleNodeLabels = tuple.slice(1, n - 1).map(nodeId => {
                        const nodeMetadata = g.node(nodeId);
                        return nodeMetadata?.label || nodeId; // Use label if available, fallback to ID
                    }).join(",");
                    edgeLabel = `${edgeLabel}[${middleNodeLabels}]`;
                }
                // The edge 

                let fullTuple = tuple.join("->");

                let edgeId = `${edgeIdPrefix}<:${fullTuple}`;
                g.setEdge(sourceNodeId, targetNodeId, edgeLabel, edgeId);
            });
        });
    }
}