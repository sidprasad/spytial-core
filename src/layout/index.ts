/**
 * Layout module entry point
 * Re-exports all layout-related functionality
 */

export * from './interfaces';
export * from './layoutspec';
export * from './layoutinstance';
export * from './colorpicker';
export * from './constraint-validator';
export * from './icon-registry';

// Utility functions
import { LayoutInstance } from './layoutinstance';
import { LayoutSpec, parseLayoutSpec } from './layoutspec';
import IEvaluator from '../evaluators/interfaces';
import { IDataInstance } from '../data-instance/interfaces';

/**
 * Convenience function to set up and generate a layout
 * @param spec The layout specification (YAML content or LayoutSpec object)
 * @param instance The data instance to layout (apply projections before passing)
 * @param evaluator The evaluator to use for constraint evaluation
 * @returns The generated layout
 */
export function setupLayout(
  spec: string | LayoutSpec,
  instance: IDataInstance,
  evaluator: IEvaluator
) {
  const layoutSpec = typeof spec === 'string' ? parseLayoutSpec(spec) : spec;
  const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
  return layoutInstance.generateLayout(instance);
}
