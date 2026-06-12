/**
 * WP3 — SelectorField behaviour.
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectorField } from '../src/spec-editor/ui/SelectorField';
import type { Completion } from '../src/spec-editor/domain/assistant';
import type { Diagnostic } from '../src/spec-editor/core/types';

/** Controlled wrapper so typing updates the value like a real host. */
function Harness(props: {
  initial?: string;
  complete?: (prefix: string) => Completion[] | Promise<Completion[]>;
  synthesize?: (request: string) => Promise<{ value: string; explanation?: string }>;
  diagnostics?: Diagnostic[];
  onChangeSpy?: (v: string) => void;
}) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <SelectorField
      value={value}
      onChange={(v) => {
        props.onChangeSpy?.(v);
        setValue(v);
      }}
      aria-label="Selector"
      complete={props.complete}
      synthesize={props.synthesize}
      diagnostics={props.diagnostics}
    />
  );
}

describe('SelectorField — typing & overlay', () => {
  it('typing updates the value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);
    const ta = screen.getByRole('combobox');
    await user.type(ta, 'parent');
    expect((ta as HTMLTextAreaElement).value).toBe('parent');
    expect(onChange).toHaveBeenCalled();
  });

  it('overlay mirror receives the same text (smoke)', () => {
    render(<Harness initial="left.child + right.child" />);
    // The aria-hidden mirror renders the highlighted tokens; its text content
    // must equal the textarea value.
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    const mirror = ta.parentElement!.querySelector(
      '.spytial-ed-selector-mirror'
    ) as HTMLElement;
    expect(mirror).toBeTruthy();
    expect(mirror.textContent).toBe('left.child + right.child');
    // a keyword should be highlighted with a syn class
    render(<Harness initial="univ" />);
    expect(document.querySelector('.spytial-ed-syn-keyword')?.textContent).toBe(
      'univ'
    );
  });

  it('highlight={false} kills the mirror and shows plain visible text', () => {
    // The escape hatch for hosts where the overlay misaligns: no mirror in the
    // DOM at all, and the textarea carries the --plain modifier (own text).
    render(
      <SelectorField value="left + right" onChange={() => {}} highlight={false} />
    );
    expect(
      document.querySelector('.spytial-ed-selector-mirror')
    ).toBeNull();
    const ta = screen.getByRole('combobox');
    expect(ta.className).toContain('spytial-ed-selector-textarea--plain');
  });
});

describe('SelectorField — autocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const complete = (prefix: string): Completion[] =>
    [
      { label: 'parent', kind: 'relation', detail: 'relation · arity 2' },
      { label: 'parentOf', kind: 'relation' },
      { label: 'Node', kind: 'type' },
    ].filter((c) => c.label.toLowerCase().startsWith(prefix.toLowerCase())) as Completion[];

  // Type `text` into the textarea synchronously, with the caret at the end.
  // Uses fireEvent (not userEvent) so it composes cleanly with fake timers.
  function typeInto(ta: HTMLTextAreaElement, text: string): void {
    fireEvent.change(ta, { target: { value: text } });
    ta.setSelectionRange(text.length, text.length);
  }

  // Run the debounce timer and let any resolved completion promises settle.
  async function flush(ms = 200): Promise<void> {
    await act(async () => {
      vi.advanceTimersByTime(ms);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('opens and filters as the user types, accepts via Enter', async () => {
    render(<Harness complete={complete} />);
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    ta.focus();

    typeInto(ta, 'par');
    await flush();

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeTruthy();
    const options = screen.getAllByRole('option');
    // 'par' filters to parent + parentOf (Node excluded)
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent?.replace(/\s+/g, ''))).toEqual(
      expect.arrayContaining([expect.stringContaining('parent')])
    );
    expect(ta.getAttribute('aria-expanded')).toBe('true');
    expect(ta.getAttribute('aria-activedescendant')).toBe(options[0].id);

    // accept the first option with Enter
    fireEvent.keyDown(ta, { key: 'Enter' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(ta.value).toBe('parent');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('navigates with arrows and accepts with Tab', async () => {
    render(<Harness complete={complete} />);
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    ta.focus();
    typeInto(ta, 'par');
    await flush();
    screen.getByRole('listbox');
    fireEvent.keyDown(ta, { key: 'ArrowDown' }); // -> parentOf
    fireEvent.keyDown(ta, { key: 'Tab' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(ta.value).toBe('parentOf');
  });

  it('Escape dismisses the popup without changing value', async () => {
    render(<Harness complete={complete} />);
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    ta.focus();
    typeInto(ta, 'par');
    await flush();
    screen.getByRole('listbox');
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(ta.value).toBe('par');
  });

  it('Ctrl+Space requests completions explicitly', async () => {
    const spy = vi.fn(complete);
    render(<Harness complete={spy} initial="par" />);
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(3, 3); // caret at end
    fireEvent.keyDown(ta, { code: 'Space', ctrlKey: true });
    await flush();
    expect(spy).toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('drops stale async responses (only the latest wins)', async () => {
    // First call resolves slowly with one set, second resolves fast with another.
    let callCount = 0;
    const slowThenFast = (prefix: string): Promise<Completion[]> => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) =>
          setTimeout(() => resolve([{ label: 'STALE', kind: 'keyword' }]), 500)
        );
      }
      return Promise.resolve([{ label: `FRESH_${prefix}`, kind: 'keyword' }]);
    };

    render(<Harness complete={slowThenFast} />);
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    ta.focus();

    typeInto(ta, 'a');
    await act(async () => {
      vi.advanceTimersByTime(160);
    }); // fires request #1 (slow, pending)
    typeInto(ta, 'ab');
    await flush(); // fires request #2 (fast) -> resolves immediately

    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent).toContain('FRESH');

    // now let the slow (stale) one resolve — it must NOT replace the list
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('listbox').textContent).toContain('FRESH');
    expect(screen.getByRole('listbox').textContent).not.toContain('STALE');
  });

  it('never crashes on a rejected completion promise', async () => {
    const rejecting = (): Promise<Completion[]> =>
      Promise.reject(new Error('boom'));
    render(<Harness complete={rejecting} />);
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    ta.focus();
    typeInto(ta, 'x');
    await flush();
    // No listbox, no throw.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(ta.value).toBe('x');
  });
});

describe('SelectorField — synthesis (✨)', () => {
  it('does NOT render the ✨ button when synthesize is absent', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: /generate selector/i })
    ).toBeNull();
  });

  it('renders the ✨ button when synthesize is provided', () => {
    render(<Harness synthesize={async () => ({ value: 'x' })} />);
    expect(
      screen.getByRole('button', { name: /generate selector/i })
    ).toBeTruthy();
  });

  it('happy path: request -> preview -> Accept writes value', async () => {
    const user = userEvent.setup();
    const synthesize = vi.fn(async (request: string) => ({
      value: 'left + right',
      explanation: `from: ${request}`,
    }));
    render(<Harness synthesize={synthesize} />);

    await user.click(
      screen.getByRole('button', { name: /generate selector/i })
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    const input = screen.getByLabelText('Selector description');
    await user.type(input, 'children of a node');
    await user.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() =>
      expect(screen.getByText(/from: children of a node/i)).toBeTruthy()
    );
    expect(synthesize).toHaveBeenCalledWith('children of a node');

    await user.click(screen.getByRole('button', { name: /^accept$/i }));
    const ta = screen.getByRole('combobox') as HTMLTextAreaElement;
    expect(ta.value).toBe('left + right');
    // popover closed
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('error path: rejection renders inline, never throws', async () => {
    const user = userEvent.setup();
    const synthesize = vi.fn(async () => {
      throw new Error('model unavailable');
    });
    render(<Harness synthesize={synthesize} />);
    await user.click(
      screen.getByRole('button', { name: /generate selector/i })
    );
    await user.type(
      screen.getByLabelText('Selector description'),
      'something'
    );
    await user.click(screen.getByRole('button', { name: /^generate$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('model unavailable');
    // value untouched
    expect((screen.getByRole('combobox') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('SelectorField — diagnostics', () => {
  it('renders diagnostic messages and marks the field invalid on error', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'error', message: 'unknown relation `foo`', source: 'domain' },
      { severity: 'warning', message: 'type Bar not in instance', source: 'domain' },
    ];
    render(<Harness initial="foo" diagnostics={diagnostics} />);
    expect(screen.getByText('unknown relation `foo`')).toBeTruthy();
    expect(screen.getByText('type Bar not in instance')).toBeTruthy();
    const ta = screen.getByRole('combobox');
    expect(ta.getAttribute('aria-invalid')).toBe('true');
  });

  it('no diagnostics -> not invalid, no list', () => {
    render(<Harness initial="foo" />);
    const ta = screen.getByRole('combobox');
    expect(ta.getAttribute('aria-invalid')).toBeNull();
    expect(document.querySelector('.spytial-ed-diagnostics')).toBeNull();
  });
});
