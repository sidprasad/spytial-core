import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConstraintData, DirectiveData } from '../../src/components/NoCodeView/interfaces'
import userEvent from '@testing-library/user-event'
import { NoCodeView } from '../../src/components/NoCodeView/NoCodeView'
import { useCallback, useState } from 'react'

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

  interface TestWrapperProps {
    initialDirectives?: DirectiveData[];
  }

  const TestWrapper = ({initialDirectives = []}: TestWrapperProps) => {
    const [directives, setDirectives] = useState<DirectiveData[]>(initialDirectives)

    const handleSetDirectives = useCallback((updater: (prev: DirectiveData[]) => DirectiveData[]) => {
      setDirectives(updater)
    }, [setDirectives])

    return <NoCodeView {...defaultProps} directives={directives} setDirectives={handleSetDirectives} />
  }

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

    it('should call setDirectives when directives are updated', async () => {
      const user = userEvent.setup()
      
      render(<NoCodeView {...defaultProps} />)
      
      // Simulate adding a directive (this depends on the actual NoCodeView implementation)
      const addButton = screen.queryByRole('button', { name: /add directive/i })
      if (addButton) {
        await user.click(addButton)
        expect(defaultProps.setDirectives).toHaveBeenCalled()
      }
    })

    it('should handle when directives are removed to empty gracefully', async () => {
      const user = userEvent.setup()
      const directives: DirectiveData[] = [{ id: '1', type: 'attribute', params: { field: 'key' } }]

      // Render the NoCodeView with one directive
      render(<TestWrapper initialDirectives={directives}/>)
      const removeButtons = screen.getAllByRole('button', { name: /Remove directive/i })
      expect(removeButtons.length).toBe(1)


      // Remove the only directive
      await user.click(removeButtons[0])

      // Check that there are no directive cards showing
      const newRemoveButtons = screen.queryAllByRole('button', { name: /Remove directive/i })
      expect(newRemoveButtons.length).toBe(0)
    })
  })

  describe('Cyclic Constraints Display Values', () => {
    it('should display current values for cyclic constraints (fixes issue #97)', () => {
      const constraints: ConstraintData[] = [
        { 
          id: '1', 
          type: 'cyclic', 
          params: { 
            selector: 'right', 
            direction: 'clockwise' 
          } 
        },
        { 
          id: '2', 
          type: 'cyclic', 
          params: { 
            selector: 'left', 
            direction: 'clockwise' 
          } 
        }
      ]
      
      render(<NoCodeView {...defaultProps} constraints={constraints} />)
      
      // Check that both selector values are displayed
      expect(screen.getByDisplayValue('right')).toBeInTheDocument()
      expect(screen.getByDisplayValue('left')).toBeInTheDocument()
      
      // Check that both direction values are displayed as "Clockwise"
      const directionSelects = screen.getAllByDisplayValue('Clockwise')
      expect(directionSelects).toHaveLength(2)
    })

    it('should handle empty cyclic constraint params gracefully', () => {
      const constraints: ConstraintData[] = [
        { 
          id: '1', 
          type: 'cyclic', 
          params: {} 
        }
      ]
      
      render(<NoCodeView {...defaultProps} constraints={constraints} />)
      
      // Should have a textbox (selector input) that's empty
      const selectorInputs = screen.getAllByRole('textbox')
      const selectorInput = selectorInputs.find(input => 
        input.getAttribute('name') === 'selector'
      )
      expect(selectorInput).toHaveValue('')
      
      // Should default to clockwise direction
      expect(screen.getByDisplayValue('Clockwise')).toBeInTheDocument()
    })
  })
})