import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { useState } from 'react'

/*
 * The legacy `NoCodeView` React component (the 27 per-type selector cards) was
 * removed in the spec-editor redesign and replaced by the schema-driven
 * `BuilderView`. This file is rewritten to exercise `BuilderView` directly,
 * preserving the original test intent at the component level:
 *
 *   - the structured builder renders Constraints and Directives sections with
 *     "Add constraint" / "Add directive" buttons,
 *   - parsed constraints/directives are displayed by their type label,
 *   - the directive add menu does NOT offer size / hideAtom (those are now
 *     constraints in the registry),
 *   - items can be removed and the section ends up empty.
 *
 * The OLD component's prop surface (setConstraints/setDirectives functional
 * setters, per-card "Clockwise" selects, etc.) is gone; the equivalent editing
 * behaviour is covered here against `BuilderView`'s real callbacks and in
 * tests/spec-editor-integration.test.tsx.
 */

import { BuilderView } from '../../src/spec-editor/ui/BuilderView'
import type { SpecItem } from '../../src/spec-editor'
import { newId } from '../../src/spec-editor'

/** No-op callback bundle for the non-mutation paths under test. */
function noopCallbacks() {
  return {
    onAddItem: vi.fn(),
    onUpdateParam: vi.fn(),
    onUpdateComment: vi.fn(),
    onToggleNegate: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
  }
}

function constraint(type: string, params: Record<string, unknown>): SpecItem {
  return { id: newId(), kind: 'constraint', type, params }
}
function directive(type: string, params: Record<string, unknown>): SpecItem {
  return { id: newId(), kind: 'directive', type, params }
}

describe('Structured Builder (BuilderView) Component Tests', () => {
  describe('Rendering', () => {
    it('should render constraints and directives sections with add buttons', () => {
      render(
        <BuilderView constraints={[]} directives={[]} {...noopCallbacks()} />,
      )

      expect(screen.getByRole('region', { name: 'Constraints' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Directives' })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /add constraint/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /add directive/i }),
      ).toBeInTheDocument()
    })

    it('should display constraints in the builder', () => {
      render(
        <BuilderView
          constraints={[constraint('orientation', { directions: ['right'], selector: 'right' })]}
          directives={[]}
          {...noopCallbacks()}
        />,
      )

      const list = screen.getByRole('list', { name: 'Constraints List' })
      expect(within(list).getByText('Orientation')).toBeInTheDocument()
    })

    it('should display directives in the builder', () => {
      render(
        <BuilderView
          constraints={[]}
          directives={[directive('attribute', { field: 'id' })]}
          {...noopCallbacks()}
        />,
      )

      const list = screen.getByRole('list', { name: 'Directives List' })
      expect(within(list).getByText('Attribute')).toBeInTheDocument()
    })

    it('should not offer size or hideAtom in the directive add menu', async () => {
      const user = userEvent.setup()
      render(
        <BuilderView constraints={[]} directives={[]} {...noopCallbacks()} />,
      )

      // Open the "Add directive" menu and confirm size/hideAtom are absent
      // (they are constraints in the registry, not directives).
      await user.click(screen.getByRole('button', { name: /add directive/i }))
      const menu = screen.getByRole('menu', { name: 'Add directive' })
      expect(within(menu).queryByText('Size')).not.toBeInTheDocument()
      expect(within(menu).queryByText('Hide atom')).not.toBeInTheDocument()
      // Sanity: a real directive type IS offered.
      expect(within(menu).getByText('Attribute')).toBeInTheDocument()
    })

    it('should render size / hideAtom items wherever they appear, with no crash', () => {
      // These types are valid (now constraints); rendering them as directives
      // is tolerated — they show as known rows, not legacy cards.
      render(
        <BuilderView
          constraints={[]}
          directives={[
            directive('size', { selector: 'Node', width: 100, height: 50 }),
            directive('hideAtom', { selector: 'Node' }),
          ]}
          {...noopCallbacks()}
        />,
      )
      const list = screen.getByRole('list', { name: 'Directives List' })
      expect(within(list).getByText('Size')).toBeInTheDocument()
      expect(within(list).getByText('Hide atom')).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('should call onAddItem when adding a constraint', async () => {
      const user = userEvent.setup()
      const cbs = noopCallbacks()
      render(<BuilderView constraints={[]} directives={[]} {...cbs} />)

      await user.click(screen.getByRole('button', { name: /add constraint/i }))
      const menu = screen.getByRole('menu', { name: 'Add constraint' })
      // Match the visible type label (menuitem names also include descriptions).
      await user.click(within(menu).getByText('Orientation'))

      expect(cbs.onAddItem).toHaveBeenCalledWith('constraint', 'orientation')
    })

    it('should call onAddItem when adding a directive', async () => {
      const user = userEvent.setup()
      const cbs = noopCallbacks()
      render(<BuilderView constraints={[]} directives={[]} {...cbs} />)

      await user.click(screen.getByRole('button', { name: /add directive/i }))
      const menu = screen.getByRole('menu', { name: 'Add directive' })
      await user.click(within(menu).getByText('Attribute'))

      expect(cbs.onAddItem).toHaveBeenCalledWith('directive', 'attribute')
    })

    it('should remove a directive via its overflow menu, emptying the section', async () => {
      const user = userEvent.setup()

      // A controlled host that removes the item from the rendered list.
      const Host = () => {
        const [directives, setDirectives] = useState<SpecItem[]>([
          directive('attribute', { field: 'key' }),
        ])
        const cbs = noopCallbacks()
        return (
          <BuilderView
            constraints={[]}
            directives={directives}
            {...cbs}
            onRemove={(id) =>
              setDirectives((prev) => prev.filter((d) => d.id !== id))
            }
          />
        )
      }
      render(<Host />)

      const list = screen.getByRole('list', { name: 'Directives List' })
      expect(within(list).getByText('Attribute')).toBeInTheDocument()

      // Open the overflow menu and delete.
      await user.click(
        within(list).getByRole('button', { name: /Actions for Attribute/i }),
      )
      await user.click(
        await screen.findByRole('menuitem', { name: /Remove Attribute directive/i }),
      )

      expect(within(list).queryByText('Attribute')).not.toBeInTheDocument()
      expect(list).toBeEmptyDOMElement()
    })
  })

  describe('Cyclic constraints display values', () => {
    it('should display selector and direction for cyclic constraints (fixes issue #97)', async () => {
      const user = userEvent.setup()
      render(
        <BuilderView
          constraints={[
            constraint('cyclic', { selector: 'right', direction: 'clockwise' }),
          ]}
          directives={[]}
          {...noopCallbacks()}
        />,
      )

      // The collapsed row summary surfaces the direction + selector.
      const list = screen.getByRole('list', { name: 'Constraints List' })
      expect(within(list).getByText(/clockwise · right/)).toBeInTheDocument()

      // Expanding the row reveals the selector value and the active direction pill.
      await user.click(within(list).getByText('Cyclic'))
      expect(await screen.findByDisplayValue('right')).toBeInTheDocument()
      const clockwisePill = screen.getByRole('radio', { name: 'clockwise' })
      expect(clockwisePill).toHaveAttribute('aria-checked', 'true')
    })

    it('should handle empty cyclic constraint params gracefully', async () => {
      const user = userEvent.setup()
      render(
        <BuilderView
          constraints={[constraint('cyclic', {})]}
          directives={[]}
          {...noopCallbacks()}
        />,
      )

      const list = screen.getByRole('list', { name: 'Constraints List' })
      await user.click(within(list).getByText('Cyclic'))

      // The selector field renders empty.
      const selector = (await screen.findByRole('combobox')) as HTMLTextAreaElement
      expect(selector.value).toBe('')
    })
  })
})
