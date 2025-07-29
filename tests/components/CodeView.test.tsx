import { describe, vi, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CodeView } from '../../src/components/NoCodeView/CodeView'

describe('CodeView Component Tests', () => {

  const defaultProps = {
    constraints: [],
    directives: [],
    yamlValue: '',
    handleTextareaChange: vi.fn(),
  }

  describe('Rendering', () => {
    it('should render a textarea for YAML input', () => {
      render(<CodeView {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeInTheDocument()
      expect(textarea).toHaveValue('')
    })

    it('should render with initial YAML value', () => {
      const initialYaml = 'constraints:\n  - orientation: {}'
      render(<CodeView {...defaultProps} yamlValue={initialYaml} />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveValue(initialYaml)
    })
  })

  describe('Interactions', () => {
    
  })

  describe('Accessibility', () => {
    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<CodeView {...defaultProps} />)
      
      const textarea = screen.getByRole('textbox')
      
      // Should be able to focus textarea with keyboard
      await user.tab()
      expect(textarea).toHaveFocus()
    })
  })

})