/**
 * SpytialExplorer — extends WebColaCnDGraph with Data Navigator integration.
 *
 * Drop-in replacement for <webcola-cnd-graph> that adds:
 *   - Data Navigator overlay on SVG nodes (keyboard-navigable, screen-reader-announced)
 *   - Modal spatial annotations (must/can on every neighbor relationship)
 *   - Group navigation (Enter to drill into a group, Esc to leave)
 *   - Spatial context panel (live-updates on node focus with constraint-derived neighbors)
 *   - Spatial REPL (must/can/cannot modal queries — replaces drag-to-explore)
 *   - Datum REPL (data instance queries)
 *
 * Usage:
 *   <spytial-explorer width="800" height="600"></spytial-explorer>
 *   <script>
 *     const explorer = document.querySelector('spytial-explorer');
 *     // Same API as webcola-cnd-graph:
 *     explorer.renderLayout(instanceLayout);
 *     // Plus: set up accessibility from layout + validator
 *     explorer.enableAccessibility(instanceLayout, validator, dataEvaluator);
 *   </script>
 */

import { WebColaCnDGraph } from '../../translators/webcola/webcola-cnd-graph';
import { AccessibleTranslator } from '../../translators/accessible/accessible-translator';
import { LayoutEvaluator } from '../../evaluators/layout/layout-evaluator';
import { getExplorerCSS } from './explorer-styles';
import type { AccessibleLayout, SpatialNeighbors } from '../../translators/accessible/accessible-translator';
import type { InstanceLayout, LayoutGroup, LayoutEdge } from '../../layout/interfaces';
import type { QualitativeConstraintValidator } from '../../layout/qualitative-constraint-validator';
import type { SGraphQueryEvaluator } from '../../evaluators/data/sgq-evaluator';
// Data Navigator — structure and input modules (rendering done manually for Shadow DOM compat)
import dataNavigator from 'data-navigator';

// ─── Types ─────────────────────────────────────────────────────────────────

type Modality = 'must' | 'can' | 'unconstrained';

/** Direction names as used by the QualitativeConstraintValidator API */
type ValidatorDirection = 'leftOf' | 'rightOf' | 'above' | 'below';

/** Spatial direction as used internally (arrow keys / nav map) */
type SpatialDir = 'left' | 'right' | 'up' | 'down';

/** Navigation modes — how arrow keys are interpreted */
type NavigationMode = 'spatial' | 'must' | 'relations';

interface AnnotatedNeighbor {
    nodeId: string;
    direction: SpatialDir;
    modality: Modality;
}

interface QueryHistoryEntry {
    expr: string;
    html: string;
    srText: string;
}

/** Maps arrow keys to DN navigation rule labels */
type NavigationRuleSet = Record<string, { key: string; direction: 'target' | 'source' }>;

// ─── Component ─────────────────────────────────────────────────────────────

export class SpytialExplorer extends WebColaCnDGraph {
    // Accessibility state
    private accessibleLayout: AccessibleLayout | null = null;
    private layoutEvaluator: LayoutEvaluator | null = null;
    private constraintValidator: QualitativeConstraintValidator | null = null;
    private dataEvaluator: SGraphQueryEvaluator | null = null;
    private currentInstanceLayout: InstanceLayout | null = null;

    // Data Navigator state
    private dnInputHandler: any = null;
    private dnCurrentFocusId: string | null = null;
    private dnOverlayContainer: HTMLElement | null = null;

    // Group navigation state
    private groupStack: string[] = [];          // stack of group names we've entered
    private groupMemberMap: Map<string, string[]> = new Map(); // groupName → nodeIds
    private nodeGroupMap: Map<string, string[]> = new Map();   // nodeId → groupNames

    // Navigation mode state
    private currentNavMode: NavigationMode = 'spatial';
    private spatialRules: NavigationRuleSet = {};
    private mustRules: NavigationRuleSet = {};
    private relationRules: NavigationRuleSet = {};
    private relationKeyMap: Array<{ key: string; label: string; relationName: string }> = [];
    private zoomObserver: MutationObserver | null = null;

    // Query histories
    private spatialHistory: QueryHistoryEntry[] = [];
    private datumHistory: QueryHistoryEntry[] = [];

    // DOM references within shadow root
    private explorerPanel: HTMLElement | null = null;

    constructor() {
        super();
        this.appendExplorerDOM();
        this.wireExplorerEvents();
    }

    // ─── Public API ────────────────────────────────────────────────────

    /**
     * Enable accessibility features after a layout has been rendered.
     * Call this after renderLayout() with the validator and evaluator
     * from the layout pipeline.
     */
    public enableAccessibility(
        layout: InstanceLayout,
        validator: QualitativeConstraintValidator | null,
        dataEvaluator?: SGraphQueryEvaluator,
    ): void {
        this.currentInstanceLayout = layout;
        this.constraintValidator = validator;

        // Build accessible representation
        const translator = new AccessibleTranslator();
        this.accessibleLayout = translator.translate(layout);

        // Layout evaluator for spatial REPL
        this.layoutEvaluator = validator
            ? new LayoutEvaluator(validator, layout)
            : null;

        // Datum evaluator for data REPL
        if (dataEvaluator) this.dataEvaluator = dataEvaluator;

        // Build group maps
        this.buildGroupMaps(layout.groups);

        // Enable REPL buttons
        this.enableREPLs();

        // Set up Data Navigator after the layout simulation settles
        // (zoom-to-fit must complete before we can read SVG positions)
        this.addEventListener('layout-complete', () => {
            // Extra frame to ensure the zoom transform is applied to the DOM
            requestAnimationFrame(() => this.setupDataNavigator());
        }, { once: true });

        // If layout already completed (e.g., enableAccessibility called late),
        // set up immediately
        if (this.getNodePositions().length > 0) {
            const t = this.getCurrentTransform();
            if (t.k !== 1 || t.x !== 0 || t.y !== 0) {
                // Transform already applied — set up now
                requestAnimationFrame(() => this.setupDataNavigator());
            }
        }
    }

    /**
     * Override renderLayout to stash the instance layout for later use.
     */
    public async renderLayout(instanceLayout: InstanceLayout, options?: any): Promise<void> {
        this.currentInstanceLayout = instanceLayout;
        return super.renderLayout(instanceLayout, options);
    }

    // ─── Group Maps ───────────────────────────────────────────────────

    private buildGroupMaps(groups: LayoutGroup[]): void {
        this.groupMemberMap.clear();
        this.nodeGroupMap.clear();

        for (const group of groups) {
            if (group.negated) continue;
            this.groupMemberMap.set(group.name, [...group.nodeIds]);
            for (const nodeId of group.nodeIds) {
                if (!this.nodeGroupMap.has(nodeId)) this.nodeGroupMap.set(nodeId, []);
                this.nodeGroupMap.get(nodeId)!.push(group.name);
            }
        }
    }

    // ─── Modality ─────────────────────────────────────────────────────

    /**
     * Determine whether a neighbor relationship is must, can, or unconstrained.
     *
     * For example, if Node1 is the left neighbor of Node0 in the current layout,
     * this checks: is Node1 in validator.getMust(Node0, 'leftOf')?
     *   - yes → 'must'  (in ALL valid layouts, Node1 is left of Node0)
     *   - no  → 'can'   (in THIS layout it is, but other valid layouts may differ)
     * If no validator is available, returns 'unconstrained'.
     */
    private getModality(
        fromNodeId: string,
        direction: SpatialDir,
        toNodeId: string,
    ): Modality {
        if (!this.constraintValidator) return 'unconstrained';

        const validatorDir = this.spatialDirToValidatorDir(direction);
        try {
            const mustSet = this.constraintValidator.getMust(fromNodeId, validatorDir);
            if (mustSet.has(toNodeId)) return 'must';
            return 'can';
        } catch {
            return 'unconstrained';
        }
    }

    /**
     * Map our spatial direction names to the validator's relation names.
     * "left neighbor" = "that node is leftOf this node"
     */
    private spatialDirToValidatorDir(dir: SpatialDir): ValidatorDirection {
        switch (dir) {
            case 'left': return 'leftOf';
            case 'right': return 'rightOf';
            case 'up': return 'above';
            case 'down': return 'below';
        }
    }

    /**
     * Get all annotated neighbors for a node — each neighbor tagged with its modality.
     */
    private getAnnotatedNeighbors(nodeId: string): AnnotatedNeighbor[] {
        if (!this.accessibleLayout) return [];

        const nav = this.accessibleLayout.navigation;
        const nb = nav.getNeighbors(nodeId);
        if (!nb) return [];

        const result: AnnotatedNeighbor[] = [];
        const pairs: Array<[SpatialDir, string | null]> = [
            ['left', nb.left],
            ['right', nb.right],
            ['up', nb.above],
            ['down', nb.below],
        ];

        for (const [dir, targetId] of pairs) {
            if (!targetId) continue;
            result.push({
                nodeId: targetId,
                direction: dir,
                modality: this.getModality(nodeId, dir, targetId),
            });
        }

        return result;
    }

    // ─── Shadow DOM Extension ──────────────────────────────────────────

    /**
     * Append the explorer panel (context + REPLs) and DN overlay container
     * to the shadow root created by WebColaCnDGraph.
     */
    private appendExplorerDOM(): void {
        const shadow = this.shadowRoot!;

        // Add explorer CSS
        const style = document.createElement('style');
        style.textContent = getExplorerCSS();
        shadow.appendChild(style);

        // Data Navigator overlay container — positioned over the SVG
        this.dnOverlayContainer = document.createElement('div');
        this.dnOverlayContainer.id = 'dn-overlay-root';
        this.dnOverlayContainer.setAttribute('role', 'application');
        this.dnOverlayContainer.setAttribute('aria-label', 'Diagram navigation. Arrow keys move between nodes. Press 1 for spatial mode, 2 for must-only mode, 3 for relation mode. Enter to go into a group. Escape to leave.');
        this.dnOverlayContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';

        // Insert into the svg-container (which has position: relative)
        const svgContainer = shadow.querySelector('#svg-container');
        if (svgContainer) {
            (svgContainer as HTMLElement).style.position = 'relative';
            svgContainer.appendChild(this.dnOverlayContainer);
        }

        // Screen-reader live region for spatial announcements
        const liveRegion = document.createElement('div');
        liveRegion.id = 'se-live-region';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        shadow.appendChild(liveRegion);

        // Explorer panel below the graph
        this.explorerPanel = document.createElement('div');
        this.explorerPanel.id = 'se-explorer-panel';
        this.explorerPanel.innerHTML = `
            <!-- Spatial context -->
            <div class="context-panel" role="region" aria-label="Spatial context for focused node">
                <div class="context-panel-label">Spatial Context</div>
                <div class="context-content" id="se-context">
                    Navigate to a node to see its spatial context.
                </div>
            </div>

            <!-- Spatial REPL -->
            <div class="repl-section" role="region" aria-label="Spatial query REPL">
                <div class="repl-label">Spatial Queries</div>
                <div class="repl-hint">
                    <code>must.rightOf(Node0)</code> &middot;
                    <code>can.leftOf(Node1)</code> &middot;
                    <code>cannot.above(Node2)</code>
                </div>
                <div class="repl-input-row">
                    <label for="se-spatial-input" class="sr-only">Spatial query expression</label>
                    <input type="text" id="se-spatial-input" class="repl-input"
                           placeholder="must.rightOf(Node0)"
                           aria-describedby="se-spatial-hint">
                    <span id="se-spatial-hint" class="sr-only">
                        Enter a spatial query like must.rightOf(Node0) and press Enter.
                        Results are clickable — activate a result to navigate to that node.
                    </span>
                    <button class="repl-button" id="se-spatial-btn" disabled>Query</button>
                </div>
                <div class="repl-output" id="se-spatial-output"
                     role="log" aria-label="Spatial query results" aria-live="polite">
<span class="result-prompt">//</span> Run enableAccessibility() first, then enter a spatial query.
<span class="result-prompt">//</span>
<span class="result-prompt">//</span> <strong>must</strong>  — true in ALL valid layouts
<span class="result-prompt">//</span> <strong>can</strong>   — true in SOME valid layout
<span class="result-prompt">//</span> <strong>cannot</strong> — true in NO valid layout
                </div>
            </div>

            <!-- Datum REPL -->
            <div class="repl-section" role="region" aria-label="Data query REPL">
                <div class="repl-label">Data Queries</div>
                <div class="repl-hint">
                    <code>Node</code> &middot;
                    <code>Node.left</code> &middot;
                    <code>Node.left.val</code>
                </div>
                <div class="repl-input-row">
                    <label for="se-datum-input" class="sr-only">Data query expression</label>
                    <input type="text" id="se-datum-input" class="repl-input"
                           placeholder="Node.left.val"
                           aria-describedby="se-datum-hint">
                    <span id="se-datum-hint" class="sr-only">
                        Enter a data query like Node.left.val and press Enter.
                    </span>
                    <button class="repl-button" id="se-datum-btn" disabled>Query</button>
                </div>
                <div class="repl-output" id="se-datum-output"
                     role="log" aria-label="Data query results" aria-live="polite">
<span class="result-prompt">//</span> Run enableAccessibility() first, then enter a data query.
                </div>
            </div>
        `;
        shadow.appendChild(this.explorerPanel);
    }

    // ─── Event Wiring ──────────────────────────────────────────────────

    private wireExplorerEvents(): void {
        const shadow = this.shadowRoot!;

        // Spatial REPL
        shadow.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.id === 'se-spatial-btn') this.executeSpatialQuery();
            if (target.id === 'se-datum-btn') this.executeDatumQuery();
            if (target.classList.contains('query-result-atom')) {
                this.navigateToNode(target.dataset.nodeId!);
            }
        });

        shadow.addEventListener('keydown', (e) => {
            const target = e.target as HTMLElement;
            if (target.id === 'se-spatial-input' && e.key === 'Enter') this.executeSpatialQuery();
            if (target.id === 'se-datum-input' && e.key === 'Enter') this.executeDatumQuery();
            if (target.classList.contains('query-result-atom') && e.key === 'Enter') {
                this.navigateToNode(target.dataset.nodeId!);
            }
        });
    }

    // ─── Data Navigator Integration ────────────────────────────────────

    /**
     * Build a Data Navigator structure from the spatial navigation map
     * and overlay focusable elements on the SVG.
     *
     * Positioning uses getBoundingClientRect() on actual SVG elements,
     * which automatically handles zoom/pan transforms.
     */
    private setupDataNavigator(): void {
        if (!this.accessibleLayout || !this.currentInstanceLayout) return;

        const shadow = this.shadowRoot!;
        const nav = this.accessibleLayout.navigation;
        const nodeDescs = this.accessibleLayout.description.nodes;
        const layout = this.currentInstanceLayout;

        // Build a map from node ID → SVG <g> element via D3's __data__ binding
        const svgNodeMap = this.buildSVGNodeMap();
        if (svgNodeMap.size === 0) return;

        const svgContainer = shadow.querySelector('#svg-container') as HTMLElement;
        if (!svgContainer) return;

        const descMap = new Map(nodeDescs.map(d => [d.id, d]));

        // ─── Build DN structure with multi-label edges ────────────────
        const dnNodes: Record<string, any> = {};
        const dnEdges: Record<string, any> = {};
        const dnElementData: Record<string, any> = {};
        let edgeCounter = 0;

        // Track which node IDs have DN nodes (for relation edge filtering)
        const dnNodeIds = new Set<string>();

        for (const [nodeId, neighbors] of nav.entries()) {
            if (!svgNodeMap.has(nodeId)) continue;
            dnNodeIds.add(nodeId);

            const renderId = `dn-node-${this.sanitizeId(nodeId)}`;
            const desc = descMap.get(nodeId);
            const nodeEdges: string[] = [];

            // Create multi-label edges for each spatial direction
            const directions: Array<[SpatialDir, string | null]> = [
                ['left', neighbors.left],
                ['right', neighbors.right],
                ['up', neighbors.above],
                ['down', neighbors.below],
            ];

            for (const [dir, targetId] of directions) {
                if (!targetId) continue;
                // Multi-label: spatial_* always, must_* when constraint-guaranteed
                const labels = [`spatial_${dir}`];
                if (this.getModality(nodeId, dir, targetId) === 'must') {
                    labels.push(`must_${dir}`);
                }
                const edgeId = `e${edgeCounter++}`;
                dnEdges[edgeId] = {
                    source: nodeId,
                    target: targetId,
                    navigationRules: labels,
                };
                nodeEdges.push(edgeId);
            }

            dnNodes[nodeId] = {
                id: nodeId,
                edges: nodeEdges,
                renderId,
                label: desc?.label ?? nodeId,
                type: desc?.mostSpecificType ?? '',
            };

            // Element data — positions computed from getBoundingClientRect
            dnElementData[renderId] = {
                semantics: {
                    label: () => this.buildNodeAnnouncement(nodeId),
                    role: 'button',
                },
                cssClass: 'dn-spatial-node',
            };
        }

        // ─── Add relation edges from the layout ──────────────────────
        // These let users follow named data relations (left, right, val, etc.)
        const relationNames = this.addRelationEdges(layout.edges, dnNodes, dnEdges, dnNodeIds, edgeCounter);

        // ─── Build navigation rule sets ──────────────────────────────

        this.spatialRules = {
            spatial_left:  { key: 'ArrowLeft',  direction: 'target' },
            spatial_right: { key: 'ArrowRight', direction: 'target' },
            spatial_up:    { key: 'ArrowUp',    direction: 'target' },
            spatial_down:  { key: 'ArrowDown',  direction: 'target' },
        };

        this.mustRules = {
            must_left:  { key: 'ArrowLeft',  direction: 'target' },
            must_right: { key: 'ArrowRight', direction: 'target' },
            must_up:    { key: 'ArrowUp',    direction: 'target' },
            must_down:  { key: 'ArrowDown',  direction: 'target' },
        };

        this.buildRelationRules(relationNames);

        const dnStructure = {
            nodes: dnNodes,
            edges: dnEdges,
            navigationRules: this.spatialRules,
            elementData: dnElementData,
        };

        // ─── Build DN input handler ────────────────────────────────────

        this.dnInputHandler = dataNavigator.input({
            structure: dnStructure,
            navigationRules: this.spatialRules,
            entryPoint: nav.nodeOrder[0],
        });

        // ─── Render DN overlay nodes ───────────────────────────────────

        this.renderDNOverlay(dnStructure, svgNodeMap, svgContainer);

        // ─── Wire keyboard + zoom tracking ─────────────────────────────

        this.wireDNKeyboard();
        this.setupZoomTracking(svgContainer, svgNodeMap);
    }

    /**
     * Build a map from node ID → SVG <g> DOM element by reading
     * D3's __data__ binding on each rendered node group.
     */
    private buildSVGNodeMap(): Map<string, SVGGElement> {
        const shadow = this.shadowRoot!;
        const result = new Map<string, SVGGElement>();
        const nodeGroups = shadow.querySelectorAll('g.node, g.error-node');
        for (const g of nodeGroups) {
            const d = (g as any).__data__;
            if (d && d.id) {
                result.set(d.id, g as SVGGElement);
            }
        }
        return result;
    }

    /**
     * Add DN edges for data relations (left, right, val, etc.) from the layout.
     * Returns the set of unique relation names found.
     */
    private addRelationEdges(
        edges: LayoutEdge[],
        dnNodes: Record<string, any>,
        dnEdges: Record<string, any>,
        dnNodeIds: Set<string>,
        edgeCounter: number,
    ): string[] {
        const seenRelations = new Set<string>();

        for (const edge of edges) {
            const relName = edge.relationName || edge.label;
            if (!relName) continue;
            // Skip group edges
            if (edge.groupId) continue;

            const sourceId = edge.source.id;
            const targetId = edge.target.id;

            // Only add edges between nodes that exist in our DN graph
            if (!dnNodeIds.has(sourceId) || !dnNodeIds.has(targetId)) continue;

            seenRelations.add(relName);

            const edgeId = `rel_e${edgeCounter++}`;
            dnEdges[edgeId] = {
                source: sourceId,
                target: targetId,
                navigationRules: [`rel_${relName}`],
            };

            // Ensure both nodes list this edge
            if (dnNodes[sourceId]) dnNodes[sourceId].edges.push(edgeId);
        }

        return [...seenRelations];
    }

    /**
     * Build the relation navigation rule set — maps the first 4 relations
     * to arrow keys in declaration order.
     */
    private buildRelationRules(relationNames: string[]): void {
        const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
        const labels = ['←', '↑', '→', '↓'];

        this.relationRules = {};
        this.relationKeyMap = [];

        for (let i = 0; i < Math.min(relationNames.length, keys.length); i++) {
            const ruleLabel = `rel_${relationNames[i]}`;
            this.relationRules[ruleLabel] = { key: keys[i], direction: 'target' };
            this.relationKeyMap.push({
                key: labels[i],
                label: relationNames[i],
                relationName: relationNames[i],
            });
        }
    }

    /**
     * Set up a MutationObserver on the zoomable SVG group to reposition
     * overlay nodes when the user zooms or pans.
     */
    private setupZoomTracking(svgContainer: HTMLElement, svgNodeMap: Map<string, SVGGElement>): void {
        // Clean up previous observer
        if (this.zoomObserver) {
            this.zoomObserver.disconnect();
            this.zoomObserver = null;
        }

        const zoomableG = this.shadowRoot!.querySelector('g.zoomable');
        if (!zoomableG) return;

        this.zoomObserver = new MutationObserver(() => {
            this.repositionOverlayNodes(svgContainer, svgNodeMap);
        });
        this.zoomObserver.observe(zoomableG, { attributes: true, attributeFilter: ['transform'] });
    }

    /**
     * Reposition all overlay nodes to match current SVG node positions.
     * Called after zoom/pan changes.
     */
    private repositionOverlayNodes(svgContainer: HTMLElement, svgNodeMap: Map<string, SVGGElement>): void {
        if (!this.dnOverlayContainer) return;

        const containerRect = svgContainer.getBoundingClientRect();
        const MIN_NODE_SIZE = 24;

        for (const el of this.dnOverlayContainer.querySelectorAll('.dn-spatial-node')) {
            const nodeId = (el as HTMLElement).dataset.nodeId;
            if (!nodeId) continue;

            const svgG = svgNodeMap.get(nodeId);
            if (!svgG) continue;

            const rect = svgG.getBoundingClientRect();
            const w = Math.max(rect.width, MIN_NODE_SIZE);
            const h = Math.max(rect.height, MIN_NODE_SIZE);
            const x = rect.left - containerRect.left + (rect.width - w) / 2;
            const y = rect.top - containerRect.top + (rect.height - h) / 2;

            (el as HTMLElement).style.left = `${x}px`;
            (el as HTMLElement).style.top = `${y}px`;
            (el as HTMLElement).style.width = `${w}px`;
            (el as HTMLElement).style.height = `${h}px`;
        }
    }

    /**
     * Render focusable overlay elements on top of the SVG nodes.
     * Positions are derived from getBoundingClientRect() on the actual SVG
     * elements, which automatically handles zoom/pan transforms.
     */
    private renderDNOverlay(
        structure: any,
        svgNodeMap: Map<string, SVGGElement>,
        svgContainer: HTMLElement,
    ): void {
        if (!this.dnOverlayContainer) return;

        // Clear previous overlay
        this.dnOverlayContainer.innerHTML = '';

        // Entry button
        const entryBtn = document.createElement('button');
        entryBtn.className = 'dn-entry-button';
        entryBtn.textContent = 'Enter diagram navigation';
        entryBtn.style.cssText = 'pointer-events: auto; margin: 4px;';
        entryBtn.addEventListener('click', () => {
            const firstNodeId = this.accessibleLayout?.navigation.nodeOrder[0];
            if (firstNodeId) this.navigateToNode(firstNodeId);
        });
        this.dnOverlayContainer.appendChild(entryBtn);

        // Mode toolbar
        this.renderModeToolbar();

        const containerRect = svgContainer.getBoundingClientRect();
        const MIN_NODE_SIZE = 24;

        // Create a focusable element for each node
        for (const [nodeId, node] of Object.entries(structure.nodes) as any[]) {
            const renderId = node.renderId;
            const svgG = svgNodeMap.get(nodeId);
            if (!svgG) continue;

            // Position from actual SVG element bounding rect
            const rect = svgG.getBoundingClientRect();
            const w = Math.max(rect.width, MIN_NODE_SIZE);
            const h = Math.max(rect.height, MIN_NODE_SIZE);
            const x = rect.left - containerRect.left + (rect.width - w) / 2;
            const y = rect.top - containerRect.top + (rect.height - h) / 2;

            const el = document.createElement('div');
            el.id = renderId;
            el.className = 'dn-spatial-node';
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '-1');
            el.setAttribute('aria-label', this.buildNodeAnnouncement(nodeId));
            el.dataset.nodeId = nodeId;

            // Tag with groups for group navigation
            const groups = this.nodeGroupMap.get(nodeId);
            if (groups && groups.length > 0) {
                el.dataset.groups = groups.join(',');
            }

            el.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                width: ${w}px;
                height: ${h}px;
                pointer-events: auto;
                cursor: pointer;
                border-radius: 4px;
                outline-offset: 2px;
            `;

            // Focus handler — update context panel
            el.addEventListener('focus', () => {
                this.dnCurrentFocusId = nodeId;
                this.onDNNodeFocused(nodeId);
            });

            this.dnOverlayContainer!.appendChild(el);
        }
    }

    /**
     * Render the navigation mode toolbar inside the overlay container.
     */
    private renderModeToolbar(): void {
        if (!this.dnOverlayContainer) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'nav-mode-toolbar';
        toolbar.setAttribute('role', 'radiogroup');
        toolbar.setAttribute('aria-label', 'Navigation mode');
        toolbar.style.cssText = 'pointer-events: auto;';

        const modes: Array<{ mode: NavigationMode; label: string; key: string }> = [
            { mode: 'spatial', label: 'Spatial', key: '1' },
            { mode: 'must', label: 'Must-only', key: '2' },
            { mode: 'relations', label: 'Relations', key: '3' },
        ];

        for (const { mode, label, key } of modes) {
            const btn = document.createElement('button');
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', mode === this.currentNavMode ? 'true' : 'false');
            btn.dataset.mode = mode;
            btn.textContent = `${label} (${key})`;
            btn.addEventListener('click', () => this.switchNavigationMode(mode));
            toolbar.appendChild(btn);
        }

        // Relation key mapping hint (shown when in relation mode)
        const keyHint = document.createElement('span');
        keyHint.className = 'relation-key-hint';
        keyHint.id = 'se-relation-key-hint';
        keyHint.style.display = this.currentNavMode === 'relations' ? 'inline' : 'none';
        keyHint.textContent = this.relationKeyMap.map(m => `${m.key} ${m.label}`).join('  ');
        toolbar.appendChild(keyHint);

        this.dnOverlayContainer.appendChild(toolbar);
    }

    /**
     * Wire keyboard navigation on the DN overlay.
     *
     * - Arrow keys: navigate based on current mode (spatial/must/relations)
     * - 1/2/3: switch navigation mode
     * - Enter: drill into a group
     * - Esc: leave a group (or exit navigation)
     */
    private wireDNKeyboard(): void {
        if (!this.dnOverlayContainer || !this.dnInputHandler) return;

        this.dnOverlayContainer.addEventListener('keydown', (e) => {
            if (!this.dnCurrentFocusId || !this.dnInputHandler) return;

            // ─── Mode switching ──────────────────────────────────
            if (e.key === '1') { this.switchNavigationMode('spatial'); e.preventDefault(); return; }
            if (e.key === '2') { this.switchNavigationMode('must'); e.preventDefault(); return; }
            if (e.key === '3') { this.switchNavigationMode('relations'); e.preventDefault(); return; }

            // ─── Group navigation ─────────────────────────────────
            if (e.key === 'Enter') {
                this.handleGroupEnter();
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (e.key === 'Escape') {
                if (this.groupStack.length > 0) {
                    this.handleGroupEscape();
                } else {
                    // Exit navigation entirely
                    (this.shadowRoot!.activeElement as HTMLElement)?.blur();
                    this.dnCurrentFocusId = null;
                }
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // ─── Navigation ──────────────────────────────────────
            const direction = this.dnInputHandler.keydownValidator(e);
            if (!direction) return;

            e.preventDefault();
            e.stopPropagation();

            const nextNode = this.dnInputHandler.move(this.dnCurrentFocusId, direction);

            if (!nextNode) {
                // Announce no neighbor in current mode
                this.announceNoNeighbor(direction);
                return;
            }

            // If we're inside a group, only navigate to group members
            if (this.groupStack.length > 0) {
                const currentGroup = this.groupStack[this.groupStack.length - 1];
                const members = this.groupMemberMap.get(currentGroup);
                if (members && !members.includes(nextNode.id)) {
                    this.announce(`Edge of group ${currentGroup}. Press Escape to leave group.`);
                    return;
                }
            }

            this.dnCurrentFocusId = nextNode.id;
            const renderId = nextNode.renderId;
            const el = this.shadowRoot!.getElementById(renderId);
            if (el) {
                el.focus();
                // Call directly — don't rely solely on focus event
                this.onDNNodeFocused(nextNode.id);
            }

            // Mode-specific announcement
            if (this.currentNavMode === 'relations') {
                const relName = this.getRelationNameFromDirection(direction);
                if (relName) {
                    this.announce(`Following ${relName} to ${this.getNodeLabel(nextNode.id)}.`);
                }
            }
        });
    }

    /**
     * Switch navigation mode and update DN's active key bindings.
     */
    private switchNavigationMode(mode: NavigationMode): void {
        if (mode === this.currentNavMode) return;

        const ruleSet = mode === 'spatial' ? this.spatialRules
            : mode === 'must' ? this.mustRules
            : this.relationRules;

        // Ensure the rule set has entries (relations may be empty)
        if (Object.keys(ruleSet).length === 0 && mode === 'relations') {
            this.announce('No data relations available for relation navigation.');
            return;
        }

        this.dnInputHandler?.setNavigationKeyBindings?.(ruleSet);
        this.currentNavMode = mode;
        this.updateModeUI();
        this.announce(`Navigation mode: ${mode}.`);
    }

    /**
     * Update the toolbar UI to reflect the current navigation mode.
     */
    private updateModeUI(): void {
        if (!this.dnOverlayContainer) return;

        const toolbar = this.dnOverlayContainer.querySelector('.nav-mode-toolbar');
        if (!toolbar) return;

        for (const btn of toolbar.querySelectorAll('[role="radio"]')) {
            const isActive = (btn as HTMLElement).dataset.mode === this.currentNavMode;
            btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
        }

        const keyHint = toolbar.querySelector('#se-relation-key-hint') as HTMLElement;
        if (keyHint) {
            keyHint.style.display = this.currentNavMode === 'relations' ? 'inline' : 'none';
        }
    }

    /**
     * Announce that no neighbor was found in the given direction for the current mode.
     */
    private announceNoNeighbor(direction: string): void {
        const nodeLabel = this.dnCurrentFocusId ? this.getNodeLabel(this.dnCurrentFocusId) : 'current node';
        if (this.currentNavMode === 'must') {
            this.announce(`No must-${direction.replace('must_', '')} neighbor from ${nodeLabel}.`);
        } else if (this.currentNavMode === 'relations') {
            const relName = this.getRelationNameFromDirection(direction) ?? direction;
            this.announce(`No ${relName} relation from ${nodeLabel}.`);
        } else {
            this.announce(`No ${direction.replace('spatial_', '')} neighbor from ${nodeLabel}.`);
        }
    }

    /**
     * Extract the relation name from a DN direction label like "rel_left" → "left".
     */
    private getRelationNameFromDirection(direction: string): string | null {
        if (direction.startsWith('rel_')) return direction.slice(4);
        return null;
    }

    // ─── Group Navigation ─────────────────────────────────────────────

    /**
     * Enter pressed on a node: if the node belongs to a group,
     * drill into that group. Navigation is then confined to group members.
     */
    private handleGroupEnter(): void {
        if (!this.dnCurrentFocusId) return;

        const groups = this.nodeGroupMap.get(this.dnCurrentFocusId);
        if (!groups || groups.length === 0) {
            this.announce('This node is not in a group.');
            return;
        }

        // If in a group already, try to enter a nested group (if any).
        // Otherwise enter the first available group.
        let targetGroup: string | null = null;
        if (this.groupStack.length > 0) {
            // Look for a group this node belongs to that's NOT the current group
            const current = this.groupStack[this.groupStack.length - 1];
            targetGroup = groups.find(g => g !== current) ?? null;
            if (!targetGroup) {
                this.announce(`Already inside group ${current}. No nested groups.`);
                return;
            }
        } else {
            targetGroup = groups[0];
        }

        this.groupStack.push(targetGroup);
        const members = this.groupMemberMap.get(targetGroup) ?? [];

        // Highlight all group members
        this.highlightNodes(members);

        this.announce(`Entered group ${targetGroup}, ${members.length} members. Arrow keys navigate within group. Escape to leave.`);
    }

    /**
     * Escape pressed while inside a group: pop the group stack
     * and return to unconstrained navigation.
     */
    private handleGroupEscape(): void {
        const leftGroup = this.groupStack.pop();

        if (this.groupStack.length > 0) {
            const parentGroup = this.groupStack[this.groupStack.length - 1];
            const members = this.groupMemberMap.get(parentGroup) ?? [];
            this.highlightNodes(members);
            this.announce(`Left group ${leftGroup}. Now in group ${parentGroup}.`);
        } else {
            // Highlight just the focused node
            if (this.dnCurrentFocusId) this.highlightNodes([this.dnCurrentFocusId]);
            this.announce(`Left group ${leftGroup}. Free navigation.`);
        }
    }

    // ─── Spatial Context ───────────────────────────────────────────────

    /**
     * Called when a DN overlay node receives focus.
     * Updates the context panel and live region with modal annotations.
     */
    private onDNNodeFocused(nodeId: string): void {
        if (!this.accessibleLayout) return;

        const nav = this.accessibleLayout.navigation;
        const nb = nav.getNeighbors(nodeId);
        if (!nb) return;

        const desc = this.accessibleLayout.description.nodes.find(n => n.id === nodeId);
        const label = desc?.label ?? nodeId;
        const type = desc?.mostSpecificType ?? '';
        const annotated = this.getAnnotatedNeighbors(nodeId);

        this.updateContextPanel(label, type, nb, annotated);
        this.highlightNodes([nodeId]);

        // Dispatch event for external consumers
        this.dispatchEvent(new CustomEvent('node-focused', {
            detail: { nodeId, label, neighbors: nb, annotatedNeighbors: annotated },
            bubbles: true,
        }));
    }

    /**
     * Build a screen-reader announcement string for a node,
     * including modal spatial context from the constraint graph.
     */
    private buildNodeAnnouncement(nodeId: string): string {
        if (!this.accessibleLayout) return nodeId;

        const desc = this.accessibleLayout.description.nodes.find(n => n.id === nodeId);
        if (!desc) return nodeId;

        const parts = [desc.label];
        if (desc.mostSpecificType) parts.push(desc.mostSpecificType);

        const annotated = this.getAnnotatedNeighbors(nodeId);
        if (annotated.length > 0) {
            const spatial = annotated.map(a => {
                const dirLabel = a.direction === 'up' ? 'above' : a.direction === 'down' ? 'below' : `${a.direction} of`;
                const modal = a.modality !== 'unconstrained' ? `${a.modality} ` : '';
                return `${modal}${dirLabel} ${this.getNodeLabel(a.nodeId)}`;
            });
            parts.push(spatial.join(', '));
        }

        const groups = this.nodeGroupMap.get(nodeId);
        if (groups && groups.length > 0) parts.push(`in group ${groups.join(', ')}`);

        // Group navigation hint
        if (groups && groups.length > 0 && this.groupStack.length === 0) {
            parts.push('press Enter to navigate within group');
        }

        return parts.join('. ') + '.';
    }

    private updateContextPanel(
        label: string,
        type: string,
        nb: SpatialNeighbors,
        annotated: AnnotatedNeighbor[],
    ): void {
        const shadow = this.shadowRoot!;
        const contextEl = shadow.getElementById('se-context');
        const liveEl = shadow.getElementById('se-live-region');
        if (!contextEl || !liveEl) return;

        // Build header
        let html = `<strong>${this.escapeHtml(label)}</strong>`;
        if (type) html += ` <span class="context-direction">${this.escapeHtml(type)}</span>`;

        // Group breadcrumb
        if (this.groupStack.length > 0) {
            html += ` <span class="context-group">In: ${this.groupStack.map(g => this.escapeHtml(g)).join(' &rsaquo; ')}</span>`;
        }
        html += '<br>';

        // Annotated neighbor chips with modality badges
        if (annotated.length > 0) {
            html += annotated.map(a => {
                const dirName = a.direction === 'up' ? 'Above'
                    : a.direction === 'down' ? 'Below'
                    : a.direction === 'left' ? 'Left'
                    : 'Right';
                const modalClass = a.modality === 'must' ? 'modality-must'
                    : a.modality === 'can' ? 'modality-can'
                    : 'modality-unconstrained';
                const modalBadge = a.modality !== 'unconstrained'
                    ? `<span class="modality-badge ${modalClass}">${a.modality}</span> `
                    : '';
                return `<span class="context-direction">${modalBadge}${dirName}: <strong>${this.escapeHtml(this.getNodeLabel(a.nodeId))}</strong></span>`;
            }).join(' ');
        } else {
            html += '<span style="color:#888">No spatial neighbors (unconstrained)</span>';
        }

        // Group membership
        const groups = nb.containingGroups;
        if (groups.length > 0 && this.groupStack.length === 0) {
            html += '<br>' + groups.map(g =>
                `<span class="context-group">Group: ${this.escapeHtml(g)} <kbd>Enter</kbd></span>`,
            ).join(' ');
        }

        contextEl.innerHTML = html;

        // Screen reader announcement with modality
        const srParts: string[] = [];
        for (const a of annotated) {
            const dirLabel = a.direction === 'up' ? 'above' : a.direction === 'down' ? 'below' : `${a.direction} of`;
            const modal = a.modality !== 'unconstrained' ? `${a.modality} ` : '';
            srParts.push(`${modal}${dirLabel} ${this.getNodeLabel(a.nodeId)}`);
        }

        let srText = label;
        if (srParts.length > 0) srText += '. ' + srParts.join(', ') + '.';
        if (groups.length > 0) srText += ` In group ${groups.join(', ')}. Press Enter to navigate within group.`;
        if (this.groupStack.length > 0) {
            srText += ` Inside group ${this.groupStack[this.groupStack.length - 1]}. Press Escape to leave.`;
        }

        liveEl.textContent = srText;
    }

    // ─── Spatial REPL ──────────────────────────────────────────────────

    private executeSpatialQuery(): void {
        const shadow = this.shadowRoot!;
        const input = shadow.getElementById('se-spatial-input') as HTMLInputElement | null;
        if (!input) return;

        const expr = input.value.trim();
        if (!expr) return;

        if (!this.layoutEvaluator) {
            this.spatialHistory.push({
                expr,
                html: '<span class="result-error">Error: No layout evaluator. Call enableAccessibility() first.</span>',
                srText: 'Error: No layout evaluator.',
            });
            this.renderSpatialHistory();
            return;
        }

        const result = this.layoutEvaluator.evaluate(expr);

        if (result.isError()) {
            this.spatialHistory.push({
                expr,
                html: `<span class="result-error">Error: ${this.escapeHtml(result.prettyPrint())}</span>`,
                srText: `Error: ${result.prettyPrint()}`,
            });
        } else if (result.noResult()) {
            this.spatialHistory.push({
                expr,
                html: '<span class="result-empty">(empty set — no results)</span>',
                srText: 'Empty set, no results.',
            });
        } else {
            const atoms = result.selectedAtoms();
            const atomHtml = atoms.map(a => {
                const safeId = this.sanitizeId(a);
                return `<span class="query-result-atom" role="link" tabindex="0" data-node-id="${this.escapeHtml(safeId)}">${this.escapeHtml(a)}</span>`;
            }).join(', ');

            this.spatialHistory.push({
                expr,
                html: `<span class="result-brace">{</span> ${atomHtml} <span class="result-brace">}</span> ` +
                      `<span class="result-count">(${atoms.length} result${atoms.length !== 1 ? 's' : ''} — click to navigate)</span>`,
                srText: `${atoms.length} result${atoms.length !== 1 ? 's' : ''}: ${atoms.join(', ')}. Activate a result to navigate to it.`,
            });

            // Highlight results in SVG
            this.highlightNodes(atoms);
        }

        this.renderSpatialHistory();
        this.dispatchEvent(new CustomEvent('query-executed', {
            detail: { type: 'spatial', expr, result: result.prettyPrint() },
            bubbles: true,
        }));

        input.value = '';
        input.focus();
    }

    private renderSpatialHistory(): void {
        const output = this.shadowRoot!.getElementById('se-spatial-output');
        if (!output) return;

        output.innerHTML = this.spatialHistory.map(h =>
            `<span class="result-prompt">&gt;</span> <span class="result-query">${this.escapeHtml(h.expr)}</span>\n  ${h.html}`,
        ).join('\n\n');
        output.scrollTop = output.scrollHeight;
    }

    // ─── Datum REPL ────────────────────────────────────────────────────

    private executeDatumQuery(): void {
        const shadow = this.shadowRoot!;
        const input = shadow.getElementById('se-datum-input') as HTMLInputElement | null;
        if (!input) return;

        const expr = input.value.trim();
        if (!expr) return;

        if (!this.dataEvaluator) {
            this.datumHistory.push({
                expr,
                html: '<span class="result-error">Error: No data evaluator. Call enableAccessibility() with a data evaluator.</span>',
                srText: 'Error: No data evaluator.',
            });
            this.renderDatumHistory();
            return;
        }

        const result = this.dataEvaluator.evaluate(expr);

        if (result.isError()) {
            this.datumHistory.push({
                expr,
                html: `<span class="result-error">Error: ${this.escapeHtml(result.prettyPrint())}</span>`,
                srText: `Error: ${result.prettyPrint()}`,
            });
        } else if (result.noResult()) {
            this.datumHistory.push({
                expr,
                html: '<span class="result-empty">(empty set — no results)</span>',
                srText: 'Empty set, no results.',
            });
        } else {
            this.datumHistory.push({
                expr,
                html: `<span style="color:#ce9178">${this.escapeHtml(result.prettyPrint())}</span>`,
                srText: result.prettyPrint(),
            });
        }

        this.renderDatumHistory();
        input.value = '';
        input.focus();
    }

    private renderDatumHistory(): void {
        const output = this.shadowRoot!.getElementById('se-datum-output');
        if (!output) return;

        output.innerHTML = this.datumHistory.map(h =>
            `<span class="result-prompt">&gt;</span> <span class="result-query">${this.escapeHtml(h.expr)}</span>\n  ${h.html}`,
        ).join('\n\n');
        output.scrollTop = output.scrollHeight;
    }

    // ─── Focus Coordination ────────────────────────────────────────────

    /**
     * Navigate to a node by ID — focuses the DN overlay element,
     * highlights the SVG node, and updates the context panel.
     */
    private navigateToNode(nodeId: string): void {
        const shadow = this.shadowRoot!;
        const renderId = `dn-node-${this.sanitizeId(nodeId)}`;
        const el = shadow.getElementById(renderId);

        if (el) {
            el.focus();
            // Call directly — don't rely solely on focus event firing
            this.dnCurrentFocusId = nodeId;
            this.onDNNodeFocused(nodeId);
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    /** Push text to the live region for screen reader announcement. */
    private announce(text: string): void {
        const liveEl = this.shadowRoot!.getElementById('se-live-region');
        if (liveEl) liveEl.textContent = text;
    }

    private enableREPLs(): void {
        const shadow = this.shadowRoot!;
        const spatialBtn = shadow.getElementById('se-spatial-btn') as HTMLButtonElement | null;
        const datumBtn = shadow.getElementById('se-datum-btn') as HTMLButtonElement | null;
        if (spatialBtn) spatialBtn.disabled = !this.layoutEvaluator;
        if (datumBtn) datumBtn.disabled = !!this.dataEvaluator === false;

        if (this.layoutEvaluator && this.currentInstanceLayout?.nodes?.[0]) {
            const firstName = this.currentInstanceLayout.nodes[0].name || this.currentInstanceLayout.nodes[0].id;
            const spatialInput = shadow.getElementById('se-spatial-input') as HTMLInputElement | null;
            if (spatialInput) spatialInput.placeholder = `must.rightOf(${firstName})`;
        }
    }

    private getNodeLabel(nodeId: string): string {
        if (!this.accessibleLayout) return nodeId;
        const desc = this.accessibleLayout.description.nodes.find(
            n => n.id === nodeId,
        );
        return desc ? desc.label : nodeId;
    }

    private sanitizeId(raw: string): string {
        return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
