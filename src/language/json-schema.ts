/**
 * Derive a JSON Schema (draft 2020-12) for a Spytial spec document from the
 * {@link LanguageManifest}.
 *
 * The manifest is the description a code generator reads; this is the artifact
 * a *validator* reads — `ajv`, a CI check, or an editor. Pointing a YAML
 * language server at it gives spec authors completion and inline errors:
 *
 * ```yaml
 * # yaml-language-server: $schema=https://cdn.jsdelivr.net/gh/sidprasad/spytial-core@<tag>/docs/spytial-spec.schema.json
 * ```
 *
 * The schema is deliberately STRICTER than `parseLayoutSpec`. The parser
 * ignores what it does not recognize — an unknown directive, a misspelled
 * field, an out-of-range enum all pass silently and then quietly do nothing.
 * That is the failure mode this schema exists to catch, so it closes every
 * object (`additionalProperties: false`) and enforces every enum. A document
 * the parser accepts does not always validate here, and that gap is the point.
 *
 * In the other direction the schema aims to accept nothing the parser rejects,
 * which is why it carries constraints beyond the obvious types: a required
 * string is `minLength: 1` (the engine tests these for truthiness, so a blank
 * one is exactly as absent as no value), `inferredEdge.draw` carries a pattern
 * matching `parseInferredEdgeDraw`, and contradictory `orientation.directions`
 * are excluded. What it cannot cover is anything needing more than one item:
 * a `draw` naming a group no `group` constraint defines, or two `cyclic`
 * constraints on one selector disagreeing about direction. Those stay parse
 * errors, and `tests/language-manifest.test.ts` pins the boundary.
 */

import type { LanguageField, LanguageItem, LanguageManifest, SpecSection } from './types';

/** A JSON Schema node. Loose by design — this is generated, not hand-maintained. */
type JsonSchemaNode = Record<string, unknown>;

const SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * `$id` is an identity, not a download link, and it has to differ whenever the
 * schema differs: a registry — or Ajv's own `$id` cache — keyed by a constant
 * `$id` will silently serve one release's schema to another's. A URL would make
 * that mistake easy, because the file lives at one path and every release
 * overwrites it. So the identity is a URN carrying the language version, and
 * the fetchable locations (which do vary by tag) stay in the description.
 */
const schemaId = (languageVersion: string): string =>
  `urn:spytial:layout-spec-schema:${languageVersion}`;

/** Scalar JSON types for the manifest's non-composite field types. */
const SCALAR_TYPES: Readonly<Record<string, string>> = {
  selector: 'string',
  relation: 'string',
  string: 'string',
  color: 'string',
  'icon-path': 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
};

/** Build the description a human (or an editor tooltip) sees for one field. */
function describeField(field: LanguageField): string {
  const parts = [field.description];
  if (field.arity) {
    parts.push(`Selector arity: ${field.arity}.`);
  }
  if (field.default !== undefined) {
    parts.push(`Default when omitted: ${JSON.stringify(field.default)}.`);
  }
  if (field.deprecated) {
    parts.push(`Deprecated — use \`${field.deprecated.replacedBy}\` instead.`);
  }
  if (field.note) {
    parts.push(field.note);
  }
  return parts.join(' ');
}

/** Render one field as a schema node. */
function fieldSchema(field: LanguageField): JsonSchemaNode {
  const node: JsonSchemaNode = { description: describeField(field) };

  if (field.deprecated) {
    node.deprecated = true;
  }

  switch (field.type) {
    case 'enum':
      node.type = 'string';
      node.enum = [...(field.values ?? [])];
      break;
    case 'enum-list': {
      node.type = 'array';
      node.minItems = 1;
      node.items = { type: 'string', enum: [...(field.values ?? [])] };
      // Value combinations the parser throws on — encoded rather than left to
      // the parse, so a contradictory list fails validation like any other bad
      // value would.
      const rules: JsonSchemaNode[] = [];
      for (const group of field.listRules?.atMostOneOf ?? []) {
        rules.push({
          not: { allOf: group.map((value) => ({ contains: { const: value } })) },
          description: `At most one of: ${group.join(', ')}.`,
        });
      }
      for (const [value, allowed] of Object.entries(field.listRules?.narrowsListTo ?? {})) {
        rules.push({
          if: { contains: { const: value } },
          then: { items: { enum: [...allowed] } },
          description: `With \`${value}\`, the only other value allowed is ${allowed
            .filter((v) => v !== value)
            .join(', ')}.`,
        });
      }
      if (rules.length > 0) {
        node.allOf = rules;
      }
      break;
    }
    case 'block':
      // Shared blocks live in $defs; an inline block carries its own leaves.
      if (field.block) {
        node.$ref = `#/$defs/${field.block}`;
        // A $ref sibling is allowed in 2020-12, and keeping the description
        // here is what makes editor tooltips useful at the use site.
      } else {
        Object.assign(node, objectSchema(field.fields ?? []));
      }
      break;
    default: {
      const jsonType = SCALAR_TYPES[field.type];
      if (jsonType) {
        node.type = jsonType;
      }
      // A required string is never allowed to be blank. The engine tests these
      // for truthiness, so `selector: ""` is exactly as absent as no selector at
      // all — a parse error where the field is enforced, a silently dropped rule
      // where it isn't. Either way it is not a document worth generating, and
      // without this the schema would accept specs the parser throws on.
      if (jsonType === 'string' && field.required) {
        node.minLength = 1;
      }
      if (field.pattern !== undefined) {
        node.pattern = field.pattern;
      }
      break;
    }
  }

  if (field.exclusiveMinimum !== undefined) node.exclusiveMinimum = field.exclusiveMinimum;
  if (field.minimum !== undefined) node.minimum = field.minimum;
  if (field.maximum !== undefined) node.maximum = field.maximum;

  // A field with an alternative shape (only `group.addEdge` today) becomes a
  // choice between the two, keeping the description at the top level.
  if (field.alternativeForm) {
    const primary: JsonSchemaNode = { ...node };
    delete primary.description;
    const alternative: JsonSchemaNode =
      field.alternativeForm.type === 'block'
        ? {
            ...objectSchema(field.alternativeForm.fields ?? []),
            description: field.alternativeForm.description,
          }
        : { type: SCALAR_TYPES[field.alternativeForm.type] ?? 'string' };
    return {
      description: describeField(field),
      oneOf: [primary, alternative, { const: true, deprecated: true, description: 'Legacy spelling of `togroup`.' }],
    };
  }

  return node;
}

/** Build a closed object schema from a field list. */
function objectSchema(fields: readonly LanguageField[]): JsonSchemaNode {
  const properties: Record<string, JsonSchemaNode> = {};
  for (const field of fields) {
    properties[field.name] = fieldSchema(field);
  }
  const required = fields.filter((f) => f.required).map((f) => f.name);
  const node: JsonSchemaNode = { type: 'object', properties, additionalProperties: false };
  if (required.length > 0) {
    node.required = required;
  }
  return node;
}

/** The body of one item (everything under its YAML key). */
function itemBodySchema(item: LanguageItem): JsonSchemaNode {
  const body = objectSchema(item.fields);

  if (item.supportsHold) {
    (body.properties as Record<string, JsonSchemaNode>).hold = {
      type: 'string',
      enum: ['always', 'never'],
      description:
        'Negation. `never` asserts the constraint must not hold; `always` (the default) is the positive form.',
    };
  }

  if (item.discriminator) {
    // Two items share this YAML key; the discriminating field's presence tells
    // them apart, and the parser resolves it the same way.
    if (item.discriminator.present) {
      const required = new Set<string>([...((body.required as string[]) ?? []), item.discriminator.field]);
      body.required = [...required];
    } else {
      body.not = { required: [item.discriminator.field] };
    }
  }

  if (item.id === 'group') {
    // `name` is required except on a negated group, where the engine generates
    // one — so it moves out of the flat `required` list into a conditional.
    body.required = ((body.required as string[]) ?? []).filter((key) => key !== 'name');
    if ((body.required as string[]).length === 0) delete body.required;
    body.allOf = [
      {
        if: { not: { properties: { hold: { const: 'never' } }, required: ['hold'] } },
        then: { required: ['name'] },
      },
    ];
  }

  return body;
}

/** One list entry: a single-key mapping (or, for `flag`, a scalar-valued key). */
function itemSchema(item: LanguageItem): JsonSchemaNode {
  const value =
    item.valueShape === 'scalar' ? fieldSchema(item.fields[0]) : itemBodySchema(item);

  const node: JsonSchemaNode = {
    title: item.label,
    description: item.deprecated
      ? `${item.description} DEPRECATED — use \`${item.deprecated.replacedBy}\` instead. ${item.deprecated.reason}`
      : item.description,
    type: 'object',
    properties: { [item.yamlKey]: value },
    required: [item.yamlKey],
    additionalProperties: false,
  };
  if (item.deprecated) {
    node.deprecated = true;
  }
  return node;
}

/** The `oneOf` of everything accepted in one section. */
function sectionSchema(manifest: LanguageManifest, section: SpecSection): JsonSchemaNode {
  const canonical = manifest.items.filter((item) => item.sections.includes(section));
  // Still parsed here, but deprecated: `$ref` the one definition and annotate
  // the reference, so `size` under `directives` is flagged while the same form
  // under `constraints` is not.
  const tolerated = manifest.items.filter((item) => item.deprecatedSections?.includes(section));

  return {
    // `null` is the empty section a bare `constraints:` line produces, which
    // the engine accepts.
    type: ['array', 'null'],
    description:
      section === 'constraints'
        ? 'Structural layout: where nodes end up relative to one another.'
        : 'Presentation: how nodes and edges look, and what is shown at all.',
    items: {
      oneOf: [
        ...canonical.map((item) => ({ $ref: `#/$defs/${defName(item)}` })),
        ...tolerated.map((item) => ({
          $ref: `#/$defs/${defName(item)}`,
          deprecated: true,
          description:
            `\`${item.yamlKey}\` here is deprecated — write it under \`${item.sections[0]}\`. ` +
            `${item.sectionDeprecation!.reason}`,
        })),
      ],
    },
  };
}

/**
 * `$defs` name for an item. `size` and `hideAtom` appear in both sections and
 * are identical there, so they get one definition each, not two.
 */
function defName(item: LanguageItem): string {
  return item.id.replace(/\./g, '_');
}

/** Generate the complete JSON Schema for a spec document. */
export function buildJsonSchema(manifest: LanguageManifest): JsonSchemaNode {
  const defs: Record<string, JsonSchemaNode> = {};

  for (const block of manifest.blocks) {
    defs[block.name] = { description: block.description, ...objectSchema(block.fields) };
  }

  for (const item of manifest.items) {
    defs[defName(item)] = itemSchema(item);
  }

  return {
    $schema: SCHEMA_DIALECT,
    $id: schemaId(manifest.languageVersion),
    title: 'Spytial layout specification',
    description:
      'A Spytial spec: constraints (structural layout) and directives (presentation). ' +
      `Spec language ${manifest.languageVersion}, from spytial-core ${manifest.spytialCoreVersion}. ` +
      'This schema is stricter than the engine parser, which silently ignores anything it does not recognize — ' +
      'validating here is how a misspelled key or an out-of-range value gets caught at all. ' +
      'Fetch it from https://cdn.jsdelivr.net/gh/sidprasad/spytial-core@<tag>/docs/spytial-spec.schema.json; ' +
      'pin a tag, since the @main path is overwritten each release.',
    'x-spytial-language-version': manifest.languageVersion,
    'x-spytial-core-version': manifest.spytialCoreVersion,
    type: 'object',
    properties: {
      constraints: sectionSchema(manifest, 'constraints'),
      directives: sectionSchema(manifest, 'directives'),
    },
    additionalProperties: false,
    $defs: defs,
  };
}
