const ORIENTATION_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend">
        <span class="input-group-text infolabel" title="${TUPLE_SELECTOR_TEXT}">Selector</span>
    </div>
    <input type="text" name="selector" class="form-control" required>
</div>
<div class="input-group">
    <div class="input-group-prepend">
        <span class="input-group-text">Directions</span>
    </div>
    <select name="directions" class="form-control" multiple>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="directlyLeft">Directly Left</option>
            <option value="directlyRight">Directly Right</option>
            <option value="directlyAbove">Directly Above</option>
            <option value="directlyBelow">Directly Below</option>
    </select>
</div>       
`;

const GROUP_BY_FIELD_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend"> <span class="input-group-text">Field</span> </div>
    <input type="text" name="field" required>
</div>
<div class="input-group">
    <div class="input-group-prepend"> <span class="input-group-text infolabel" title="Which 0-indexed element of the field to use as the group key."> Group On </span> </div>
    <input type="number" name="groupOn" required>
</div>
<div class="input-group">
    <div class="input-group-prepend"> <span class="input-group-text infolabel" title="Which 0-indexed element of the field are group members."> Add to Group </span> </div>
    <input type="number" name="addToGroup" required>
</div>
`;



const GROUP_BY_SELECTOR_SELECTOR = `

<div class="input-group">
    <div class="input-group-prepend">
        <span class="input-group-text infolabel" title="${UNARY_SELECTOR_TEXT} or ${TUPLE_SELECTOR_TEXT}">Selector</span>
    </div>
    <input type="text" name="selector" class="form-control" required>
</div>
<div class="input-group">
    <div class="input-group-prepend">  <span class="input-group-text">Group Name</span> </div>
    <input type="text" name="name" required>
</div>
`;


const DIRECTIVE_SELECT = `
    <button class="close" title="Remove directive" type="button" onclick="removeDirective(this)">
        <span aria-hidden="true">&times;</span>
    </button>
    <div class="input-group">
        <div class="input-group-prepend">
            <span class="input-group-text">Directive</span>
        </div>
        <select onchange="updateFields(this)">
            <option value="flag">Visibility Flag</option>
            <option value="attribute">Attribute</option>
            <option value="hideField">Hide Field</option>
            <option value="icon">Icon</option>
            <option value="atomColor">Color (Atom)</option>
            <option value="edgeColor">Color (Edge)</option>
            <option value="size">Size</option>
            <option value="projection">Projection</option>
            <option value="inferredEdge">Inferred Edge</option>
        </select>
    </div>
    <div class="params"></div>
`;


const ATTRIBUTE_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend"> <span class="input-group-text">Field</span></div>
    <input type="text" name="field" class="form-control" required>
</div>`;

const HIDE_FIELD_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend"> <span class="input-group-text">Field</span></div>
    <input type="text" name="field" class="form-control" required>
</div>`;

const PROJECTION_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend"><span class="input-group-text">Sig</span></div>
    <input type="text" class="form-control" name="sig" required>
</div>
`;

const COLOR_ATOM_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend">
        <span class="input-group-text infolabel" title="${UNARY_SELECTOR_TEXT}">Selector</span>
    </div>
    <input type="text" name="selector" class="form-control" required>
</div>
<div class="input-group">
    <div class="input-group-prepend"><span class="input-group-text">Color</span></div>
    <input type="color" name="value" class="form-control" required>
</div>
`;

const COLOR_EDGE_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend"> <span class="input-group-text">Field</span></div>
    <input type="text" name="field" class="form-control" required>
</div>
<div class="input-group">
    <div class="input-group-prepend"><span class="input-group-text">Color</span></div>
    <input type="color" name="value" class="form-control" required>
</div>
`;

const ICON_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend">
        <span class="input-group-text infolabel" title="${UNARY_SELECTOR_TEXT}">Selector</span>
    </div>
    <input type="text" name="selector" class="form-control" required>
</div>
<div class="input-group">
    <div class="input-group-prepend"><span class="input-group-text">Path</span></div>
    <input type="text" name="path" class="form-control" required placeholder="/path/to/icon.png">
</div>
<div class="input-group">
    <div class="input-group-prepend"><span class="input-group-text">Show Labels</span></div>
    <div class=" form-check ml-3">
        <input class="form-check-input" type="checkbox" value="" name="showLabels" >
    </div>
</div>
`;

const SIZE_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend">
        <span class="input-group-text infolabel" title="${UNARY_SELECTOR_TEXT}">Selector</span>
    </div>
    <input type="text" name="selector" class="form-control" required>
</div>
<div class="input-group">
    <label><span class="input-group-text">Width</span></label> <input type="number" name="width" class="form-control" required>
     <label><span class="input-group-text">Height</span></label> <input type="number" name="height" class="form-control" required>
</div>
`;

const FLAG_SELECTOR = `
<div class="input-group">
    <select name="flag" class="form-control">
        <option value="hideDisconnectedBuiltIns">Hide disconnected built ins.</option>
        <option value="hideDisconnected">Hide all disconnected.</option>
    </select>
</div>
`;

const HELPER_EDGE_SELECTOR = `
<div class="input-group">
    <div class="input-group-prepend">
        <span class="input-group-text infolabel" title="${TUPLE_SELECTOR_TEXT}">Selector</span>
    </div>
    <input type="text" name="selector" class="form-control" required>
</div>
<div class="input-group">
    <div class="input-group-prepend">  <span class="input-group-text">Edge Name</span> </div>
    <input type="text" name="name" required>
</div>
`;