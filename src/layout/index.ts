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
import { LayoutInstance, LayoutInstanceAsync } from './layoutinstance';
import { LayoutSpec, parseLayoutSpec } from './layoutspec';
import IEvaluator, { IEvaluatorAsync } from '../evaluators/interfaces';
import { AlloyInstance } from '../data-instance/alloy/alloy-instance';
import { IDataInstance } from '../data-instance/interfaces';

/**
 * Convenience function to set up and generate a layout using a synchronous evaluator
 * @param spec The layout specification (YAML content or LayoutSpec object)
 * @param instance The Alloy instance to layout
 * @param evaluator The evaluator to use for constraint evaluation
 * @param projections Optional projections to apply
 * @returns The generated layout and projection data
 */
export function setupLayout(
  spec: string | LayoutSpec,
  instance: IDataInstance,
  evaluator: IEvaluator,
  projections: Record<string, string> = {}
) {
  const layoutSpec = typeof spec === 'string' ? parseLayoutSpec(spec) : spec;
  const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
  return layoutInstance.generateLayout(instance, projections);
}

/**
 * Convenience function to set up and generate a layout using an asynchronous evaluator.
 * 
 * Use this function when your evaluator relies on async backends such as:
 * - Remote services
 * - Web Workers
 * - Other async I/O operations
 * 
 * @param spec The layout specification (YAML content or LayoutSpec object)
 * @param instance The data instance to layout
 * @param evaluator The async evaluator to use for constraint evaluation
 * @param projections Optional projections to apply
 * @returns Promise resolving to the generated layout and projection data
 * 
 * @example
 * ```typescript
 * const asyncEvaluator: IEvaluatorAsync = new RemoteEvaluator();
 * await asyncEvaluator.initializeAsync({ sourceData: myInstance });
 * 
 * const result = await setupLayoutAsync(spec, instance, asyncEvaluator);
 * console.log(result.layout.nodes);
 * ```
 */
export async function setupLayoutAsync(
  spec: string | LayoutSpec,
  instance: IDataInstance,
  evaluator: IEvaluatorAsync,
  projections: Record<string, string> = {}
): Promise<{
  layout: import('./interfaces').InstanceLayout,
  projectionData: { type: string, projectedAtom: string, atoms: string[] }[],
  error: import('./constraint-validator').ConstraintError | null
}> {
  const layoutSpec = typeof spec === 'string' ? parseLayoutSpec(spec) : spec;
  const layoutInstance = new LayoutInstanceAsync(layoutSpec, evaluator);
  return layoutInstance.generateLayoutAsync(instance, projections);
}
