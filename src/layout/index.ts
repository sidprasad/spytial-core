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
import IEvaluator from '../evaluators/interfaces';
import { AlloyInstance } from '../data-instance/alloy/alloy-instance';
import { IDataInstance } from '../data-instance/interfaces';

/**
 * Convenience function to set up and generate a layout
 * @param spec The layout specification (YAML content or LayoutSpec object)
 * @param instance The Alloy instance to layout
 * @param evaluator The evaluator to use for constraint evaluation
 * @param projections Optional projections to apply
 * @returns A Promise resolving to the generated layout and projection data
 */
export async function setupLayout(
  spec: string | LayoutSpec,
  instance: IDataInstance,
  evaluator: IEvaluator,
  projections: Record<string, string> = {}
) {
  const layoutSpec = typeof spec === 'string' ? parseLayoutSpec(spec) : spec;
  const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
  return layoutInstance.generateLayout(instance, projections);
}
