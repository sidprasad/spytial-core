/**
 * HOOK 3 — `LayoutAssistant` (whole-spec suggestion) integration tests.
 *
 * Covers the behavioural contract from `docs/SPEC_EDITOR_REDESIGN.md`:
 *
 *   - the Suggest button appears only when the assistant provides `suggest`,
 *   - the suggester receives `{domain, instance, currentYaml}` and nothing else,
 *   - an accepted proposal is applied through the document — `onChange` fires
 *     with canonical YAML, the builder repopulates, and it is ONE undo step
 *     that restores the previous spec,
 *   - the panel renders rationale / confidence / outcome / notes,
 *   - a rejected promise leaves the document untouched and shows the message,
 *   - unparseable proposal YAML is an error, not a wiped document,
 *   - a superseded run's result is dropped rather than applied late,
 *   - the rendered panel has no axe violations.
 *
 * @vitest-environment jsdom
 */

import React, { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import axe from 'axe-core'

import { SpecEditor } from '../src/spec-editor/ui/SpecEditor'
import { parseYamlToState } from '../src/spec-editor'
import type {
  LayoutAssistant,
  LayoutAssistContext,
  LayoutSuggestionResult,
} from '../src/spec-editor'
import type { IInputDataInstance } from '../src/data-instance/interfaces'
import { buildSampleBstInstance } from './helpers/bst-instance-fixture'

const EXISTING_SPEC = `constraints:
  - cyclic:
      selector: left
      direction: clockwise
`

const PROPOSAL = `constraints:
  - orientation:
      selector: left
      directions:
        - below
`

function Host(props: {
  initial?: string
  instance?: IInputDataInstance
  layoutAssistant?: LayoutAssistant
  onChangeSpy?: (v: string) => void
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
      layoutAssistant={props.layoutAssistant}
      defaultView="builder"
      aria-label="Spec editor under test"
    />
  )
}

// The trigger's accessible name IS its visible text, which swaps to
// "Analyzing…" mid-run (no aria-label — that would desync name from label).
const suggestButton = () => screen.getByRole('button', { name: /Suggest|Analyzing/ })

describe('SpecEditor — Suggest affordance gating', () => {
  it('is absent with no assistant', () => {
    render(<Host />)
    expect(screen.queryByRole('button', { name: /Suggest/ })).toBeNull()
  })

  it('is absent when the assistant provides no suggest member', () => {
    render(<Host layoutAssistant={{}} />)
    expect(screen.queryByRole('button', { name: /Suggest/ })).toBeNull()
  })

  it('appears when the assistant provides suggest', () => {
    render(<Host layoutAssistant={{ suggest: vi.fn() }} />)
    expect(suggestButton()).toBeInTheDocument()
  })
})

describe('SpecEditor — applying a suggestion', () => {
  it('passes the domain, instance, and current YAML to the suggester', async () => {
    const user = userEvent.setup()
    const instance = buildSampleBstInstance()
    let seen: LayoutAssistContext | null = null
    const suggest = vi.fn(async (ctx: LayoutAssistContext) => {
      seen = ctx
      return { yaml: PROPOSAL }
    })

    render(
      <Host initial={EXISTING_SPEC} instance={instance} layoutAssistant={{ suggest }} />,
    )
    await user.click(suggestButton())

    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1))
    const ctx = seen as unknown as LayoutAssistContext
    expect(ctx.currentYaml).toBe(EXISTING_SPEC)
    expect(ctx.instance).toBe(instance)
    // The domain is the editor-resolved schema, not the raw instance.
    expect(ctx.domain?.relations.map((r) => r.name)).toEqual(
      expect.arrayContaining(['left', 'right']),
    )
    // Domain-agnostic contract: exactly these three keys, no host concepts.
    expect(Object.keys(ctx).sort()).toEqual(['currentYaml', 'domain', 'instance'])
  })

  it('emits the proposal as canonical YAML and repopulates the builder', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Host
        initial={EXISTING_SPEC}
        onChangeSpy={onChange}
        layoutAssistant={{ suggest: async () => ({ yaml: PROPOSAL }) }}
      />,
    )

    await user.click(suggestButton())
    await waitFor(() => expect(onChange).toHaveBeenCalled())

    const emitted = onChange.mock.calls.at(-1)![0] as string
    const state = parseYamlToState(emitted)
    expect(state.constraints).toHaveLength(1)
    expect(state.constraints[0].type).toBe('orientation')

    // The builder shows the suggested row, not the replaced one.
    await waitFor(() => {
      expect(screen.getByText(/Orientation/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/^Cyclic/i)).toBeNull()
  })

  it('is a single undo step back to the previous spec', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Host
        initial={EXISTING_SPEC}
        onChangeSpy={onChange}
        layoutAssistant={{ suggest: async () => ({ yaml: PROPOSAL }) }}
      />,
    )

    await user.click(suggestButton())
    await waitFor(() =>
      expect(parseYamlToState(onChange.mock.calls.at(-1)![0] as string).constraints[0].type).toBe(
        'orientation',
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const afterUndo = parseYamlToState(onChange.mock.calls.at(-1)![0] as string)
    expect(afterUndo.constraints).toHaveLength(1)
    expect(afterUndo.constraints[0].type).toBe('cyclic')
  })
})

describe('SpecEditor — suggestions panel', () => {
  const RESULT: LayoutSuggestionResult = {
    yaml: PROPOSAL,
    suggestions: [
      {
        id: 'orientation:left:below',
        rationale: 'left forms an acyclic tree over Node.',
        confidence: 'high',
        outcome: 'applied',
      },
      {
        id: 'cyclic:next',
        rationale: 'Primary form failed validation; applied fallback 1.',
        confidence: 'medium',
        outcome: 'weakened',
      },
      { id: 'group:owner', rationale: 'Requires a suggestion that was omitted.', outcome: 'omitted' },
    ],
    notes: ['1 suggestion used a weaker fallback.'],
  }

  async function renderWithResult(result = RESULT) {
    const user = userEvent.setup()
    render(<Host initial={EXISTING_SPEC} layoutAssistant={{ suggest: async () => result }} />)
    await user.click(suggestButton())
    const panel = await screen.findByRole('region', { name: 'Layout suggestions' })
    return { user, panel }
  }

  it('renders each rationale with its confidence and outcome', async () => {
    const { panel } = await renderWithResult()
    expect(within(panel).getByText('3 suggestions')).toBeInTheDocument()
    expect(within(panel).getByText('left forms an acyclic tree over Node.')).toBeInTheDocument()
    expect(within(panel).getByText('high')).toBeInTheDocument()
    expect(within(panel).getByText('weakened')).toBeInTheDocument()
    expect(within(panel).getByText('omitted')).toBeInTheDocument()
    expect(within(panel).getByText('1 suggestion used a weaker fallback.')).toBeInTheDocument()
    // Ids are machine-facing, shown as a secondary tag.
    expect(within(panel).getByText('orientation:left:below')).toBeInTheDocument()
  })

  it('renders opaque results (yaml only) without inventing rows', async () => {
    const { panel } = await renderWithResult({ yaml: PROPOSAL })
    expect(within(panel).getByText('Suggestion applied')).toBeInTheDocument()
    expect(within(panel).queryByRole('listitem')).toBeNull()
  })

  it('dismisses without reverting the applied spec', async () => {
    const { user, panel } = await renderWithResult()
    await user.click(within(panel).getByRole('button', { name: 'Dismiss suggestions' }))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Layout suggestions' })).toBeNull(),
    )
    expect(screen.getByText(/Orientation/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { panel } = await renderWithResult()
    const results = await axe.run(panel, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})

describe('SpecEditor — suggestion failures leave the document alone', () => {
  it('surfaces a rejected suggester without touching the spec', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Host
        initial={EXISTING_SPEC}
        onChangeSpy={onChange}
        layoutAssistant={{
          suggest: async () => {
            throw new Error('No instance is available to analyze.')
          },
        }}
      />,
    )

    await user.click(suggestButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No instance is available to analyze.',
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/^Cyclic/i)).toBeInTheDocument()
    // The button is usable again after a failure.
    expect(suggestButton()).toBeEnabled()
  })

  it('treats unparseable proposal YAML as an error, not a wipe', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Host
        initial={EXISTING_SPEC}
        onChangeSpy={onChange}
        layoutAssistant={{ suggest: async () => ({ yaml: 'constraints: [unclosed' }) }}
      />,
    )

    await user.click(suggestButton())

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/^Cyclic/i)).toBeInTheDocument()
  })

  it('disables the trigger while a run is in flight', async () => {
    const user = userEvent.setup()
    let release: (r: LayoutSuggestionResult) => void = () => {}
    const pending = new Promise<LayoutSuggestionResult>((resolve) => {
      release = resolve
    })
    render(<Host initial={EXISTING_SPEC} layoutAssistant={{ suggest: () => pending }} />)

    await user.click(suggestButton())
    await waitFor(() => expect(suggestButton()).toBeDisabled())
    expect(suggestButton()).toHaveTextContent('Analyzing…')

    release({ yaml: PROPOSAL })
    await waitFor(() => expect(suggestButton()).toBeEnabled())
  })

  it('drops a result that resolves after unmount', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release: (r: LayoutSuggestionResult) => void = () => {}
    const pending = new Promise<LayoutSuggestionResult>((resolve) => {
      release = resolve
    })

    const { unmount } = render(
      <Host
        initial={EXISTING_SPEC}
        onChangeSpy={onChange}
        layoutAssistant={{ suggest: () => pending }}
      />,
    )
    await user.click(suggestButton())
    unmount()

    release({ yaml: PROPOSAL })
    await pending
    // Flush the .then chain the handler attached.
    await Promise.resolve()
    expect(onChange).not.toHaveBeenCalled()
  })
})
