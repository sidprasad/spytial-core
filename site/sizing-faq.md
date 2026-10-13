# Height and width FAQ

## Can I size `webcola-cnd-graph` with CSS?

Yes. Style the custom element itself with a stylesheet or an inline `style`:

```html
<style>
  #graph {
    width: 100%;
    max-width: 900px;
    height: 480px;
  }
</style>
<webcola-cnd-graph id="graph"></webcola-cnd-graph>
```

The graph fills its container up to 900px wide. Use `width: 640px` for a fixed
width or `height: 60vh` for a viewport-relative height. CSS overrides the
component's default `width: 100%; height: 100%`.

The height includes the toolbar; the canvas takes the remaining space. See
[embedded graph options](embedding.md) to use a compact toolbar or hide it.

## Do `width` and `height` attributes or viewer options set the size?

The component does not read `width` or `height` HTML attributes. Use CSS units in
the `style` attribute instead:

```html
<webcola-cnd-graph style="width: 100%; height: 480px;"></webcola-cnd-graph>
```

There are no width or height fields in `setViewOptions()`. CnD's `size` constraint
sets **node dimensions**, not the viewer's dimensions.

## Why does `width: 100%` still look narrow in an embedded page?

`100%` refers to the containing block's width. A narrow column or a wrapper with
`max-width` limits the graph too. Set the wrapper's width as well:

```html
<style>
  .diagram-frame {
    width: 100%;
    max-width: none;
    min-width: 0;
    height: 480px;
  }

  .diagram-frame > webcola-cnd-graph {
    width: 100%;
    height: 100%;
    min-width: 0;
  }
</style>
<div class="diagram-frame">
  <webcola-cnd-graph id="graph"></webcola-cnd-graph>
</div>
```

Parent containers can still limit this wrapper. In browser developer tools,
inspect the graph's computed dimensions and its ancestors to find the limit or
an overriding style.

For an iframe embed, size the iframe in the outer page **and** the graph in the
iframe's document. The outer page's stylesheet does not reach into an iframe.
For example, in the outer page:

```html
<iframe
  src="diagram.html"
  title="Spatial diagram"
  style="display: block; width: 100%; height: 480px; border: 0;"
></iframe>
```

And in `diagram.html`, alongside the bundle and rendering code:

```html
<style>
  html, body { margin: 0; width: 100%; height: 100%; }
  webcola-cnd-graph {
    width: 100%;
    height: 100%;
    --cnd-canvas-border: none;
  }
</style>
<webcola-cnd-graph id="graph"></webcola-cnd-graph>
<script>
  document.getElementById('graph').setViewOptions({ toolbar: 'compact' });
</script>
```

The graph fills the iframe; compact mode keeps the controls small. To enlarge
the embed, change the iframe or its outer container too.

For an embed inside a shadow root, put the sizing rule in that root or use an
inline style on the graph.

## Why is `height: 100%` collapsed or clipped?

A percentage height needs a definite containing-block height. Give the graph a
height such as `480px` or `60vh`, or give its wrapper a definite height.
`height: auto` or `min-height` alone on an ordinary wrapper is not enough.

The graph does not grow to match its diagram content. For a full-page viewer,
define the height through the page:

```css
html, body { margin: 0; height: 100%; }
webcola-cnd-graph {
  width: 100%;
  height: 100%;
  --cnd-canvas-border: none;
}
```

## How do I let a graph shrink inside flex or grid layouts?

Flex and grid items can have automatic minimum sizes that prevent them from
shrinking. Allow the graph and its containing items to shrink with
`min-width: 0` and `min-height: 0`. For a header above a graph:

```html
<style>
  .diagram-panel {
    display: flex;
    flex-direction: column;
    height: 600px;
    min-width: 0;
    min-height: 0;
  }

  .diagram-panel > header { flex: 0 0 auto; }

  .diagram-panel > webcola-cnd-graph {
    flex: 1 1 0;
    width: 100%;
    height: 0;
    min-width: 0;
    min-height: 0;
  }
</style>
<section class="diagram-panel">
  <header>Diagram</header>
  <webcola-cnd-graph id="graph"></webcola-cnd-graph>
</section>
```

Flex gives the graph the space below the header. In a grid, use
`grid-template-columns: minmax(0, 1fr)` and
`grid-template-rows: auto minmax(0, 1fr)` for tracks that need to shrink, and give
the grid a definite height. For a narrow viewer, use
`await graph.setViewOptions({ toolbar: 'compact' })`.

## Can users drag to resize the graph?

Yes. Put the graph in a wrapper with CSS `resize: both` and let the graph fill
that wrapper. The browser supplies a resize grip in the wrapper's bottom corner:

```html
<style>
  .resizable-graph {
    width: 640px;
    max-width: 100%;
    height: 480px;
    min-width: 280px;
    min-height: 240px;
    resize: both;
    overflow: auto;
    box-sizing: border-box;
    border: 1px solid #ccc;
    /* Leave room for the resize grip outside the interactive canvas. */
    padding: 0 12px 12px 0;
  }

  .resizable-graph > webcola-cnd-graph {
    width: 100%;
    height: 100%;
    --cnd-canvas-border: none;
  }
</style>
<div class="resizable-graph">
  <webcola-cnd-graph id="resizable-graph"></webcola-cnd-graph>
</div>
<script>
  document.getElementById('resizable-graph').setViewOptions({ toolbar: 'compact' });
</script>
```

Load the bundle and render a layout as usual. The box needs no JavaScript resize
handler. Keep `overflow: auto`; CSS resizing does not work with
`overflow: visible`. Use `resize: vertical` or `resize: horizontal` to restrict
the direction, and adjust the size limits to suit your page.

For a custom drag handle, see the
[Spatial Explorer demo source](https://github.com/sidprasad/spytial-core/blob/main/webcola-demo/accessible-demo.html#L82-L105).
It updates a wrapper's width and height. Fitting the diagram after a resize is
covered below.

## Does the diagram automatically fit after a resize or when a hidden tab opens?

Sometimes. Graphs with edge labels can automatically re-fit when resized or
revealed, provided the user has not manually panned or zoomed. Graphs without
edge labels do not use this automatic fitting. After manual pan or zoom,
resizing preserves that view.

To explicitly fit the diagram, use **Fit to View** or call the method once the
graph is visible and the browser has applied its dimensions:

```js
const graph = document.getElementById('graph');

// After the host resizes the container or reveals a hidden panel:
requestAnimationFrame(() => graph.resetViewToFitContent());
```

Render once the container is visible and has a nonzero size when possible. For
animated size changes, fit after the transition finishes. **Fit to View** and
`resetViewToFitContent()` clear the manual pan/zoom state, allowing automatic
fitting again for graphs with edge labels.

For continuous fitting, use `ResizeObserver` to schedule an explicit fit when
dimensions change, and disconnect it on teardown. This overrides the user's
pan and zoom on each resize.

## The viewer is wide, but the nodes still occupy a small area. Why?

CSS sets the viewer's box; it does not stretch the nodes or change the authored
spatial constraints. Fit to View pans and zooms the diagram to fit inside the
canvas, and does not zoom in beyond 1:1. A small diagram can therefore leave
empty space in a large viewer. Use the zoom controls to magnify it, or a CnD
[`size` constraint](constraints.md#size) to change node dimensions.
