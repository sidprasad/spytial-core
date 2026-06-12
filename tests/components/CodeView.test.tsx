import { describe, vi, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

/*
 * The legacy `NoCodeView/CodeView` React component was removed in the
 * spec-editor redesign and replaced by the schema-driven `src/spec-editor/ui/
 * CodeView`. This file is rewritten to test the NEW CodeView, preserving the
 * original rendering + keyboard-focus intent (a controlled YAML textarea) while
 * dropping the old prop surface (constraints/directives/handleTextareaChange).
 */

import { CodeView } from '../../src/spec-editor/ui/CodeView'

describe('CodeView Component Tests', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  }

  describe('Rendering', () => {
    it('should render a textarea for YAML input', () => {
      render(<CodeView {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeInTheDocument()
      expect(textarea).toHaveValue('')
    })

    it('should render with an initial YAML value', () => {
      const initialYaml = 'constraints:\n  - orientation: {}'
      render(<CodeView {...defaultProps} value={initialYaml} />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveValue(initialYaml)
    })
  })

  describe('Interactions', () => {
    it('should fire onChange with the edited text', () => {
      const onChange = vi.fn()
      render(<CodeView {...defaultProps} onChange={onChange} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'directives:\n  - flag: foo' } })
      expect(onChange).toHaveBeenCalledWith('directives:\n  - flag: foo')
    })

    it('should not be editable when disabled', () => {
      render(<CodeView {...defaultProps} disabled />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<CodeView {...defaultProps} />)

      const textarea = screen.getByRole('textbox')

      // Should be able to focus the textarea with the keyboard.
      await user.tab()
      expect(textarea).toHaveFocus()
    })

    it('should surface parse diagnostics with the unapplied-edits notice', () => {
      render(
        <CodeView
          {...defaultProps}
          value="constraints: ["
          hasUnappliedEdits
          diagnostics={[
            { severity: 'error', message: 'bad yaml', source: 'yaml', line: 1, column: 14 },
          ]}
        />,
      )
      expect(screen.getByText(/unapplied edits/i)).toBeInTheDocument()
      expect(screen.getByText('bad yaml')).toBeInTheDocument()
    })
  })
})
