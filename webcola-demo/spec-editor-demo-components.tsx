/**
 * Spec Editor demo — showcases the schema-driven Spytial spec editor with BOTH
 * integration hooks wired up:
 *
 *  1. Domain awareness — a real `AlloyDataInstance` (a small binary-search-tree
 *     instance with sigs `Node` and fields `left`/`right`/`key`) gives the
 *     editor live type/relation dropdowns and selector completions.
 *  2. A mock `SelectorAssistant` — `synthesize()` turns a natural-language
 *     request into a plausible selector after ~600ms (keyword-matched against
 *     the domain's relations) with an explanation; `review()` flags any
 *     selector containing the literal `TODO`.
 *
 * Plus a theme switcher (default light / dark / a custom "funky" theme via the
 * `theme` prop) so the appearance hook is demonstrated too.
 *
 * Mount with `mountSpecEditorDemo('spec-editor-demo-root')`. The bundle exposes
 * the function on `window.SpecEditorDemo` and as `window.mountSpecEditorDemo`.
 */

import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpecEditor, registerSpecEditorThemes } from '../src/spec-editor';
import type {
  Diagnostic,
  SelectorAssistant,
  SelectorAssistContext,
  SpecEditorTheme,
} from '../src/spec-editor';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';
import type { IInputDataInstance } from '../src/data-instance/interfaces';

// ── Sample domain (binary-search-tree instance) ──────────────────────────────
// Inlined so the demo is self-contained (no fetch). Mirrors sample/forge/datum.xml.
const SAMPLE_BST_XML = `<alloy builddate="2025-05-14">
<instance bitwidth="4" maxseq="-1" command="bst" filename="bst.frg" version="4.1">
<sig label="seq/Int" ID="0" parentID="1" builtin="yes"></sig>
<sig label="Int" ID="1" parentID="2" builtin="yes"></sig>
<sig label="univ" ID="2" builtin="yes"></sig>
<field label="no-field-guard" ID="3" parentID="2">
<types> <type ID="2"/><type ID="2"/> </types>
</field>
<sig label="Node" ID="4" parentID="2">
<atom label="Node0"/><atom label="Node1"/><atom label="Node2"/><atom label="Node3"/><atom label="Node4"/>
</sig>
<field label="right" ID="5" parentID="4">
<tuple><atom label="Node1"/><atom label="Node4"/></tuple>
<tuple><atom label="Node3"/><atom label="Node0"/></tuple>
<types><type ID="4"/><type ID="4"/></types>
</field>
<field label="key" ID="6" parentID="4">
<tuple><atom label="Node0"/><atom label="7"/></tuple>
<tuple><atom label="Node1"/><atom label="7"/></tuple>
<tuple><atom label="Node2"/><atom label="6"/></tuple>
<tuple><atom label="Node3"/><atom label="6"/></tuple>
<tuple><atom label="Node4"/><atom label="5"/></tuple>
<types><type ID="4"/><type ID="1"/></types>
</field>
<field label="left" ID="7" parentID="4">
<tuple><atom label="Node3"/><atom label="Node1"/></tuple>
<tuple><atom label="Node4"/><atom label="Node2"/></tuple>
<types><type ID="4"/><type ID="4"/></types>
</field>
</instance>
</alloy>`;

function buildSampleInstance(): IInputDataInstance | undefined {
  try {
    const datum = parseAlloyXML(SAMPLE_BST_XML);
    return new AlloyDataInstance(datum.instances[0]);
  } catch (err) {
    // Never let a fixture problem break the demo; fall back to no domain.
    // eslint-disable-next-line no-console
    console.warn('spec-editor demo: failed to build sample instance', err);
    return undefined;
  }
}

const INITIAL_SPEC = `constraints:
  # the left child sits below-left of its parent
  - orientation:
      selector: left
      directions:
        - directlyLeft
        - below
  - orientation:
      selector: right
      directions:
        - directlyRight
        - below
directives:
  - attribute:
      field: key
  - flag: hideDisconnectedBuiltIns
`;

// ── Mock SelectorAssistant (demonstrates both hooks) ─────────────────────────

/** Keyword-match the request against the domain's relations + a few stock forms. */
function synthesizeSelector(
  ctx: SelectorAssistContext,
  request: string,
): { value: string; explanation?: string } {
  const lower = request.toLowerCase();
  const relations = ctx.domain?.relations ?? [];
  const types = ctx.domain?.types ?? [];

  // 1. Direct relation name mention wins.
  for (const rel of relations) {
    if (lower.includes(rel.name.toLowerCase())) {
      return {
        value: rel.name,
        explanation: `Matched the relation "${rel.name}" mentioned in your request.`,
      };
    }
  }
  // 2. Intent words → composed selectors over known relations.
  if (/child|children|descend/.test(lower) && relations.some((r) => r.name === 'left')) {
    return {
      value: 'left + right',
      explanation: 'Both child edges (the union of the left and right relations).',
    };
  }
  if (/leaf|childless/.test(lower) && types.some((t) => t.name === 'Node')) {
    return {
      value: 'Node - (left + right).Node',
      explanation: 'Nodes that are not the parent end of any child edge (leaves).',
    };
  }
  // 3. A type mention → that type's atoms.
  for (const t of types) {
    if (lower.includes(t.name.toLowerCase())) {
      return {
        value: t.name,
        explanation: `All atoms of the "${t.name}" sig.`,
      };
    }
  }
  // 4. Fallback.
  const first = relations[0]?.name ?? types[0]?.name ?? 'univ';
  return {
    value: first,
    explanation: `Couldn't match your request precisely; suggesting "${first}" as a starting point.`,
  };
}

const mockAssistant: SelectorAssistant = {
  // Natural-language → selector, after a realistic delay.
  synthesize: (ctx, request) =>
    new Promise((resolve) => {
      setTimeout(() => resolve(synthesizeSelector(ctx, request)), 600);
    }),
  // Lint: flag any selector that still contains a TODO placeholder.
  review: (ctx, value) =>
    new Promise((resolve) => {
      const diagnostics: Diagnostic[] = [];
      if (/TODO/.test(value)) {
        diagnostics.push({
          severity: 'warning',
          message: 'Selector contains a "TODO" — replace it before rendering.',
          source: 'assistant',
        });
      }
      setTimeout(() => resolve(diagnostics), 200);
    }),
};

// ── Theme presets ────────────────────────────────────────────────────────────

const funkyTheme: SpecEditorTheme = {
  accent: '#ff2e88',
  accentText: '#1a022b',
  surface: '#fdf2ff',
  surfaceRaised: '#f6e0ff',
  border: '#e2a8ff',
  text: '#2a0a3d',
  textMuted: '#8a4fb0',
  danger: '#e11d48',
  warning: '#d97706',
  success: '#0ea5a3',
  fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
  radius: '12px',
  synKeyword: '#d6009d',
  synType: '#0891b2',
  synRelation: '#7c3aed',
  synOperator: '#db2777',
  synString: '#ca8a04',
  synComment: '#9d6fb8',
};

// 'light' and 'dark' resolve by NAME from the built-in registry (the same
// convention as webcola-cnd-graph's theme attribute); 'funky' is registered
// here as a custom named theme to demonstrate registerSpecEditorThemes.
type ThemeChoice = 'light' | 'dark' | 'funky';

registerSpecEditorThemes({ funky: funkyTheme });

// ── Demo app ─────────────────────────────────────────────────────────────────

const SpecEditorDemoApp: React.FC = () => {
  const instance = useMemo(() => buildSampleInstance(), []);
  const [value, setValue] = useState<string>(INITIAL_SPEC);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('light');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  const wrapStyle: React.CSSProperties =
    themeChoice === 'dark'
      ? { background: '#101014', padding: 16, borderRadius: 8 }
      : { padding: 16 };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontWeight: 600 }}>
          Theme:{' '}
          <select
            value={themeChoice}
            onChange={(e) => setThemeChoice(e.target.value as ThemeChoice)}
          >
            <option value="light">Default (light)</option>
            <option value="dark">Dark</option>
            <option value="funky">Funky (custom)</option>
          </select>
        </label>
        <span style={{ color: '#6b6b75', fontSize: 13 }}>
          {instance
            ? 'Domain loaded: sig Node · fields left, right, key — try the ✨ button or type a selector.'
            : 'No domain (fixture unavailable) — completions are language-only.'}
        </span>
      </div>

      <div style={wrapStyle}>
        <SpecEditor
          value={value}
          onChange={setValue}
          instance={instance}
          selectorAssistant={mockAssistant}
          theme={themeChoice === 'light' ? undefined : themeChoice}
          onDiagnostics={setDiagnostics}
          aria-label="Spytial spec editor demo"
        />
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Diagnostics ({diagnostics.length}) &amp; current YAML
        </summary>
        <ul style={{ fontSize: 13 }}>
          {diagnostics.map((d, i) => (
            <li key={i}>
              <strong>{d.severity}</strong> [{d.source}]: {d.message}
            </li>
          ))}
        </ul>
        <pre
          style={{
            background: '#f5f5f7',
            padding: 12,
            borderRadius: 6,
            overflow: 'auto',
            fontSize: 12,
          }}
        >
          {value}
        </pre>
      </details>
    </div>
  );
};

/**
 * Mount the spec-editor demo into the given container id (default
 * `spec-editor-demo-root`).
 *
 * @public
 */
export function mountSpecEditorDemo(
  containerId = 'spec-editor-demo-root',
): boolean {
  const container = document.getElementById(containerId);
  if (!container) {
    // eslint-disable-next-line no-console
    console.error(`Spec Editor demo: container "${containerId}" not found`);
    return false;
  }
  createRoot(container).render(<SpecEditorDemoApp />);
  return true;
}

if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>;
  win.SpecEditorDemo = { mountSpecEditorDemo };
  win.mountSpecEditorDemo = mountSpecEditorDemo;
}
