import * as yaml from 'js-yaml';
import { EdgeStyle } from './edge-style';

export type RelativeDirection = "above" | "below" | "left" | "right" | "directlyAbove" | "directlyBelow" | "directlyLeft" | "directlyRight";
export type RotationDirection = "clockwise" | "counterclockwise";
export type ClusterTarget = "domain" | "range";
export type AlignDirection = "horizontal" | "vertical";




/////////// COPE AND DRAG CORE ////////////

export interface Operation {}


class ConstraintOperation implements Operation {
    selector: string;
    constructor(selector: string) {
        this.selector = selector;
    }
    isInternallyConsistent(): boolean {
        // Default implementation, can be overridden by subclasses
        return true;
    }

    inconsistencyMessage(): string {
        return `Inconsistent Constraint Operation: ${this.selector}`;  
    }

    toHTML(): string {
        return `ConstraintOperation with selector <code>${this.selector} </code>.`;
    }
}



// So we have 3 kinds of constraint operations //

export class RelativeOrientationConstraint extends ConstraintOperation {
    directions : RelativeDirection[];

    constructor(directions: RelativeDirection[], selector: string) {
        super(selector);
        this.directions = directions;
    }
    
    override isInternallyConsistent(): boolean {

        // If "above" and  "below" are present, return false
        if (this.directions.includes("above") && this.directions.includes("below")) {
            return false;
        }

        // If "left" and "right" are present, return false
        if (this.directions.includes("left") && this.directions.includes("right")) {
            return false;
        }

        // If directlyLeft is present, the only other possible value should be left
        if (this.directions.includes("directlyLeft")) {
            // Ensure that all other values in the array are "left"
            if (!this.directions.every((direction) => direction === "left" || direction === "directlyLeft")) {
                return false;
            }
        }

        // If directlyRight is present, the only other possible value should be right
        if (this.directions.includes("directlyRight")) {
            // Ensure that all other values in the array are "right"
            if (!this.directions.every((direction) => direction === "right" || direction === "directlyRight")) {
                return false;
            }
        }

        // If directlyAbove is present, the only other possible value should be above
        if (this.directions.includes("directlyAbove")) {
            // Ensure that all other values in the array are "above"
            if (!this.directions.every((direction) => direction === "above" || direction === "directlyAbove")) {
                return false;
            }
        }

        // If directlyBelow is present, the only other possible value should be below
        if (this.directions.includes("directlyBelow")) {
            // Ensure that all other values in the array are "below"
            if (!this.directions.every((direction) => direction === "below" || direction === "directlyBelow")) {
                return false;
            }
        }
            return true;
        }


    override inconsistencyMessage(): string {
        let dirStr : string = this.directions.join(", ");
        return `Orientation Constraint with directions [${dirStr}] and selector <code>${this.selector}</code> is internally inconsistent.`;  
    }

    override toHTML(): string {

        let directions = this.directions.join(", ");
        return `OrientationConstraint with directions [${directions}] and selector <code>${this.selector}</code>`;
    }
}

export class AlignConstraint extends ConstraintOperation {
    direction: AlignDirection;

    constructor(direction: AlignDirection, selector: string) {
        super(selector);
        this.direction = direction;
    }
    
    override isInternallyConsistent(): boolean {
        // Direction must be horizontal or vertical
        return this.direction === "horizontal" || this.direction === "vertical";
    }

    override inconsistencyMessage(): string {
        return `Align Constraint with direction [${this.direction}] and selector <code>${this.selector}</code> is internally inconsistent.`;  
    }

    override toHTML(): string {
        return `AlignConstraint with direction [${this.direction}] and selector <code>${this.selector}</code>`;
    }
}




export class GroupBySelector extends ConstraintOperation{
    name: string;
    addEdge: boolean;

    constructor(selector : string, name: string, addEdge: boolean = false) {
        super(selector);
        this.name = name;
        this.addEdge = addEdge;
    }

    override toHTML(): string {

        return `GroupBySelector with selector <code>${this.selector}</code> 
        and name <code>${this.name}</code>.`;
    }
}


/*

    TODO: Deprecate.

*/
export class GroupByField  {
    // And applies to selects the thing to group ON
    field : string;

    // Optional selector to specify which atoms this grouping applies to
    selector? : string;

    // And this is the element upon WHICH to group (ie. the key)
    groupOn : number;

    // And this is what gets grouped
    addToGroup : number;
    constructor(field: string, groupOn: number, addToGroup: number, selector?: string) {
        this.field = field;
        this.groupOn = groupOn;
        this.addToGroup = addToGroup;
        this.selector = selector;
    }

    toHTML(): string {
        const selectorText = this.selector ? ` with selector <pre>${this.selector}</pre>` : '';
        return `GroupByField on field <pre>${this.field}</pre> grouping field index <pre>${this.groupOn}</pre> 
        adding to group index <pre>${this.addToGroup}</pre>${selectorText}.`;
    }
}







export class CyclicOrientationConstraint extends ConstraintOperation {
    direction : RotationDirection;

    constructor(direction: RotationDirection, selector: string) {
        super(selector);
        this.direction = direction;
    }

    override inconsistencyMessage(): string {
        return `Cyclic constraint with direction [${this.direction}] with selector <code>${this.selector}</code> is inconsistent.`;  
    }

    override toHTML(): string {
        return `Cyclic constraint with direction [${this.direction}] and selector <code>${this.selector}</code>`;
    }
}


// And directive operations (TODO: THESE ALSO NEED TO BE SELECTORS!)

export interface DirectiveOperation extends Operation {}

export interface VisualManipulation extends Operation {
    selector : string;
}

export interface AtomColorDirective extends VisualManipulation {
    color : string;
}

export interface AtomSizeDirective extends VisualManipulation {
    height : number;
    width : number;
}

export interface AtomIconDirective extends VisualManipulation {
    path : string;
    showLabels : boolean;
}

export interface InferredEdgeDirective extends VisualManipulation {
    name : string;
    color?: string;
    style?: EdgeStyle;
    weight?: number;
}

export interface AtomHidingDirective extends VisualManipulation {
    // Uses selector to determine which atoms to hide
}


export interface FieldDirective extends Operation {
    field: string;
    selector?: string; // Optional selector to specify which atoms this directive applies to
}


export interface AttributeDirective extends FieldDirective {
    /**
     * Optional filter to specify which attribute values to show.
     * For relations like rel:x->y->Bool, this allows filtering to only show
     * attributes where the filter evaluates to true (e.g., only show where value is True).
     * This is a binary/n-ary selector that should match tuples (not just atoms).
     */
    filter?: string;
}

export interface FieldHidingDirective extends FieldDirective {}

/**
 * EdgeStyleDirective is the canonical interface for edge styling.
 * It allows customization of color, line style, weight, label visibility, and edge visibility.
 */
export interface EdgeStyleDirective extends FieldDirective {
    color: string;
    style?: EdgeStyle;
    weight?: number;
    showLabel?: boolean;
    hidden?: boolean;
}

/**
 * @deprecated Use EdgeStyleDirective instead. EdgeColorDirective is retained for backwards compatibility.
 */
export type EdgeColorDirective = EdgeStyleDirective;


export interface ProjectionDirective extends DirectiveOperation {
    sig : string;
}

/////////////////////////////////////////////////

interface ConstraintsBlock 
{
    orientation : {
        relative: RelativeOrientationConstraint[];
        cyclic: CyclicOrientationConstraint[];
    };
    alignment: AlignConstraint[];
    grouping : {
        byfield : GroupByField[];
        byselector : GroupBySelector[];
    }

}

interface DirectivesBlock {
    atomColors: AtomColorDirective[];
    sizes: AtomSizeDirective[];
    icons: AtomIconDirective[];
    edgeColors: EdgeColorDirective[];
    projections: ProjectionDirective[];
    attributes: AttributeDirective[];
    hiddenFields: FieldHidingDirective[];
    inferredEdges: InferredEdgeDirective[];
    hiddenAtoms: AtomHidingDirective[];
    hideDisconnected : boolean;
    hideDisconnectedBuiltIns : boolean;
}

function assertPositiveSizeDimension(value: unknown, label: string): void {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
        throw new Error(`Size ${label} must be greater than 0`);
    }
}

function assertValidSizeParams(size: Record<string, unknown>, context: string): void {
    assertPositiveSizeDimension(size.width, `${context} width`);
    assertPositiveSizeDimension(size.height, `${context} height`);
}


export interface LayoutSpec {

    constraints: ConstraintsBlock

    directives : DirectivesBlock
}

function DEFAULT_LAYOUT() : LayoutSpec 
{

    return {
        constraints: {
            orientation : {
                relative: [] as RelativeOrientationConstraint[],
                cyclic: [] as CyclicOrientationConstraint[]
            },
            alignment: [] as AlignConstraint[],
            grouping : {
                byfield : [] as GroupByField[],
                byselector : [] as GroupBySelector[]
            }
        },
        directives: {
            atomColors: [],
            sizes: [],
            icons: [],
            edgeColors: [],
            projections: [],
            attributes: [],
            hiddenFields: [],
            inferredEdges: [],
            hiddenAtoms: [],
            hideDisconnected: false,
            hideDisconnectedBuiltIns: false
        }
    };
}



/////////// Now we also define some convenient SUGAR /////////


// TODO: Lets ignore sugar for now.







/////////

/**
 * Parses a YAML string into a LayoutSpec object.
 * @param s YAML string to parse into a LayoutSpec.
 * @returns LayoutSpec object containing constraints and directives.
 * @throws Error if there are inconsistencies in the constraints or directives.
 */
export function parseLayoutSpec(s: string): LayoutSpec {

    if (!s) {
        return DEFAULT_LAYOUT();
    }


    // First, parse the YAML
    let parsed = yaml.load(s) as Record<string, unknown>;


    // Now extract the constraints and directives
    let constraints = parsed?.constraints;
    let directives = parsed?.directives;



    let layoutSpec: LayoutSpec = DEFAULT_LAYOUT();

    // Now we go through the constraints and directives and extract them
    // Note: size and hideAtom can appear in either constraints or directives
    let sizesFromConstraints: AtomSizeDirective[] = [];
    let hiddenAtomsFromConstraints: AtomHidingDirective[] = [];

    if (constraints && Array.isArray(constraints)) {
        try {
          let constraintsParsed = parseConstraints(constraints);
          layoutSpec.constraints = constraintsParsed;
          
          // Also extract size and hideAtom from constraints
          const typedConstraints = constraints as Record<string, any>[];
          sizesFromConstraints = typedConstraints.filter(c => c.size)
            .map(c => {
                assertValidSizeParams(c.size, "constraint");
                return {
                    height: c.size.height,
                    width: c.size.width,
                    selector: c.size.selector
                };
            });
          
          hiddenAtomsFromConstraints = typedConstraints.filter(c => c.hideAtom)
            .map(c => ({
                selector: c.hideAtom.selector
            }));
        }
        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            throw new Error(`${errorMessage}`);
        }
    }

    if (directives && Array.isArray(directives)) {
        try {
            let directivesParsed = parseDirectives(directives);
            layoutSpec.directives = directivesParsed;
            
            // Merge size and hideAtom from constraints into directives
            layoutSpec.directives.sizes = [...sizesFromConstraints, ...directivesParsed.sizes];
            layoutSpec.directives.hiddenAtoms = [...hiddenAtomsFromConstraints, ...directivesParsed.hiddenAtoms];
        }

        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            throw new Error(`${errorMessage}`);
        }
    } else {
        // If no directives block exists, still use size/hideAtom from constraints
        layoutSpec.directives.sizes = sizesFromConstraints;
        layoutSpec.directives.hiddenAtoms = hiddenAtomsFromConstraints;
    }
    return layoutSpec;
}

/**
 * Removes duplicate cyclic orientation constraints based on selector and direction.
 * @param constraints Array of cyclic constraints
 * @returns Array with duplicates removed
 */
function removeDuplicateCyclicConstraints(constraints: CyclicOrientationConstraint[]): CyclicOrientationConstraint[] {
    const seen = new Map<string, CyclicOrientationConstraint>();
    const result: CyclicOrientationConstraint[] = [];
    
    for (const constraint of constraints) {
        const key = `${constraint.selector.trim()}|${constraint.direction}`;
        if (!seen.has(key)) {
            seen.set(key, constraint);
            result.push(constraint);
        }
    }
    
    return result;
}

/**
 * Removes duplicate relative orientation constraints based on selector and directions.
 * @param constraints Array of relative orientation constraints
 * @returns Array with duplicates removed
 */
function removeDuplicateRelativeOrientationConstraints(constraints: RelativeOrientationConstraint[]): RelativeOrientationConstraint[] {
    const seen = new Map<string, RelativeOrientationConstraint>();
    const result: RelativeOrientationConstraint[] = [];
    
    for (const constraint of constraints) {
        const key = `${constraint.selector.trim()}|${constraint.directions.sort().join(',')}`;
        if (!seen.has(key)) {
            seen.set(key, constraint);
            result.push(constraint);
        }
    }
    
    return result;
}

/**
 * Removes duplicate align constraints based on selector and direction.
 * @param constraints Array of align constraints
 * @returns Array with duplicates removed
 */
function removeDuplicateAlignConstraints(constraints: AlignConstraint[]): AlignConstraint[] {
    const seen = new Map<string, AlignConstraint>();
    const result: AlignConstraint[] = [];
    
    for (const constraint of constraints) {
        const key = `${constraint.selector.trim()}|${constraint.direction}`;
        if (!seen.has(key)) {
            seen.set(key, constraint);
            result.push(constraint);
        }
    }
    
    return result;
}

/**
 * Removes duplicate group by selector constraints based on selector and name.
 * @param constraints Array of group by selector constraints
 * @returns Array with duplicates removed
 */
function removeDuplicateGroupBySelectorConstraints(constraints: GroupBySelector[]): GroupBySelector[] {
    const seen = new Map<string, GroupBySelector>();
    const result: GroupBySelector[] = [];
    
    for (const constraint of constraints) {
        const key = `${constraint.selector.trim()}|${constraint.name}|${constraint.addEdge}`;
        if (!seen.has(key)) {
            seen.set(key, constraint);
            result.push(constraint);
        }
    }
    
    return result;
}

/**
 * Removes duplicate group by field constraints based on field, groupOn, addToGroup, and selector.
 * @param constraints Array of group by field constraints
 * @returns Array with duplicates removed
 */
function removeDuplicateGroupByFieldConstraints(constraints: GroupByField[]): GroupByField[] {
    const seen = new Map<string, GroupByField>();
    const result: GroupByField[] = [];
    
    for (const constraint of constraints) {
        const key = `${constraint.field}|${constraint.groupOn}|${constraint.addToGroup}|${constraint.selector || ''}`;
        if (!seen.has(key)) {
            seen.set(key, constraint);
            result.push(constraint);
        }
    }
    
    return result;
}

/**
 * Parses the constraints from the YAML specification.
 * @param constraints List of constraints from the YAML specification.
 * @returns List of CnD constraints
 * @throws Error if there are inconsistencies in the constraints.
 */
function parseConstraints(constraints: unknown[]):   ConstraintsBlock
{
    // Type assertion since we expect specific structure from YAML
    const typedConstraints = constraints as Record<string, any>[];

    // All cyclic orientation constraints should start with 'cyclic'
    let cyclicConstraints: CyclicOrientationConstraint[] = typedConstraints.filter(c => c.cyclic)
        .map(c => {
            
            if(!c.cyclic.selector) {
                throw new Error("Cyclic constraint must have a selector");
            }

            return new CyclicOrientationConstraint(
                c.cyclic.direction || "clockwise",
                c.cyclic.selector
            );
        });

        // Remove duplicate cyclic constraints
        cyclicConstraints = removeDuplicateCyclicConstraints(cyclicConstraints);

        let cyclicDirectionsBySelector : Record<string, RotationDirection> = {};

        cyclicConstraints.forEach(c => {
            let k = c.selector.trim();

            if (!cyclicDirectionsBySelector[k]) {
                cyclicDirectionsBySelector[k] = c.direction;
            }
            else if (cyclicDirectionsBySelector[k] !== c.direction) {
                throw new Error(`Inconsistent cyclic constraint for selector ${k}: ${cyclicDirectionsBySelector[k]}, ${c.direction}`);
            }
        });
    



    let relativeOrientationConstraints: RelativeOrientationConstraint[] = typedConstraints.filter(c => c.orientation)
        .map(c => {

            var isInternallyConsistent = true;
            let constr = c.orientation as RelativeOrientationConstraint;


            // If not, we parse from the CORE constraint
            if(!constr.selector) {
                throw new Error("Orientation constraint must have selector field");
            }

            if(!constr.directions) {
                throw new Error("Orientation constraint must have directions field");
            }

            let roc = new RelativeOrientationConstraint(
                constr.directions,
                constr.selector
            );
            isInternallyConsistent = roc.isInternallyConsistent();
            if(!isInternallyConsistent) {
                throw new Error(roc.inconsistencyMessage());
            }
            return roc;
        });

    // Remove duplicate relative orientation constraints
    relativeOrientationConstraints = removeDuplicateRelativeOrientationConstraints(relativeOrientationConstraints);


    let byfield: GroupByField[] = typedConstraints.filter(c => c.group)
        .filter(c => c.group.field)
        .map(c => {

            // If not, we parse from the CORE constraint
            if(c.group.groupOn == undefined) {
                throw new Error("Grouping constraint must have groupOn field");
            }

            if(c.group.field == undefined) {
                throw new Error("Grouping constraint must specify a field");
            }

            if(c.group.addToGroup == undefined) {
                throw new Error("Grouping constraint must specify addToGroup");
            }


            return new GroupByField(
                c.group.field,
                c.group.groupOn,
                c.group.addToGroup,
                c.group.selector
            );

            // return {
            //     groupOn: c.group.groupOn,
            //     field: c.group.field,
            //     addToGroup: c.group.addToGroup,
            // }
        });

    // Remove duplicate group by field constraints
    byfield = removeDuplicateGroupByFieldConstraints(byfield);

    let byselector: GroupBySelector[] = typedConstraints.filter(c => c.group)
        .filter(c => c.group.selector && c.group.name && !c.group.field)
        .map(c => {
            if(!c.group.selector) {
                throw new Error("Grouping constraint must have a selector.");
            }
            if(!c.group.name) {
                throw new Error("Grouping constraint must have a name.");
            }
            return new GroupBySelector(c.group.selector, c.group.name, c.group.addEdge);
        });

    // Remove duplicate group by selector constraints
    byselector = removeDuplicateGroupBySelectorConstraints(byselector);

    let alignConstraints: AlignConstraint[] = typedConstraints.filter(c => c.align)
        .map(c => {
            if(!c.align.selector) {
                throw new Error("Align constraint must have a selector");
            }
            
            if(!c.align.direction) {
                throw new Error("Align constraint must have a direction");
            }

            let alignConstraint = new AlignConstraint(
                c.align.direction,
                c.align.selector
            );
            
            if(!alignConstraint.isInternallyConsistent()) {
                throw new Error(alignConstraint.inconsistencyMessage());
            }
            
            return alignConstraint;
        });

    // Remove duplicate align constraints
    alignConstraints = removeDuplicateAlignConstraints(alignConstraints);

    return {
        orientation: {
            relative: relativeOrientationConstraints,
            cyclic: cyclicConstraints
        },
        alignment: alignConstraints,
        grouping: {
            byfield: byfield,
            byselector: byselector
        }
    }

}

/**
 * Parses the directives from the YAML specification.
 * @param directives List of directives from the YAML specification.
 * @returns List of CnD directives
 * @throws Error if there are inconsistencies in the directives.
 */
function parseDirectives(directives: unknown[]): DirectivesBlock {
    // Type assertion since we expect specific structure from YAML
    const typedDirectives = directives as Record<string, any>[];

    // CURRENTLY NO SUGAR HERE!

    let icons : AtomIconDirective[] = typedDirectives.filter(d => d.icon)
                .map(d => {

                    return {
                        path: d.icon.path,
                        selector: d.icon.selector,
                        showLabels: d.icon.showLabels || false 
                    }
                });
    let atomColors : AtomColorDirective[] = typedDirectives.filter(d => d.atomColor)
                .map(d => {
                    return {
                        color: d.atomColor.value,
                        selector: d.atomColor.selector
                    }
                });

    let sizes : AtomSizeDirective[] = typedDirectives.filter(d => d.size)
                .map(d => {
                    assertValidSizeParams(d.size, "directive");
                    return {
                        height: d.size.height,
                        width: d.size.width,
                        selector: d.size.selector
                    };
                });
    
    let edgeColors : EdgeColorDirective[] = typedDirectives.filter(d => d.edgeColor)
                .map(d => {
                    return {
                        color: d.edgeColor.value,
                        field: d.edgeColor.field,
                        selector: d.edgeColor.selector,
                        style: d.edgeColor.style,
                        weight: d.edgeColor.weight,
                        showLabel: d.edgeColor.showLabel,
                        hidden: d.edgeColor.hidden
                    }
                });

    let attributes : AttributeDirective[]  = typedDirectives.filter(d => d.attribute).map(d => {
        return {
            field: d.attribute.field,
            selector: d.attribute.selector,
            filter: d.attribute.filter
        }
    });

    let hiddenFields : FieldHidingDirective[] = typedDirectives.filter(d => d.hideField).map(d => {
        return {
            field: d.hideField.field,
            selector: d.hideField.selector
        }
    });

    let projections : ProjectionDirective[] = typedDirectives.filter(d => d.projection).map(d => {
            return {
                sig: d.projection.sig
            }
        }
    );

    let flags = typedDirectives.filter(d => d.flag).map(d => d.flag);
    let hideDisconnected = flags.includes("hideDisconnected");
    let hideDisconnectedBuiltIns = flags.includes("hideDisconnectedBuiltIns");

    let inferredEdges : InferredEdgeDirective[] = typedDirectives.filter(d => d.inferredEdge).map(d => {
        return {
            name: d.inferredEdge.name,
            selector: d.inferredEdge.selector,
            color: d.inferredEdge.color,
            style: d.inferredEdge.style,
            weight: d.inferredEdge.weight
        }
    });

    let hiddenAtoms : AtomHidingDirective[] = typedDirectives.filter(d => d.hideAtom).map(d => {
        return {
            selector: d.hideAtom.selector
        }
    });

    return {
        atomColors,
        sizes,
        icons,
        edgeColors,
        projections,
        attributes,
        hiddenFields,
        inferredEdges,
        hiddenAtoms,
        hideDisconnected,
        hideDisconnectedBuiltIns
    }
}
