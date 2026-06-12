/**
 * WP4 — SpecEditor integration tests.
 *
 * Exercises the public `SpecEditor` component end to end against a real
 * `SpecDocument`, plus a back-compat check for the `CndLayoutInterface` wrapper
 * driven only by its legacy prop surface. Covers the behavioural contract from
 * `docs/SPEC_EDITOR_REDESIGN.md`:
 *
 *   - builder edit → `onChange` fires with round-trippable YAML,
 *   - code-view edit → debounced model sync,
 *   - invalid YAML → diagnostic shown, model preserved, "unapplied edits"
 *     indicator, then valid YAML clears it,
 *   - undo/redo across a builder mutation,
 *   - `theme` prop sets `--spytial-ed-*` custom properties on the editor root,
 *   - `instance` / `domain` props → relationName/typeName datalist options,
 *   - mock assistant with `synthesize` → ✨ affordance appears; without → absent,
 *   - `onDiagnostics` callback fires on validation change.
 *
 * Fake-timer note: prior agents found `userEvent.type` deadlocks with fake
 * timers, so the debounced-sync test uses `fireEvent` for typing while timers
 * are faked and drives the debounce with `vi.advanceTimersByTime`.
 *
 * @vitest-environment jsdom
 */

import React, { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

import { SpecEditor } from '../src/spec-editor/ui/SpecEditor'
import { parseYamlToState } from '../src/spec-editor'
import type {
  Diagnostic,
  SelectorAssistant,
  SpecEditorTheme,
} from '../src/spec-editor'
import { CndLayoutInterface } from '../src/components/CndLayoutInterface'
import type { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces'
import type { IInputDataInstance } from '../src/data-instance/interfaces'
// Sample domain (binary-search-tree instance): sig Node with fields left,
// right (Node->Node) and key (Node->Int). Shared with the CnD layout
// interface integration suite.
import { buildSampleBstInstance as buildSampleInstance } from './helpers/bst-instance-fixture'

/** Controlled host so the editor's YAML value updates like a real consumer. */
function Host(props: {
  initial?: string
  instance?: IInputDataInstance
  theme?: SpecEditorTheme
  selectorAssistant?: SelectorAssistant
  onChangeSpy?: (v: string) => void
  onDiagnosticsSpy?: (d: Diagnostic[]) => void
  defaultView?: 'builder' | 'code'
}) {
  const [value, setValue] = useState(props.initial ?? '')
  return (
    <SpecEditor
      value={value}
      onChange={(v) => {
        props.onChangeSpy?.(v)
        setValue(v)
      }}
      instance={props.instance}
      theme={props.theme}
      selectorAssistant={props.selectorAssistant}
      onDiagnostics={props.onDiagnosticsSpy}
      defaultView={props.defaultView ?? 'builder'}
      aria-label="Spec editor under test"
    />
  )
}

function getBuilderTab(root: HTMLElement = document.body): HTMLElement {
  // The Builder tab's accessible name gains a "Text has unapplied edits" suffix
  // when the badge is present, so match on the leading "Builder".
  return within(root).getByRole('tab', { name: /^Builder/ })
}
function getCodeTab(root: HTMLElement = document.body): HTMLElement {
  return within(root).getByRole('tab', { name: 'Code' })
}

/**
 * Expand a builder row by clicking its type-label text (the row-toggle button).
 * Clicking the label avoids the ambiguity between the toggle button and the
 * "Actions for …" overflow button, which share the type name.
 */
async function expandRow(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByText(label))
}

describe('SpecEditor — builder edits emit round-trippable YAML', () => {
  it('adding a directive fires onChange with YAML that re-parses', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Host onChangeSpy={onChange} defaultView="builder" />)

    // Open the "Add directive" menu and add a Flag directive.
    await user.click(screen.getByRole('button', { name: '+ Add directive' }))
    await user.click(await screen.findByRole('menuitem', { name: /Flag/i }))

    expect(onChange).toHaveBeenCalled()
    const emitted = onChange.mock.calls.at(-1)![0] as string

    // The emitted YAML re-parses into a single flag directive (round trip).
    const state = parseYamlToState(emitted)
    expect(state.directives).toHaveLength(1)
    expect(state.directives[0].type).toBe('flag')

    // And the new flag row is present in the builder.
    expect(screen.getByText('Flag')).toBeInTheDocument()
  })

  it('editing a field via the builder regenerates YAML synchronously', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Host
        initial={'directives:\n  - flag: hideEmptyRelations\n'}
        onChangeSpy={onChange}
        defaultView="builder"
      />,
    )

    // Expand the flag row and edit its Flag text field.
    await expandRow(user, 'Flag')
    const flagInput = (await screen.findByDisplayValue(
      'hideEmptyRelations',
    )) as HTMLInputElement
    fireEvent.change(flagInput, { target: { value: 'hideDisconnectedBuiltIns' } })

    const emitted = onChange.mock.calls.at(-1)![0] as string
    expect(emitted).toContain('hideDisconnectedBuiltIns')
    const state = parseYamlToState(emitted)
    expect(state.directives[0].params.flag).toBe('hideDisconnectedBuiltIns')
  })
})

describe('SpecEditor — code-view edits sync to the model (debounced)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('typing valid YAML applies to the model after the debounce', async () => {
    const onChange = vi.fn()
    // Render synchronously inside act with fake timers active. Use fireEvent for
    // typing (userEvent.type deadlocks under fake timers).
    render(<Host onChangeSpy={onChange} defaultView="code" />)

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    const yaml = 'constraints:\n  - orientation: {}\n'
    act(() => {
      fireEvent.change(textarea, { target: { value: yaml } })
    })

    // onChange fires immediately (text is controlled); model not yet synced.
    expect(onChange).toHaveBeenCalledWith(yaml)

    // Advance past the 300ms parse debounce; the model is replaced.
    act(() => {
      vi.advanceTimersByTime(350)
    })

    // Switch to the builder; the orientation constraint is now in the model.
    act(() => {
      fireEvent.click(getBuilderTab())
    })
    expect(screen.getByText('Orientation')).toBeInTheDocument()
  })
})

describe('SpecEditor — a model mutation cancels a pending code-view parse (Finding 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  // Note: a view toggle FLUSHES (applies) a pending code-view parse rather than
  // discarding it — the builder must reflect what was just typed. The stale-parse
  // guard exists for mutations that race the debounce WITHOUT a toggle, e.g.
  // pressing Undo in the toolbar while a parse is pending. That is what this
  // regression test exercises.
  it('does not let a stale debounced parse discard an undo made within the debounce', () => {
    const onChange = vi.fn()
    render(
      <Host
        initial={'directives:\n  - flag: hideEmptyRelations\n'}
        onChangeSpy={onChange}
        defaultView="builder"
      />,
    )

    // 0) Make one undoable builder edit so Undo is enabled: expand the flag
    //    row and change its value.
    act(() => {
      fireEvent.click(screen.getByText('Flag'))
    })
    const flagInput = screen.getByDisplayValue('hideEmptyRelations') as HTMLInputElement
    act(() => {
      fireEvent.change(flagInput, { target: { value: 'editedFlag' } })
    })
    expect((onChange.mock.calls.at(-1)![0] as string)).toContain('editedFlag')

    // 1) Switch to code view and type completely different valid YAML T (a
    //    single orientation constraint). This schedules the 300ms parse.
    act(() => {
      fireEvent.click(getCodeTab())
    })
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    const T = 'constraints:\n  - orientation: {selector: fromCode}\n'
    act(() => {
      fireEvent.change(textarea, { target: { value: T } })
    })
    // onChange echoes the code text immediately (controlled), parse not yet run.
    expect(onChange).toHaveBeenLastCalledWith(T)

    // 2) Within the debounce window, press Undo — a model mutation that emits
    //    and supersedes the pending parse generation.
    act(() => {
      vi.advanceTimersByTime(100) // still inside the 300ms window
      fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    })
    const undoYaml = onChange.mock.calls.at(-1)![0] as string
    expect(undoYaml).toContain('hideEmptyRelations')

    // 3) Advance well past the original debounce. The STALE parse for T must
    //    abort (its captured generation was superseded by the undo).
    act(() => {
      vi.advanceTimersByTime(500)
    })

    // The undo survives in onChange: nothing replaced it with the stale code
    // text T, and the last value is still the undo emission.
    expect(onChange.mock.calls.at(-1)![0]).toBe(undoYaml)
    expect(onChange).not.toHaveBeenLastCalledWith(T)

    // And it survives in the model: the builder shows the restored flag, not
    // the orientation constraint from the discarded stale code text.
    act(() => {
      fireEvent.click(getBuilderTab())
    })
    expect(screen.getByText('Flag')).toBeInTheDocument()
    expect(screen.queryByText('Orientation')).not.toBeInTheDocument()
    expect(parseYamlToState(undoYaml).directives[0].params.flag).toBe('hideEmptyRelations')
  })
})

describe('SpecEditor — invalid YAML preserves the model and shows a diagnostic', () => {
  it('shows the parse error + unapplied-edits indicator, then clears on valid YAML', async () => {
    vi.useFakeTimers()
    try {
      render(
        <Host
          initial={'constraints:\n  - orientation: {}\n'}
          defaultView="code"
        />,
      )

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

      // Type syntactically invalid YAML.
      act(() => {
        fireEvent.change(textarea, {
          target: { value: 'constraints:\n  - orientation: {directions: [below]' },
        })
        vi.advanceTimersByTime(350)
      })

      // A parse diagnostic is shown and the "unapplied edits" notice appears.
      expect(screen.getByText(/unapplied edits/i)).toBeInTheDocument()
      // The Builder tab carries the warning badge.
      expect(screen.getByLabelText('Text has unapplied edits')).toBeInTheDocument()

      // The model is preserved: switching to the builder still shows the
      // original orientation constraint (NOT cleared by the bad text).
      act(() => {
        fireEvent.click(getBuilderTab())
      })
      expect(screen.getByText('Orientation')).toBeInTheDocument()

      // Go back to code and type valid YAML; the indicator clears.
      act(() => {
        fireEvent.click(getCodeTab())
      })
      const ta2 = screen.getByRole('textbox') as HTMLTextAreaElement
      act(() => {
        fireEvent.change(ta2, { target: { value: 'directives:\n  - flag: foo\n' } })
        vi.advanceTimersByTime(350)
      })

      expect(screen.queryByText(/unapplied edits/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Text has unapplied edits')).not.toBeInTheDocument()
    } finally {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
  })
})

describe('SpecEditor — undo / redo across a builder mutation', () => {
  it('undo removes an added item; redo restores it', async () => {
    const user = userEvent.setup()
    render(<Host defaultView="builder" />)

    // Initially nothing, undo/redo disabled.
    const undo = screen.getByRole('button', { name: 'Undo' })
    const redo = screen.getByRole('button', { name: 'Redo' })
    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()

    // Add a Flag directive.
    await user.click(screen.getByRole('button', { name: '+ Add directive' }))
    await user.click(await screen.findByRole('menuitem', { name: /Flag/i }))
    expect(screen.getByText('Flag')).toBeInTheDocument()
    expect(undo).not.toBeDisabled()

    // Undo removes it.
    await user.click(undo)
    expect(screen.queryByText('Flag')).not.toBeInTheDocument()
    expect(redo).not.toBeDisabled()

    // Redo restores it.
    await user.click(redo)
    expect(screen.getByText('Flag')).toBeInTheDocument()
  })
})

describe('SpecEditor — builder focus management (Finding 4)', () => {
  // The row toggle is the button carrying aria-controls (vs the overflow menu
  // button which carries aria-haspopup). Find it by the type label it contains.
  function rowToggle(label: string): HTMLButtonElement {
    const btns = screen.getAllByRole('button')
    const match = btns.find(
      (b) =>
        b.getAttribute('aria-controls') !== null &&
        b.textContent?.includes(label),
    )
    if (!match) throw new Error(`row toggle for "${label}" not found`)
    return match as HTMLButtonElement
  }

  it('Esc inside an expanded row returns focus to that row’s toggle', async () => {
    const user = userEvent.setup()
    render(
      <Host
        initial={'directives:\n  - flag: hideEmptyRelations\n'}
        defaultView="builder"
      />,
    )

    // Expand the flag row via its toggle button.
    const toggle = rowToggle('Flag')
    await user.click(toggle)
    // The comment input (inside the panel) is present once expanded.
    const commentInput = await screen.findByPlaceholderText(/round-trips as a YAML comment/i)
    commentInput.focus()
    expect(document.activeElement).toBe(commentInput)

    // Press Esc inside the panel: it collapses AND focus returns to the toggle.
    await user.keyboard('{Escape}')
    expect(
      screen.queryByPlaceholderText(/round-trips as a YAML comment/i),
    ).not.toBeInTheDocument()
    expect(document.activeElement).toBe(toggle)
  })

  it('deleting a row moves focus to the next row’s toggle', async () => {
    const user = userEvent.setup()
    // Two directives so a "next" row exists after deleting the first.
    render(
      <Host
        initial={'directives:\n  - flag: hideEmptyRelations\n  - attribute:\n      field: key\n'}
        defaultView="builder"
      />,
    )

    const nextToggle = rowToggle('Attribute')

    // Open the first row's overflow menu and delete it.
    await user.click(screen.getByRole('button', { name: /Actions for Flag/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Remove Flag directive/i }))

    // The flag row is gone; focus landed on the next row's toggle, not <body>.
    expect(screen.queryByText('Flag')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(nextToggle)
  })

  it('deleting the only row falls back to focusing the section’s Add button', async () => {
    const user = userEvent.setup()
    render(
      <Host initial={'directives:\n  - flag: hideEmptyRelations\n'} defaultView="builder" />,
    )

    const addBtn = screen.getByRole('button', { name: '+ Add directive' })

    await user.click(screen.getByRole('button', { name: /Actions for Flag/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Remove Flag directive/i }))

    expect(screen.queryByText('Flag')).not.toBeInTheDocument()
    // No sibling rows remain, so focus falls back to the Add button.
    expect(document.activeElement).toBe(addBtn)
  })
})

describe('SpecEditor — theme prop sets custom properties on the root', () => {
  it('maps theme tokens to --spytial-ed-* custom properties', () => {
    render(
      <Host
        theme={{ accent: 'rgb(1, 2, 3)', radius: '13px', synKeyword: 'rgb(4, 5, 6)' }}
        defaultView="builder"
      />,
    )
    const root = screen.getByRole('region', { name: 'Spec editor under test' })
    expect(root.style.getPropertyValue('--spytial-ed-accent')).toBe('rgb(1, 2, 3)')
    expect(root.style.getPropertyValue('--spytial-ed-radius')).toBe('13px')
    expect(root.style.getPropertyValue('--spytial-ed-syn-keyword')).toBe('rgb(4, 5, 6)')
  })

  it('omits custom properties for tokens not provided', () => {
    render(<Host theme={{ accent: 'rgb(9, 9, 9)' }} defaultView="builder" />)
    const root = screen.getByRole('region', { name: 'Spec editor under test' })
    expect(root.style.getPropertyValue('--spytial-ed-accent')).toBe('rgb(9, 9, 9)')
    // A token we didn't set has no inline custom property (falls back via CSS).
    expect(root.style.getPropertyValue('--spytial-ed-surface')).toBe('')
  })
})

describe('SpecEditor — domain awareness renders datalist options', () => {
  it('relationName field offers the domain relations as datalist options', async () => {
    const user = userEvent.setup()
    const instance = buildSampleInstance()
    // attribute has a relationName "field"; start with one so it renders.
    render(
      <Host
        initial={'directives:\n  - attribute:\n      field: key\n'}
        instance={instance}
        defaultView="builder"
      />,
    )

    // Expand the attribute row to reveal its fields.
    await expandRow(user, 'Attribute')

    // The field input is wired to a datalist; the datalist lists the domain
    // relations (left, right, key) from the BST instance.
    const fieldInput = (await screen.findByDisplayValue('key')) as HTMLInputElement
    const listId = fieldInput.getAttribute('list')
    expect(listId).toBeTruthy()
    const datalist = document.getElementById(listId!) as HTMLDataListElement
    expect(datalist).toBeTruthy()
    const optionValues = Array.from(datalist.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    )
    expect(optionValues).toEqual(expect.arrayContaining(['left', 'right', 'key']))
  })
})

describe('SpecEditor — assistant ✨ affordance', () => {
  it('shows the synthesize button when the assistant provides synthesize', async () => {
    const user = userEvent.setup()
    const assistant: SelectorAssistant = {
      synthesize: async () => ({ value: 'left + right', explanation: 'both children' }),
    }
    render(
      <Host
        initial={'constraints:\n  - orientation: {}\n'}
        selectorAssistant={assistant}
        defaultView="builder"
      />,
    )

    // Expand the orientation row; its selector field carries the ✨ button.
    await expandRow(user, 'Orientation')
    expect(
      await screen.findByRole('button', {
        name: 'Generate selector from a description',
      }),
    ).toBeInTheDocument()
  })

  it('hides the synthesize button when no assistant is provided', async () => {
    const user = userEvent.setup()
    render(
      <Host initial={'constraints:\n  - orientation: {}\n'} defaultView="builder" />,
    )
    await expandRow(user, 'Orientation')
    // The selector field exists, but no ✨ affordance.
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'Generate selector from a description',
      }),
    ).not.toBeInTheDocument()
  })
})

describe('SpecEditor — onDiagnostics fires on validation change', () => {
  it('reports a structural diagnostic for a constraint missing a required field', async () => {
    const onDiagnostics = vi.fn()
    // orientation with no selector/directions has required-field errors.
    render(
      <Host
        initial={'constraints:\n  - orientation: {}\n'}
        onDiagnosticsSpy={onDiagnostics}
        defaultView="builder"
      />,
    )

    await waitFor(() => {
      expect(onDiagnostics).toHaveBeenCalled()
    })
    const lastDiagnostics = onDiagnostics.mock.calls.at(-1)![0] as Diagnostic[]
    expect(lastDiagnostics.length).toBeGreaterThan(0)
    expect(lastDiagnostics.some((d) => d.severity === 'error')).toBe(true)
  })
})

// ── Back-compat: CndLayoutInterface driven by ONLY the legacy prop set ────────

describe('CndLayoutInterface — back-compat with the legacy prop surface', () => {
  it('renders and functions with only the legacy props', async () => {
    const user = userEvent.setup()

    const setConstraints = vi.fn()
    const setDirectives = vi.fn()

    function LegacyHost() {
      const [yamlValue, setYamlValue] = useState('')
      const [isNoCodeView, setIsNoCodeView] = useState(false)
      const [constraints, setC] = useState<ConstraintData[]>([])
      const [directives, setD] = useState<DirectiveData[]>([])
      return (
        <CndLayoutInterface
          yamlValue={yamlValue}
          onChange={setYamlValue}
          isNoCodeView={isNoCodeView}
          onViewChange={setIsNoCodeView}
          constraints={constraints}
          setConstraints={(updater) => {
            setConstraints(updater)
            setC(updater)
          }}
          directives={directives}
          setDirectives={(updater) => {
            setDirectives(updater)
            setD(updater)
          }}
        />
      )
    }

    render(<LegacyHost />)

    // Renders in the code view by default (isNoCodeView=false).
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea).toBeInTheDocument()

    // Code-view edits flow through onChange and update the textarea.
    fireEvent.change(textarea, {
      target: { value: 'directives:\n  - attribute:\n      field: key\n' },
    })
    expect(textarea.value).toContain('attribute')

    // The deprecated setDirectives callback is kept loosely in sync.
    await waitFor(() => {
      expect(setDirectives).toHaveBeenCalled()
    })

    // The view toggle still works (isNoCodeView wiring).
    await user.click(screen.getByRole('tab', { name: 'Builder' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Directives' })).toBeInTheDocument()
  })
})
