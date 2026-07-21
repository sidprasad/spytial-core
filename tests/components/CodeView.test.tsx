import { describe, vi, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { EditorView } from '@codemirror/view'

/*
 * CodeView is a CodeMirror 6 editor (it replaced the textarea + highlight-mirror
 * overlay). CodeMirror owns the text rendering, so these tests drive it through
 * its EditorView API rather than a `<textarea>` value.
 */

import { CodeView } from '../../src/spec-editor/ui/CodeView'

/** The EditorView backing the rendered CodeView. */
function cmView(container: HTMLElement): EditorView {
  const el = container.querySelector('.cm-editor') as HTMLElement | null
  const view = el ? EditorView.findFromDOM(el) : null
  if (!view) throw new Error('CodeMirror editor not found')
  return view
}

describe('CodeView Component Tests', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  }

  describe('Rendering', () => {
    it('renders a CodeMirror editor', () => {
      const { container } = render(<CodeView {...defaultProps} />)
      expect(container.querySelector('.cm-editor')).toBeInTheDocument()
      expect(cmView(container).state.doc.toString()).toBe('')
    })

    it('shows the initial YAML value', () => {
      const initialYaml = 'constraints:\n  - orientation: {}'
      const { container } = render(<CodeView {...defaultProps} value={initialYaml} />)
      expect(cmView(container).state.doc.toString()).toBe(initialYaml)
    })

    it('renders a line-number gutter by default', () => {
      const { container } = render(<CodeView {...defaultProps} value={'a\nb\nc'} />)
      expect(container.querySelector('.cm-lineNumbers')).toBeInTheDocument()
    })

    it('omits the line-number gutter when showLineNumbers={false}', () => {
      const { container } = render(
        <CodeView {...defaultProps} value={'a\nb'} showLineNumbers={false} />,
      )
      expect(container.querySelector('.cm-lineNumbers')).toBeNull()
    })
  })

  describe('Interactions', () => {
    it('should fire onChange with the edited text', () => {
      const onChange = vi.fn()
      const { container } = render(<CodeView {...defaultProps} onChange={onChange} />)
      cmView(container).dispatch({
        changes: { from: 0, insert: 'directives:\n  - flag: foo' },
      })
      expect(onChange).toHaveBeenCalledWith('directives:\n  - flag: foo')
    })

    it('should not be editable when disabled', () => {
      const { container } = render(<CodeView {...defaultProps} disabled />)
      const content = container.querySelector('.cm-content')
      expect(content?.getAttribute('contenteditable')).toBe('false')
    })
  })

  describe('Accessibility', () => {
    it('exposes a focusable, labelled text input', () => {
      const { container } = render(<CodeView {...defaultProps} />)
      const content = container.querySelector('.cm-content') as HTMLElement
      expect(content.getAttribute('aria-label')).toBe('Layout specification YAML')
      content.focus()
      expect(document.activeElement).toBe(content)
    })

    it('should surface parse diagnostics with the unapplied-edits notice', () => {
      render(
        <CodeView
          {...defaultProps}
          value="constraints: ["
          hasUnappliedEdits
          diagnostics={[
            {
              severity: 'error',
              message: 'bad yaml',
              source: 'yaml',
              line: 1,
              column: 14,
              from: 13,
              to: 14,
            },
          ]}
        />,
      )
      expect(screen.getByText(/unapplied edits/i)).toBeInTheDocument()
      expect(screen.getByText('bad yaml')).toBeInTheDocument()
    })
  })
})
