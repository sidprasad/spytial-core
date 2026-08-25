/**
 * CSS for the WebColaCnDGraph web component's shadow DOM.
 *
 * Same pattern as `explorer-styles.ts`: the stylesheet lives beside the
 * component instead of inline in it. The component's `getCSS()` passes in
 * the three values that vary per instance (font import, font family, and the
 * light-theme canvas background); everything else is static. Dark theme is
 * not decided here — the stylesheet reads `--cnd-*` custom properties that
 * the component sets on the host element.
 */
export function getGraphCSS({
  fontImports,
  fontFamily,
  canvasBackground,
}: {
  fontImports: string;
  fontFamily: string;
  canvasBackground: string;
}): string {
  return `
      ${fontImports}
      :host {
        display: block;
        width: 100%;
        height: 100%;
        font-family: ${fontFamily};
      }

      /* A column: the toolbar takes the height it needs, the canvas takes the
         rest. It has to divide the height rather than have both children ask
         for it — the canvas used to be height:100% *of the host*, which ignores
         the toolbar stacked above it, so the canvas overhung the host by the
         toolbar's height and the bottom of every diagram was cut off.

         The column lives on this wrapper rather than on :host because a host
         page's own rule for the element (say, one setting display: block on
         webcola-cnd-graph) beats anything :host says, and that would leave the
         canvas with no height at all. Nothing outside can restyle a shadow
         child. */
      #graph-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      #svg-container {
        position: relative; /* Make this the positioning context for zoom controls */
        width: 100%;
        /* Fill what the toolbar leaves. min-height:0 because a flex item will
           not shrink below its content otherwise, which would reinstate the
           overflow this replaced. */
        flex: 1 1 auto;
        min-height: 0;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 8px;
        background-color: var(--cnd-canvas-bg, ${canvasBackground}); /* light: warm-white / background attr; dark: --cnd-canvas-bg */
        overflow: hidden;
      }

      #loading {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: min(65%, 420px);
        padding: 6px 10px;
        background: var(--cnd-loading-bg, rgba(255, 255, 255, 0.93));
        border: 1px solid var(--cnd-panel-border, rgba(0, 0, 0, 0.12));
        border-radius: 999px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
        color: var(--cnd-loading-text, #374151);
        font-size: 12px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: opacity 120ms ease, transform 120ms ease, visibility 0s linear 120ms;
      }

      /* The "nothing to draw" note. Muted, centred, and non-interactive: an
         empty diagram is a result, not an error. */
      #empty-state {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        max-width: 80%;
        padding: 8px 12px;
        text-align: center;
        color: var(--cnd-loading-text, #6b7280);
        font-size: 13px;
        pointer-events: none;
      }

      #empty-state[hidden] {
        display: none;
      }

      #loading.visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .loading-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--cnd-loading-dot, #2563eb);
        flex-shrink: 0;
        animation: loading-pulse 1s ease-in-out infinite;
      }

      /* Selector warnings: a collapsed summary bar, with detail on demand.
         An unresolved name yields an empty set rather than an error, so the
         diagram still renders looking perfectly fine — this bar is the only thing
         saying a constraint silently did nothing. Collapsed rather than expanded
         because these are advisory and, on an animated trace, one fires per
         frame; dismissable because a warning you have already read and decided
         to live with should not keep shouting. */
      #layout-warnings {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1001;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        max-width: min(80%, 420px);
      }

      #layout-warnings[hidden] {
        display: none;
      }

      #layout-warnings-bar {
        display: flex;
        align-items: stretch;
        background: var(--cnd-warning-bg, #fef3c7);
        border: 1px solid var(--cnd-warning-border, #f59e0b);
        border-radius: 6px;
        overflow: hidden;
      }

      #layout-warnings-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        padding: 4px 10px;
        background: none;
        border: none;
        color: var(--cnd-warning-text, #92400e);
        font: inherit;
        font-size: 12px;
        line-height: 1.6;
        text-align: left;
        cursor: pointer;
      }

      #layout-warnings-badge:hover,
      #layout-warnings-dismiss:hover {
        background: var(--cnd-warning-bg-hover, #fde68a);
      }

      #layout-warnings-badge:focus-visible,
      #layout-warnings-dismiss:focus-visible {
        outline: 2px solid var(--cnd-warning-border, #f59e0b);
        outline-offset: -2px;
      }

      #layout-warnings-caret {
        margin-left: auto;
        font-size: 10px;
        transition: transform 120ms ease;
      }

      #layout-warnings-badge[aria-expanded="true"] #layout-warnings-caret {
        transform: rotate(90deg);
      }

      #layout-warnings-dismiss {
        padding: 0 9px;
        background: none;
        border: none;
        border-left: 1px solid var(--cnd-warning-border, #f59e0b);
        color: var(--cnd-warning-text, #92400e);
        font: inherit;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
      }

      #layout-warnings-panel {
        max-height: 260px;
        overflow-y: auto;
        padding: 8px 10px;
        background: var(--cnd-panel-bg, rgba(255, 255, 255, 0.97));
        border: 1px solid var(--cnd-warning-border, #f59e0b);
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
        color: var(--cnd-loading-text, #374151);
        font-size: 12px;
        text-align: left;
      }

      #layout-warnings-panel[hidden] {
        display: none;
      }

      .layout-warning-item + .layout-warning-item {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--cnd-panel-border, rgba(0, 0, 0, 0.12));
      }

      .layout-warning-label {
        font-weight: 600;
      }

      .layout-warning-item code {
        padding: 0 3px;
        background: var(--cnd-code-bg, rgba(0, 0, 0, 0.06));
        border-radius: 3px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .layout-warning-message {
        margin-top: 2px;
      }

      .layout-warning-item[title] {
        cursor: help;
      }

      #loading-progress {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      @keyframes loading-pulse {
        0%, 100% { opacity: 0.4; transform: scale(0.85); }
        50% { opacity: 1; transform: scale(1); }
      }
      
      /* Make SVG fill the container completely */
      svg {
        width: 100%;          /* Fill container width */
        height: 100%;         /* Fill container height */
        display: block;       /* Remove inline spacing */
        cursor: grab;
      }
      
      svg:active {
        cursor: grabbing;
      }
      
      .node rect {
        cursor: move;
      }

      .error-node rect, .error-group {
        stroke-width: 2px;
        stroke-dasharray: 5 5;
        animation: dash 1s linear infinite;
      }

      /* Atoms re-introduced because a constraint references them despite a hideAtom
         directive. Distinct from error nodes: a calmer dashed purple outline + faded
         fill that reads as "shown because needed, but you meant to hide it". */
      .reintroduced-node rect {
        stroke: var(--cnd-reintroduced-stroke, #8e44ad);
        stroke-width: 2px;
        stroke-dasharray: 3 3;
        fill-opacity: 0.55;
      }

      /* Enhanced visibility for small error nodes */
      .small-error-node rect {
        stroke-width: 4px !important; /* Thicker stroke for visibility */
        stroke-dasharray: 8 4 !important; /* Larger dash pattern */
        animation: dash 1s linear infinite, pulse-bg 2s ease-in-out infinite !important;
        fill: rgba(225, 112, 46, 0.46) !important; /* Light reddish background */
      }

      @keyframes dash {
        to {
          stroke-dashoffset: -10;
        }
      }

      /* Pulsing background animation for small error nodes */
      @keyframes pulse-bg {
        0%, 100% { 
          fill-opacity: 0.15; 
        }
        50% { 
          fill-opacity: 0.55; 
        }
      }
      
      .link {
        stroke-width: 1.25px;
        fill: none;
        marker-end: url(#end-arrow);
      }

      .inferredLink {
        stroke-width: 1.5px;
        fill: none;
        marker-end: url(#end-arrow);
      }


    .alignmentLink {
            stroke: transparent !important;    /* make the stroke invisible */
            stroke-width: 0 !important;        /* ensure no visible thickness */
            stroke-opacity: 0 !important;      /* defensive */
            fill: none !important;
            pointer-events: none !important;   /* don't block mouse events */
          }


      .link.highlighted {
        stroke: var(--cnd-edge-highlight, black);
        stroke-width: 3px; /* Change this to your desired highlight width */
      }

      .inferredLink.highlighted {
        stroke: var(--cnd-inferred-highlight, #666666);
        stroke-width: 3px; /* Change this to your desired highlight width */
      }

      /* Node highlighting styles. Also applies to .error-node so hovering a
         conflicting constraint in the error modal highlights the unsat nodes;
         the solid orange stroke + glow overrides the dashed red error style. */
      .node.highlighted rect,
      .error-node.highlighted rect {
        stroke: #ff9500;
        stroke-width: 3px;
        stroke-dasharray: none;
        animation: none;
        filter: drop-shadow(0 0 6px rgba(255, 149, 0, 0.6));
      }

      .node.highlighted-first rect,
      .error-node.highlighted-first rect {
        stroke: #007aff;
        stroke-width: 3px;
        stroke-dasharray: none;
        animation: none;
        filter: drop-shadow(0 0 6px rgba(0, 122, 255, 0.6));
      }

      .node.highlighted-second rect,
      .error-node.highlighted-second rect {
        stroke: #ff3b30;
        stroke-width: 3px;
        stroke-dasharray: none;
        animation: none;
        filter: drop-shadow(0 0 6px rgba(255, 59, 48, 0.6));
      }

      /* Add a badge indicator for first/second in binary selectors */
      .highlight-badge {
        font-size: 10px;
        font-weight: bold;
        fill: white;
        text-anchor: middle;
        pointer-events: none;
      }

      .highlight-badge-bg {
        pointer-events: none;
      }
      
      .group {
        fill: var(--cnd-group-fill, rgba(200, 200, 200, 0.10));
        stroke: var(--cnd-group-stroke, #666);
        stroke-width: 1.5px;
        stroke-opacity: 0.4;
      }

      .groupLabelBg {
        pointer-events: none;
      }
      
      .label {
        text-anchor: middle;
        dominant-baseline: middle;
        font-size: 10px;
        pointer-events: none;
        /* Themed label color. Overrides the per-element fill="black"
           presentation attribute (CSS beats presentation attributes), and
           tspans without their own fill inherit it. */
        fill: var(--cnd-label-text, #1a1a1a);
      }

      .linklabel {
        text-anchor: middle;
        dominant-baseline: middle;
        font-size: 12px;
        font-weight: 500;
        fill: var(--cnd-label-text, #1a1a1a);
        pointer-events: none;
        font-family: ${fontFamily};
        stroke: var(--cnd-canvas-bg, ${canvasBackground});
        stroke-width: 3px;
        stroke-linejoin: round;
        paint-order: stroke fill;
      }

      .mostSpecificTypeLabel {
        font-size: 9px;
        font-weight: 600;
        pointer-events: none;
      }

      /* An icon this package ships is drawn inline (see buildIconElement) with
         its glyph painted in currentColor, so the color it inherits here is the
         glyph's color. It follows the label slot: black-on-warm-white as before
         under the light baseline, light on a dark canvas. An <image> also lands
         on this rule and simply ignores it — an external SVG resolves its own
         currentColor against its own document, which is why bundled icons are
         inlined in the first place. */
      .node-icon {
        color: var(--cnd-label-text, #000);
      }
      
      #error {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background: var(--cnd-panel-bg, white);
        color: var(--cnd-panel-text, inherit);
        border: 1px solid var(--cnd-panel-border, #ccc);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      /* Input mode styles */
      svg.input-mode {
        cursor: crosshair !important;
      }

      svg.input-mode .node rect {
        cursor: crosshair !important;
      }

      svg.input-mode:active {
        cursor: crosshair !important;
      }

      /* Draggable edge endpoint handles (shown only in input mode) */
      .edge-endpoint-marker { transition: opacity 0.12s ease; }
      .edge-endpoint-marker .endpoint-shape {
        transition: stroke-width 0.1s ease, filter 0.1s ease;
      }
      .edge-endpoint-marker:hover .endpoint-shape {
        stroke-width: 3.5;
        filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.35));
      }

      .temporary-edge {
        pointer-events: none;
        z-index: 1000;
      }

      svg.input-mode .link {
        cursor: pointer;
      }

      svg.input-mode .link:hover {
        opacity: 0.8;
      }

      /* Graph toolbar styling */
      #graph-toolbar {
        display: flex;
        /* Keep its own height in the host's column — the canvas below takes
           whatever is left, and squeezing the controls is never the answer. */
        flex: 0 0 auto;
        justify-content: flex-start;
        align-items: center;
        padding: 8px 12px;
        background: var(--cnd-toolbar-bg, rgba(255, 255, 255, 0.95));
        border: 1px solid var(--cnd-panel-border, rgba(0, 0, 0, 0.1));
        border-radius: 6px;
        margin-bottom: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(4px);
      }

      /* Zoom controls styling */
      #zoom-controls {
        display: flex;
        flex-direction: row;
        gap: 8px;
        align-items: center;
      }

      #zoom-controls button {
        width: 24px;
        height: 24px;
        border: 1px solid var(--cnd-control-border, #d1d5db);
        background: var(--cnd-control-bg, #f9fafb);
        color: var(--cnd-panel-text-muted, #374151);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        user-select: none;
        line-height: 1;
      }

      #zoom-controls button:hover {
        background: var(--cnd-control-bg-hover, #f3f4f6);
        border-color: #9ca3af;
        color: var(--cnd-panel-text, #111827);
      }

      #zoom-controls button:active {
        background: #e5e7eb;
        border-color: #6b7280;
        transform: translateY(0.5px);
      }

      #zoom-controls button:disabled {
        background: var(--cnd-control-bg, #f9fafb);
        border-color: #e5e7eb;
        color: #9ca3af;
        cursor: not-allowed;
      }

      #zoom-controls button:disabled:hover {
        background: var(--cnd-control-bg, #f9fafb);
        border-color: #e5e7eb;
        color: #9ca3af;
        transform: none;
      }

      /* Routing control styling */
      #routing-control {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: 16px;
        padding-left: 16px;
        border-left: 1px solid #e5e7eb;
      }

      #routing-control label {
        font-size: 12px;
        font-weight: 500;
        color: #6b7280;
        user-select: none;
      }

      #routing-mode {
        padding: 4px 8px;
        border: 1px solid var(--cnd-control-border, #d1d5db);
        background: var(--cnd-control-bg, #f9fafb);
        color: var(--cnd-panel-text-muted, #374151);
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
        outline: none;
      }

      #routing-mode:hover {
        background: var(--cnd-control-bg-hover, #f3f4f6);
        border-color: #9ca3af;
      }

      #routing-mode:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
      }

      /* Mode (theme) control styling — mirrors the routing control */
      #mode-control {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: 16px;
        padding-left: 16px;
        border-left: 1px solid var(--cnd-control-border, #e5e7eb);
      }

      #mode-control label {
        font-size: 12px;
        font-weight: 500;
        color: var(--cnd-panel-text-muted, #6b7280);
        user-select: none;
      }

      #theme-mode {
        padding: 4px 8px;
        border: 1px solid var(--cnd-control-border, #d1d5db);
        background: var(--cnd-control-bg, #f9fafb);
        color: var(--cnd-panel-text-muted, #374151);
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
        outline: none;
      }

      #theme-mode:hover {
        background: var(--cnd-control-bg-hover, #f3f4f6);
        border-color: #9ca3af;
      }

      #theme-mode:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
      }

      /* Screenshot control styling */
      #screenshot-control {
        display: flex;
        align-items: center;
        margin-left: 16px;
        padding-left: 16px;
        border-left: 1px solid #e5e7eb;
      }

      #screenshot-btn {
        width: 24px;
        height: 24px;
        border: 1px solid var(--cnd-control-border, #d1d5db);
        background: var(--cnd-control-bg, #f9fafb);
        color: var(--cnd-panel-text-muted, #374151);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        user-select: none;
        line-height: 1;
      }

      #screenshot-btn:hover {
        background: var(--cnd-control-bg-hover, #f3f4f6);
        border-color: #9ca3af;
        color: var(--cnd-panel-text, #111827);
      }

      #screenshot-btn:active {
        background: #e5e7eb;
        border-color: #6b7280;
        transform: translateY(0.5px);
      }

      /* Modal Overlay and Dialog */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: ${fontFamily};
      }

      .modal-dialog {
        background: var(--cnd-panel-bg, white);
        color: var(--cnd-panel-text, inherit);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
      }

      .modal-header {
        margin-bottom: 16px;
      }

      .modal-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--cnd-panel-text, #333);
      }

      .modal-body {
        margin-bottom: 20px;
      }

      .modal-message {
        margin: 0 0 16px 0;
        font-size: 14px;
        color: var(--cnd-panel-text-muted, #555);
        line-height: 1.5;
      }

      .modal-input {
        width: 100%;
        padding: 8px 12px;
        border: 2px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      }

      .modal-input:focus {
        outline: none;
        border-color: #007acc;
      }

      .modal-footer {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .modal-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .modal-button.primary {
        background: #007acc;
        color: white;
      }

      .modal-button.primary:hover {
        background: #005fa3;
      }

      .modal-button.secondary {
        background: #f8f9fa;
        color: #666;
        border: 1px solid #ddd;
      }

      .modal-button.secondary:hover {
        background: #e9ecef;
      }
    `;
}
