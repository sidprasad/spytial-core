import React, { useCallback, useMemo } from 'react';
import { SpecEditor } from '../spec-editor';
import type {
  SpecEditorProps,
  Diagnostic,
  DomainSchema,
  SelectorAssistant,
  SpecEditorThemeInput,
} from '../spec-editor';
import { parseLayoutSpecToData } from './NoCodeView/shims';
import type { ConstraintData, DirectiveData } from './NoCodeView/interfaces';
import type { IInputDataInstance } from '../data-instance/interfaces';

/**
 * Props for the CND Layout Interface.
 *
 * `CndLayoutInterface` is now a thin back-compat wrapper over the schema-driven
 * {@link SpecEditor}. The legacy props (`yamlValue`, `isNoCodeView`,
 * `onViewChange`, and the `constraints`/`setConstraints`/`directives`/
 * `setDirectives` quartet) still work, but the document inside `SpecEditor` is
 * the source of truth — the constraint/directive callbacks are deprecated and
 * kept loosely in sync on a best-effort basis. New code should pass `value` +
 * `instance` (and any other {@link SpecEditorProps}) directly.
 *
 * @public
 */
export interface CndLayoutInterfaceProps {
  /** Current YAML value (legacy name for `value`). */
  yamlValue?: string;
  /** Current YAML value (alias for `yamlValue`; `value` wins if both given). */
  value?: string;
  /** Callback when the YAML value changes. */
  onChange: (value: string) => void;

  /** Whether to show the Structured Builder (true) vs Code view (false). */
  isNoCodeView?: boolean;
  /** Callback when the view mode changes. */
  onViewChange?: (isNoCodeView: boolean) => void;

  /**
   * @deprecated The document owns this state now. Kept loosely in sync via a
   * best-effort callback so legacy wrappers keep functioning.
   */
  constraints?: ConstraintData[];
  /** @deprecated see {@link CndLayoutInterfaceProps.constraints} */
  setConstraints?: (updater: (prev: ConstraintData[]) => ConstraintData[]) => void;
  /** @deprecated see {@link CndLayoutInterfaceProps.constraints} */
  directives?: DirectiveData[];
  /** @deprecated see {@link CndLayoutInterfaceProps.constraints} */
  setDirectives?: (updater: (prev: DirectiveData[]) => DirectiveData[]) => void;

  /** Domain awareness: the live data instance (extracts a schema). */
  instance?: IInputDataInstance;
  /** Domain awareness: a precomputed schema (wins over `instance`). */
  domain?: DomainSchema;
  /** Theme: token object or a registered theme name (e.g. 'dark'). */
  theme?: SpecEditorThemeInput;
  /** Selector-writing assistant hook. */
  selectorAssistant?: SelectorAssistant;
  /** Row density. */
  density?: 'compact' | 'comfortable';
  /** Syntax highlighting in code view + selector fields (default true). */
  syntaxHighlighting?: boolean;
  /** Notified whenever validation state changes. */
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;

  /** Additional CSS class name. */
  className?: string;
  /** Whether the component is disabled. */
  disabled?: boolean;
  /** ARIA label for accessibility. */
  'aria-label'?: string;
}

/**
 * CND Layout Interface — a thin back-compat wrapper over {@link SpecEditor}.
 *
 * Provides the historical prop surface (controlled `yamlValue`, an
 * `isNoCodeView` view toggle, and the deprecated constraint/directive
 * callbacks) while delegating all editing to the new spec editor. Builder and
 * Code views stay live and lossless; comments and unknown nodes round-trip.
 *
 * @example
 * ```tsx
 * <CndLayoutInterface
 *   value={yamlValue}
 *   onChange={setYamlValue}
 *   instance={dataInstance}
 * />
 * ```
 *
 * @public
 */
const CndLayoutInterface: React.FC<CndLayoutInterfaceProps> = ({
  yamlValue,
  value,
  onChange,
  isNoCodeView,
  onViewChange,
  constraints,
  setConstraints,
  directives,
  setDirectives,
  instance,
  domain,
  theme,
  selectorAssistant,
  density,
  syntaxHighlighting,
  onDiagnostics,
  className,
  disabled = false,
  'aria-label': ariaLabel = 'CND Layout Specification Interface',
}) => {
  const currentValue = value ?? yamlValue ?? '';

  // Map the legacy boolean view flag to the SpecEditor view names. When
  // `isNoCodeView` is undefined the editor falls back to its own default view.
  const view: 'builder' | 'code' | undefined =
    isNoCodeView === undefined ? undefined : isNoCodeView ? 'builder' : 'code';

  const handleViewChange = useCallback(
    (next: 'builder' | 'code') => {
      onViewChange?.(next === 'builder');
    },
    [onViewChange],
  );

  /**
   * Keep the deprecated constraint/directive callbacks loosely in sync. The
   * document is the source of truth; on every YAML change we best-effort parse
   * it into the legacy data shapes and push them through the legacy setters so
   * old wrappers that read those arrays keep functioning.
   */
  const handleChange = useCallback(
    (nextYaml: string) => {
      onChange(nextYaml);
      if (setConstraints || setDirectives) {
        try {
          const parsed = parseLayoutSpecToData(nextYaml);
          setConstraints?.(() => parsed.constraints);
          setDirectives?.(() => parsed.directives);
        } catch {
          // Invalid intermediate YAML: leave the legacy arrays untouched.
        }
      }
    },
    [onChange, setConstraints, setDirectives],
  );

  const editorProps: SpecEditorProps = useMemo(() => {
    const props: SpecEditorProps = {
      value: currentValue,
      onChange: handleChange,
      defaultView: 'builder',
      disabled,
      'aria-label': ariaLabel,
    };
    if (view !== undefined) {
      props.view = view;
      props.onViewChange = handleViewChange;
    }
    if (instance !== undefined) props.instance = instance;
    if (domain !== undefined) props.domain = domain;
    if (theme !== undefined) props.theme = theme;
    if (selectorAssistant !== undefined) props.selectorAssistant = selectorAssistant;
    if (density !== undefined) props.density = density;
    if (syntaxHighlighting !== undefined)
      props.syntaxHighlighting = syntaxHighlighting;
    if (onDiagnostics !== undefined) props.onDiagnostics = onDiagnostics;
    if (className !== undefined) props.className = className;
    return props;
  }, [
    currentValue,
    handleChange,
    view,
    handleViewChange,
    instance,
    domain,
    theme,
    selectorAssistant,
    density,
    syntaxHighlighting,
    onDiagnostics,
    className,
    disabled,
    ariaLabel,
  ]);

  // `constraints`/`directives` are read-only deprecated inputs; referenced here
  // only to acknowledge them (the document owns the real state).
  void constraints;
  void directives;

  return <SpecEditor {...editorProps} />;
};

/**
 * Named export for tree-shaking (no default export), per spytial-core guidelines.
 */
export { CndLayoutInterface };
