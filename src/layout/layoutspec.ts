import * as yaml from 'js-yaml';

export type RelativeDirection = "above" | "below" | "left" | "right" | "directlyAbove" | "directlyBelow" | "directlyLeft" | "directlyRight";
export type RotationDirection = "clockwise" | "counterclockwise";
export type ClusterTarget = "domain" | "range";




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




export class GroupBySelector extends ConstraintOperation{
    name: string;

    constructor(selector : string, name: string) {
        super(selector);
        this.name = name;
    }

    override toHTML(): string {
        return `GroupBySelector with selector <pre>${this.selector}</pre> 
        and name <pre>${this.name}</pre>.`;
    }
}


/*

    TODO: Could this be written with selectors (X, Y) and name --> edge name would have to be well 
    generated.

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
}

export interface AtomHidingDirective extends VisualManipulation {
    // Uses selector to determine which atoms to hide
}


export interface FieldDirective extends Operation {
    field: string;
    selector?: string; // Optional selector to specify which atoms this directive applies to
}


export interface AttributeDirective extends FieldDirective {}

export interface FieldHidingDirective extends FieldDirective {}

export interface EdgeColorDirective extends FieldDirective {
    color: string;
}


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


    if (constraints && Array.isArray(constraints)) {
        try {
          let constraintsParsed = parseConstraints(constraints);
          layoutSpec.constraints = constraintsParsed;
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
        }

        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            throw new Error(`${errorMessage}`);
        }
    }
    return layoutSpec;
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

    let byselector: GroupBySelector[] = typedConstraints.filter(c => c.group)
        .filter(c => c.group.selector && c.group.name && !c.group.field)
        .map(c => {
            if(!c.group.selector) {
                throw new Error("Grouping constraint must have a selector.");
            }
            if(!c.group.name) {
                throw new Error("Grouping constraint must have a name.");
            }
            return new GroupBySelector(c.group.selector, c.group.name);
        });

    return {
        orientation: {
            relative: relativeOrientationConstraints,
            cyclic: cyclicConstraints
        },
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
                    return {
                        height: d.size.height,
                        width: d.size.width,
                        selector: d.size.selector
                    }
                });
    
    let edgeColors : EdgeColorDirective[] = typedDirectives.filter(d => d.edgeColor)
                .map(d => {
                    return {
                        color: d.edgeColor.value,
                        field: d.edgeColor.field,
                        selector: d.edgeColor.selector
                    }
                });

    let attributes : AttributeDirective[]  = typedDirectives.filter(d => d.attribute).map(d => {
        return {
            field: d.attribute.field,
            selector: d.attribute.selector
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
            selector: d.inferredEdge.selector
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