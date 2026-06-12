# Spec Editor

The Spytial **spec editor** (`SpecEditor`) is the schema-driven editor for CnD
layout specs. It is the replacement for the old `NoCodeView` "Structured Builder"
and the back-compat surface of `CndLayoutInterface`.

This guide is for integrators embedding the editor in their own Spytial
integration. Everything it documents is exported from `src/spec-editor`
(re-exported by the back-compat wrapper in `src/components/CndLayoutInterface`).

## Overview

`SpecEditor` is a **live two-way YAML ⇄ structured-builder editor with a single
source of truth.** Internally it owns one `SpecDocument`. Both visible views — a
compact schema-driven **Builder** and a raw **Code** (YAML) editor — are
projections of that one document and stay live:

- Builder edits mutate the document, regenerate YAML, and call `onChange`
  synchronously.
- Code edits update the controlled `value` immediately and re-parse the model on
  a 300 ms debounce.
- The view toggle is **purely visual** — no conversion happens on toggle, so an
  unparseable draft never traps you in one view.

The document preserves comments and unknown YAML nodes, so round-tripping a spec
through the editor does not lose information.

### Quick start

```tsx
import { useState } from 'react';
import { SpecEditor } from '../src/spec-editor';

function Editor() {
  const [yaml, setYaml] = useState('constraints: []\ndirectives: []\n');
  return <SpecEditor value={yaml} onChange={setYaml} />;
}
```

That is the minimum: a controlled `value` and an `onChange`. Everything else
(domain awareness, theming, the selector assistant) is opt-in.

### Loading the styles

The editor ships its own stylesheet (`src/spec-editor/ui/spec-editor.css`),
imported by `SpecEditor.tsx`. How it reaches the page depends on how you consume
the component:

- **ESM / bundler consumers** (Vite, webpack, Rollup, etc.) get the CSS
  automatically — the `import './spec-editor.css'` is part of the module graph,
  *provided your bundler is configured to handle CSS imports* (most app setups
  are). Nothing else to do.
- **IIFE / `<script>`-tag consumers** must link the extracted CSS explicitly.
  tsup emits the imported CSS into a sibling file next to the bundle (same base
  name as the `.global.js`), and a bare `<script>` does **not** apply it. Add the
  matching `<link>`:

  ```html
  <script src="…/dist/components/spec-editor-demo-components.global.js"></script>
  <link rel="stylesheet" href="…/dist/components/spec-editor-demo-components.css" />
  ```

  Use the `.css` file whose base name matches the bundle you load (e.g.
  `react-component-integration.css` for the `CndLayoutInterface` integration
  bundle). Without it, the editor renders unstyled.

> **Import paths.** The examples import from `../src/spec-editor` and
> `../src/components/CndLayoutInterface`, matching how this repo's own
> `webcola-demo` wrappers consume the editor from source. When consuming the
> published package, the equivalents resolve through the package's component
> bundles; the named exports are identical.

## Props reference

### `SpecEditorProps`

Defined in `src/spec-editor/ui/SpecEditor.tsx`.

| Prop | Type | Default | Behavior |
| --- | --- | --- | --- |
| `value` | `string` | — (required) | Controlled YAML. The single source of truth for the host; the editor regenerates it from its internal document on every edit. |
| `onChange` | `(value: string) => void` | — (required) | Called with new YAML on every builder edit (synchronously) and on every code-view keystroke (immediately, before the debounced re-parse). |
| `instance` | `IInputDataInstance` | `undefined` | Live data instance. Used to derive a `DomainSchema` (autocomplete, dropdowns, soft warnings). See [Domain awareness](#domain-awareness). |
| `domain` | `DomainSchema` | `undefined` | Precomputed domain schema. **Wins over `instance`** if both are given. |
| `theme` | `SpecEditorTheme \| string` | `undefined` | Either a partial token object (only the keys you set are applied as inline CSS variables on the editor root), or the **name** of a registered theme — `'light'`, `'dark'`, or anything added via `registerSpecEditorThemes` — mirroring `webcola-cnd-graph`'s by-name `theme` attribute. See [Theming](#theming-guide-hook-1). |
| `selectorAssistant` | `SelectorAssistant` | `undefined` | Pluggable completion / synthesis / review hook for selector fields. See [Selector assistance](#selector-assistance-guide-hook-2). |
| `density` | `'compact' \| 'comfortable'` | `'compact'` | Row padding / font sizing. `compact` is noticeably tighter than the old cards. |
| `syntaxHighlighting` | `boolean` | `true` | Syntax highlighting in the code view and selector fields. Both use a mirror overlay (highlighted `<pre>` behind a transparent-text textarea, scroll-synced, with ligatures/kerning normalized on both elements). If a host's fonts or zoom ever misalign the overlay, set this to `false` to render plain visible text with no mirror — the escape hatch that the old, removed highlighter never had. |
| `defaultView` | `'builder' \| 'code'` | `'builder'` | The view shown initially when the editor owns its own view state (i.e. `view` is not passed). |
| `view` | `'builder' \| 'code'` | `undefined` | Optional **controlled** view. When set, the editor renders this view and reports changes via `onViewChange` instead of owning view state. |
| `onViewChange` | `(view: 'builder' \| 'code') => void` | `undefined` | Called when the user clicks a view tab. Required to make a controlled `view` interactive. |
| `className` | `string` | `undefined` | Extra class on the editor root (`<section class="spytial-ed …">`), for host-side CSS scoping. |
| `disabled` | `boolean` | `false` | Disables all editing affordances (tabs, history, mutations, code typing). |
| `'aria-label'` | `string` | `'Layout specification editor'` | Accessible label on the editor root section. |
| `onDiagnostics` | `(diagnostics: Diagnostic[]) => void` | `undefined` | Called whenever the combined validation state changes (structural + domain + assistant `review`). De-duplicated; not called on no-op re-renders. |

### `CndLayoutInterface` back-compat wrapper

`CndLayoutInterface` (`src/components/CndLayoutInterface.tsx`) is now a **thin
wrapper over `SpecEditor`** that keeps the historical prop surface working. Reach
for it only when you have existing code on the old prop names; new code should
use `SpecEditor` directly.

Legacy props that still work, and how they map:

| Legacy prop | Maps to / behavior |
| --- | --- |
| `yamlValue` | Legacy name for `value`. `value` wins if both are given (`value ?? yamlValue ?? ''`). |
| `value` | Forwarded to `SpecEditor.value`. |
| `onChange` | Forwarded, wrapped so the deprecated `setConstraints`/`setDirectives` stay loosely in sync (see below). |
| `isNoCodeView` | Maps to the controlled `view`: `true → 'builder'`, `false → 'code'`. When `undefined`, the editor uses its own default view. |
| `onViewChange` | Wrapped: receives `(isNoCodeView: boolean)` — `true` when the user switches to Builder. Only wired up when `isNoCodeView` is provided. |

Deprecated props — the document owns this state now, so these are kept **loosely
in sync on a best-effort basis** and are no longer a source of truth:

| Deprecated prop | Behavior |
| --- | --- |
| `constraints` | Read-only acknowledgement only. Ignored as input. |
| `setConstraints` | On every YAML change, the wrapper best-effort parses the new YAML with `parseLayoutSpecToData` and pushes `parsed.constraints` through this setter. If the intermediate YAML is unparseable, the legacy array is left untouched. |
| `directives` | Read-only acknowledgement only. Ignored as input. |
| `setDirectives` | Same best-effort sync as `setConstraints`, with `parsed.directives`. |

New `SpecEditorProps` the wrapper accepts and forwards: `instance`, `domain`,
`theme`, `selectorAssistant`, `density`, `onDiagnostics`, `className`,
`disabled`, and `'aria-label'` (default `'CND Layout Specification Interface'`).
It always forwards `defaultView: 'builder'`. It does not expose `defaultView` as
its own prop — view selection goes through `isNoCodeView`.

## Domain awareness

The editor becomes domain-aware when you give it a `DomainSchema`, either
directly via `domain` or derived from a live `instance` via
`extractDomainSchema(instance)`. If both are present, `domain` wins.

```tsx
// Option A: let the editor extract the schema from a live instance.
<SpecEditor value={yaml} onChange={setYaml} instance={dataInstance} />

// Option B: pass a precomputed schema (cache it, or build it by hand).
import { extractDomainSchema } from '../src/spec-editor';
const domain = useMemo(() => extractDomainSchema(dataInstance), [dataInstance]);
<SpecEditor value={yaml} onChange={setYaml} domain={domain} />
```

With a domain present you get:

- **Autocomplete** in selector fields: domain types, relations, and atoms are
  merged with the selector-language keywords/operators and offered in the
  completion popup (Ctrl+Space or while typing).
- **Relation / type dropdowns**: fields of kind `relationName` and `typeName`
  render as combo boxes (free text plus a dropdown of known names) instead of
  plain text inputs.
- **Soft warnings**: `relationName`/`typeName` values not present in the
  instance, and selector identifiers that match no domain type/relation/atom,
  surface as `source: 'domain'` diagnostics. **All domain diagnostics are
  warnings, never errors** — the same spec is legitimately reused across
  instances that may not contain every referenced name, so a domain miss never
  blocks editing.

**Graceful degradation.** With no domain (neither prop set), the editor is fully
functional: no dropdowns, no completions beyond the selector-language keywords,
no domain diagnostics — the editing experience is otherwise identical.
`extractDomainSchema(instance)` never throws; a malformed or partial instance
degrades to an emptier schema rather than crashing the editor.

### `extractDomainSchema` built-in-type exclusions

`extractDomainSchema` (in `src/spec-editor/domain/domain-schema.ts`) distills the
instance into a `DomainSchema` of user-facing types and relations and is
deliberately selective:

- **Built-in types are excluded** from `schema.types`. A type is treated as
  built-in if the instance marks it (`type.isBuiltin === true`) **or** its name
  is one of the well-known selector built-ins: `univ`, `Int`, `seq/Int`, `iden`,
  `none`, `String`. These are reachable through selector keyword completions
  instead, and are never flagged by domain validation, so type dropdowns stay
  focused on user sigs.
- **All-built-in relations are excluded.** A relation whose entire type
  signature is built-in (e.g. Alloy's internal `no-field-guard` over
  `[univ, univ]`) is dropped as housekeeping; a real user field always touches at
  least one user sig.
- Relations expose `name` (the bare field name used in selectors), plus
  `arity`/`typeSignature` derived from the relation's type signature when known.
- Types and relations are de-duplicated; per-item failures are swallowed.

## Theming guide (hook 1)

All editor styles live in `spec-editor.css` and are keyed off `--spytial-ed-*`
CSS custom properties, each with a fallback equal to the `lightTheme` preset. So
the editor is fully styled with **no theme prop**, and every visual knob can be
overridden three ways.

### Token table

`SpecEditorTheme` (in `src/spec-editor/ui/theme.ts`). camelCase tokens map to
kebab-case CSS variable names.

| Token | CSS variable | Controls |
| --- | --- | --- |
| `accent` | `--spytial-ed-accent` | Primary accent — focus rings, active pills, the ✨ affordance. |
| `accentText` | `--spytial-ed-accent-text` | Text/foreground on accent-filled surfaces. |
| `surface` | `--spytial-ed-surface` | Base editor background. |
| `surfaceRaised` | `--spytial-ed-surface-raised` | Raised surfaces (rows, popovers, toolbar). |
| `border` | `--spytial-ed-border` | Borders and dividers. |
| `text` | `--spytial-ed-text` | Primary text color. |
| `textMuted` | `--spytial-ed-text-muted` | Secondary/muted text (summaries, hints). |
| `danger` | `--spytial-ed-danger` | Error diagnostics and destructive affordances. |
| `warning` | `--spytial-ed-warning` | Warning diagnostics and the "unapplied edits" badge. |
| `success` | `--spytial-ed-success` | Success/valid states. |
| `fontFamily` | `--spytial-ed-font-family` | UI font stack. |
| `monoFontFamily` | `--spytial-ed-mono-font-family` | Monospace font for code/selector fields. |
| `fontSize` | `--spytial-ed-font-size` | Base font size (rem/px). |
| `radius` | `--spytial-ed-radius` | Base corner radius. |
| `spacing` | `--spytial-ed-spacing` | Base spacing unit. |
| `synKeyword` | `--spytial-ed-syn-keyword` | Selector/YAML highlight: keywords. |
| `synType` | `--spytial-ed-syn-type` | Highlight: type/sig names. |
| `synRelation` | `--spytial-ed-syn-relation` | Highlight: relation/field names. |
| `synOperator` | `--spytial-ed-syn-operator` | Highlight: operators. |
| `synString` | `--spytial-ed-syn-string` | Highlight: string literals. |
| `synComment` | `--spytial-ed-syn-comment` | Highlight: comments. |

### Three override routes

1. **The `theme` prop.** Pass a (possibly partial) `SpecEditorTheme` object, or
   a registered theme **name** (`'light'`, `'dark'`, or your own). For objects,
   only the keys you set are emitted as inline custom properties on the editor
   root via `themeToCssVars`; the rest fall back to the baked-in `lightTheme`
   values.
2. **Host CSS variables.** Set any `--spytial-ed-*` variable on an ancestor (or
   the editor's own `className`). The CSS reads `var(--spytial-ed-*, <fallback>)`,
   so host-set variables win over the fallbacks without any prop.
3. **`className` + CSS.** Add a class via the `className` prop and write rules
   against the `spytial-ed-*` class names for structural tweaks beyond the
   tokens.

Routes 1 and 2 compose; an inline `theme` token overrides an inherited variable
for the same knob.

### Named themes (the `webcola-cnd-graph` convention)

The editor mirrors the graph component's theme model: a module-level registry
of named themes, seeded with `light` and `dark`, that `theme` can reference by
name. An unknown or absent name resolves to the CSS fallbacks — which ARE the
light theme, the same "absence means light" rule the graph uses.

```ts
import { registerSpecEditorThemes, SpecEditor } from 'spytial-core';

registerSpecEditorThemes({
  blueprint: { accent: '#53b9d1', surface: '#0d1b2a', text: '#dce6f2' },
});

<SpecEditor value={yaml} onChange={setYaml} theme="blueprint" />
// or simply: theme="dark"
```

Registration is module-level (like `WebColaCnDGraph.registerThemes`), so hosts
that theme both components can register matching palettes once and pass the
same name to each.

### Presets and density

`lightTheme` and `darkTheme` are exported as `Required<SpecEditorTheme>`. The
default appearance is the light tokens via CSS fallbacks, so you only pass a
theme when you want dark or custom. `density` (`'compact'` default,
`'comfortable'`) controls row padding/font and is a prop, not a theme token.

### Complete dark-mode example

```tsx
import { SpecEditor, darkTheme } from '../src/spec-editor';

function DarkEditor({ yaml, setYaml }: { yaml: string; setYaml: (v: string) => void }) {
  return (
    <div style={{ background: '#101014', padding: 16, borderRadius: 8 }}>
      <SpecEditor value={yaml} onChange={setYaml} theme={darkTheme} />
    </div>
  );
}
```

### "Brand accent only" example

A partial theme — every unset token keeps its light-preset fallback:

```tsx
import { SpecEditor, type SpecEditorTheme } from '../src/spec-editor';

const brand: SpecEditorTheme = { accent: '#ff2e88', accentText: '#1a022b' };

<SpecEditor value={yaml} onChange={setYaml} theme={brand} />;
```

## Selector assistance guide (hook 2)

`SelectorAssistant` (in `src/spec-editor/domain/assistant.ts`) is the pluggable
hook for selector-writing help. All three members are optional; the UI gates each
affordance on the member's presence.

```ts
interface SelectorAssistant {
  complete?(ctx: SelectorAssistContext, prefix: string): Completion[] | Promise<Completion[]>;
  synthesize?(ctx: SelectorAssistContext, request: string): Promise<{ value: string; explanation?: string }>;
  review?(ctx: SelectorAssistContext, value: string): Promise<Diagnostic[]>;
}
```

Members:

- **`complete(ctx, prefix)`** — extra completions for the autocomplete popup,
  merged with the built-in domain/keyword completions. May be sync or async.
- **`synthesize(ctx, request)`** — turns a natural-language `request` into a
  selector `value` (with an optional `explanation`). This powers the ✨ button on
  selector fields: clicking it opens a request box, the result is previewed, and
  Accept writes `value` into the field. Always async.
- **`review(ctx, value)`** — async lint of a written selector; returned
  diagnostics are merged into the field's diagnostics (debounced ~400 ms). The
  editor stamps each returned diagnostic with `itemId`, `fieldKey`, and
  `source: 'assistant'`.

`SelectorAssistContext` is passed to every member:

| Field | Type | Meaning |
| --- | --- | --- |
| `itemKind` | `'constraint' \| 'directive'` | Kind of the item owning the field. |
| `itemType` | `string` | Registry type, e.g. `'orientation'`. |
| `fieldKey` | `string` | The params key of the selector field, e.g. `'selector'`. |
| `currentValue` | `string` | Current value of the field. |
| `domain` | `DomainSchema \| undefined` | The active domain schema, if any. |
| `specYaml` | `string` | The full current spec YAML, for context. |

`Completion`: `{ label, insertText?, kind, detail? }` where `kind` is
`'type' | 'relation' | 'atom' | 'keyword' | 'snippet'`, `insertText` defaults to
`label`, and `detail` is a right-aligned hint (e.g. `'relation · arity 2'`).

### Worked example: a mock assistant

Adapted from `webcola-demo/spec-editor-demo-components.tsx`. It synthesizes a
selector from a request (keyword-matched against the domain) and lints any
selector still containing `TODO`:

```tsx
import type {
  SelectorAssistant,
  SelectorAssistContext,
  Diagnostic,
} from '../src/spec-editor';

function synthesizeSelector(
  ctx: SelectorAssistContext,
  request: string,
): { value: string; explanation?: string } {
  const lower = request.toLowerCase();
  const relations = ctx.domain?.relations ?? [];
  const types = ctx.domain?.types ?? [];

  // A direct relation-name mention wins.
  for (const rel of relations) {
    if (lower.includes(rel.name.toLowerCase())) {
      return { value: rel.name, explanation: `Matched relation "${rel.name}".` };
    }
  }
  // Intent words → composed selectors.
  if (/child|children/.test(lower) && relations.some((r) => r.name === 'left')) {
    return { value: 'left + right', explanation: 'Both child edges.' };
  }
  // A type mention → that type.
  for (const t of types) {
    if (lower.includes(t.name.toLowerCase())) {
      return { value: t.name, explanation: `All atoms of "${t.name}".` };
    }
  }
  const fallback = relations[0]?.name ?? types[0]?.name ?? 'univ';
  return { value: fallback, explanation: `No precise match; suggesting "${fallback}".` };
}

const mockAssistant: SelectorAssistant = {
  synthesize: (ctx, request) =>
    new Promise((resolve) => {
      setTimeout(() => resolve(synthesizeSelector(ctx, request)), 600);
    }),
  review: (ctx, value) =>
    new Promise((resolve) => {
      const diagnostics: Diagnostic[] = [];
      if (/TODO/.test(value)) {
        diagnostics.push({
          severity: 'warning',
          message: 'Selector contains a "TODO" — replace it before rendering.',
          source: 'assistant',
        });
      }
      resolve(diagnostics);
    }),
};

<SpecEditor value={yaml} onChange={setYaml} instance={instance} selectorAssistant={mockAssistant} />;
```

### Wiring a real LLM-backed assistant

`synthesize` and `review` are async, so a real implementation just `await`s your
backend. Use `ctx.domain`, `ctx.specYaml`, and `ctx.currentValue` to build a
grounded prompt.

```ts
const llmAssistant: SelectorAssistant = {
  async synthesize(ctx, request) {
    const res = await fetch('/api/selector/synthesize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        request,
        field: ctx.fieldKey,
        itemType: ctx.itemType,
        types: ctx.domain?.types ?? [],
        relations: ctx.domain?.relations ?? [],
        spec: ctx.specYaml,
      }),
    });
    const data = await res.json();
    return { value: data.selector, explanation: data.explanation };
  },

  async review(ctx, value) {
    const res = await fetch('/api/selector/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, domain: ctx.domain }),
    });
    const { issues } = await res.json();
    return issues.map((i: { message: string }) => ({
      severity: 'warning' as const,
      message: i.message,
      source: 'assistant' as const,
    }));
  },
};
```

Where errors surface, and how failures are handled:

- **`synthesize`** errors surface in the ✨ popover's error state; the field is
  left unchanged. (You may also reject the promise to signal failure.)
- **`review`** runs on a debounce; rejected promises and per-task throws are
  **swallowed** — a failing review simply contributes no diagnostics rather than
  breaking the editor.
- **`complete`** is wrapped defensively: a throw or rejected promise falls back
  to the built-in completions, so a flaky completion source degrades silently.

### How completions merge with built-ins

For each selector field the editor composes:

1. **Built-in completions** from `createBuiltinCompletionSource(domain)` —
   domain types/relations/atoms (when a domain is present) plus the
   selector-language keywords/operators/snippets, prefix-filtered.
2. **`assistant.complete()`** results, when provided.

These are merged with `mergeCompletions(assistantResults, builtinResults)`, which
dedupes on `(label, insertText)` preserving first-seen order. Assistant results
are passed first, so **the assistant wins ties** — an assistant completion with
the same label/insert text as a built-in suppresses the built-in. Atom
completions from the domain are capped (`MAX_ATOM_COMPLETIONS = 200`) to keep the
popup responsive on large instances; supply an `assistant.complete()` if you need
instance-aware results beyond the cap.

## Adding a new constraint/directive type

A type is described entirely by an `ItemDefinition` (in
`src/spec-editor/core/registry.ts`); the builder renders its form generically
from the `FieldSpec[]`. Adding a type means adding a registry entry — no new
component.

An `ItemDefinition` has:

- `kind`: `'constraint' | 'directive'`.
- `type`: the registry key (e.g. `'orientation'`).
- `label`, optional `description`: shown in the add menu.
- optional `deprecated`: parse/render but hide from the add menu.
- `fields: FieldSpec[]`: the form. Each `FieldSpec` is
  `{ key, kind, label, required?, options?, multiple?, default?, placeholder?, help?, selectorArity? }`.
  `kind` is one of `selector | relationName | typeName | enum | number | color | text | boolean`.
- `summary(params)`: the one-line collapsed-row text.
- optional `validate(params)`: extra structural diagnostics beyond required-field
  checks.
- optional `toYamlNode(params)` / `fromYamlNode(node)`: override YAML emission /
  ingestion for quirky shapes (return `null` from `fromYamlNode` to reject).

Use the real `orientation` entry as the model:

```ts
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
    if (dirs.includes('above') && dirs.includes('below')) {
      out.push(fieldError('directions', 'Cannot be both above and below.'));
    }
    return out;
  },
};
```

To register a new type, define its `ItemDefinition` the same way and add it to the
`DEFINITIONS` array in `registry.ts` (constraints first, then directives). The add
menu, the generated form, defaults (`defaultParamsFor`), validation, and YAML
round-tripping all pick it up automatically.

For a directive with a non-standard YAML shape, see `flag` (a bare scalar
`- flag: hideDisconnectedBuiltIns` via `toYamlNode`/`fromYamlNode`). For two types
that share one YAML key, see `groupselector` and `groupfield`, both of which emit
under `group:` and are disambiguated on ingestion by their `fromYamlNode` (the
presence of `field` ⇒ groupfield). Any tooling mapping YAML keys ↔ types should
use the registry helpers `getDefinitionsForYamlKey` / `isKnownYamlKey` rather than
assuming `yamlKey === type`.

> **Important:** YAML shapes here are pinned against the authoritative
> layout-engine parser (`src/layout/layoutspec.ts`). A registry entry must emit
> YAML that parser accepts, or it breaks the round-trip invariant. (This is why
> there is no `projection` entry — `parseLayoutSpec` has no `projection` branch;
> projection is a runtime UI concern, not a spec directive.)

## Migration notes

The old `NoCodeView` Structured Builder is **replaced** by the spec editor in
`src/spec-editor/`. Use `SpecEditor` (or the back-compat `CndLayoutInterface`).

### Shimmed exports that keep working

`src/components/NoCodeView/index.ts` still exports the legacy **data API** as thin
shims over the new core (`src/components/NoCodeView/shims.ts`), so existing
imports compile unchanged:

- `parseLayoutSpecToData(yaml)` — YAML → `{ constraints, directives }` legacy
  data shapes (backed by `parseYamlToState`).
- `generateLayoutSpecYaml(constraints, directives)` — legacy data shapes → YAML
  (backed by `serializeStateToYaml`).
- `validateYaml(yaml)` — YAML syntax check; unchanged behavior.
- `validateSpytialSpec(yaml)` — syntax check + structural key/type warnings + a
  final `parseLayoutSpec`; unchanged behavior.
- `ConstraintData` / `DirectiveData` — the legacy `{ id, type, params, comment }`
  data types; unchanged.

(`highlightSelector` is also retained verbatim as a pure helper.)

### Removed exports

The **27 per-type selector components** (e.g. `OrientationSelector`,
`AlignSelector`, `IconSelector`, …) and the `NoCodeView`/`CodeView`/
`ConstraintCard`/`DirectiveCard` React surfaces, selector hooks, and CSS are
**deleted**. The replacement pattern is a generic **`FieldRenderer` driven by the
registry**: each type is an `ItemDefinition` whose `FieldSpec[]` is rendered by
one `FieldRenderer`, instead of a hand-built component per type. To add or change
a form, edit the registry entry (see
[Adding a type](#adding-a-new-constraintdirective-type)).

### Behavior changes

1. **The view toggle is purely visual and never blocked by unparseable YAML.**
   Switching Builder ⇄ Code does no conversion. If the YAML in the code view
   doesn't parse, the model keeps its last good state, the code view shows a
   parse diagnostic with line/column, and the Builder tab shows a small "text has
   unapplied edits" badge — but you can still toggle freely and the model is
   preserved.
2. **`parseLayoutSpecToData` no longer migrates `size`/`hideAtom` from directives
   into constraints.** Items stay in whatever YAML section they appear in; the
   editor renders them wherever they are. The old directive→constraint migration
   is gone.
3. **`groupfield` is deprecated.** It is still parsed and rendered (so existing
   specs keep working), but is hidden from the add menu. Prefer `groupselector`
   with a binary relation. (See the auto-memory note: `group: { field, groupOn,
   addToGroup }` is the deprecated by-field form.)
4. **Full undo/redo history** replaces the old single-snapshot undo. The
   `SpecDocument` keeps a full history stack; Cmd/Ctrl+Z undoes and
   Shift+Cmd/Ctrl+Z redoes when focus is inside the editor, and toolbar buttons
   expose the same.

## Demo

A working demo wires up both integration hooks (domain awareness + a mock
selector assistant) and a theme switcher.

Run it:

```bash
npm run build:all
npm run serve   # serves on port 8080
```

Then open <http://localhost:8080/webcola-demo/spec-editor-demo.html>.

What it demonstrates:

- **Domain awareness** — a real `AlloyDataInstance` (a binary-search-tree with
  sig `Node` and fields `left`, `right`, `key`) powers the type/relation
  dropdowns and selector completions.
- **The selector assistant (✨)** — a mock assistant turns a natural-language
  request into a selector after a short delay (try "children" or "leaf nodes")
  and lints any selector containing `TODO`.
- **Theming** — a switcher toggles the default light theme, the built-in
  `darkTheme` preset, and a custom "funky" theme passed via the `theme` prop.
- **Live diagnostics + YAML** — an expandable panel shows the current
  `onDiagnostics` output and the live YAML value.

The demo source is `webcola-demo/spec-editor-demo-components.tsx` (mounted by
`webcola-demo/spec-editor-demo.html`); it is a good reference for a minimal
end-to-end integration.
```