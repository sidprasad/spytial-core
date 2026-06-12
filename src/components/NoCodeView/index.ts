/**
 * Back-compat barrel for the legacy `NoCodeView` module.
 *
 * The old Structured Builder UI (the `NoCodeView`/`CodeView` surfaces, the 27
 * per-type selector components, the `ConstraintCard`/`DirectiveCard` widgets,
 * the selector hooks and CSS) has been replaced by the schema-driven Spytial
 * spec editor in `src/spec-editor/` (use `SpecEditor`, or the back-compat
 * `CndLayoutInterface` wrapper). This barrel keeps the legacy DATA API working
 * by re-exporting thin shims over the new core (see `./shims`).
 */

// Data functions + validation (thin shims over src/spec-editor).
export {
  parseLayoutSpecToData,
  generateLayoutSpecYaml,
  validateYaml,
  validateSpytialSpec,
  highlightSelector,
} from './shims';
export type { SpytialValidationResult } from './shims';

// Structured-data types (unchanged).
export type { ConstraintData, DirectiveData } from './interfaces';
export type { ConstraintType, DirectiveType } from './types';

// Legacy description/constants used by integrators.
export * from './constants';
