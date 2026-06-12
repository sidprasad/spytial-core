import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { CndLayoutInterface } from '../../src/components/CndLayoutInterface'
import type { ConstraintData, DirectiveData } from '../../src/components/NoCodeView/interfaces'
import { useState } from 'react'

/*
 * These tests exercise the back-compat `CndLayoutInterface` wrapper, which is
 * now a thin shim over the schema-driven `SpecEditor` (see
 * docs/SPEC_EDITOR_REDESIGN.md). The OLD editor's DOM has been replaced, so the
 * assertions are updated to the new component's roles/labels while PRESERVING
 * each test's original intent:
 *
 *   - the legacy prop surface (yamlValue/onChange/isNoCodeView/onViewChange/
 *     constraints/setConstraints/directives/setDirectives) still works,
 *   - the view toggle is now a two-tab control ("Builder" / "Code") instead of
 *     the old `role=switch`; `isNoCodeView` maps to the Builder view and
 *     `onViewChange` is still notified with a boolean,
 *   - code-view edits flow through `onChange`,
 *   - the structured builder shows Constraints / Directives sections,
 *   - disabled and aria-label behaviours are preserved.
 *
 * Where a behaviour genuinely changed — most notably toggle-time YAML
 * regeneration, which is gone because the two views are now LIVE projections of
 * one model — the test is rewritten to assert the new equivalent (live sync) and
 * the change is noted in a comment.
 */

describe('CndLayoutInterface Component', () => {
  const defaultProps = {
    yamlValue: '',
    onChange: vi.fn(),
    isNoCodeView: false,
    onViewChange: vi.fn(),
    constraints: [] as ConstraintData[],
    setConstraints: vi.fn(),
    directives: [] as DirectiveData[],
    setDirectives: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** The Builder/Code tab buttons live in the view-toggle tablist. */
  function getCodeTab(): HTMLElement {
    return screen.getByRole('tab', { name: 'Code' })
  }
  function getBuilderTab(): HTMLElement {
    return screen.getByRole('tab', { name: 'Builder' })
  }

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<CndLayoutInterface {...defaultProps} />)

      // The editor root is a region with the default accessible name.
      expect(
        screen.getByRole('region', { name: 'CND Layout Specification Interface' }),
      ).toBeInTheDocument()

      // The view toggle is a tablist with a Builder tab and a Code tab.
      expect(screen.getByRole('tablist', { name: 'Editor view' })).toBeInTheDocument()
      expect(getCodeTab()).toBeInTheDocument()
      expect(getBuilderTab()).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<CndLayoutInterface {...defaultProps} className="custom-class" />)

      const container = screen.getByLabelText('CND Layout Specification Interface')
      expect(container).toHaveClass('custom-class')
    })

    it('should show Code View by default (isNoCodeView=false)', () => {
      render(<CndLayoutInterface {...defaultProps} />)

      // Code view renders the YAML textarea.
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      // The Code tab is the selected one.
      expect(getCodeTab()).toHaveAttribute('aria-selected', 'true')

      // The builder sections are not shown in Code view.
      expect(screen.queryByRole('region', { name: 'Constraints' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Directives' })).not.toBeInTheDocument()
    })

    it('should show Structured Builder when isNoCodeView is true', () => {
      render(<CndLayoutInterface {...defaultProps} isNoCodeView={true} />)

      // No YAML textarea in the builder view.
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

      // The builder exposes Constraints and Directives sections.
      expect(screen.getByRole('region', { name: 'Constraints' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Directives' })).toBeInTheDocument()
      expect(getBuilderTab()).toHaveAttribute('aria-selected', 'true')
    })

    it('should display textarea empty by default', () => {
      render(<CndLayoutInterface {...defaultProps} />)

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe('')
    })

    it('should display yamlValue in textarea, if given', () => {
      const testYaml = 'constraints:\n  - orientation: {}'
      render(<CndLayoutInterface {...defaultProps} yamlValue={testYaml} />)

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe(testYaml)
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when textarea value changes', async () => {
      const user = userEvent.setup()
      const mockOnChange = defaultProps.onChange

      render(<CndLayoutInterface {...defaultProps} />)

      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'test content')

      expect(mockOnChange).toHaveBeenCalled()
    })

    it('should call onViewChange(true) when switching to the Builder tab', async () => {
      const user = userEvent.setup()
      const mockOnViewChange = defaultProps.onViewChange

      render(<CndLayoutInterface {...defaultProps} />)

      // Start in Code view; click the Builder tab to switch to the builder.
      await user.click(getBuilderTab())

      // `isNoCodeView === true` corresponds to the builder view.
      expect(mockOnViewChange).toHaveBeenCalledWith(true)
    })

    it('should call onViewChange(false) when switching to the Code tab', async () => {
      const user = userEvent.setup()
      const mockOnViewChange = defaultProps.onViewChange

      render(<CndLayoutInterface {...defaultProps} isNoCodeView={true} />)

      await user.click(getCodeTab())

      expect(mockOnViewChange).toHaveBeenCalledWith(false)
    })

    // BEHAVIOUR CHANGE: the old editor trapped the user in Code View when the
    // YAML failed to parse (toggle-time conversion). The redesign makes the two
    // views LIVE projections of one model, so the toggle is purely visual and
    // never blocked. Invalid YAML instead surfaces a parse diagnostic while the
    // model keeps its last good state; the view still toggles freely. This test
    // now asserts that new contract: switching views is not blocked by invalid
    // text, and the diagnostic appears in the code view.
    it('should toggle views freely and surface a diagnostic for unparseable YAML', async () => {
      const user = userEvent.setup()

      // Drive with a real stateful host so the controlled YAML value actually
      // updates (the debounced parse needs the new text to flow back in).
      const onViewChange = vi.fn()
      const Host = () => {
        const [yaml, setYaml] = useState('constraints:\n  - orientation: {}\n')
        const [isNoCode, setIsNoCode] = useState(false)
        return (
          <CndLayoutInterface
            {...defaultProps}
            yamlValue={yaml}
            onChange={setYaml}
            isNoCodeView={isNoCode}
            onViewChange={(v) => {
              onViewChange(v)
              setIsNoCode(v)
            }}
          />
        )
      }
      render(<Host />)

      // The view toggle is not disabled and switches to the builder.
      const builderTab = getBuilderTab()
      expect(builderTab).not.toBeDisabled()
      await user.click(builderTab)
      expect(onViewChange).toHaveBeenCalledWith(true)

      // Switch back to code and type invalid YAML; a parse diagnostic appears
      // (the "unapplied edits" badge) without clobbering the model.
      await user.click(getCodeTab())
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(textarea, {
        target: { value: 'constraints:\n  - orientation: {directions: [below]' },
      })
      await waitFor(
        () => {
          expect(
            screen.getByLabelText('Text has unapplied edits'),
          ).toBeInTheDocument()
        },
        { timeout: 2000 },
      )
    })

    it('should not call onChange when disabled', async () => {
      const user = userEvent.setup()
      const mockOnChange = defaultProps.onChange

      render(<CndLayoutInterface {...defaultProps} disabled={true} />)

      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeDisabled()

      await user.type(textarea, 'test')
      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<CndLayoutInterface {...defaultProps} aria-label="Custom ARIA label" />)

      expect(screen.getByLabelText('Custom ARIA label')).toBeInTheDocument()
    })

    it('should expose undo/redo controls', () => {
      render(<CndLayoutInterface {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined callbacks gracefully', () => {
      const propsWithoutCallbacks = {
        ...defaultProps,
        onChange: undefined as any,
        onViewChange: undefined as any,
        setConstraints: undefined as any,
        setDirectives: undefined as any,
      }

      expect(() =>
        render(<CndLayoutInterface {...propsWithoutCallbacks} />),
      ).not.toThrow()
    })

    it('should handle large YAML values', () => {
      const largeYaml = 'constraints:\n'.repeat(1000)

      render(<CndLayoutInterface {...defaultProps} yamlValue={largeYaml} />)

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe(largeYaml)
    })

    it('should render the builder with empty constraints and directives arrays', () => {
      render(
        <CndLayoutInterface
          {...defaultProps}
          isNoCodeView={true}
          constraints={[]}
          directives={[]}
        />,
      )

      expect(screen.getByRole('region', { name: 'Constraints' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Directives' })).toBeInTheDocument()
    })
  })

  // A controlled test wrapper that mirrors how a real host drives the component.
  interface TestWrapperProps {
    initialIsNoCodeView?: boolean
    initialYamlValue?: string
  }

  const TestWrapper = ({
    initialIsNoCodeView = false,
    initialYamlValue = '',
  }: TestWrapperProps) => {
    const [isNoCodeView, setIsNoCodeView] = useState(initialIsNoCodeView)
    const [yamlValue, setYamlValue] = useState(initialYamlValue)

    return (
      <CndLayoutInterface
        {...defaultProps}
        isNoCodeView={isNoCodeView}
        onViewChange={setIsNoCodeView}
        yamlValue={yamlValue}
        onChange={setYamlValue}
      />
    )
  }

  describe('Integration with the structured builder', () => {
    it('should switch between Code and Builder views correctly', async () => {
      const user = userEvent.setup()

      render(<TestWrapper />)

      // Start in Code View.
      expect(screen.getByRole('textbox')).toBeInTheDocument()

      // Switch to the Builder view.
      await user.click(getBuilderTab())

      // The textarea is gone; the builder sections are shown.
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Constraints' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Directives' })).toBeInTheDocument()
    })

    // REWRITTEN (was the skipped "No Code View should update when Code View
    // changes"). The old skip reason was a mock-integration gap; with one live
    // model there is nothing to mock. This asserts the new LIVE-SYNC contract:
    // YAML typed in the code view is reflected in the builder rows immediately
    // (no toggle-time conversion), and the textarea retains its value across a
    // round trip through the builder.
    it('Builder view reflects Code view edits live', async () => {
      const user = userEvent.setup()
      const testYaml = 'constraints:\n  - orientation: {}\n'

      render(<TestWrapper />)

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: testYaml } })
      expect(textarea.value).toBe(testYaml)

      // Switch to the builder; the parsed orientation constraint appears.
      await user.click(getBuilderTab())
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      await waitFor(() => {
        expect(screen.getByText('Orientation')).toBeInTheDocument()
      })

      // Switch back to the code view; the YAML is preserved.
      await user.click(getCodeTab())
      const roundTripped = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(roundTripped.value).toContain('orientation')
    })

    // REWRITTEN (was "Code View should update when No Code View changes"). The
    // old test mounted a mocked NoCodeView and removed a directive card. The new
    // builder is real, so this drives it directly: a removed directive
    // disappears from the Directives list and the regenerated YAML reflects the
    // removal — demonstrating builder → code live sync.
    it('Code view reflects builder edits live (removing a directive)', async () => {
      const user = userEvent.setup()
      const initialYaml = 'directives:\n  - attribute:\n      field: key\n'

      render(<TestWrapper initialYamlValue={initialYaml} initialIsNoCodeView={true} />)

      // The builder shows the parsed attribute directive.
      expect(screen.getByRole('region', { name: 'Directives' })).toBeInTheDocument()
      await waitFor(() => {
        expect(screen.getByText('Attribute')).toBeInTheDocument()
      })

      // Switch to Code view; the YAML mentions the attribute directive.
      await user.click(getCodeTab())
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toContain('attribute')

      // Back to the builder; remove the directive via its overflow menu.
      await user.click(getBuilderTab())
      await user.click(
        screen.getByRole('button', { name: /Actions for Attribute/i }),
      )
      const removeButton = await screen.findByRole('menuitem', {
        name: /Remove Attribute directive/i,
      })
      await user.click(removeButton)

      // The Directives list is now empty.
      const directivesList = screen.getByRole('list', { name: 'Directives List' })
      expect(directivesList).toBeEmptyDOMElement()

      // The regenerated YAML no longer mentions the attribute directive.
      await user.click(getCodeTab())
      const newTextarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(newTextarea.value).not.toContain('attribute')
    })
  })
})
