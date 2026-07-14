import * as yaml from 'js-yaml';
import { EdgeStyle } from './edge-style';
import { EdgeStyleRule, parseEdgeStyleSpec, edgeColorToEdgeStyleRule } from './style/edge-style-spec';
import type { LineStyle } from './style/edge-style-spec';
import { AtomStyleRule, parseAtomStyleSpec, atomColorToAtomStyleRule } from './style/atom-style-spec';
import { parseTextStyle } from './style/text-style';
import type { TextStyle } from './style/text-style';

export type RelativeDirection = "above" | "below" | "left" | "right" | "directlyAbove" | "directlyBelow" | "directlyLeft" | "directlyRight";
export type RotationDirection = "clockwise" | "counterclockwise";
export type ClusterTarget = "domain" | "range";
export type AlignDirection = "horizontal" | "vertical";




/////////// COPE AND DRAG CORE ////////////

export interface Operation {}


class ConstraintOperation implements Operation {
    selector: string;
    negated: boolean;
    constructor(selector: string, negated: boolean = false) {
        this.selector = selector;
        this.negated = negated;
    }
    isInternallyConsistent(): boolean {
        // Default implementation, can be overridden by subclasses
        return true;
    }

    inconsistencyMessage(): string {
        return `Inconsistent Constraint Operation: ${this.selector}`;
    }

    toHTML(): string {
        const prefix = this.negated ? 'NOT ' : '';
        return `${prefix}ConstraintOperation with selector <code>${this.selector} </code>.`;
    }
}



// So we have 3 kinds of constraint operations //

export class RelativeOrientationConstraint extends ConstraintOperation {
    directions : RelativeDirection[];

    constructor(directions: RelativeDirection[], selector: string, negated: boolean = false) {
        super(selector, negated);
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
        const prefix = this.negated ? 'NOT ' : '';
        let directions = this.directions.join(", ");
        return `${prefix}OrientationConstraint with directions [${directions}] and selector <code>${this.selector}</code>`;
    }
}

export class AlignConstraint extends ConstraintOperation {
    direction: AlignDirection;

    constructor(direction: AlignDirection, selector: string, negated: boolean = false) {
        super(selector, negated);
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
        const prefix = this.negated ? 'NOT ' : '';
        return `${prefix}AlignConstraint with direction [${this.direction}] and selector <code>${this.selector}</code>`;
    }
}




/**
 * Direction of the optional edge a {@link GroupBySelector} draws between the
 * group key and the group. For binary selector tuples (a, b), (a, c), … the
 * group is keyed by `a` and contains {b, c, …}; the edge connects `a` to that
 * group.
 *   - `'none'`      → draw no edge (default)
 *   - `'togroup'`   → draw an edge a → group
 *   - `'fromgroup'` → draw an edge group → a
 */
export type GroupEdgeDirection = 'none' | 'togroup' | 'fromgroup';

/** The closed set of values accepted in the `addEdge` field. */
export const GROUP_EDGE_DIRECTIONS: readonly GroupEdgeDirection[] = ['none', 'togroup', 'fromgroup'];

/**
 * Normalise a raw `addEdge` value into a {@link GroupEdgeDirection}. Accepts the
 * three string values, and — for backwards compatibility with specs written
 * against the old boolean flag — maps `true` to `'togroup'` (the historical
 * behaviour: an edge from the key node into the group). Anything else is `'none'`.
 */
export function normalizeGroupEdgeDirection(value: unknown): GroupEdgeDirection {
    // Block form — `addEdge: { points, lineStyle, textStyle }` — carries the
    // direction in `points`; the bare string/bool form is the direction itself.
    if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>).points;
    }
    if (value === true || value === 'togroup') return 'togroup';
    if (value === 'fromgroup') return 'fromgroup';
    return 'none';
}

export class GroupBySelector extends ConstraintOperation{
    name: string;
    addEdge: GroupEdgeDirection;
    /**
     * Line styling for the `addEdge` connector (the edge drawn between the key
     * and the group). Present only when `addEdge` is given in block form
     * (`addEdge: { points, lineStyle, textStyle }`). The connector is an edge, so
     * this reuses the shared {@link LineStyle}. Absent = the default edge look.
     */
    connectorLineStyle?: LineStyle;
    /** Label styling for the `addEdge` connector's label (shared {@link TextStyle}). */
    connectorTextStyle?: TextStyle;
    /** Styling for the group's own label, from the group's top-level `textStyle`. */
    labelTextStyle?: TextStyle;

    constructor(selector : string, name: string, addEdge: GroupEdgeDirection | boolean = 'none', negated: boolean = false) {
        super(selector, negated);
        this.name = name;
        this.addEdge = normalizeGroupEdgeDirection(addEdge);
    }

    override toHTML(): string {
        if (this.negated) {
            return `Members selected by <code>${this.selector}</code> cannot form a group`;
        }
        const edgeNote =
            this.addEdge === 'togroup' ? ` An edge is drawn from the key to the group.`
            : this.addEdge === 'fromgroup' ? ` An edge is drawn from the group to the key.`
            : '';
        return `GroupBySelector with selector <code>${this.selector}</code>
        and name <code>${this.name}</code>.${edgeNote}`;
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

    negated : boolean;

    constructor(field: string, groupOn: number, addToGroup: number, selector?: string, negated: boolean = false) {
        this.field = field;
        this.groupOn = groupOn;
        this.addToGroup = addToGroup;
        this.selector = selector;
        this.negated = negated;
    }

    toHTML(): string {
        if (this.negated) {
            const selectorText = this.selector ? ` (selector: <code>${this.selector}</code>)` : '';
            return `Members grouped by field <code>${this.field}</code> cannot form a group${selectorText}`;
        }
        const selectorText = this.selector ? ` with selector <pre>${this.selector}</pre>` : '';
        return `GroupByField on field <pre>${this.field}</pre> grouping field index <pre>${this.groupOn}</pre>
        adding to group index <pre>${this.addToGroup}</pre>${selectorText}.`;
    }
}







export class CyclicOrientationConstraint extends ConstraintOperation {
    direction : RotationDirection;

    constructor(direction: RotationDirection, selector: string, negated: boolean = false) {
        super(selector, negated);
        this.direction = direction;
    }

    override inconsistencyMessage(): string {
        return `Cyclic constraint with direction [${this.direction}] with selector <code>${this.selector}</code> is inconsistent.`;
    }

    override toHTML(): string {
        const prefix = this.negated ? 'NOT ' : '';
        return `${prefix}Cyclic constraint with direction [${this.direction}] and selector <code>${this.selector}</code>`;
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
    /** Line color. Parsed from `lineStyle.color` (legacy inline `color` still accepted). */
    color?: string;
    /** Line dash pattern. Parsed from `lineStyle.pattern` (legacy inline `style` still accepted). */
    style?: EdgeStyle;
    /** Line weight. Parsed from `lineStyle.weight` (legacy inline `weight` still accepted). */
    weight?: number;
    /** Optional highlight color drawn as a wider underlay beneath the edge. */
    highlight?: string;
    /** Optional label styling. Parsed from the `textStyle` block. */
    textStyle?: TextStyle;
}

export interface AtomHidingDirective extends VisualManipulation {
    // Uses selector to determine which atoms to hide
}


export interface FieldDirective extends Operation {
    field: string;
    /** Optional unary selector to specify which source atoms this directive applies to */
    selector?: string;
    /**
     * Optional filter to specify which tuples this directive applies to.
     * For relations like rel:x->y->Bool, this allows filtering to only apply
     * to tuples where the filter evaluates to true (e.g., only where value is True).
     * This is a binary/n-ary selector that should match tuples (not just atoms).
     */
    filter?: string;
}


export interface AttributeDirective extends FieldDirective {
    /**
     * Styling for this attribute's line on the node, from the shared `textStyle`
     * block (`size` tier + `color`). Absent leaves fall back to the defaults
     * (normal size, inherited label color).
     */
    textStyle?: TextStyle;
}

/**
 * TagDirective adds computed attributes to nodes based on n-ary selector evaluation.
 * Unlike AttributeDirective which works with edges/fields, TagDirective is purely selector-based
 * and doesn't remove edges or modify the graph structure.
 * 
 * The value selector is evaluated and for each tuple returned:
 * - For unary results (single atom), the tag appears as: name: value
 * - For n-ary results (x1->y1->z1, x2->y2->z2), tags appear as:
 *   name[x1][y1]: z1
 *   name[x2][y2]: z2
 */
export interface TagDirective extends Operation {
    /** Selector to determine which atoms get this tag */
    toTag: string;
    /** The attribute name to display */
    name: string;
    /** N-ary selector whose result becomes the attribute value */
    value: string;
    /**
     * Styling for this tag's line on the node, from the shared `textStyle`
     * block (`size` tier + `color`). Absent leaves fall back to the defaults
     * (normal size, inherited label color).
     */
    textStyle?: TextStyle;
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
    /** Optional highlight color drawn as a wider underlay beneath the edge. */
    highlight?: string;
}

/**
 * @deprecated Use EdgeStyleDirective instead. EdgeColorDirective is retained for backwards compatibility.
 */
export type EdgeColorDirective = EdgeStyleDirective;


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
    atomStyles: AtomStyleRule[];
    sizes: AtomSizeDirective[];
    icons: AtomIconDirective[];
    edgeColors: EdgeColorDirective[];
    edgeStyles: EdgeStyleRule[];
    attributes: AttributeDirective[];
    tags: TagDirective[];
    hiddenFields: FieldHidingDirective[];
    inferredEdges: InferredEdgeDirective[];
    hiddenAtoms: AtomHidingDirective[];
    hideDisconnected : boolean;
    hideDisconnectedBuiltIns : boolean;
}

function assertPositiveSizeDimension(value: unknown, label: string): void {
    if (value === undefined || value === null) {
        throw new Error(`Size ${label} is required and must be greater than 0`);
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
            atomStyles: [],
            sizes: [],
            icons: [],
            edgeColors: [],
            edgeStyles: [],
            attributes: [],
            tags: [],
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
        const key = `${constraint.selector.trim()}|${constraint.direction}|${constraint.negated}`;
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
        const key = `${constraint.selector.trim()}|${constraint.directions.sort().join(',')}|${constraint.negated}`;
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
        const key = `${constraint.selector.trim()}|${constraint.direction}|${constraint.negated}`;
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
    const rawConstraints = constraints as Record<string, any>[];

    // Pre-process: determine negation from "hold: never" field
    const typedConstraints = rawConstraints.map((c): Record<string, any> & { _negated: boolean } => {
        const inner = c.orientation || c.cyclic || c.align || c.group;
        if (inner && inner.hold === 'never') {
            return { ...c, _negated: true };
        }
        return { ...c, _negated: false };
    });

    // All cyclic orientation constraints should start with 'cyclic'
    let cyclicConstraints: CyclicOrientationConstraint[] = typedConstraints.filter(c => c.cyclic)
        .map(c => {

            if(!c.cyclic.selector) {
                throw new Error("Cyclic constraint must have a selector");
            }

            return new CyclicOrientationConstraint(
                c.cyclic.direction || "clockwise",
                c.cyclic.selector,
                c._negated
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
                constr.selector,
                c._negated
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
                c.group.selector,
                c._negated
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
        .filter(c => c.group.selector && !c.group.field)
        .map(c => {
            if(!c.group.selector) {
                throw new Error("Grouping constraint must have a selector.");
            }
            if(!c.group.name && !c._negated) {
                throw new Error("Grouping constraint must have a name.");
            }
            // Auto-generate name for negated groups without one
            const name = c.group.name || `_not_group_${c.group.selector}`;
            const gbs = new GroupBySelector(c.group.selector, name, c.group.addEdge, c._negated);
            // Block-form `addEdge: { points, lineStyle, textStyle }` styles the
            // connector — which is an edge — so parse it as an edge spec (the
            // `points` key is ignored by parseEdgeStyleSpec). A bare string/bool
            // addEdge stays unstyled (its direction was read above).
            if (c.group.addEdge && typeof c.group.addEdge === 'object') {
                const connSpec = parseEdgeStyleSpec(c.group.addEdge);
                gbs.connectorLineStyle = connSpec.lineStyle;
                gbs.connectorTextStyle = connSpec.textStyle;
            }
            // The group's own label styling (top-level `textStyle`).
            gbs.labelTextStyle = parseTextStyle(c.group.textStyle);
            return gbs;
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
                c.align.selector,
                c._negated
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
    // atomColor is the deprecated flat form of atomStyle. Desugar each into an
    // AtomStyleRule (border-preserving: value→borderStyle.color, so existing
    // diagrams stay outlined exactly as before) and resolve through the one
    // atomStyle path (compose / collide together). Emit one deprecation warning.
    // `atomColors` is kept empty only to satisfy the DirectivesBlock shape; its
    // sole consumer (getNodeColorMap) now reads the resolved atomStyle instead,
    // and atom styling flows via `atomStyles`.
    const rawAtomColors = typedDirectives.filter(d => d.atomColor);
    if (rawAtomColors.length > 0) {
        console.warn(
            "[spytial] 'atomColor' is deprecated and will be removed in a future major; " +
            "use 'atomStyle' with a 'borderStyle' block (value→borderStyle.color), " +
            "or a 'fillStyle' block for a real interior fill."
        );
    }
    // A selectorless (malformed) atomColor desugars to null and is dropped — it
    // was a no-op before, and must not become a global recolor of every atom.
    const desugaredAtomColors: AtomStyleRule[] = rawAtomColors
        .map(d => atomColorToAtomStyleRule(d.atomColor))
        .filter((rule): rule is AtomStyleRule => rule !== null);
    let atomColors : AtomColorDirective[] = [];

    let sizes : AtomSizeDirective[] = typedDirectives.filter(d => d.size)
                .map(d => {
                    assertValidSizeParams(d.size, "directive");
                    return {
                        height: d.size.height,
                        width: d.size.width,
                        selector: d.size.selector
                    };
                });
    
    // edgeColor is the deprecated flat form of edgeStyle. Desugar each into an
    // EdgeStyleRule so both forms resolve through the one edgeStyle path (and
    // compose / collide together). Emit one deprecation warning. `edgeColors` is
    // kept empty only to satisfy the DirectivesBlock shape; its sole consumer
    // (findEdgeDirective) then no-ops, and edge styling flows via `edgeStyles`.
    const rawEdgeColors = typedDirectives.filter(d => d.edgeColor);
    if (rawEdgeColors.length > 0) {
        console.warn(
            "[spytial] 'edgeColor' is deprecated and will be removed in a future major; " +
            "use 'edgeStyle' with a 'lineStyle' block " +
            "(value→lineStyle.color, style→lineStyle.pattern, weight→lineStyle.weight, highlight→lineStyle.highlight)."
        );
    }
    const desugaredEdgeColors: EdgeStyleRule[] = rawEdgeColors.map(d => edgeColorToEdgeStyleRule(d.edgeColor));
    let edgeColors : EdgeColorDirective[] = [];

    let attributes : AttributeDirective[]  = typedDirectives.filter(d => d.attribute).map(d => {
        return {
            field: d.attribute.field,
            selector: d.attribute.selector,
            filter: d.attribute.filter,
            textStyle: parseTextStyle(d.attribute.textStyle)
        }
    });

    let hiddenFields : FieldHidingDirective[] = typedDirectives.filter(d => d.hideField).map(d => {
        return {
            field: d.hideField.field,
            selector: d.hideField.selector,
            filter: d.hideField.filter
        }
    });

    let flags = typedDirectives.filter(d => d.flag).map(d => d.flag);
    let hideDisconnected = flags.includes("hideDisconnected");
    let hideDisconnectedBuiltIns = flags.includes("hideDisconnectedBuiltIns");

    // inferredEdge keeps its structural identity (name/selector) but adopts the
    // shared lineStyle/textStyle blocks. Legacy inline color/style/weight/highlight
    // still parse (mapped onto the flat fields) but are deprecated.
    let usedLegacyInferredInline = false;
    let inferredEdges : InferredEdgeDirective[] = typedDirectives.filter(d => d.inferredEdge).map(d => {
        const ie = d.inferredEdge;
        const spec = parseEdgeStyleSpec(ie); // extracts lineStyle / textStyle blocks
        if (ie.color !== undefined || ie.style !== undefined || ie.weight !== undefined || ie.highlight !== undefined) {
            usedLegacyInferredInline = true;
        }
        return {
            name: ie.name,
            selector: ie.selector,
            color: spec.lineStyle?.color ?? ie.color,
            style: spec.lineStyle?.pattern ?? ie.style,
            weight: spec.lineStyle?.weight ?? ie.weight,
            highlight: spec.lineStyle?.highlight ?? ie.highlight,
            textStyle: spec.textStyle,
        };
    });
    if (usedLegacyInferredInline) {
        console.warn(
            "[spytial] inferredEdge's inline 'color'/'style'/'weight'/'highlight' are deprecated; " +
            "use a 'lineStyle' block (color, pattern, weight, highlight) instead."
        );
    }

    let hiddenAtoms : AtomHidingDirective[] = typedDirectives.filter(d => d.hideAtom).map(d => {
        return {
            selector: d.hideAtom.selector
        }
    });

    let tags : TagDirective[] = typedDirectives.filter(d => d.tag).map(d => {
        return {
            toTag: d.tag.toTag,
            name: d.tag.name,
            value: d.tag.value,
            textStyle: parseTextStyle(d.tag.textStyle)
        }
    });

    let edgeStyles : EdgeStyleRule[] = typedDirectives.filter(d => d.edgeStyle).map(d => {
        return {
            field: d.edgeStyle.field,
            selector: d.edgeStyle.selector,
            filter: d.edgeStyle.filter,
            style: parseEdgeStyleSpec(d.edgeStyle)
        }
    });
    // Desugared legacy edgeColor rules join the native ones — one resolution path.
    edgeStyles = [...edgeStyles, ...desugaredEdgeColors];

    // atomStyle (composite: fillStyle + borderStyle + textStyle), keyed by an
    // optional unary selector. Native rules plus desugared legacy atomColor rules
    // resolve through the one atomStyle path.
    let atomStyles : AtomStyleRule[] = typedDirectives.filter(d => d.atomStyle).map(d => {
        return {
            selector: d.atomStyle.selector,
            style: parseAtomStyleSpec(d.atomStyle)
        }
    });
    atomStyles = [...atomStyles, ...desugaredAtomColors];

    return {
        atomColors,
        atomStyles,
        sizes,
        icons,
        edgeColors,
        edgeStyles,
        attributes,
        tags,
        hiddenFields,
        inferredEdges,
        hiddenAtoms,
        hideDisconnected,
        hideDisconnectedBuiltIns
    }
}
