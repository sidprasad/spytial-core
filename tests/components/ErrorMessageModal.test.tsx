import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { ErrorMessageModal } from '../../src/components/ErrorMessageModal/ErrorMessageModal'
import type { SystemError, ErrorMessages } from '../../src/components/ErrorMessageModal'

describe('ErrorMessageModal Component', () => {
  describe('Rendering (ErrorMessageModal)', () => {
    it('should render parse-error with correct HTML elements and error message', () => {
      const parseError: SystemError = {
        type: 'parse-error',
        message: 'Orientation constraint must have selector field',
        source: 'spec.yaml'
      }

      render(<ErrorMessageModal systemError={parseError} />)

      // Check main modal container
      expect(document.getElementById('error-message-modal')).toBeInTheDocument()
      
      // Check header
      expect(screen.getByText('Could not produce a diagram')).toBeInTheDocument()
      expect(screen.getByText('Your instance cannot be visualized with the current CnD spec.')).toBeInTheDocument()

      // Check error card header
      expect(screen.getByText('Parse Error (spec.yaml)')).toBeInTheDocument()

      // Check error message
      expect(screen.getByText('Orientation constraint must have selector field')).toBeInTheDocument()
    })

    it('should render positional-error with constraint table', () => {
      const errorMessages: ErrorMessages = {
        conflictingConstraint: 'left(A) = left(B)',
        conflictingSourceConstraint: 'A left-of B',
        minimalConflictingConstraints: new Map([
          ['A left-of B', ['left(A) = left(B)', 'top(A) = top(B)']],
          ['B right-of C', ['left(B) + width(B) = left(C)']]
        ])
      }

      const positionalError: SystemError = {
        type: 'positional-error',
        messages: errorMessages
      }

      render(<ErrorMessageModal systemError={positionalError} />)

      // Check main modal container
      expect(document.getElementById('error-message-modal')).toBeInTheDocument()

      // Check headers
      expect(screen.getByText('Could not produce a diagram')).toBeInTheDocument()
      expect(screen.getByText('Your instance cannot be visualized with the current CnD spec.')).toBeInTheDocument()

      // Check constraint table instruction
      expect(screen.getByText(/Hover over the conflicting constraints/)).toBeInTheDocument()

      // Check table headers
      expect(screen.getByText('Source Constraints')).toBeInTheDocument()
      expect(screen.getByText('Diagram Elements')).toBeInTheDocument()

      // Check source constraints are rendered
      expect(screen.getByText('A left-of B')).toBeInTheDocument()
      expect(screen.getByText('B right-of C')).toBeInTheDocument()

      // Check diagram constraints are rendered
      expect(screen.getByText('left(A) = left(B)')).toBeInTheDocument()
      expect(screen.getByText('top(A) = top(B)')).toBeInTheDocument()
      expect(screen.getByText('left(B) + width(B) = left(C)')).toBeInTheDocument()
    })

    it('should render group-overlap-error with correct HTML elements and error message', () => {
      const groupOverlapError: SystemError = {
        type: 'group-overlap-error',
        message: 'Groups "fruit[Basket0,_]" and "status[_,Fresh0]" overlap with nodes: Apple4',
        source: 'layout.yaml'
      }

      render(<ErrorMessageModal systemError={groupOverlapError} />)

      // Check main modal container
      expect(document.getElementById('error-message-modal')).toBeInTheDocument()

      // Check headers
      expect(screen.getByText('Could not produce a diagram')).toBeInTheDocument()
      expect(screen.getByText('Your instance cannot be visualized with the current CnD spec.')).toBeInTheDocument()

      // Check error card header
      expect(screen.getByText('Group Overlap Error (layout.yaml)')).toBeInTheDocument()

      // Check error message
      expect(screen.getByText('Groups "fruit[Basket0,_]" and "status[_,Fresh0]" overlap with nodes: Apple4')).toBeInTheDocument()
    })

    it('should render general-error with correct HTML elements and error message', () => {
      const generalError: SystemError = {
        type: 'general-error',
        message: 'An unexpected error occurred while processing the layout'
      }

      render(<ErrorMessageModal systemError={generalError} />)

      // Check main modal container
      expect(document.getElementById('error-message-modal')).toBeInTheDocument()

      // Check headers
      expect(screen.getByText('Could not produce a diagram')).toBeInTheDocument()
      expect(screen.getByText('Your instance cannot be visualized with the current CnD spec.')).toBeInTheDocument()

      // Check error card header (should be "Error" for general-error)
      expect(screen.getByText('Error')).toBeInTheDocument()

      // Check error message
      expect(screen.getByText('An unexpected error occurred while processing the layout')).toBeInTheDocument()
    })

    it('should return null and log error for invalid SystemError', () => {
      // Mock console.error to capture the log
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const invalidError = null

      const { container } = render(<ErrorMessageModal systemError={invalidError} />)

      // Should render nothing
      expect(container.firstChild).toBeNull()

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith('Cannot display the following error:', null)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Highlighting when rendering a SystemError of type positional-error', () => {
    const errorMessages: ErrorMessages = {
      conflictingConstraint: 'left(A) = left(B)',
      conflictingSourceConstraint: 'A left-of B',
      minimalConflictingConstraints: new Map([
        ['A left-of B', ['left(A) = left(B)', 'top(A) = top(B)']],
        ['B right-of C', ['left(B) + width(B) = left(C)']]
      ])
    }

    const positionalError: SystemError = {
      type: 'positional-error',
      messages: errorMessages
    }

    it('should highlight related diagram constraints when hovering over a source constraint', async () => {
      const user = userEvent.setup()
      render(<ErrorMessageModal systemError={positionalError} />)

      // Find the source constraint element
      const sourceConstraint = screen.getByText('A left-of B').parentElement!

      // Hover over the source constraint
      await user.hover(sourceConstraint)

      // Check that the source constraint gets highlighted
      expect(sourceConstraint).toHaveClass('highlight-source')

      // Check that related diagram constraints get highlighted
      const diagramConstraint1 = screen.getByText('left(A) = left(B)').parentElement!
      const diagramConstraint2 = screen.getByText('top(A) = top(B)').parentElement!
      const unrelatedDiagramConstraint = screen.getByText('left(B) + width(B) = left(C)').parentElement!

      expect(diagramConstraint1).toHaveClass('highlight-source')
      expect(diagramConstraint2).toHaveClass('highlight-source')
      expect(unrelatedDiagramConstraint).not.toHaveClass('highlight-source')

      // Stop hovering
      await user.unhover(sourceConstraint)

      // Check that highlighting is removed
      expect(sourceConstraint).not.toHaveClass('highlight-source')
      expect(diagramConstraint1).not.toHaveClass('highlight-source')
      expect(diagramConstraint2).not.toHaveClass('highlight-source')
    })

    it('should highlight related source constraints when hovering over a diagram constraint', async () => {
      const user = userEvent.setup()
      render(<ErrorMessageModal systemError={positionalError} />)

      // Find the diagram constraint element
      const diagramConstraint = screen.getByText('left(A) = left(B)').parentElement!

      // Hover over the diagram constraint
      await user.hover(diagramConstraint)

      // Check that the diagram constraint gets highlighted
      expect(diagramConstraint).toHaveClass('highlight-diagram')

      // Check that related source constraint gets highlighted
      const sourceConstraint = screen.getByText('A left-of B').parentElement!
      const unrelatedSourceConstraint = screen.getByText('B right-of C').parentElement!

      expect(sourceConstraint).toHaveClass('highlight-diagram')
      expect(unrelatedSourceConstraint).not.toHaveClass('highlight-diagram')

      // Stop hovering
      await user.unhover(diagramConstraint)

      // Check that highlighting is removed
      expect(diagramConstraint).not.toHaveClass('highlight-diagram')
      expect(sourceConstraint).not.toHaveClass('highlight-diagram')
    })

    it('should use correct constraint IDs in data attributes', () => {
      render(<ErrorMessageModal systemError={positionalError} />)

      // Check source constraint data attributes
      const sourceConstraints = screen.getAllByText(/left-of|right-of/)
      expect(sourceConstraints[0].parentElement).toHaveAttribute('data-constraint-id', 'source-0')
      expect(sourceConstraints[1].parentElement).toHaveAttribute('data-constraint-id', 'source-1')

      // Check diagram constraint data attributes
      const diagramConstraints = screen.getAllByText(/left\(|top\(/)
      expect(diagramConstraints[0].parentElement).toHaveAttribute('data-constraint-id', 'diagram-0-0')
      expect(diagramConstraints[1].parentElement).toHaveAttribute('data-constraint-id', 'diagram-0-1')
      expect(diagramConstraints[2].parentElement).toHaveAttribute('data-constraint-id', 'diagram-1-0')
    })

    it('should handle mouse events correctly', async () => {
      const user = userEvent.setup()
      render(<ErrorMessageModal systemError={positionalError} />)

      const sourceConstraint = screen.getByText('A left-of B').parentElement!
      const diagramConstraint = screen.getByText('left(A) = left(B)').parentElement!

      // Test multiple hover/unhover cycles
      await user.hover(sourceConstraint)
      expect(sourceConstraint).toHaveClass('highlight-source')
      
      await user.unhover(sourceConstraint)
      expect(sourceConstraint).not.toHaveClass('highlight-source')

      await user.hover(diagramConstraint)
      expect(diagramConstraint).toHaveClass('highlight-diagram')
      
      await user.unhover(diagramConstraint)
      expect(diagramConstraint).not.toHaveClass('highlight-diagram')
    })
  })
})