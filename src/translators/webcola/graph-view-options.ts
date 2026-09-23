/** Instance-local presentation and gesture options; never part of the CnD spec. */
export interface GraphViewOptions {
  /** Default: full. Individual controls override the preset (including none). */
  toolbar?: 'full' | 'compact' | 'none';
  controls?: Partial<Record<GraphControl, boolean>>;
  interaction?: {
    /** Constrained node/group rearrangement. Default: true. */
    nodeDrag?: boolean;
    /** Mouse/touch pan and zoom. Public zoom/fit actions remain available. */
    panZoom?: boolean;
    /** Default: true, but cannot enable editing on a read-only viewer. */
    structuralEditing?: boolean;
  };
  /** Font stack for graph text. null restores the font-family attribute/default. */
  fontFamily?: string | null;
}

export type GraphControl = 'zoom' | 'fit' | 'routing' | 'theme' | 'export' | 'editing';

export interface ResolvedGraphViewOptions {
  toolbar: 'full' | 'compact' | 'none';
  controls: Partial<Record<GraphControl, boolean>>;
  interaction: Required<NonNullable<GraphViewOptions['interaction']>>;
  fontFamily: string | null;
}

export function defaultGraphViewOptions(): ResolvedGraphViewOptions {
  return {
    toolbar: 'full', controls: {},
    interaction: { nodeDrag: true, panZoom: true, structuralEditing: true },
    fontFamily: null,
  };
}
