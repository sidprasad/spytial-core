/**
 * {@link IconField} — the `iconPath` field kind: a free-text input plus a
 * browser for the icons that ship with the package.
 *
 * The text input stays authoritative, because `path` accepts four different
 * things (a bundled name, a `pack:name` reference, an absolute URL, a relative
 * asset path) and only the first is enumerable. The browser is an assist for
 * the discoverable case, not a replacement for typing: nothing it offers is
 * unavailable by hand, and anything typed by hand still works.
 *
 * Bundled icons are inlined data URIs, so they preview truthfully with no
 * network. Pack references resolve to a CDN at render time and therefore
 * *cannot* be previewed here — they are listed as guidance (prefix, name, a
 * copyable example) rather than shown as thumbnails, which is honest about the
 * fact that they need a connection to draw.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  getBundledIconNames,
  getBundledIconSvg,
  getIconPacks,
} from '../../layout/icon-registry';
import { useAnchoredPopup } from './use-anchored-popup';

/**
 * Draw a bundled icon by inlining its markup, so `fill="currentColor"` picks up
 * the surrounding theme. An `<img>` cannot do this: `currentColor` there
 * resolves against the SVG document (initial `color`: black), which is
 * invisible on the dark theme's surface.
 *
 * `dangerouslySetInnerHTML` is safe here *by construction*: `getBundledIconSvg`
 * only ever returns markup this package authored at compile time, and returns
 * `undefined` for anything else — so an author-supplied path can never reach
 * it. Callers must keep that invariant; never pass a typed value through.
 */
const BundledGlyph: React.FC<{ name: string; className?: string }> = ({
  name,
  className,
}) => {
  const svg = getBundledIconSvg(name);
  if (!svg) return null;
  return (
    <span
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export interface IconFieldProps {
  /** controlled value — whatever the author typed or picked */
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export const IconField: React.FC<IconFieldProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popupId = useId();

  const popupStyle = useAnchoredPopup(open, btnRef, {
    align: 'end',
    estimatedHeight: 340,
  });

  const bundled = useMemo(() => getBundledIconNames(), []);
  const packs = useMemo(() => getIconPacks(), []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? bundled.filter((n) => n.includes(q)) : bundled;
  }, [bundled, query]);

  // Close on click-outside, matching the overflow menu's behaviour.
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

  const pick = (name: string): void => {
    onChange(name);
    setOpen(false);
  };

  // Preview the current value only when it is a bundled icon: those inline with
  // no network and inherit the theme colour. A CDN or remote URL would need a
  // round-trip, and a broken one would render a browser error glyph inside the
  // form.
  const previewable = !!value && !!getBundledIconSvg(value);

  return (
    <div className="spytial-ed-icon" ref={wrapRef}>
      <div className="spytial-ed-icon-row">
        {previewable ? (
          <BundledGlyph name={value} className="spytial-ed-icon-preview" />
        ) : null}
        <input
          id={id}
          type="text"
          className="spytial-ed-input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          ref={btnRef}
          type="button"
          className="spytial-ed-icon-btn"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          aria-label="Browse built-in icons"
          title="Browse built-in icons"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">☆</span>
        </button>
      </div>

      {open ? (
        <div
          id={popupId}
          className="spytial-ed-icon-pop"
          style={popupStyle}
          role="dialog"
          aria-label="Built-in icons"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              btnRef.current?.focus();
            }
          }}
        >
          <input
            type="text"
            className="spytial-ed-input spytial-ed-icon-search"
            placeholder={`Filter ${bundled.length} bundled icons…`}
            value={query}
            spellCheck={false}
            aria-label="Filter bundled icons"
            onChange={(e) => setQuery(e.target.value)}
          />

          <p className="spytial-ed-icon-note">
            Bundled icons need no network. You can also type any image URL or
            path.
          </p>

          {matches.length > 0 ? (
            <div className="spytial-ed-icon-grid" role="listbox" aria-label="Bundled icons">
              {matches.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={value === name}
                  className={`spytial-ed-icon-cell${
                    value === name ? ' spytial-ed-icon-cell--active' : ''
                  }`}
                  title={name}
                  onClick={() => pick(name)}
                >
                  <BundledGlyph name={name} className="spytial-ed-icon-cell-glyph" />
                  <span className="spytial-ed-icon-cell-name">{name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="spytial-ed-icon-empty">
              No bundled icon matches “{query.trim()}”. Try an icon pack below,
              or paste a URL.
            </p>
          )}

          <div className="spytial-ed-icon-packs">
            <p className="spytial-ed-icon-note">
              Icon packs — write <code>prefix:name</code>. These load from a CDN
              at render time, so they need a connection and aren’t previewed
              here.
            </p>
            <ul>
              {packs.map((p) => (
                <li key={p.prefix}>
                  <code>{p.prefix}:</code> {p.label}{' '}
                  <span className="spytial-ed-icon-pack-eg">
                    e.g. <code>{p.example}</code>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
};
