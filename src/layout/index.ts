/**
 * Layout module entry point
 * Re-exports all layout-related functionality
 */

export * from './interfaces';
export * from './layoutspec';
export * from './layoutinstance';
export * from './colorpicker';
export * from './constraint-validator';

// Utility functions
import { LayoutInstance } from './layoutinstance';
import { LayoutSpec, parseLayoutSpec } from './layoutspec';
import { AnyEvaluator } from '../evaluators/interfaces';
import { IDataInstance } from '../data-instance/interfaces';

/**
 * Convenience function to set up and generate a layout.
 * 
 * This function works with both sync and async evaluators. The returned Promise
 * resolves immediately when using a sync evaluator, or when async evaluation completes
 * for async evaluators.
 * 
 * @param spec The layout specification (YAML content or LayoutSpec object)
 * @param instance The data instance to layout
 * @param evaluator The evaluator to use for constraint evaluation (sync or async)
 * @param projections Optional projections to apply
 * @returns Promise resolving to the generated layout and projection data
 * 
 * @example
 * ```typescript
 * // Using a sync evaluator
 * const syncEvaluator = new SGraphQueryEvaluator();
 * syncEvaluator.initialize({ sourceData: instance });
 * const result = await setupLayout(spec, instance, syncEvaluator);
 * 
 * // Using an async evaluator
 * const asyncEvaluator = new RemoteEvaluator();
 * await asyncEvaluator.initializeAsync({ sourceData: instance });
 * const result = await setupLayout(spec, instance, asyncEvaluator);
 * ```
 */
export async function setupLayout(
  spec: string | LayoutSpec,
  instance: IDataInstance,
  evaluator: AnyEvaluator,
  projections: Record<string, string> = {}
): Promise<{
  layout: import('./interfaces').InstanceLayout,
  projectionData: { type: string, projectedAtom: string, atoms: string[] }[],
  error: import('./constraint-validator').ConstraintError | null
}> {
  const layoutSpec = typeof spec === 'string' ? parseLayoutSpec(spec) : spec;
  const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
  return layoutInstance.generateLayout(instance, projections);
}
