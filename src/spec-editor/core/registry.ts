/**
 * Item definition registry for the Spytial spec editor.
 *
 * Each constraint/directive type is described by an `ItemDefinition` (fields,
 * defaults, one-line summary, optional validation, and optional YAML emission /
 * ingestion overrides for quirky shapes). The builder renders forms generically
 * from `FieldSpec[]`, and the YAML codec round-trips through `toYamlNode` /
 * `fromYamlNode` when present.
 *
 * The accepted/emitted YAML shapes here are pinned against the authoritative
 * layout-engine parser (`src/layout/layoutspec.ts`) so that anything this
 * registry round-trips also parses there. Notable shapes:
 *
 *   constraints:
 *     - orientation: { selector, directions: [...], hold? }
 *     - cyclic:      { selector, direction, hold? }
 *     - align:       { selector, direction, hold? }
 *     - group:       { selector, name, addEdge?: none|togroup|fromgroup, hold? }  (groupselector)
 *     - group:       { field, groupOn, addToGroup, selector?, hold? }  (groupfield, deprecated)
 *     - size:        { selector, width, height }
 *     - hideAtom:    { selector }
 *   directives:
 *     - flag: <scalar string>
 *     - attribute:    { field, selector?, filter? }
 *     - hideField:    { field, selector?, filter? }
 *     - icon:         { path, selector?, showLabels? }
 *     - atomStyle:    { selector?, fillStyle?:{color}, borderStyle?:{color,width}, textStyle?:{size,color} }
 *     - atomColor:    { value, selector? }  (deprecated → atomStyle)
 *     - edgeStyle:    { field, selector?, filter?, lineStyle?:{color,pattern,weight,highlight}, textStyle?:{size,color}, showLabel?, hidden? }
 *     - edgeColor:    { value, field, selector?, filter?, style?, weight?, showLabel?, hidden?, highlight? }  (deprecated → edgeStyle)
 *     - inferredEdge: { name, selector?, lineStyle?:{color,pattern,weight,highlight}, textStyle?:{size,color} }
 *     - tag:          { toTag, name, value }
 *
 * This module is framework-agnostic — no React.
 */

import type { Diagnostic, FieldSpec, ItemDefinition, ItemKind } from './types';

// Defaults mirrored from src/components/NoCodeView/constants.ts so the new
// editor produces the same starting values as the editor it replaces. We keep
// local copies (rather than importing the React-adjacent module) to keep this
// package free of any coupling to the old NoCodeView internals.
export const DEFAULT_NODE_WIDTH = 100;
export const DEFAULT_NODE_HEIGHT = 60;
const DEFAULT_COLOR = '#000000';

// ---- small param helpers -------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => asString(v)).filter((v) => v.length > 0);
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [asString(value)];
}

function missing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function fieldError(
  fieldKey: string,
  message: string,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { severity, message, fieldKey, source: 'structure' };
}

// ---- enum option sets (mirror src/layout/layoutspec.ts) ------------------

export const ORIENTATION_DIRECTIONS = [
  'above',
  'below',
  'left',
  'right',
  'directlyAbove',
  'directlyBelow',
  'directlyLeft',
  'directlyRight',
] as const;

export const CYCLIC_DIRECTIONS = ['clockwise', 'counterclockwise'] as const;
export const ALIGN_DIRECTIONS = ['horizontal', 'vertical'] as const;
export const EDGE_STYLES = ['solid', 'dashed', 'dotted'] as const;

/**
 * Text-size tiers for an `attribute` / `tag` line, relative to the node label.
 * `large` renders bigger than the label, `normal` (the engine default) smaller,
 * `small` smaller still. (Mirrors AttrTextSize in text-extent.ts.) No field
 * `default` is set on these — an unset value is omitted from YAML and the engine
 * treats it as `normal`, so specs stay clean.
 */
export const TEXT_SIZE_OPTIONS = ['small', 'normal', 'large'] as const;

/**
 * Direction of the optional edge a group-by-selector draws between the group
 * key and the group. `none` draws nothing; `togroup` points key → group;
 * `fromgroup` points group → key. (Mirrors GroupEdgeDirection in layoutspec.ts.)
 */
export const GROUP_EDGE_DIRECTIONS = ['none', 'togroup', 'fromgroup'] as const;

/**
 * Normalise an `addEdge` value into a GROUP_EDGE_DIRECTIONS member. Tolerates
 * the legacy boolean flag (`true` → 'togroup') so older specs keep working.
 */
function normGroupEdge(value: unknown): (typeof GROUP_EDGE_DIRECTIONS)[number] {
  if (value === true || value === 'togroup') return 'togroup';
  if (value === 'fromgroup') return 'fromgroup';
  return 'none';
}

/**
 * The complete set of flags the engine recognizes (`layoutspec.ts` checks for
 * exactly these and silently ignores anything else). A closed set, so the
 * builder offers a choice instead of free text.
 */
export const FLAG_OPTIONS = [
  'hideDisconnected',
  'hideDisconnectedBuiltIns',
] as const;

// ---- definitions ---------------------------------------------------------

/**
 * Orientation: directions describe the TARGET relative to the SOURCE of the
 * selector edge. `directions: [left]` on selector `parent` means the target end
 * of each `parent` tuple is drawn left of the source. Summaries read in that
 * direction. (Some prose in constraints.md says the opposite; the parser is
 * authoritative.)
 */
const orientation: ItemDefinition = {
  kind: 'constraint',
  type: 'orientation',
  label: 'Orientation',
  description: 'Specify the relative positioning of elements.',
  fields: [
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      required: true,
      selectorArity: 'binary',
      placeholder: 'e.g. parent',
      help: 'Binary selector; orientation applies from the source end to the target end of each tuple.',
    },
    {
      key: 'directions',
      kind: 'enum',
      label: 'Directions',
      required: true,
      multiple: true,
      options: ORIENTATION_DIRECTIONS,
      help: 'Where the target sits relative to the source.',
    },
  ],
  summary(params) {
    const dirs = asStringArray(params.directions);
    const selector = asString(params.selector);
    const dirText = dirs.length > 0 ? dirs.join(', ') : 'no directions';
    return selector ? `target ${dirText} of source · ${selector}` : `target ${dirText} of source`;
  },
  validate(params) {
    const out: Diagnostic[] = [];
    const dirs = asStringArray(params.directions);
    const has = (d: string): boolean => dirs.includes(d);
    if (has('above') && has('below')) {
      out.push(fieldError('directions', 'Cannot be both above and below.'));
    }
    if (has('left') && has('right')) {
      out.push(fieldError('directions', 'Cannot be both left and right.'));
    }
    return out;
  },
};

const cyclic: ItemDefinition = {
  kind: 'constraint',
  type: 'cyclic',
  label: 'Cyclic',
  description: 'Arrange elements along the perimeter of a circle.',
  fields: [
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      required: true,
      selectorArity: 'binary',
    },
    {
      key: 'direction',
      kind: 'enum',
      label: 'Direction',
      options: CYCLIC_DIRECTIONS,
      default: 'clockwise',
    },
  ],
  summary(params) {
    const dir = asString(params.direction) || 'clockwise';
    const selector = asString(params.selector);
    return selector ? `${dir} · ${selector}` : dir;
  },
};

const align: ItemDefinition = {
  kind: 'constraint',
  type: 'align',
  label: 'Align',
  description: 'Ensure elements are aligned horizontally or vertically.',
  fields: [
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      required: true,
      selectorArity: 'binary',
    },
    {
      key: 'direction',
      kind: 'enum',
      label: 'Direction',
      required: true,
      options: ALIGN_DIRECTIONS,
      default: 'horizontal',
    },
  ],
  summary(params) {
    const dir = asString(params.direction) || 'horizontal';
    const selector = asString(params.selector);
    return selector ? `${dir} · ${selector}` : dir;
  },
};

/**
 * Group by selector. Emits under the `group:` key. The authoritative parser
 * distinguishes byselector from byfield by the presence of `field`.
 */
const groupselector: ItemDefinition = {
  kind: 'constraint',
  type: 'groupselector',
  label: 'Group (by selector)',
  description: 'Group elements based on a selector.',
  fields: [
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      required: true,
      selectorArity: 'binary',
    },
    {
      key: 'name',
      kind: 'text',
      label: 'Group name',
      placeholder: 'e.g. cluster',
    },
    {
      key: 'addEdge',
      kind: 'enum',
      label: 'Add edge',
      options: GROUP_EDGE_DIRECTIONS,
      default: 'none',
      help: 'Draw an edge between the group key and the group: "togroup" points key → group, "fromgroup" points group → key, "none" draws nothing.',
    },
  ],
  summary(params) {
    const selector = asString(params.selector);
    const name = asString(params.name);
    const base = name ? `group "${name}"` : 'group';
    return selector ? `${base} · ${selector}` : base;
  },
  toYamlNode(params) {
    const node: Record<string, unknown> = { selector: asString(params.selector) };
    if (!missing(params.name)) {
      node.name = asString(params.name);
    }
    const edge = normGroupEdge(params.addEdge);
    if (edge !== 'none') {
      node.addEdge = edge;
    }
    if (params.hold !== undefined) {
      node.hold = params.hold;
    }
    return { group: node };
  },
  fromYamlNode(node) {
    if (!isRecord(node)) {
      return null;
    }
    const group = node.group;
    if (!isRecord(group) || group.field !== undefined) {
      return null; // not a byselector group
    }
    const params: Record<string, unknown> = {
      selector: asString(group.selector),
      addEdge: normGroupEdge(group.addEdge),
    };
    if (group.name !== undefined) {
      params.name = asString(group.name);
    }
    if (group.hold !== undefined) {
      params.hold = group.hold;
    }
    return params;
  },
};

/**
 * Group by field — DEPRECATED. Parsed/rendered for back-compat but hidden from
 * the add menu. Prefer `groupselector` with a binary relation.
 */
const groupfield: ItemDefinition = {
  kind: 'constraint',
  type: 'groupfield',
  label: 'Group (by field)',
  description: 'Group elements based on a field. Deprecated — prefer Group (by selector).',
  deprecated: true,
  fields: [
    {
      key: 'field',
      kind: 'relationName',
      label: 'Field',
      required: true,
    },
    {
      key: 'groupOn',
      kind: 'number',
      label: 'Group on (index)',
      required: true,
      default: 0,
    },
    {
      key: 'addToGroup',
      kind: 'number',
      label: 'Add to group (index)',
      required: true,
      default: 1,
    },
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'unary',
    },
  ],
  summary(params) {
    const field = asString(params.field);
    const base = field ? `group on "${field}"` : 'group on field';
    const selector = asString(params.selector);
    return selector ? `${base} · ${selector}` : base;
  },
  toYamlNode(params) {
    const node: Record<string, unknown> = {
      field: asString(params.field),
      groupOn: typeof params.groupOn === 'number' ? params.groupOn : Number(params.groupOn ?? 0),
      addToGroup:
        typeof params.addToGroup === 'number' ? params.addToGroup : Number(params.addToGroup ?? 1),
    };
    if (!missing(params.selector)) {
      node.selector = asString(params.selector);
    }
    if (params.hold !== undefined) {
      node.hold = params.hold;
    }
    return { group: node };
  },
  fromYamlNode(node) {
    if (!isRecord(node)) {
      return null;
    }
    const group = node.group;
    if (!isRecord(group) || group.field === undefined) {
      return null; // not a byfield group
    }
    const params: Record<string, unknown> = {
      field: asString(group.field),
      groupOn: typeof group.groupOn === 'number' ? group.groupOn : Number(group.groupOn ?? 0),
      addToGroup:
        typeof group.addToGroup === 'number' ? group.addToGroup : Number(group.addToGroup ?? 1),
    };
    if (group.selector !== undefined) {
      params.selector = asString(group.selector);
    }
    if (group.hold !== undefined) {
      params.hold = group.hold;
    }
    return params;
  },
};

const size: ItemDefinition = {
  kind: 'constraint',
  type: 'size',
  label: 'Size',
  description: 'Set the width and height of elements matching the selector.',
  fields: [
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'unary',
    },
    {
      key: 'width',
      kind: 'number',
      label: 'Width',
      required: true,
      default: DEFAULT_NODE_WIDTH,
    },
    {
      key: 'height',
      kind: 'number',
      label: 'Height',
      required: true,
      default: DEFAULT_NODE_HEIGHT,
    },
  ],
  summary(params) {
    const w = missing(params.width) ? '?' : asString(params.width);
    const h = missing(params.height) ? '?' : asString(params.height);
    const selector = asString(params.selector);
    return selector ? `${w}×${h} · ${selector}` : `${w}×${h}`;
  },
  validate(params) {
    const out: Diagnostic[] = [];
    for (const key of ['width', 'height'] as const) {
      const value = params[key];
      if (typeof value === 'number' && (Number.isNaN(value) || value <= 0)) {
        out.push(fieldError(key, `${key} must be greater than 0.`));
      }
    }
    return out;
  },
};

const hideAtom: ItemDefinition = {
  kind: 'constraint',
  type: 'hideAtom',
  label: 'Hide atom',
  description: 'Hide elements matching the selector from the visualization.',
  fields: [
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      required: true,
      selectorArity: 'unary',
    },
  ],
  summary(params) {
    const selector = asString(params.selector);
    return selector ? `hide · ${selector}` : 'hide';
  },
};

/**
 * Flag directive — quirky scalar YAML form: `- flag: hideDisconnectedBuiltIns`.
 * The param is stored under `flag`. The codec uses toYamlNode/fromYamlNode to
 * round-trip the scalar form.
 */
const flag: ItemDefinition = {
  kind: 'directive',
  type: 'flag',
  label: 'Flag',
  description: 'Toggle a built-in rendering flag, e.g. hideDisconnectedBuiltIns.',
  fields: [
    {
      key: 'flag',
      // Closed choice: the engine recognizes exactly FLAG_OPTIONS and ignores
      // anything else, so the builder offers the real ones instead of free
      // text. Unknown flags in hand-written YAML still parse and round-trip;
      // they surface a structural error naming the allowed values.
      kind: 'enum',
      options: FLAG_OPTIONS,
      label: 'Flag',
      required: true,
      default: 'hideDisconnected',
      help: 'hideDisconnected hides disconnected atoms; hideDisconnectedBuiltIns hides only disconnected built-in atoms.',
    },
  ],
  summary(params) {
    const value = asString(params.flag);
    return value || '(no flag)';
  },
  toYamlNode(params) {
    return { flag: asString(params.flag) };
  },
  fromYamlNode(node) {
    if (!isRecord(node)) {
      return null;
    }
    const value = node.flag;
    if (typeof value === 'string') {
      return { flag: value };
    }
    // Tolerate the rare mapping form `flag: { flag: x }`.
    if (isRecord(value) && typeof value.flag === 'string') {
      return { flag: value.flag };
    }
    return null;
  },
};

const attribute: ItemDefinition = {
  kind: 'directive',
  type: 'attribute',
  label: 'Attribute',
  description: 'Render a field as an inline attribute on its source atom.',
  fields: [
    {
      key: 'field',
      kind: 'relationName',
      label: 'Field',
      required: true,
    },
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'unary',
    },
    {
      key: 'textSize',
      kind: 'enum',
      options: TEXT_SIZE_OPTIONS,
      label: 'Text size',
      help: 'Font size of this attribute line: large is bigger than the node label, normal (default) is smaller, small is smaller still.',
    },
  ],
  summary(params) {
    const field = asString(params.field);
    const selector = asString(params.selector);
    const base = field || '(no field)';
    return selector ? `${base} · ${selector}` : base;
  },
};

const hideField: ItemDefinition = {
  kind: 'directive',
  type: 'hideField',
  label: 'Hide field',
  description: 'Hide a relation/field from the visualization.',
  fields: [
    {
      key: 'field',
      kind: 'relationName',
      label: 'Field',
      required: true,
    },
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'unary',
    },
  ],
  summary(params) {
    const field = asString(params.field);
    const selector = asString(params.selector);
    const base = field ? `hide ${field}` : 'hide field';
    return selector ? `${base} · ${selector}` : base;
  },
};

const icon: ItemDefinition = {
  kind: 'directive',
  type: 'icon',
  label: 'Icon',
  description: 'Render matching atoms with an icon.',
  fields: [
    {
      key: 'path',
      kind: 'text',
      label: 'Path / URL',
      required: true,
      placeholder: 'e.g. https://… or assets/foo.svg',
    },
    {
      key: 'showLabels',
      kind: 'boolean',
      label: 'Show labels',
      default: false,
    },
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'unary',
    },
  ],
  summary(params) {
    const path = asString(params.path);
    const selector = asString(params.selector);
    const base = path || '(no path)';
    return selector ? `${base} · ${selector}` : base;
  },
};

const atomColor: ItemDefinition = {
  kind: 'directive',
  type: 'atomColor',
  label: 'Atom color',
  description: 'Deprecated — use Atom style (atomStyle). Still parsed/rendered for back-compat (value → border color).',
  deprecated: true,
  fields: [
    {
      key: 'value',
      kind: 'color',
      label: 'Color',
      required: true,
      default: DEFAULT_COLOR,
    },
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'unary',
    },
  ],
  summary(params) {
    const color = asString(params.value);
    const selector = asString(params.selector);
    const base = color || '(no color)';
    return selector ? `${base} · ${selector}` : base;
  },
};

/**
 * Shared `lineStyle` block children — reused by edgeStyle, inferredEdge, and a
 * group's connector. No `default`s: style blocks must stay sparse (a seeded
 * default would emit as an authored value and break the resolver's compose /
 * collision rules).
 */
const LINE_STYLE_FIELDS: readonly FieldSpec[] = [
  { key: 'color', kind: 'color', label: 'Color' },
  { key: 'pattern', kind: 'enum', options: EDGE_STYLES, label: 'Pattern' },
  { key: 'weight', kind: 'number', label: 'Weight' },
  { key: 'highlight', kind: 'color', label: 'Highlight' },
];

/** Shared `textStyle` block children — reused wherever a label is styled. No defaults. */
const TEXT_STYLE_FIELDS: readonly FieldSpec[] = [
  { key: 'size', kind: 'enum', options: TEXT_SIZE_OPTIONS, label: 'Size' },
  { key: 'color', kind: 'color', label: 'Color' },
];

/** Shared `fillStyle` block children — an atom's interior fill. No defaults (sparse). */
const FILL_STYLE_FIELDS: readonly FieldSpec[] = [
  { key: 'color', kind: 'color', label: 'Color' },
];

/** Shared `borderStyle` block children — an atom's outline color + width. No defaults (sparse). */
const BORDER_STYLE_FIELDS: readonly FieldSpec[] = [
  { key: 'color', kind: 'color', label: 'Color' },
  { key: 'width', kind: 'number', label: 'Width' },
];

const edgeStyle: ItemDefinition = {
  kind: 'directive',
  type: 'edgeStyle',
  label: 'Edge style',
  description: 'Style the edges of a field/relation — line and label.',
  fields: [
    { key: 'field', kind: 'relationName', label: 'Field', required: true },
    { key: 'selector', kind: 'selector', label: 'Selector', selectorArity: 'unary' },
    { key: 'filter', kind: 'selector', label: 'Filter', selectorArity: 'binary' },
    { key: 'lineStyle', kind: 'group', label: 'Line style', children: LINE_STYLE_FIELDS },
    { key: 'textStyle', kind: 'group', label: 'Text style', children: TEXT_STYLE_FIELDS },
    { key: 'showLabel', kind: 'boolean', label: 'Show label' },
    { key: 'hidden', kind: 'boolean', label: 'Hidden' },
  ],
  summary(params) {
    const field = asString(params.field);
    const line = (params.lineStyle ?? {}) as Record<string, unknown>;
    const color = asString(line.color);
    const base = field ? (color ? `${field}: ${color}` : field) : color || 'edge';
    const selector = asString(params.selector);
    return selector ? `${base} · ${selector}` : base;
  },
};

const atomStyle: ItemDefinition = {
  kind: 'directive',
  type: 'atomStyle',
  label: 'Atom style',
  description: 'Style matching atoms — fill, border, and label.',
  fields: [
    { key: 'selector', kind: 'selector', label: 'Selector', selectorArity: 'unary' },
    { key: 'fillStyle', kind: 'group', label: 'Fill style', children: FILL_STYLE_FIELDS },
    { key: 'borderStyle', kind: 'group', label: 'Border style', children: BORDER_STYLE_FIELDS },
    { key: 'textStyle', kind: 'group', label: 'Text style', children: TEXT_STYLE_FIELDS },
  ],
  summary(params) {
    const fill = (params.fillStyle ?? {}) as Record<string, unknown>;
    const border = (params.borderStyle ?? {}) as Record<string, unknown>;
    const color = asString(fill.color) || asString(border.color);
    const selector = asString(params.selector);
    const base = color || 'atom';
    return selector ? `${base} · ${selector}` : base;
  },
};

const edgeColor: ItemDefinition = {
  kind: 'directive',
  type: 'edgeColor',
  label: 'Edge color',
  description: 'Deprecated — use Edge style (edgeStyle). Still parsed/rendered for back-compat.',
  deprecated: true,
  fields: [
    {
      key: 'field',
      kind: 'relationName',
      label: 'Field',
      required: true,
    },
    {
      key: 'value',
      kind: 'color',
      label: 'Color',
      required: true,
      default: DEFAULT_COLOR,
    },
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'unary',
    },
    {
      key: 'style',
      kind: 'enum',
      label: 'Style',
      options: EDGE_STYLES,
    },
    {
      key: 'weight',
      kind: 'number',
      label: 'Weight',
    },
  ],
  summary(params) {
    const field = asString(params.field);
    const color = asString(params.value);
    const base = field ? `${field}: ${color || 'edge'}` : color || 'edge';
    const selector = asString(params.selector);
    return selector ? `${base} · ${selector}` : base;
  },
};

const inferredEdge: ItemDefinition = {
  kind: 'directive',
  type: 'inferredEdge',
  label: 'Inferred edge',
  description: 'Draw an inferred edge from a selector.',
  fields: [
    {
      key: 'name',
      kind: 'text',
      label: 'Name',
      required: true,
    },
    {
      key: 'selector',
      kind: 'selector',
      label: 'Selector',
      selectorArity: 'binary',
    },
    {
      key: 'color',
      kind: 'color',
      label: 'Color',
      default: DEFAULT_COLOR,
    },
    {
      key: 'style',
      kind: 'enum',
      label: 'Style',
      options: EDGE_STYLES,
    },
    {
      key: 'weight',
      kind: 'number',
      label: 'Weight',
    },
  ],
  summary(params) {
    const name = asString(params.name);
    const selector = asString(params.selector);
    const base = name || '(no name)';
    return selector ? `${base} · ${selector}` : base;
  },
};

const tag: ItemDefinition = {
  kind: 'directive',
  type: 'tag',
  label: 'Tag',
  description: 'Add computed attributes to nodes based on selector evaluation.',
  fields: [
    {
      key: 'toTag',
      kind: 'selector',
      label: 'To tag (selector)',
      required: true,
      selectorArity: 'unary',
      help: 'Selects which atoms get the tag.',
    },
    {
      key: 'name',
      kind: 'text',
      label: 'Name',
      required: true,
      help: 'The attribute name to display.',
    },
    {
      key: 'value',
      kind: 'selector',
      label: 'Value (selector)',
      required: true,
      help: 'Selector whose result becomes the attribute value.',
    },
    {
      key: 'textSize',
      kind: 'enum',
      options: TEXT_SIZE_OPTIONS,
      label: 'Text size',
      help: 'Font size of this tag line: large is bigger than the node label, normal (default) is smaller, small is smaller still.',
    },
  ],
  summary(params) {
    const name = asString(params.name);
    const toTag = asString(params.toTag);
    const base = name || '(no name)';
    return toTag ? `${base} · ${toTag}` : base;
  },
};

// ---- registry assembly ---------------------------------------------------

const DEFINITIONS: readonly ItemDefinition[] = [
  // constraints
  orientation,
  cyclic,
  align,
  groupselector,
  groupfield,
  size,
  hideAtom,
  // directives
  flag,
  attribute,
  hideField,
  icon,
  atomStyle,
  atomColor,
  edgeStyle,
  edgeColor,
  inferredEdge,
  tag,
];

const BY_TYPE = new Map<string, ItemDefinition>(DEFINITIONS.map((d) => [d.type, d]));

/**
 * The YAML top-level key each registry type emits under. This is usually the
 * type itself, but the two grouping definitions (`groupselector`, `groupfield`)
 * both emit under `group:` and are disambiguated on ingestion by their
 * `fromYamlNode`. The codec uses this to map a parsed YAML key back to its
 * candidate definitions.
 */
const YAML_KEY_BY_TYPE: Readonly<Record<string, string>> = {
  groupselector: 'group',
  groupfield: 'group',
};

function yamlKeyForType(type: string): string {
  return YAML_KEY_BY_TYPE[type] ?? type;
}

const CANDIDATES_BY_YAML_KEY = ((): Map<string, ItemDefinition[]> => {
  const map = new Map<string, ItemDefinition[]>();
  for (const def of DEFINITIONS) {
    const key = yamlKeyForType(def.type);
    const list = map.get(key);
    if (list) {
      list.push(def);
    } else {
      map.set(key, [def]);
    }
  }
  return map;
})();

/**
 * Candidate definitions that emit under a given YAML key, in registry order.
 * For `group` this returns `[groupselector, groupfield]`; for everything else a
 * single-element array (or empty if the key is unknown).
 */
export function getDefinitionsForYamlKey(yamlKey: string): readonly ItemDefinition[] {
  return CANDIDATES_BY_YAML_KEY.get(yamlKey) ?? [];
}

/** True iff some registry definition emits under this YAML key. */
export function isKnownYamlKey(yamlKey: string): boolean {
  return CANDIDATES_BY_YAML_KEY.has(yamlKey);
}

/** Look up an item definition by registry type key. */
export function getDefinition(type: string): ItemDefinition | undefined {
  return BY_TYPE.get(type);
}

/** True iff the registry knows about this type. */
export function isKnownType(type: string): boolean {
  return BY_TYPE.has(type);
}

/** All definitions (constraints + directives), in canonical order. */
export function getAllDefinitions(): readonly ItemDefinition[] {
  return DEFINITIONS;
}

/**
 * Definitions of a given kind. Pass `{ includeDeprecated: false }` (the default)
 * to hide deprecated entries from the add menu.
 */
export function getDefinitions(
  kind: ItemKind,
  options: { includeDeprecated?: boolean } = {},
): readonly ItemDefinition[] {
  const includeDeprecated = options.includeDeprecated ?? false;
  return DEFINITIONS.filter(
    (d) => d.kind === kind && (includeDeprecated || !d.deprecated),
  );
}

/**
 * Build the default params for a type from its FieldSpec defaults. Fields with
 * no `default` are omitted (so required-but-empty fields surface as diagnostics
 * rather than silently emitting empty strings).
 */
export function defaultParamsFor(type: string): Record<string, unknown> {
  const def = BY_TYPE.get(type);
  if (!def) {
    return {};
  }
  const params: Record<string, unknown> = {};
  for (const field of def.fields) {
    if (field.default !== undefined) {
      params[field.key] = field.default;
    }
  }
  return params;
}

/** A field's spec by key, if any. */
export function getFieldSpec(type: string, key: string): FieldSpec | undefined {
  return BY_TYPE.get(type)?.fields.find((f) => f.key === key);
}
