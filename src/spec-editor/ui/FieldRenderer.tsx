/**
 * {@link FieldRenderer} — a generic, schema-driven form renderer for the spec
 * editor. Given a `FieldSpec[]`, a values map and an `onChange(key, value)`
 * callback, it renders one row per field, dispatching on {@link FieldKind}:
 *
 * - `selector`        → {@link SelectorField}
 * - `relationName` /
 *   `typeName`        → combo box (text input + datalist of known names)
 * - `enum`            → segmented pill buttons (multi-select pills when `multiple`)
 * - `number`          → number input
 * - `color`           → color swatch input
 * - `boolean`         → switch
 * - `text`            → text input
 *
 * The renderer is domain-agnostic. Domain names for `relationName`/`typeName`
 * combo boxes come from the `options` prop; per-field selector props (the
 * completion + synthesis sources) come from an optional `selectorProps`
 * callback that WP4 supplies. With neither, every field still renders and edits.
 */

import React, { useId } from 'react';
import type { Diagnostic, FieldSpec } from '../core/types';
import { SelectorField } from './SelectorField';
import type { SelectorFieldProps } from './SelectorField';

/** Domain names available for the combo-box field kinds. */
export interface FieldRendererOptions {
  relationNames?: readonly string[];
  typeNames?: readonly string[];
}

/** Per-field selector wiring, forwarded into {@link SelectorField}. */
export type SelectorFieldExtras = Pick<
  SelectorFieldProps,
  'complete' | 'synthesize' | 'highlight'
>;

export interface FieldRendererProps {
  fields: readonly FieldSpec[];
  values: Record<string, unknown>;
  onChange(key: string, value: unknown): void;
  /** all diagnostics for the item; the renderer buckets them per field. */
  diagnostics?: readonly Diagnostic[];
  /** domain names for combo-box fields. */
  options?: FieldRendererOptions;
  /** optional per-field selector wiring (completion/synthesis). */
  selectorProps?: (field: FieldSpec) => SelectorFieldExtras | undefined;
  disabled?: boolean;
  className?: string;
}

/** Coerce an unknown stored value to a string for text-like inputs. */
function asString(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

/** Coerce an unknown stored value to an array of strings (multi-enum). */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

const fieldDiagnostics = (
  diagnostics: readonly Diagnostic[] | undefined,
  key: string
): Diagnostic[] =>
  (diagnostics ?? []).filter((d) => d.fieldKey === key);

const topSeverity = (
  ds: readonly Diagnostic[]
): Diagnostic['severity'] | undefined => {
  if (ds.length === 0) return undefined;
  if (ds.some((d) => d.severity === 'error')) return 'error';
  if (ds.some((d) => d.severity === 'warning')) return 'warning';
  return 'info';
};

/** Inline diagnostic list, shared by non-selector fields. */
const FieldDiagnostics: React.FC<{ diagnostics: Diagnostic[]; id: string }> = ({
  diagnostics,
  id,
}) =>
  diagnostics.length > 0 ? (
    <ul className="spytial-ed-diagnostics" id={id}>
      {diagnostics.map((d, i) => (
        <li
          key={i}
          className={`spytial-ed-diagnostic spytial-ed-diagnostic--${d.severity}`}
        >
          <span className="spytial-ed-diagnostic-dot" aria-hidden="true" />
          <span className="spytial-ed-diagnostic-msg">{d.message}</span>
        </li>
      ))}
    </ul>
  ) : null;

export const FieldRenderer: React.FC<FieldRendererProps> = ({
  fields,
  values,
  onChange,
  diagnostics,
  options,
  selectorProps,
  disabled = false,
  className,
}) => {
  const groupId = useId();

  return (
    <div className={`spytial-ed-fields${className ? ` ${className}` : ''}`}>
      {fields.map((field) => {
        const fieldId = `${groupId}-${field.key}`;
        const labelId = `${fieldId}-label`;
        const diagId = `${fieldId}-diag`;
        const ds = fieldDiagnostics(diagnostics, field.key);
        const severity = topSeverity(ds);
        const value = values[field.key];

        return (
          <div
            key={field.key}
            className={`spytial-ed-field spytial-ed-field--${field.kind}${
              severity ? ` spytial-ed-field--${severity}` : ''
            }`}
          >
            <label
              id={labelId}
              htmlFor={field.kind === 'selector' ? undefined : fieldId}
              className="spytial-ed-field-label"
              title={field.help}
            >
              {field.label}
              {field.required ? (
                <span
                  className="spytial-ed-field-required"
                  aria-hidden="true"
                  title="required"
                >
                  {' '}
                  *
                </span>
              ) : null}
            </label>

            <div className="spytial-ed-field-control">
              {renderControl(field, value, {
                fieldId,
                labelId,
                diagId,
                hasDiagnostics: ds.length > 0,
                disabled,
                onChange,
                options,
                selectorProps,
                diagnostics: ds,
              })}

              {/* Selector renders its own diagnostics inline; others here. */}
              {field.kind === 'selector' ? null : (
                <FieldDiagnostics diagnostics={ds} id={diagId} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface ControlCtx {
  fieldId: string;
  labelId: string;
  diagId: string;
  hasDiagnostics: boolean;
  disabled: boolean;
  onChange: (key: string, value: unknown) => void;
  options?: FieldRendererOptions;
  selectorProps?: (field: FieldSpec) => SelectorFieldExtras | undefined;
  diagnostics: Diagnostic[];
}

function renderControl(
  field: FieldSpec,
  value: unknown,
  ctx: ControlCtx
): React.ReactNode {
  const {
    fieldId,
    labelId,
    diagId,
    hasDiagnostics,
    disabled,
    onChange,
    options,
    selectorProps,
    diagnostics,
  } = ctx;
  const describedBy = hasDiagnostics ? diagId : undefined;

  switch (field.kind) {
    case 'selector': {
      const extras = selectorProps?.(field) ?? {};
      return (
        <SelectorField
          value={asString(value)}
          onChange={(v) => onChange(field.key, v)}
          placeholder={field.placeholder}
          disabled={disabled}
          selectorArity={field.selectorArity}
          aria-labelledby={labelId}
          diagnostics={diagnostics}
          complete={extras.complete}
          synthesize={extras.synthesize}
          highlight={extras.highlight}
        />
      );
    }

    case 'relationName':
    case 'typeName': {
      const names =
        field.kind === 'relationName'
          ? options?.relationNames
          : options?.typeNames;
      const listId = `${fieldId}-list`;
      const hasOptions = !!names && names.length > 0;
      return (
        <>
          <input
            id={fieldId}
            type="text"
            className="spytial-ed-input spytial-ed-combo"
            value={asString(value)}
            placeholder={field.placeholder}
            disabled={disabled}
            list={hasOptions ? listId : undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby={describedBy}
            aria-invalid={
              diagnostics.some((d) => d.severity === 'error') || undefined
            }
            onChange={(e) => onChange(field.key, e.target.value)}
          />
          {hasOptions ? (
            <datalist id={listId}>
              {names!.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          ) : null}
        </>
      );
    }

    case 'enum': {
      const opts = field.options ?? [];
      if (field.multiple) {
        const selected = asStringArray(value);
        return (
          <div
            className="spytial-ed-pills"
            role="group"
            aria-labelledby={labelId}
            aria-describedby={describedBy}
          >
            {opts.map((opt) => {
              const isOn = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`spytial-ed-pill${
                    isOn ? ' spytial-ed-pill--active' : ''
                  }`}
                  aria-pressed={isOn}
                  disabled={disabled}
                  onClick={() => {
                    const next = isOn
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt];
                    onChange(field.key, next);
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }
      // single-select segmented control
      const current = asString(value);
      return (
        <div
          className="spytial-ed-pills"
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
        >
          {opts.map((opt) => {
            const isOn = current === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`spytial-ed-pill${
                  isOn ? ' spytial-ed-pill--active' : ''
                }`}
                role="radio"
                aria-checked={isOn}
                disabled={disabled}
                onClick={() => onChange(field.key, opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    case 'number': {
      const raw = value;
      const display =
        raw === undefined || raw === null || raw === '' ? '' : String(raw);
      return (
        <input
          id={fieldId}
          type="number"
          className="spytial-ed-input spytial-ed-input--number"
          value={display}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={
            diagnostics.some((d) => d.severity === 'error') || undefined
          }
          onChange={(e) => {
            const v = e.target.value;
            // Emit a number when parseable, empty string when cleared.
            onChange(field.key, v === '' ? '' : Number(v));
          }}
        />
      );
    }

    case 'color': {
      const colorVal = asString(value) || '#000000';
      return (
        <div className="spytial-ed-color">
          <input
            id={fieldId}
            type="color"
            className="spytial-ed-color-swatch"
            value={normalizeColor(colorVal)}
            disabled={disabled}
            aria-describedby={describedBy}
            aria-label={`${field.label} color`}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
          <input
            type="text"
            className="spytial-ed-input spytial-ed-color-text"
            value={asString(value)}
            placeholder={field.placeholder ?? '#rrggbb'}
            disabled={disabled}
            spellCheck={false}
            aria-label={`${field.label} hex value`}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        </div>
      );
    }

    case 'boolean': {
      const checked = value === true || value === 'true';
      return (
        <button
          id={fieldId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={describedBy}
          className={`spytial-ed-switch${
            checked ? ' spytial-ed-switch--on' : ''
          }`}
          disabled={disabled}
          onClick={() => onChange(field.key, !checked)}
        >
          <span className="spytial-ed-switch-thumb" aria-hidden="true" />
        </button>
      );
    }

    case 'text':
    default:
      return (
        <input
          id={fieldId}
          type="text"
          className="spytial-ed-input"
          value={asString(value)}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={
            diagnostics.some((d) => d.severity === 'error') || undefined
          }
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
  }
}

/** Native `<input type=color>` only accepts `#rrggbb`; coerce best-effort. */
function normalizeColor(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return '#000000';
}
