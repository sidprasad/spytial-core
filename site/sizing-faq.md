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

This graph fills its containing block up to 900px wide. For a fixed width, use
`width: 640px`; for a viewport-relative height, use `height: 60vh`. These CSS
rules override the component's default `width: 100%; height: 100%`.

The height includes the toolbar. The canvas takes the remaining space, so allow
enough height for both. See [embedded graph options](embedding.md) to use a
compact toolbar or hide it.

## Do `width` and `height` attributes or viewer options set the size?

The component does not read `width` or `height` HTML attributes. Use CSS units in
the `style` attribute instead:

```html
<webcola-cnd-graph style="width: 100%; height: 480px;"></webcola-cnd-graph>
```

There are no width or height fields in `setViewOptions()`. CnD's `size` constraint
sets **node dimensions**, not the viewer's dimensions.

## Why does `width: 100%` still look narrow in an embedded page?

`100%` refers to the containing block's width, not the whole screen. If the host
puts the graph in a narrow column or a wrapper with `max-width`, the graph fills
that narrower area. Set the available width on that wrapper as well:

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

Each ancestor can impose a width limit; removing one wrapper's `max-width` does
not remove limits on its parents. In browser developer tools, inspect the graph's
computed width and height, then inspect its ancestors to find the limiting box.
Check for host stylesheet rules or inline styles overriding your dimensions.

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

Here the graph fills the iframe with a frameless canvas and compact controls
that wrap at narrow widths.
Changing only the graph's CSS cannot enlarge
the iframe or the outer page's container. If the host uses a shadow root for the
embed, put the sizing rule in that root or use an inline style on the graph.

## Why is `height: 100%` collapsed or clipped?

A percentage height needs a definite containing-block height. An ordinary
wrapper with `height: auto` does not provide that. Give the graph a height such
as `480px` or `60vh`, or give the wrapper a definite height as in the example
above. `min-height` alone is not a substitute for that parent height.

The graph does not grow to match its diagram content. An unconstrained
`height: auto` is not a content-sizing mode. For a full-page viewer, define the
height through the page:

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

Flex distributes the space remaining below the header to the graph. In a grid,
use tracks such as `grid-template-columns: minmax(0, 1fr)` and
`grid-template-rows: auto minmax(0, 1fr)` when those tracks need to shrink, and
give the grid a definite height. For a narrow viewer, opt into wrapping controls
with `await graph.setViewOptions({ toolbar: 'compact' })`.

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

Load the bundle and render a layout as usual. No JavaScript resize handler is
needed for the box itself. `overflow: auto` enables CSS resizing; leaving the
wrapper at `overflow: visible` does not. Use `resize: vertical` or
`resize: horizontal` to allow only one direction, and adjust the minimum and
maximum dimensions to suit the host.

Resizing retains the current pan and zoom. Use **Fit to View** afterward to
re-fit the diagram, as described below. If the host needs its own drag handle,
the [Spatial Explorer demo](../webcola-demo/accessible-demo.html) shows a custom
handle that updates a wrapper's width and height. A custom handle can also call
`resetViewToFitContent()` once the resize gesture ends.

## Does the diagram automatically fit after a resize or when a hidden tab opens?

The CSS box resizes, but a box resize does not automatically trigger a fit.
Once the graph is visible and the browser has applied its dimensions, use the
toolbar's **Fit to View** button or call:

```js
const graph = document.getElementById('graph');

// After the host resizes the container or reveals a hidden panel:
requestAnimationFrame(() => graph.resetViewToFitContent());
```

Prefer rendering once the container is visible and has a nonzero size. If you
rendered while hidden, re-fit after revealing it. For animated size changes,
fit after the transition finishes. Hosts that need continuous fitting can
observe the graph with `ResizeObserver` and schedule a fit when its dimensions
change; disconnect the observer on teardown. Automatic fitting resets the
user's current pan and zoom, so choose when to do it deliberately.

## The viewer is wide, but the nodes still occupy a small area. Why?

CSS sets the viewer's box; it does not stretch the nodes or change the authored
spatial constraints. Fit to View pans and zooms the diagram to fit inside the
canvas, and does not zoom in beyond 1:1. A small diagram can therefore leave
empty space in a large viewer. Use the zoom controls to magnify it, or a CnD
[`size` constraint](constraints.md#size) to change node dimensions.
