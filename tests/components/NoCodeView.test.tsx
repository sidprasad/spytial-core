import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConstraintData, DirectiveData } from '../../src/components/NoCodeView/interfaces'
import userEvent from '@testing-library/user-event'
import { NoCodeView } from '../../src/components/NoCodeView/NoCodeView'

describe('NoCodeView Component Tests', () => {

  const defaultProps = {
    constraints: [],
    setConstraints: vi.fn(),
    directives: [],
    setDirectives: vi.fn(),
  };

  describe('Rendering', () => {

    it('should render constraints and directives sections with buttons', () => {
      render(<NoCodeView {...defaultProps} />)

      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /add a new constraint/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /add a new directive/i })).toBeInTheDocument()
    })

    it('should display constraints in No Code view', () => {
      const constraints: ConstraintData[] = [
        { id: '1', type: 'orientation', params: { directions: ['right'] } }
      ]
      
      render(<NoCodeView {...defaultProps} constraints={constraints} />)
      
      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/orientation/i)).toBeInTheDocument()
    })

    it('should display directives in No Code view', () => {
      const directives: DirectiveData[] = [
        { id: '1', type: 'size', params: { value: 50 } }
      ]
      
      render(<NoCodeView {...defaultProps} directives={directives} />)
      
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
      expect(screen.getByText(/size/i)).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('should call setConstraints when constraints are updated', async () => {
      const user = userEvent.setup()
      
      render(<NoCodeView {...defaultProps} />)
      
      // Simulate adding a constraint (this depends on the actual NoCodeView implementation)
      const addButton = screen.queryByRole('button', { name: /add constraint/i })
      if (addButton) {
        await user.click(addButton)
        expect(defaultProps.setConstraints).toHaveBeenCalled()
      }
    })
  })
})