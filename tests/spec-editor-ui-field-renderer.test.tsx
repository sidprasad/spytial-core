/**
 * WP3 — FieldRenderer behaviour across every FieldKind.
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FieldRenderer } from '../src/spec-editor/ui/FieldRenderer';
import type { FieldSpec, Diagnostic } from '../src/spec-editor/core/types';

function Harness(props: {
  fields: FieldSpec[];
  initial?: Record<string, unknown>;
  options?: { relationNames?: string[]; typeNames?: string[] };
  diagnostics?: Diagnostic[];
  onChangeSpy?: (key: string, value: unknown) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(
    props.initial ?? {}
  );
  return (
    <FieldRenderer
      fields={props.fields}
      values={values}
      options={props.options}
      diagnostics={props.diagnostics}
      onChange={(key, value) => {
        props.onChangeSpy?.(key, value);
        setValues((v) => ({ ...v, [key]: value }));
      }}
    />
  );
}

describe('FieldRenderer — text', () => {
  it('renders a text input and fires onChange with a string', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <Harness
        fields={[{ key: 'name', kind: 'text', label: 'Name' }]}
        onChangeSpy={spy}
      />
    );
    const input = screen.getByLabelText('Name');
    await user.type(input, 'hi');
    expect(spy).toHaveBeenLastCalledWith('name', 'hi');
  });
});

describe('FieldRenderer — number', () => {
  it('emits a number for parseable input and empty string when cleared', () => {
    const spy = vi.fn();
    render(
      <Harness
        fields={[{ key: 'width', kind: 'number', label: 'Width' }]}
        onChangeSpy={spy}
      />
    );
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });
    expect(spy).toHaveBeenLastCalledWith('width', 42);
    fireEvent.change(input, { target: { value: '' } });
    expect(spy).toHaveBeenLastCalledWith('width', '');
  });
});

describe('FieldRenderer — boolean', () => {
  it('renders a switch and toggles', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <Harness
        fields={[{ key: 'addEdge', kind: 'boolean', label: 'Add edge' }]}
        initial={{ addEdge: false }}
        onChangeSpy={spy}
      />
    );
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await user.click(sw);
    expect(spy).toHaveBeenLastCalledWith('addEdge', true);
  });
});

describe('FieldRenderer — color', () => {
  it('renders a swatch + hex input and fires onChange', () => {
    const spy = vi.fn();
    render(
      <Harness
        fields={[{ key: 'value', kind: 'color', label: 'Color' }]}
        initial={{ value: '#ff0000' }}
        onChangeSpy={spy}
      />
    );
    const swatch = screen.getByLabelText('Color color') as HTMLInputElement;
    expect(swatch.type).toBe('color');
    fireEvent.change(swatch, { target: { value: '#00ff00' } });
    expect(spy).toHaveBeenLastCalledWith('value', '#00ff00');
    const hex = screen.getByLabelText('Color hex value') as HTMLInputElement;
    fireEvent.change(hex, { target: { value: '#abcdef' } });
    expect(spy).toHaveBeenLastCalledWith('value', '#abcdef');
  });
});

describe('FieldRenderer — enum (single)', () => {
  it('renders radio pills and selects one', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <Harness
        fields={[
          {
            key: 'direction',
            kind: 'enum',
            label: 'Direction',
            options: ['clockwise', 'counterclockwise'],
          },
        ]}
        onChangeSpy={spy}
      />
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    await user.click(radios[1]);
    expect(spy).toHaveBeenLastCalledWith('direction', 'counterclockwise');
  });
});

describe('FieldRenderer — enum (multiple)', () => {
  it('renders toggle pills and adds/removes selections', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <Harness
        fields={[
          {
            key: 'directions',
            kind: 'enum',
            label: 'Directions',
            multiple: true,
            options: ['above', 'below', 'left', 'right'],
          },
        ]}
        initial={{ directions: ['above'] }}
        onChangeSpy={spy}
      />
    );
    const pills = screen.getAllByRole('button');
    // 'above' pill should be pressed
    const above = screen.getByRole('button', { name: 'above' });
    expect(above.getAttribute('aria-pressed')).toBe('true');
    // toggle 'left' on
    await user.click(screen.getByRole('button', { name: 'left' }));
    expect(spy).toHaveBeenLastCalledWith('directions', ['above', 'left']);
    // toggle 'above' off
    await user.click(screen.getByRole('button', { name: 'above' }));
    expect(spy).toHaveBeenLastCalledWith('directions', ['left']);
    expect(pills.length).toBe(4);
  });
});

describe('FieldRenderer — relationName / typeName combo', () => {
  it('shows a datalist with options when provided', () => {
    render(
      <Harness
        fields={[{ key: 'field', kind: 'relationName', label: 'Field' }]}
        options={{ relationNames: ['parent', 'next', 'left'] }}
      />
    );
    const input = screen.getByLabelText('Field') as HTMLInputElement;
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(listId!);
    expect(datalist?.tagName.toLowerCase()).toBe('datalist');
    expect(datalist!.querySelectorAll('option')).toHaveLength(3);
  });

  it('is a plain input (no datalist) when no options are provided', () => {
    render(
      <Harness
        fields={[{ key: 'field', kind: 'relationName', label: 'Field' }]}
      />
    );
    const input = screen.getByLabelText('Field') as HTMLInputElement;
    expect(input.getAttribute('list')).toBeNull();
    expect(document.querySelector('datalist')).toBeNull();
  });

  it('allows free text regardless of options', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <Harness
        fields={[{ key: 'sig', kind: 'typeName', label: 'Type' }]}
        options={{ typeNames: ['Node'] }}
        onChangeSpy={spy}
      />
    );
    const input = screen.getByLabelText('Type');
    await user.type(input, 'Custom');
    expect(spy).toHaveBeenLastCalledWith('sig', 'Custom');
  });
});

describe('FieldRenderer — selector', () => {
  it('renders a SelectorField and forwards selectorProps', () => {
    const complete = vi.fn(() => []);
    render(
      <FieldRenderer
        fields={[
          {
            key: 'selector',
            kind: 'selector',
            label: 'Selector',
            selectorArity: 'binary',
          },
        ]}
        values={{ selector: 'parent' }}
        onChange={() => {}}
        selectorProps={() => ({ complete })}
      />
    );
    // SelectorField's editable element is the combobox (APG editable pattern).
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    expect(ta.value).toBe('parent');
  });
});

describe('FieldRenderer — required + diagnostics', () => {
  it('marks required fields and renders per-field diagnostics', () => {
    const diagnostics: Diagnostic[] = [
      {
        severity: 'error',
        message: 'name is required',
        fieldKey: 'name',
        source: 'structure',
      },
    ];
    render(
      <Harness
        fields={[
          { key: 'name', kind: 'text', label: 'Name', required: true },
          { key: 'note', kind: 'text', label: 'Note' },
        ]}
        diagnostics={diagnostics}
      />
    );
    // required marker present
    expect(screen.getByText('Name').textContent).toContain('*');
    // diagnostic shown only on the matching field
    expect(screen.getByText('name is required')).toBeTruthy();
    const nameInput = screen.getByLabelText(/Name/);
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    const noteInput = screen.getByLabelText('Note');
    expect(noteInput.getAttribute('aria-invalid')).toBeNull();
  });
});
