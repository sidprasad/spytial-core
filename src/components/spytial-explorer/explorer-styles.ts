/**
 * CSS styles for the SpytialExplorer web component.
 * Scoped to Shadow DOM — no global leakage.
 */
export function getExplorerCSS(): string {
    return /* css */ `
    :host {
        display: flex;
        flex-direction: column;
        font-family: system-ui, -apple-system, sans-serif;
        color: #333;
        --accent: #5a3d8a;
        --accent-light: #f0eef8;
        --accent-border: #c4b8e0;
        --focus-ring: #007acc;
        --repl-bg: #1e1e1e;
        --repl-fg: #d4d4d4;
        --success: #2e7d32;
        --error: #c62828;
    }

    /* Override parent's svg-container to share height with explorer panel */
    #svg-container {
        flex: 1;
        min-height: 200px;
        height: auto !important;
    }

    #se-explorer-panel {
        flex-shrink: 0;
        padding: 8px 0;
    }

    /* ─── Layout ─────────────────────────────────────────────── */

    .explorer-root {
        max-width: 1400px;
        margin: 0 auto;
    }

    .explorer-header {
        padding: 16px 20px;
        margin-bottom: 16px;
    }

    .explorer-header h1 {
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 8px 0;
    }

    .explorer-header p {
        font-size: 14px;
        color: #555;
        margin: 0;
        line-height: 1.5;
    }

    .explorer-header code {
        background: var(--accent-light);
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 13px;
        color: var(--accent);
    }

    /* Collapsible input */
    details.input-panel {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin-bottom: 16px;
        padding: 0;
    }

    details.input-panel summary {
        cursor: pointer;
        padding: 12px 20px;
        font-weight: 600;
        font-size: 14px;
        color: #555;
        user-select: none;
    }

    details.input-panel summary:hover {
        color: var(--accent);
    }

    details.input-panel .input-body {
        padding: 0 20px 16px;
    }

    details.input-panel label {
        font-weight: 600;
        font-size: 13px;
        display: block;
        margin-bottom: 4px;
        margin-top: 12px;
    }

    details.input-panel textarea {
        width: 100%;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        resize: vertical;
        box-sizing: border-box;
    }

    .json-input { height: 180px; }
    .cnd-input { height: 100px; }

    /* ─── Main grid ──────────────────────────────────────────── */

    .explorer-main {
        display: flex;
        gap: 16px;
        align-items: stretch;
    }

    .left-panel {
        flex: 2;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .right-panel {
        flex: 1;
        min-width: 320px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    @media (max-width: 900px) {
        .explorer-main {
            flex-direction: column;
        }
        .right-panel {
            min-width: unset;
        }
    }

    /* ─── Visual graph ───────────────────────────────────────── */

    .graph-container {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        overflow: hidden;
        position: relative;
    }

    .graph-container webcola-cnd-graph {
        display: block;
    }

    /* ─── Navigator (ARIA tree) ──────────────────────────────── */

    .navigator-container {
        background: #fff;
        border: 2px solid var(--accent);
        border-radius: 8px;
        padding: 12px 16px;
    }

    .navigator-label {
        font-weight: 600;
        font-size: 13px;
        color: var(--accent);
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .navigator-hint {
        font-weight: 400;
        font-size: 12px;
        color: #888;
    }

    .navigator-output [role="graphics-document"] {
        font-family: system-ui, sans-serif;
    }

    .navigator-output .diagram-overview {
        font-size: 13px;
        color: #555;
        margin: 0 0 10px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid #eee;
    }

    .navigator-output [role="treeitem"] {
        padding: 6px 10px;
        margin: 3px 0;
        border-radius: 5px;
        border: 1px solid #e8e8e8;
        cursor: pointer;
        outline: none;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 5px;
        font-size: 14px;
    }

    .navigator-output [role="treeitem"]:hover {
        background: #f5f5f5;
    }

    .navigator-output [role="treeitem"]:focus {
        background: #e8f0fe;
        box-shadow: 0 0 0 2px var(--focus-ring);
        border-color: var(--focus-ring);
    }

    .navigator-output .node-label {
        font-weight: 600;
    }

    .navigator-output .node-type {
        font-size: 11px;
        background: #e8e8e8;
        color: #555;
        padding: 1px 6px;
        border-radius: 3px;
        font-weight: 500;
    }

    .navigator-output .node-attrs {
        display: flex;
        gap: 3px;
        flex-wrap: wrap;
    }

    .navigator-output .node-attr {
        font-size: 11px;
        background: #eef6ff;
        color: #1a5276;
        padding: 1px 6px;
        border-radius: 3px;
    }

    .navigator-output .attr-key {
        font-weight: 600;
    }

    .navigator-output .node-connections {
        width: 100%;
        display: flex;
        gap: 3px;
        flex-wrap: wrap;
        margin-top: 2px;
    }

    .navigator-output .node-edge {
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 3px;
    }

    .navigator-output .node-edge-out {
        background: #f0faf0;
        color: #1e6e1e;
    }

    .navigator-output .node-edge-in {
        background: #fef5e7;
        color: #7d5a00;
    }

    .navigator-output .group-label {
        font-weight: 600;
    }

    .navigator-output .node-count {
        font-weight: 400;
        color: #888;
    }

    .navigator-output [role="group"] {
        padding-left: 14px;
        border-left: 2px solid #ddd;
        margin-left: 6px;
        margin-top: 4px;
    }

    .navigator-output .diagram-relationships,
    .navigator-output .diagram-spatial {
        margin-top: 12px;
    }

    .navigator-output h3 {
        font-size: 13px;
        font-weight: 600;
        margin: 0 0 6px 0;
        color: #333;
    }

    .navigator-output table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }

    .navigator-output th,
    .navigator-output td {
        border: 1px solid #e0e0e0;
        padding: 4px 8px;
        text-align: left;
    }

    .navigator-output th {
        background: #f5f5f5;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #666;
    }

    .navigator-output .diagram-spatial ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .navigator-output .diagram-spatial li {
        padding: 3px 0;
        font-size: 12px;
        color: #444;
    }

    .navigator-output .diagram-spatial em {
        color: var(--accent);
        font-style: normal;
        font-weight: 500;
    }

    /* ─── Context panel ──────────────────────────────────────── */

    .context-panel {
        background: var(--accent-light);
        border: 1px solid var(--accent-border);
        border-radius: 6px;
        padding: 12px 16px;
    }

    .context-panel-label {
        font-weight: 600;
        font-size: 13px;
        color: var(--accent);
        margin-bottom: 6px;
    }

    .context-content {
        font-size: 13px;
        line-height: 1.5;
    }

    .context-direction {
        display: inline-block;
        background: #e8e0f5;
        padding: 1px 8px;
        border-radius: 3px;
        margin: 2px 4px 2px 0;
        font-size: 12px;
    }

    .context-group {
        display: inline-block;
        background: #e0f0e0;
        padding: 1px 8px;
        border-radius: 3px;
        margin: 2px 4px 2px 0;
        font-size: 12px;
    }

    .context-group kbd {
        font-size: 10px;
        background: #c0d8c0;
        padding: 0 4px;
        border-radius: 2px;
        margin-left: 4px;
    }

    /* ─── Modality badges ───────────────────────────────────── */

    .modality-badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 0 5px;
        border-radius: 3px;
        vertical-align: middle;
    }

    .modality-must {
        background: #c8e6c9;
        color: #2e7d32;
    }

    .modality-can {
        background: #fff3e0;
        color: #e65100;
    }

    .modality-unconstrained {
        background: #e0e0e0;
        color: #616161;
    }

    /* ─── REPL shared ────────────────────────────────────────── */

    .repl-section {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 12px 16px;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .repl-label {
        font-weight: 600;
        font-size: 13px;
        color: #333;
        margin-bottom: 2px;
    }

    .repl-hint {
        font-size: 12px;
        color: #888;
        margin-bottom: 8px;
    }

    .repl-input-row {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
    }

    .repl-input {
        flex: 1;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        padding: 6px 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        outline: none;
    }

    .repl-input:focus {
        border-color: var(--focus-ring);
        box-shadow: 0 0 0 1px var(--focus-ring);
    }

    .repl-button {
        background-color: var(--focus-ring);
        color: white;
        border: none;
        padding: 6px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
    }

    .repl-button:hover { background-color: #005a9e; }
    .repl-button:disabled { background-color: #ccc; cursor: not-allowed; }

    .repl-output {
        font-family: 'Courier New', monospace;
        font-size: 11px;
        background: var(--repl-bg);
        color: var(--repl-fg);
        padding: 8px 10px;
        border-radius: 4px;
        min-height: 32px;
        max-height: 150px;
        overflow-y: auto;
        white-space: pre-wrap;
        line-height: 1.4;
    }

    /* ─── Query result atoms ─────────────────────────────────── */

    .query-result-atom {
        cursor: pointer;
        text-decoration: underline;
        text-decoration-style: dotted;
        color: #ce9178;
    }

    .query-result-atom:hover,
    .query-result-atom:focus {
        text-decoration-style: solid;
        color: #4ec9b0;
        outline: 1px solid #4ec9b0;
        outline-offset: 1px;
        border-radius: 2px;
    }

    .result-error { color: #f44336; }
    .result-empty { color: #888; }
    .result-brace { color: #9cdcfe; }
    .result-count { color: #666; }
    .result-query { color: #4ec9b0; }
    .result-prompt { color: #888; }

    /* ─── Status ─────────────────────────────────────────────── */

    .status-bar {
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 13px;
        margin-top: 8px;
    }

    .status-bar.info { background: #e3f2fd; color: #1976d2; }
    .status-bar.success { background: #e8f5e8; color: var(--success); }
    .status-bar.error { background: #ffebee; color: var(--error); }

    /* ─── Translate button ───────────────────────────────────── */

    .translate-button {
        background-color: var(--accent);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        margin-top: 8px;
    }

    .translate-button:hover { background-color: #4a2d7a; }

    /* ─── Utility ────────────────────────────────────────────── */

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0,0,0,0);
        border: 0;
    }

    .highlight-flash {
        outline: 3px solid #4ec9b0 !important;
    }

    /* ─── Navigation mode toolbar ────────────────────────────────── */

    .nav-mode-toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 4px;
        margin: 4px;
        font-size: 12px;
    }

    .nav-mode-toolbar [role="radio"] {
        background: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 3px 8px;
        font-size: 11px;
        cursor: pointer;
        font-weight: 500;
        color: #555;
    }

    .nav-mode-toolbar [role="radio"]:hover {
        background: #e8e0f5;
    }

    .nav-mode-toolbar [role="radio"][aria-checked="true"] {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
    }

    .relation-key-hint {
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: #888;
        margin-left: 6px;
    }
    `;
}
