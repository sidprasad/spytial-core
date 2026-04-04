/**
 * Accessible Translator module - compiles InstanceLayout to accessible representations.
 *
 * Parallel to the WebCola translator: same InstanceLayout input,
 * but outputs spatial navigation maps, structured descriptions, and semantic HTML
 * instead of visual SVG data.
 */

export { AccessibleTranslator } from './accessible-translator';

export type {
    AccessibleLayout,
    AccessibleTranslatorOptions,
    SpatialNavigationMap,
    SpatialNeighbors,
    EdgeReference,
    LayoutDescription,
    OverviewSection,
    TypeSection,
    NodeDescription,
    EdgeDescription,
    GroupDescription,
    RelationshipSummary,
    SpatialRelationshipDescription,
} from './accessible-translator';

// Also export the builder function for direct use
export { buildSpatialNavigationMap } from './accessible-translator';
