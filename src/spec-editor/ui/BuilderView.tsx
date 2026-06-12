/**
 * {@link BuilderView} — the compact, schema-driven row list of the spec editor.
 *
 * Each constraint/directive is a single compact row: a kind badge, the type
 * label, a live `summary(params)`, a diagnostic dot when the item has issues,
 * and an overflow menu (duplicate · delete · move up/down · add comment).
 * Clicking a row expands it inline (accordion: exactly one open at a time, Esc
 * collapses) into the generated form rendered by {@link FieldRenderer} from the
 * registry definition, plus a "negate" toggle for types that support `hold` and
 * a free-text comment input.
 *
 * "Add constraint" / "Add directive" buttons open searchable menus built from
 * the registry (deprecated types hidden). Reordering is keyboard-accessible via
 * the overflow menu's move up/down items.
 *
 * Unknown-type items (those carrying `SpecItem.raw`) render as a read-only row
 * labelled with their YAML key and a "preserved as written" note — they survive
 * round-trips untouched.
 *
 * This component is domain-blind about completion/synthesis: the parent passes a
 * `selectorProps(item, field)` callback that composes the real sources.
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  Diagnostic,
  FieldSpec,
  ItemKind,
  SpecItem,
} from '../core/types';
import {
  getDefinition,
  getDefinitions,
} from '../core/registry';
import { FieldRenderer } from './FieldRenderer';
import type {
  FieldRendererOptions,
  SelectorFieldExtras,
} from './FieldRenderer';
import { useAnchoredPopup } from './use-anchored-popup';

/** Types that round-trip a `hold: never` negation toggle. */
const NEGATABLE_TYPES: ReadonlySet<string> = new Set([
  'orientation',
  'cyclic',
  'align',
  'groupselector',
  'groupfield',
]);

export interface BuilderViewProps {
  constraints: readonly SpecItem[];
  directives: readonly SpecItem[];
  /** all diagnostics; the view buckets them per item/field. */
  diagnostics?: readonly Diagnostic[];
  /** domain names for combo-box fields. */
  options?: FieldRendererOptions;
  /** per (item, field) selector wiring (completion/synthesis). */
  selectorProps?: (item: SpecItem, field: FieldSpec) => SelectorFieldExtras | undefined;
  onAddItem(kind: ItemKind, type: string): void;
  onUpdateParam(id: string, key: string, value: unknown): void;
  onUpdateComment(id: string, comment: string): void;
  /** toggle the `hold: never` negation for a negatable item. */
  onToggleNegate(id: string, negated: boolean): void;
  onDuplicate(id: string): void;
  onRemove(id: string): void;
  onMove(id: string, direction: -1 | 1): void;
  disabled?: boolean;
  className?: string;
}

export const BuilderView: React.FC<BuilderViewProps> = ({
  constraints,
  directives,
  diagnostics,
  options,
  selectorProps,
  onAddItem,
  onUpdateParam,
  onUpdateComment,
  onToggleNegate,
  onDuplicate,
  onRemove,
  onMove,
  disabled = false,
  className,
}) => {
  // Exactly one expanded row at a time (accordion).
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  // Collapse the currently expanded row. The id arg lets callers reason about
  // which row collapsed (focus return is handled in the Row itself).
  const collapse = useCallback((_id?: string) => setExpandedId(null), []);

  const empty = constraints.length === 0 && directives.length === 0;

  return (
    <div className={`spytial-ed-builder${className ? ` ${className}` : ''}`}>
      <Section
        title="Constraints"
        kind="constraint"
        items={constraints}
        diagnostics={diagnostics}
        options={options}
        selectorProps={selectorProps}
        expandedId={expandedId}
        onToggleExpand={toggleExpand}
        onCollapse={collapse}
        onAddItem={onAddItem}
        onUpdateParam={onUpdateParam}
        onUpdateComment={onUpdateComment}
        onToggleNegate={onToggleNegate}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onMove={onMove}
        disabled={disabled}
      />

      <Section
        title="Directives"
        kind="directive"
        items={directives}
        diagnostics={diagnostics}
        options={options}
        selectorProps={selectorProps}
        expandedId={expandedId}
        onToggleExpand={toggleExpand}
        onCollapse={collapse}
        onAddItem={onAddItem}
        onUpdateParam={onUpdateParam}
        onUpdateComment={onUpdateComment}
        onToggleNegate={onToggleNegate}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onMove={onMove}
        disabled={disabled}
      />

      {empty ? (
        <p className="spytial-ed-builder-empty">
          No constraints or directives yet — add one to start shaping the layout.
        </p>
      ) : null}
    </div>
  );
};

// ---- section (constraints / directives) ----------------------------------

interface SectionProps {
  title: string;
  kind: ItemKind;
  items: readonly SpecItem[];
  diagnostics?: readonly Diagnostic[];
  options?: FieldRendererOptions;
  selectorProps?: (item: SpecItem, field: FieldSpec) => SelectorFieldExtras | undefined;
  expandedId: string | null;
  onToggleExpand(id: string): void;
  onCollapse(id?: string): void;
  onAddItem(kind: ItemKind, type: string): void;
  onUpdateParam(id: string, key: string, value: unknown): void;
  onUpdateComment(id: string, comment: string): void;
  onToggleNegate(id: string, negated: boolean): void;
  onDuplicate(id: string): void;
  onRemove(id: string): void;
  onMove(id: string, direction: -1 | 1): void;
  disabled: boolean;
}

const Section: React.FC<SectionProps> = ({
  title,
  kind,
  items,
  diagnostics,
  options,
  selectorProps,
  expandedId,
  onToggleExpand,
  onCollapse,
  onAddItem,
  onUpdateParam,
  onUpdateComment,
  onToggleNegate,
  onDuplicate,
  onRemove,
  onMove,
  disabled,
}) => {
  const listLabel = `${title} List`;

  // Focus management (APG accordion): keep a live map of each row's toggle
  // button plus a ref to the "Add" button, so after deleting a row we can land
  // focus on a sensible neighbour instead of dropping it to <body>.
  const toggleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  // Set to the id of the toggle to focus once the post-delete re-render lands;
  // `'__add__'` is a sentinel meaning "focus the Add button".
  const pendingFocusId = useRef<string | null>(null);

  const registerToggle = useCallback(
    (id: string, el: HTMLButtonElement | null): void => {
      if (el) {
        toggleRefs.current.set(id, el);
      } else {
        toggleRefs.current.delete(id);
      }
    },
    [],
  );

  const handleRemove = useCallback(
    (id: string): void => {
      // Decide the focus target BEFORE removal, from the current ordering:
      // next row's toggle, else previous row's toggle, else the Add button.
      const idx = items.findIndex((it) => it.id === id);
      const next = items[idx + 1];
      const prev = items[idx - 1];
      pendingFocusId.current = next?.id ?? prev?.id ?? '__add__';
      onRemove(id);
    },
    [items, onRemove],
  );

  // After the list re-renders (post-delete), move focus to the chosen target.
  useEffect(() => {
    const target = pendingFocusId.current;
    if (target === null) return;
    pendingFocusId.current = null;
    if (target === '__add__') {
      addBtnRef.current?.focus();
      return;
    }
    toggleRefs.current.get(target)?.focus();
  }, [items]);

  return (
    <section className="spytial-ed-section" aria-label={title}>
      <div className="spytial-ed-section-head">
        <h3 className="spytial-ed-section-title">{title}</h3>
        <AddMenu
          kind={kind}
          onAdd={onAddItem}
          disabled={disabled}
          triggerRef={addBtnRef}
        />
      </div>

      <ul className="spytial-ed-rows" aria-label={listLabel}>
        {items.map((item, index) => (
          <Row
            key={item.id}
            item={item}
            index={index}
            count={items.length}
            diagnostics={diagnostics}
            options={options}
            selectorProps={selectorProps}
            expanded={expandedId === item.id}
            onToggleExpand={onToggleExpand}
            onCollapse={onCollapse}
            registerToggle={registerToggle}
            onUpdateParam={onUpdateParam}
            onUpdateComment={onUpdateComment}
            onToggleNegate={onToggleNegate}
            onDuplicate={onDuplicate}
            onRemove={handleRemove}
            onMove={onMove}
            disabled={disabled}
          />
        ))}
      </ul>
    </section>
  );
};

// ---- a single row --------------------------------------------------------

interface RowProps {
  item: SpecItem;
  index: number;
  count: number;
  diagnostics?: readonly Diagnostic[];
  options?: FieldRendererOptions;
  selectorProps?: (item: SpecItem, field: FieldSpec) => SelectorFieldExtras | undefined;
  expanded: boolean;
  onToggleExpand(id: string): void;
  /** collapse the row and return focus to its toggle (Esc / APG accordion). */
  onCollapse(id: string): void;
  /** register/unregister this row's toggle button for focus management. */
  registerToggle(id: string, el: HTMLButtonElement | null): void;
  onUpdateParam(id: string, key: string, value: unknown): void;
  onUpdateComment(id: string, comment: string): void;
  onToggleNegate(id: string, negated: boolean): void;
  onDuplicate(id: string): void;
  onRemove(id: string): void;
  onMove(id: string, direction: -1 | 1): void;
  disabled: boolean;
}

const Row: React.FC<RowProps> = ({
  item,
  index,
  count,
  diagnostics,
  options,
  selectorProps,
  expanded,
  onToggleExpand,
  onCollapse,
  registerToggle,
  onUpdateParam,
  onUpdateComment,
  onToggleNegate,
  onDuplicate,
  onRemove,
  onMove,
  disabled,
}) => {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const def = getDefinition(item.type);

  // Register the toggle button so the section can return focus to it (on Esc)
  // or to a sibling (after delete), per the APG accordion focus guidance.
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const itemId = item.id;
  useEffect(() => {
    registerToggle(itemId, toggleRef.current);
    return () => registerToggle(itemId, null);
  }, [itemId, registerToggle]);

  const itemDiagnostics = useMemo(
    () => (diagnostics ?? []).filter((d) => d.itemId === item.id),
    [diagnostics, item.id],
  );
  const severity = topSeverity(itemDiagnostics);

  // Unknown / unregistered types render read-only ("preserved as written").
  if (!def) {
    return (
      <li className="spytial-ed-row spytial-ed-row--unknown">
        <div className="spytial-ed-row-main">
          <span className="spytial-ed-badge spytial-ed-badge--unknown">
            {item.kind === 'constraint' ? 'C' : 'D'}
          </span>
          <span className="spytial-ed-row-type">{item.type}</span>
          <span className="spytial-ed-row-summary spytial-ed-row-summary--muted">
            preserved as written
          </span>
        </div>
      </li>
    );
  }

  const summary = (() => {
    try {
      return def.summary(item.params);
    } catch {
      return '';
    }
  })();

  const negatable = NEGATABLE_TYPES.has(item.type);
  const negated = item.params.hold === 'never';

  return (
    <li
      className={`spytial-ed-row${expanded ? ' spytial-ed-row--expanded' : ''}${
        severity ? ` spytial-ed-row--${severity}` : ''
      }`}
    >
      <div className="spytial-ed-row-main">
        <button
          ref={toggleRef}
          type="button"
          className="spytial-ed-row-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          disabled={disabled}
          onClick={() => onToggleExpand(item.id)}
        >
          <span
            className={`spytial-ed-badge spytial-ed-badge--${item.kind}`}
            aria-hidden="true"
          >
            {item.kind === 'constraint' ? 'C' : 'D'}
          </span>
          <span className="spytial-ed-row-type">{def.label}</span>
          {negated ? (
            <span
              className="spytial-ed-row-negated"
              role="img"
              aria-label="should not hold"
              title="should not hold (hold: never)"
            >
              ¬
            </span>
          ) : null}
          <span className="spytial-ed-row-summary">{summary}</span>
          {severity ? (
            <span
              className={`spytial-ed-row-dot spytial-ed-row-dot--${severity}`}
              role="img"
              aria-label={`${severity}: ${itemDiagnostics.length} issue${
                itemDiagnostics.length === 1 ? '' : 's'
              }`}
            />
          ) : null}
        </button>

        <OverflowMenu
          item={item}
          index={index}
          count={count}
          disabled={disabled}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onMove={onMove}
          onAddComment={() => onToggleExpand(item.id)}
        />
      </div>

      {expanded ? (
        <div
          className="spytial-ed-row-panel"
          id={panelId}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              // Collapse and return focus to this row's toggle (APG accordion).
              onCollapse(item.id);
              toggleRef.current?.focus();
            }
          }}
        >
          <FieldRenderer
            fields={visibleFields(def.fields)}
            values={item.params}
            diagnostics={itemDiagnostics}
            options={options}
            disabled={disabled}
            onChange={(key, value) => onUpdateParam(item.id, key, value)}
            selectorProps={
              selectorProps
                ? (field) => selectorProps(item, field)
                : undefined
            }
          />

          {negatable ? (
            <div className="spytial-ed-field spytial-ed-field--hold">
              <span
                className="spytial-ed-field-label"
                id={`${baseId}-hold-label`}
                title="Whether this constraint must hold, or must NOT hold (hold: never), in the layout."
              >
                Condition
              </span>
              <div className="spytial-ed-field-control">
                <div
                  className="spytial-ed-pills"
                  role="radiogroup"
                  aria-labelledby={`${baseId}-hold-label`}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!negated}
                    className={`spytial-ed-pill${!negated ? ' spytial-ed-pill--active' : ''}`}
                    disabled={disabled}
                    onClick={() => onToggleNegate(item.id, false)}
                  >
                    Should hold
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={negated}
                    className={`spytial-ed-pill${negated ? ' spytial-ed-pill--active spytial-ed-pill--negated' : ''}`}
                    disabled={disabled}
                    onClick={() => onToggleNegate(item.id, true)}
                  >
                    Should not hold
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="spytial-ed-field spytial-ed-field--text">
            <label
              className="spytial-ed-field-label"
              htmlFor={`${baseId}-comment`}
            >
              Comment
            </label>
            <div className="spytial-ed-field-control">
              <input
                id={`${baseId}-comment`}
                type="text"
                className="spytial-ed-input"
                value={item.comment ?? ''}
                placeholder="Optional note (round-trips as a YAML comment)"
                disabled={disabled}
                onChange={(e) => onUpdateComment(item.id, e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
};

// ---- overflow menu -------------------------------------------------------

interface OverflowMenuProps {
  item: SpecItem;
  index: number;
  count: number;
  disabled: boolean;
  onDuplicate(id: string): void;
  onRemove(id: string): void;
  onMove(id: string, direction: -1 | 1): void;
  onAddComment(): void;
}

const OverflowMenu: React.FC<OverflowMenuProps> = ({
  item,
  index,
  count,
  disabled,
  onDuplicate,
  onRemove,
  onMove,
  onAddComment,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  // Fixed positioning so host containers with overflow clipping (demo
  // sidebars) can't cut the menu off; flips above the button when cramped.
  const menuStyle = useAnchoredPopup(open, btnRef, {
    align: 'end',
    estimatedHeight: 220,
  });
  const label = getDefinition(item.type)?.label ?? item.type;

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const run = useCallback(
    (fn: () => void) => {
      fn();
      close();
    },
    [close],
  );

  return (
    <div className="spytial-ed-overflow" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="spytial-ed-overflow-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open ? (
        <ul
          className="spytial-ed-overflow-menu"
          style={menuStyle}
          role="menu"
          aria-label={`Actions for ${label}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="spytial-ed-overflow-item"
              onClick={() => run(onAddComment)}
            >
              Add comment
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="spytial-ed-overflow-item"
              onClick={() => run(() => onDuplicate(item.id))}
            >
              Duplicate
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="spytial-ed-overflow-item"
              disabled={index === 0}
              onClick={() => run(() => onMove(item.id, -1))}
            >
              Move up
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="spytial-ed-overflow-item"
              disabled={index >= count - 1}
              onClick={() => run(() => onMove(item.id, 1))}
            >
              Move down
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="spytial-ed-overflow-item spytial-ed-overflow-item--danger"
              aria-label={`Remove ${label} ${item.kind}`}
              onClick={() => run(() => onRemove(item.id))}
            >
              Delete
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
};

// ---- add menu (searchable) -----------------------------------------------

interface AddMenuProps {
  kind: ItemKind;
  onAdd(kind: ItemKind, type: string): void;
  disabled: boolean;
  /** ref to the trigger button, for post-delete focus fallback. */
  triggerRef?: React.Ref<HTMLButtonElement>;
}

const AddMenu: React.FC<AddMenuProps> = ({ kind, onAdd, disabled, triggerRef }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Local trigger ref for popup anchoring, merged with the external ref the
  // section uses for focus management.
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const setTriggerRef = useCallback(
    (el: HTMLButtonElement | null): void => {
      btnRef.current = el;
      if (typeof triggerRef === 'function') {
        triggerRef(el);
      } else if (triggerRef && typeof triggerRef === 'object') {
        (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
      }
    },
    [triggerRef],
  );

  // Fixed positioning so the menu can't be clipped by host containers (the
  // original absolute menu rendered BELOW a short sidebar and was invisible).
  const menuStyle = useAnchoredPopup(open, btnRef, {
    align: 'end',
    estimatedHeight: 320,
  });

  // Deprecated types are hidden from the add menu (getDefinitions default).
  const defs = useMemo(() => getDefinitions(kind), [kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return defs;
    return defs.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q),
    );
  }, [defs, query]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const onDocMouseDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const choose = useCallback(
    (type: string) => {
      onAdd(kind, type);
      close();
    },
    [onAdd, kind, close],
  );

  const label = kind === 'constraint' ? 'Add constraint' : 'Add directive';

  return (
    <div className="spytial-ed-add" ref={wrapRef}>
      <button
        ref={setTriggerRef}
        type="button"
        className="spytial-ed-add-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        + {label}
      </button>

      {open ? (
        <div
          className="spytial-ed-add-menu"
          style={menuStyle}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="spytial-ed-add-search"
            value={query}
            placeholder="Search types…"
            aria-label={`Search ${kind} types`}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="spytial-ed-add-list">
            {filtered.length === 0 ? (
              <li className="spytial-ed-add-empty">No matching types.</li>
            ) : (
              filtered.map((d) => (
                <li key={d.type} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="spytial-ed-add-item"
                    onClick={() => choose(d.type)}
                  >
                    <span className="spytial-ed-add-item-label">{d.label}</span>
                    {d.description ? (
                      <span className="spytial-ed-add-item-desc">
                        {d.description}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

// ---- helpers -------------------------------------------------------------

/** Hide the internal `hold` param from the form — surfaced as a Negate toggle. */
function visibleFields(fields: readonly FieldSpec[]): FieldSpec[] {
  return fields.filter((f) => f.key !== 'hold');
}

function topSeverity(
  ds: readonly Diagnostic[],
): Diagnostic['severity'] | undefined {
  if (ds.length === 0) return undefined;
  if (ds.some((d) => d.severity === 'error')) return 'error';
  if (ds.some((d) => d.severity === 'warning')) return 'warning';
  return 'info';
}
