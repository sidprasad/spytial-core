# Configuring embedded graphs

`WebColaCnDGraph` and `StructuredInputGraph` share an instance-local
`setViewOptions(options): Promise<void>` API. These are viewer options, not CnD
constraints: reuse the same data and spec in a document and a playground.
Existing integrations that do not call this method keep their current defaults.

```js
const graph = document.querySelector('webcola-cnd-graph');
await graph.setViewOptions({
  toolbar: 'compact',
  interaction: { structuralEditing: false },
});
await graph.renderLayout(layout);
```

See [full and quiet graphs together](../webcola-demo/embedding-options-demo.html)
(build locally with `npm run build:all`, then `npm run serve`).

## Options and live updates

| Option | Default | Meaning |
| --- | --- | --- |
| `toolbar` | `'full'` | `'full'` shows all available controls; `'compact'` shows zoom and fit; `'none'` hides built-in controls. |
| `controls` | `{}` | Individual boolean overrides: `zoom`, `fit`, `routing`, `theme`, `export`, `editing`. Overrides take precedence over the preset, even `'none'`. Editing controls apply only to `StructuredInputGraph`. |
| `interaction.nodeDrag` | `true` | Allow constrained dragging of nodes and groups. |
| `interaction.panZoom` | `true` | Allow mouse/touch pan and zoom. Programmatic actions still work. |
| `interaction.structuralEditing` | `true` | Permit the editing capabilities the constructor already enables. `false` blocks structural edits through modifiers, edge handles, edge dialogs, forms, context menus, and Delete/Backspace. |
| `fontFamily` | `null` | Graph font stack; `null` restores the existing `font-family` attribute or the default Atkinson Hyperlegible stack. |

All options can change before or after mounting. Calls merge nested fields:
`setViewOptions({ controls: { theme: false } })` leaves other options alone.
Overrides persist when changing presets; explicitly set an override to `true`
or `false` to change it. `getViewOptions()` returns a detached snapshot.
The exported TypeScript types are `GraphViewOptions`, `GraphControl`, and
`ResolvedGraphViewOptions`.

Controls and permissions update synchronously without rebuilding the graph.
Font changes remeasure automatic node boxes and rerun the constrained
layout from the live positions, preserving the viewport. Await the returned
promise before reading the resulting geometry. Node positions can move to
satisfy constraints with the new dimensions. Explicit `size` constraints and
host-supplied dimensions remain exact; a deliberately small box can overflow,
just as before. Automatic sizing is tracked internally for nodes returned by `LayoutInstance`,
without adding keys to generated layouts or their JSON. Custom, cloned, or
deserialized nodes retain their dimensions unless the host opts them in with
`LayoutNode.autoSize: true`.

Type badges, attributes, and tags remain displayed in every toolbar mode;
there are no viewer options to hide them. Data and selector evaluation are unchanged. CnD `showLabel: false` remains authoritative. The API does
not turn the base viewer into an editor: `new WebColaCnDGraph()` stays read-only,
`new StructuredInputGraph()` stays editable by default, and the legacy
`WebColaCnDGraph(isInputAllowed)` constructor is unchanged. Disabling editing
cancels pending gestures/dialogs and hides editing buttons. It does not prevent
a host from replacing the data or calling `renderLayout()`.

Toolbar visibility does not grant or revoke editing permission. To make an
editable component exploration-only, explicitly set
`interaction.structuralEditing: false`. Node dragging and pan/zoom remain
independently configurable. Built-in controls use native buttons/selects,
wrap at narrow widths after opting into `setViewOptions()`, and hidden controls
take neither focus nor toolbar space. Controls added with `addToolbarControl()` are host-owned and remain
visible independently of the built-in preset.

## Host-owned controls

These actions work regardless of toolbar visibility or gesture permissions:

```js
zoomInButton.onclick = () => graph.zoomIn();
zoomOutButton.onclick = () => graph.zoomOut();
fitButton.onclick = () => graph.resetViewToFitContent();
downloadButton.onclick = () => graph.takeScreenshot('diagram.png');
graph.setRoutingMode('taut'); // also 'grid' or an already registered router id
```

`setRoutingMode()` synchronizes the dropdown and reroutes a rendered graph
without moving its nodes. Unknown mode names throw. Register optional routers
before selecting them. Theme APIs (`setTheme`, `registerTheme`,
`registerThemes`) remain available when the theme control is hidden.

## Document theme, typography, and frame

Use the existing theme registry and `--cnd-*` color slots. Have the host call
`setTheme()` on each embedded graph whenever its document theme changes:

```js
await graph.setViewOptions({ controls: { theme: false } });
const preference = matchMedia('(prefers-color-scheme: dark)');
const syncTheme = () => graph.setTheme(preference.matches ? 'dark' : 'light');
syncTheme();
preference.addEventListener('change', syncTheme);
// On host teardown: preference.removeEventListener('change', syncTheme);
```

For a document theme selector, call the same function from that selector instead
of using `matchMedia`. This explicit synchronization also updates node palettes,
SVG colors, and PNG backgrounds; a theme is not inferred from an ancestor's CSS.
Custom themes use `graph.registerTheme({ name, slots, nodeColors })` followed by
`graph.setTheme(name)`, so there is only one color system.

```js
await document.fonts.ready;
await graph.setViewOptions({ fontFamily: getComputedStyle(document.body).fontFamily });
```

Set `fontFamily` again after loading a new web font to remeasure live nodes.
Automatic boxes retain the existing 100×60 minimum and 280×140 cap. The existing
`font-family` attribute is an initial font hook; use `setViewOptions` for live
updates and remeasurement. Framing hooks are CSS custom properties on the host:

```css
webcola-cnd-graph {
  --cnd-canvas-border: none;
  --cnd-canvas-radius: 0;
}
```

## Diagnostics

Removing the toolbar leaves the warning badge and rendering diagnostics intact.
For host-owned diagnostics, inspect the pipeline result **before** rendering:

```js
const result = new LayoutInstance(spec, evaluator).generateLayout(instance);
showConstraintError(result.error);       // structured conflict/IIS result
showSelectorErrors(result.selectorErrors);
graph.addEventListener('layout-warnings', event => showWarnings(event.detail.warnings));
graph.addEventListener('layout-error', event => showRenderError(event.detail));
await graph.renderLayout(result.layout);
```

`showConstraintError`, `showSelectorErrors`, `showWarnings`, and `showRenderError`
are host functions. Surface messages in an accessible status/error region;
`layout-error.detail.fatal === false` means the diagram is present but degraded.
`StructuredInputGraph` also emits `constraint-error`, `constraints-satisfied`,
and `layout-generation-error` as it runs its own pipeline, and exposes
`getCurrentConstraintError()`. Hiding controls does not silence any of these
channels. Source editors, copy/apply actions, and playground links belong to the
host, outside the core viewer.
