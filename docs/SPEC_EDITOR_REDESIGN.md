# Spec Editor Redesign (Structured Builder v2)

Status: **implemented** — see `docs/SPEC_EDITOR.md` for the integrator-facing guide.

This document is the source of truth for the ground-up redesign of the CnD layout
spec editor (`CndLayoutInterface` + `NoCodeView`, the "Structured Builder"). All
implementation work packages build against the interfaces pinned here. If an
implementation needs to deviate, update this doc in the same change.

## Why redesign

Problems with the current editor (`src/components/NoCodeView/`):

1. **Lossy, toggle-time sync.** YAML ⇄ builder conversion only happens when the
   user flips the Code/Builder toggle (`CndLayoutInterface.tsx:203-224`). Comments
   survive via fragile regex extraction; `flag` directives need a serialization
   hack; invalid YAML traps the user in Code View.
2. **No domain awareness.** Every selector/field is a free-form textarea even
   though the host holds an `IInputDataInstance` with `getTypes()/getAtoms()/getRelations()`.
   `ReplWithVisualization` already passes `instance` into `CndLayoutInterface` —
   the prop doesn't exist; it's dead wiring.
3. **No theming contract.** Components hardcode Bootstrap utility classes, but
   Bootstrap is not a dependency — host pages must happen to load it. Appearance
   is not customizable.
4. **Syntax help is dead code.** `highlightSelector()` exists but is disabled
   due to overlay scroll-sync issues; no autocomplete; validation only in Code View.
5. **Obtrusive.** Every constraint is a full card with chrome; a 3-constraint
   spec is a wall of UI.
6. **Hardcoded forms.** 27 hand-built per-type selector components; adding a
   constraint type means writing a new React component.

## Architecture overview

```
src/spec-editor/
  core/        # framework-agnostic model (NO React imports)
    spec-document.ts     # SpecDocument: single source of truth, undo/redo, events
    yaml-codec.ts        # parse/serialize with comment + unknown-node preservation
    registry.ts          # ItemDefinition registry + all built-in definitions
    diagnostics.ts       # Diagnostic types + structural validation
    types.ts             # SpecItem, FieldSpec, etc. (shared contracts)
  domain/      # domain awareness (NO React imports)
    domain-schema.ts     # DomainSchema + extractDomainSchema(instance)
    domain-validation.ts # validate items against a DomainSchema
    completions.ts       # built-in completion provider (domain + selector keywords)
    assistant.ts         # SelectorAssistant interface (the pluggable hook)
  ui/          # React components
    theme.ts             # theme tokens, presets, ThemeRoot helper
    spec-editor.css      # ALL styles, driven by --spytial-ed-* custom properties
    SelectorField.tsx    # highlighted input + autocomplete popup + assistant affordance
    FieldRenderer.tsx    # generic form renderer for FieldSpec kinds
    BuilderView.tsx      # compact row list, expand-to-edit
    CodeView.tsx         # YAML editor with live parse + diagnostics
    SpecEditor.tsx       # combines views, owns a SpecDocument
  index.ts
src/components/CndLayoutInterface.tsx   # rebuilt as thin back-compat wrapper over SpecEditor
```

**Single source of truth.** A `SpecDocument` holds the parsed spec (constraints,
directives, preserved comments/unknown nodes). Both views are projections of it
and stay live — no toggle-time conversion, no data loss. YAML is regenerated from
the model continuously; hand-edited YAML is parsed into the model continuously
(debounced ~300ms). A parse error never clobbers the model: the model keeps its
last good state, the code view shows the diagnostic, and the builder shows an
"out of sync with text" indicator until the YAML parses again.

**Schema-driven forms.** Each constraint/directive type is described by an
`ItemDefinition` (fields, summary, validation, serialization quirks). The builder
renders forms generically from `FieldSpec[]`. Adding a type = adding a registry
entry, not a component.

## Pinned interfaces

These are contracts between work packages. WP1 creates them verbatim in
`src/spec-editor/core/types.ts` and `src/spec-editor/domain/*`.

```ts
// ---- core/types.ts ----
export type ItemKind = 'constraint' | 'directive';

export interface SpecItem {
  id: string;                       // stable uuid for React keys + diagnostics
  kind: ItemKind;
  type: string;                     // registry key, e.g. 'orientation'
  params: Record<string, unknown>;
  comment?: string;                 // user note, round-trips as YAML comment
  raw?: unknown;                    // present iff type unknown to registry; re-emitted verbatim
}

export type FieldKind =
  | 'selector'        // CnD selector expression (gets SelectorField treatment)
  | 'relationName'    // a relation/field name from the domain (dropdown when domain known)
  | 'typeName'        // a type/sig name from the domain (dropdown when domain known)
  | 'enum' | 'number' | 'color' | 'text' | 'boolean';

export interface FieldSpec {
  key: string;                      // params key
  kind: FieldKind;
  label: string;
  required?: boolean;
  options?: readonly string[];      // for 'enum'
  multiple?: boolean;               // for 'enum': multi-select pills (e.g. orientation directions)
  default?: unknown;
  placeholder?: string;
  help?: string;                    // short tooltip text
  selectorArity?: 'unary' | 'binary'; // for 'selector' fields
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  itemId?: string;                  // ties to a builder row
  fieldKey?: string;                // ties to a specific field
  line?: number; column?: number;   // ties to a YAML location (code view)
  source: 'yaml' | 'structure' | 'domain' | 'assistant';
}

export interface ItemDefinition {
  kind: ItemKind;
  type: string;
  label: string;                    // human name in the add menu
  description?: string;
  deprecated?: boolean;             // parse + render, but hide from add menu (e.g. 'groupfield')
  fields: FieldSpec[];
  /** one-line summary for the collapsed row, e.g. "left, above · parent" */
  summary(params: Record<string, unknown>): string;
  /** extra structural validation beyond required-field checks */
  validate?(params: Record<string, unknown>): Diagnostic[];
  /** override YAML emission for quirky shapes (e.g. flag scalar form) */
  toYamlNode?(params: Record<string, unknown>): unknown;
  /** override YAML ingestion; return null to reject */
  fromYamlNode?(node: unknown): Record<string, unknown> | null;
}

// ---- domain/domain-schema.ts ----
export interface DomainRelation {
  name: string;
  arity?: number;
  /** type signature when known, e.g. ['Node', 'Node'] */
  typeSignature?: readonly string[];
}
export interface DomainSchema {
  types: ReadonlyArray<{ name: string; atoms: readonly string[] }>;
  relations: readonly DomainRelation[];
}
/** Adapter from the live instance. Never throws; returns best-effort schema. */
export function extractDomainSchema(instance: IInputDataInstance): DomainSchema;

// ---- domain/assistant.ts (HOOK: selector-writing assistance) ----
export interface SelectorAssistContext {
  itemKind: ItemKind;
  itemType: string;
  fieldKey: string;
  currentValue: string;
  domain?: DomainSchema;
  /** full current spec YAML, for context */
  specYaml: string;
}
export interface Completion {
  label: string;
  insertText?: string;              // defaults to label
  kind: 'type' | 'relation' | 'atom' | 'keyword' | 'snippet';
  detail?: string;                  // right-aligned hint, e.g. 'relation · arity 2'
}
export interface SelectorAssistant {
  /** extra completions, merged with built-in domain completions */
  complete?(ctx: SelectorAssistContext, prefix: string): Completion[] | Promise<Completion[]>;
  /** natural-language request -> selector. Powers the ✨ affordance. */
  synthesize?(ctx: SelectorAssistContext, request: string): Promise<{ value: string; explanation?: string }>;
  /** async review of a written selector (e.g. model-based lint) */
  review?(ctx: SelectorAssistContext, value: string): Promise<Diagnostic[]>;
}

// ---- ui/theme.ts (HOOK: appearance customization) ----
/** Every visual knob is a token; tokens become --spytial-ed-* custom properties. */
export interface SpecEditorTheme {
  accent?: string; accentText?: string;
  surface?: string; surfaceRaised?: string;
  border?: string; text?: string; textMuted?: string;
  danger?: string; warning?: string; success?: string;
  fontFamily?: string; monoFontFamily?: string;
  fontSize?: string;                // base, rem/px
  radius?: string; spacing?: string; // base unit
  // syntax tokens for selector/yaml highlighting
  synKeyword?: string; synType?: string; synRelation?: string;
  synOperator?: string; synString?: string; synComment?: string;
}
export const lightTheme: Required<SpecEditorTheme>;
export const darkTheme: Required<SpecEditorTheme>;
```

### SpecDocument API (WP1)

```ts
export interface SpecDocumentState {
  constraints: SpecItem[];
  directives: SpecItem[];
  /** comments/blank-line structure not attached to an item, preserved on serialize */
  headerComment?: string;
}

export class SpecDocument {
  static fromYaml(yaml: string): SpecDocument;       // throws SpecParseError w/ line info
  toYaml(): string;                                  // deterministic, comment-preserving
  getState(): Readonly<SpecDocumentState>;
  // mutations (each records one undo step)
  addItem(kind: ItemKind, type: string): SpecItem;   // params from FieldSpec defaults
  updateItem(id: string, patch: Partial<Pick<SpecItem, 'params' | 'comment' | 'type'>>): void;
  removeItem(id: string): void;
  moveItem(id: string, toIndex: number): void;
  replaceFromYaml(yaml: string): void;               // code-view edits; throws on parse error
  // history
  canUndo(): boolean; canRedo(): boolean; undo(): void; redo(): void;
  // validation
  validate(domain?: DomainSchema): Diagnostic[];     // structural + domain
  // events
  subscribe(listener: (state: SpecDocumentState) => void): () => void;
}
```

Round-trip requirement: for any document built via the API,
`SpecDocument.fromYaml(doc.toYaml())` must be semantically identical (params,
comments, unknown nodes). Property-test this with `fast-check` (already a dev dep).

### Public component API (WP4)

```tsx
export interface SpecEditorProps {
  /** controlled YAML value */
  value: string;
  onChange(value: string): void;
  /** domain awareness: pass either the live instance or a precomputed schema */
  instance?: IInputDataInstance;
  domain?: DomainSchema;            // wins over instance if both given
  /** hooks */
  theme?: SpecEditorTheme;
  selectorAssistant?: SelectorAssistant;
  /** appearance */
  density?: 'compact' | 'comfortable';   // default 'compact'
  defaultView?: 'builder' | 'code';      // default 'builder'
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** notified whenever validation state changes */
  onDiagnostics?(diagnostics: Diagnostic[]): void;
}
```

`CndLayoutInterface` is rebuilt as a thin wrapper over `SpecEditor` that keeps
its existing props working: `yamlValue`→`value`, `isNoCodeView`/`onViewChange`
still control the visible view, and `constraints`/`setConstraints`/`directives`/
`setDirectives` become **optional and deprecated** (the document owns that state
now; if provided they are kept loosely in sync via best-effort callbacks so the
demo wrappers keep compiling, but they are no longer the source of truth). It
additionally accepts and forwards all new `SpecEditorProps`.

`src/components/NoCodeView/index.ts` keeps exporting `parseLayoutSpecToData`,
`generateLayoutSpecYaml`, `validateYaml`, `validateSpytialSpec`, `ConstraintData`,
`DirectiveData` as thin shims over the new core so existing imports compile.
The 27 per-type selector components are deleted (the shims module documents the
replacement).

## Behavioral spec

### Sync (fixes pain point 1)
- Builder edits → document mutation → YAML regenerated synchronously → `onChange`.
- Code edits → `onChange` immediately (text is controlled) → debounced (300ms)
  `replaceFromYaml`; on parse error, model untouched, error shown inline with
  line/column, builder toggle shows a small "text has unapplied edits" badge.
- The view toggle is purely visual. No conversion happens on toggle.
- Undo/redo: full history stack in `SpecDocument` (replaces the current
  single-snapshot undo). Keyboard: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z when focus is
  inside the editor.

### Builder UI (fixes pain point 5)
- Each item is a **compact row**: grip (reorder) · kind badge · type label ·
  live `summary(params)` · diagnostic dot (if any) · overflow menu (duplicate,
  delete, comment). Click row → expands inline to the generated form.
- Exactly one row expanded at a time (accordion); Esc collapses.
- "Add constraint" / "Add directive" split buttons with a searchable menu built
  from the registry (deprecated types hidden).
- Empty state: one-line hint + add buttons, not a big placeholder card.
- Density token controls row padding/font; `compact` is the default and is
  noticeably tighter than today's cards.

### Selector fields (fixes pain point 4, hook 2)
`SelectorField` is a one-line grow-as-needed input with:
- **Highlighting** via the standard overlay technique (mirrored `<pre>` behind a
  transparent-text `<textarea>`, scroll positions synced in `onScroll` — this
  fixes the bug that got the old highlighter disabled). Token colors come from
  `--spytial-ed-syn-*` variables.
- **Autocomplete**: triggered on typing/Ctrl+Space; merges (a) selector-language
  keywords/operators (derive the list from the layout-query grammar /
  simple-graph-query usage; see old `highlightSelector` for a starting set),
  (b) domain completions (types, relations, atoms) when a `DomainSchema` is
  present, (c) `assistant.complete()` results when provided. Keyboard: ↑↓ to
  navigate, Tab/Enter to accept, Esc to dismiss. ARIA combobox pattern.
- **Assistant affordance**: when `assistant.synthesize` is provided, a ✨ button
  appears in the field; clicking opens an inline popover with a free-text
  request box; the result is previewed (with `explanation` if present) and
  Accept writes it into the field. Loading and error states required.
- **Validation**: structural (parse the selector with the existing layout query
  parser where feasible) + domain ("type `Foo` is not in this instance" as a
  warning, since specs may legitimately reference types absent from the current
  instance) + `assistant.review` results, debounced.

### Domain awareness (fixes pain point 2)
- `domain` prop (or `extractDomainSchema(instance)`) flows via React context to
  all fields.
- `relationName`/`typeName` fields render as combo boxes (free text + dropdown
  of known names) when a domain is present; plain text inputs otherwise.
- Everything must degrade gracefully with no domain: no dropdowns, no domain
  diagnostics, identical editing experience otherwise.

### Theming (fixes pain point 3, hook 1)
- **Zero Bootstrap.** All class names are `spytial-ed-*`; all styling lives in
  `spec-editor.css` keyed off `--spytial-ed-*` custom properties with fallback
  values, so the component is fully styled standalone AND every knob can be
  overridden by (a) the `theme` prop, (b) host CSS setting the variables, or
  (c) `className` + CSS.
- The `theme` prop maps tokens → inline custom properties on the editor root.
- Ship `lightTheme` and `darkTheme` presets; default = light tokens via CSS
  fallbacks (no prop needed).

## Built-in registry entries

Constraints: `orientation` (directions multi-enum: above/below/left/right/
directlyAbove/directlyBelow/directlyLeft/directlyRight + binary selector),
`cyclic` (direction enum + selector), `align` (direction enum + selector),
`groupselector` (binary selector + addEdge boolean), `groupfield`
(**deprecated: true** — parse/render but hide from add menu; prefer
groupselector), `size` (width/height numbers + selector), `hideAtom` (unary selector).

Directives: `flag` (text; scalar YAML form via toYamlNode/fromYamlNode),
`attribute` (field + optional selector), `hideField` (relationName),
`icon` (path/url + showLabels + selector), `atomColor` (color + selector),
`edgeColor` (color + field/selector), `inferredEdge` (name + color + selector),
`tag` (text + selector), `projection` (typeName) if currently parsed by
`parseLayoutSpec` — match the existing parser's accepted shapes exactly
(see `src/components/NoCodeView/NoCodeView.tsx:144-275` and `CodeView.tsx:37-119`
for today's accepted YAML, and the core `parseLayoutSpec` for ground truth).

**Semantics note for summaries (do not get this wrong):** orientation
`directions` describe the TARGET relative to the SOURCE of the selector edge —
`directions: [left]` on selector `parent` means the target end of each `parent`
tuple is drawn left of the source. Some prose in constraints.md says the
opposite; the implementation is authoritative.

### WP1 implementation notes (deviations + decisions of record)

These were resolved while implementing `src/spec-editor/core/` against the
authoritative parser (`src/layout/layoutspec.ts`):

- **`projection` is NOT a registry entry.** The design listed it "if currently
  parsed by `parseLayoutSpec`". It is not: `parseLayoutSpec` has no `projection`
  branch (projection is a runtime UI concern in the Alloy demo — atom-selection
  panels — applied via `instance.applyProjections(...)`, not a spec directive).
  Adding a registry entry would emit YAML the engine rejects, breaking the
  round-trip-through-`parseLayoutSpec` invariant. Revisit if the parser gains a
  `projection:` directive.
- **`tag` fields are `toTag` / `name` / `value`** (three fields), not the
  "text + selector" the prose sketched — that is the parser's actual accepted
  shape (`TagDirective`). `toTag` and `value` are selector fields, `name` is
  text.
- **`hideField` / `attribute` / `edgeColor` use a `field` param** (kind
  `relationName`), matching the parser. `edgeColor`'s color param is `value`
  (not `color`); the parser maps `edgeColor.value → color` internally. The
  registry models color via a `value` field for `atomColor`/`edgeColor` and a
  `color` field for `inferredEdge`, matching each parser branch exactly.
- **`group` YAML-key aliasing.** Both `groupselector` and `groupfield` emit
  under the `group:` key and are disambiguated on ingestion by `fromYamlNode`
  (presence of `field` ⇒ groupfield). The codec resolves a YAML key to its
  candidate definitions via the registry helpers `getDefinitionsForYamlKey` /
  `isKnownYamlKey` and tries each `fromYamlNode` in registry order. WP4 (code
  view) and any tooling that maps YAML keys ↔ types must use these helpers, not
  assume `yamlKey === type`.
- **`hold` is preserved as a param.** Negated constraints use `hold: never`;
  the group definitions pass it through `to/fromYamlNode`, and the default
  codec path preserves it for the other types since it is just another params
  key. WP2/WP3 may surface it as a "negate" toggle.
- **Comments are normalized to a round-trip-stable form** (each line trimmed,
  blank lines dropped) on store (`updateItem`) and on emit, because the parser
  trims comment text on the way in. Multi-line comments join with `\n` and
  re-emit as one `#` line per line.
- **`flag` bare-scalar emission is guarded** (post-review): `- flag: <value>` is
  only emitted verbatim when the value is YAML-safe (matches `[A-Za-z0-9_.-]+`
  *and* js-yaml re-parses it to the identical string); otherwise it falls
  through to the generic js-yaml dump, which quotes/escapes correctly. This
  prevents a value with `:`/`#`/newlines (or a number/boolean-like token such as
  `123`/`yes`) from corrupting the document or being dropped on the round trip.
- **Helper exports added** beyond the pinned API (all in
  `src/spec-editor/index.ts`): `parseYamlToState`, `serializeStateToYaml`,
  `getDefinition`, `getDefinitions`, `getAllDefinitions`,
  `getDefinitionsForYamlKey`, `isKnownType`, `isKnownYamlKey`,
  `defaultParamsFor`, `getFieldSpec`, `validateItem`, `validateState`, `newId`,
  and the enum/const tables (`ORIENTATION_DIRECTIONS`, `CYCLIC_DIRECTIONS`,
  `ALIGN_DIRECTIONS`, `EDGE_STYLES`, `DEFAULT_NODE_WIDTH`,
  `DEFAULT_NODE_HEIGHT`). `SpecParseError` is exported and carries
  `line`/`column`.
- **No `uuid` runtime dep** (only `@types/uuid` is present). Ids come from
  `src/spec-editor/core/id.ts` (`crypto.randomUUID` with a timestamp+random
  fallback), exported as `newId`.

## Work packages

- **WP1 — core model** (`src/spec-editor/core/`): types, SpecDocument, yaml-codec
  with comment/unknown preservation, registry with all built-in definitions,
  structural diagnostics, undo/redo. Unit + property tests. No React.
- **WP2 — domain layer** (`src/spec-editor/domain/`): DomainSchema,
  extractDomainSchema, domain validation, built-in completions, SelectorAssistant
  contract. Unit tests with a real AlloyDataInstance fixture. No React.
- **WP3 — UI foundation** (`src/spec-editor/ui/` primitives): theme tokens/css,
  SelectorField (highlight overlay + autocomplete + ✨ affordance), FieldRenderer.
  Component tests (testing-library + jsdom).
- **WP4 — views + integration**: BuilderView, CodeView, SpecEditor,
  CndLayoutInterface rewrite + shims, update `ReplWithVisualization` (pass
  instance through — the dead wiring becomes real), update webcola-demo wrappers,
  new demo page `webcola-demo/spec-editor-demo.html` with a sample instance and
  a mock assistant demonstrating both hooks. Delete `src/components/NoCodeView/`
  internals not needed by shims.
- **WP5 — verification & docs**: build:all, test:run, typecheck, lint, demo
  walkthrough, `docs/SPEC_EDITOR.md` (props, theming guide, assistant hook guide,
  migration notes).

## Conventions (binding on all WPs)

- Build: `npm run build:all`. Tests: `npm run test:run` (never `npm test`).
  Typecheck: `npm run typecheck`. Demo server: `npm run serve` (port 8080).
- **No new runtime dependencies.** The editor must work in the self-contained
  IIFE bundles. (This is why SelectorField is hand-rolled, not CodeMirror.)
- Named exports only (tree-shaking convention used across the repo).
- Strict TS; no `any` in public APIs.
- Accessibility: keyboard operability for every interaction (rows, menus,
  autocomplete, popovers); ARIA roles per APG patterns; `axe-core` is available
  for tests.
- Terminology in docs/comments: "Spytial integration", never "port".
