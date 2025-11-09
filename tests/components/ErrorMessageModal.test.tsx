import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { ErrorMessageModal } from '../../src/components/ErrorMessageModal/ErrorMessageModal'
import type { SystemError, ErrorMessages } from '../../src/components/ErrorMessageModal'

describe('ErrorMessageModal Component', () => {
  describe('Rendering', () => {
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
      expect(screen.getByText('Could not satisfy all constraints')).toBeInTheDocument()
      expect(screen.getByText('Your data causes the following visualization constraints to conflict.')).toBeInTheDocument()

      // Check error card header
      expect(screen.getByText('Parse Error (spec.yaml)')).toBeInTheDocument()

      // Check error message
      expect(screen.getByText('Orientation constraint must have selector field')).toBeInTheDocument()
    })

    it('should render positional-error with constraint table', () => {
      const errorMessages: ErrorMessages = {
        conflictingConstraint: 'Node2 is above Node1',
        conflictingSourceConstraint: 'OrientationConstraint with directions [below] and selector Node2-&gt;Node1',
        minimalConflictingConstraints: new Map([
          ['OrientationConstraint with directions [below] and selector Node2-&gt;Node1', ['Node2 is above Node1']],
          ['OrientationConstraint with directions [directlyRight] and selector ~v', ['Node1 is horizontally aligned with Variable3', 'Node2 is horizontally aligned with Variable3']]
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
      expect(screen.getByText('Could not satisfy all constraints')).toBeInTheDocument()
      expect(screen.getByText('Your data causes the following visualization constraints to conflict.')).toBeInTheDocument()

      // Check constraint table instruction
      expect(screen.getByText(/Hover over the conflicting constraints/)).toBeInTheDocument()

      // Check table headers
      expect(screen.getByText('Source Constraints')).toBeInTheDocument()
      expect(screen.getByText('Diagram Elements')).toBeInTheDocument()

      // Check source constraints are rendered
      expect(screen.getByText('OrientationConstraint with directions [below] and selector Node2->Node1')).toBeInTheDocument()
      expect(screen.getByText('OrientationConstraint with directions [directlyRight] and selector ~v')).toBeInTheDocument()

      // Check diagram constraints are rendered
      expect(screen.getByText('Node2 is above Node1')).toBeInTheDocument()
      expect(screen.getByText('Node1 is horizontally aligned with Variable3')).toBeInTheDocument()
      expect(screen.getByText('Node2 is horizontally aligned with Variable3')).toBeInTheDocument()
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
      expect(screen.getByText('Could not satisfy all constraints')).toBeInTheDocument()
      expect(screen.getByText('Your data causes the following visualization constraints to conflict.')).toBeInTheDocument()

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
      expect(screen.getByText('Could not satisfy all constraints')).toBeInTheDocument()
      expect(screen.getByText('Your data causes the following visualization constraints to conflict.')).toBeInTheDocument()

      // Check error card header (should be "Error" for general-error)
      expect(screen.getByText('Error')).toBeInTheDocument()

      // Check error message
      expect(screen.getByText('An unexpected error occurred while processing the layout')).toBeInTheDocument()
    })

    it('should return null and log error for invalid SystemError', () => {
      // Mock console.error to capture the log
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const invalidError = undefined

      const { container } = render(<ErrorMessageModal systemError={invalidError} />)

      // Should render nothing
      expect(container.firstChild).toBeNull()

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith('Cannot display the following error:', invalidError)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Highlighting when rendering a SystemError of type positional-error', () => {
    const errorMessages: ErrorMessages = {
      conflictingConstraint: 'Node2 is above Node1',
      conflictingSourceConstraint: 'OrientationConstraint with directions [below] and selector Node2-&gt;Node1',
      minimalConflictingConstraints: new Map([
        ['OrientationConstraint with directions [below] and selector Node2-&gt;Node1', ['Node2 is above Node1']],
        ['OrientationConstraint with directions [directlyRight] and selector ~v', ['Node1 is horizontally aligned with Variable3', 'Node2 is horizontally aligned with Variable3']]
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
      const sourceConstraint = screen.getByText('OrientationConstraint with directions [below] and selector Node2->Node1').parentElement!

      // Hover over the source constraint
      await user.hover(sourceConstraint)

      // Check that the source constraint gets highlighted
      expect(sourceConstraint).toHaveClass('highlight-source')

      // Check that related diagram constraints get highlighted
      const diagramConstraint1 = screen.getByText('Node2 is above Node1').parentElement!
      const unrelatedDiagramConstraint1 = screen.getByText('Node1 is horizontally aligned with Variable3').parentElement!
      const unrelatedDiagramConstraint2 = screen.getByText('Node2 is horizontally aligned with Variable3').parentElement!

      expect(diagramConstraint1).toHaveClass('highlight-source')
      expect(unrelatedDiagramConstraint1).not.toHaveClass('highlight-source')
      expect(unrelatedDiagramConstraint2).not.toHaveClass('highlight-source')

      // Stop hovering
      await user.unhover(sourceConstraint)

      // Check that highlighting is removed
      expect(sourceConstraint).not.toHaveClass('highlight-source')
      expect(diagramConstraint1).not.toHaveClass('highlight-source')
    })

    it('should highlight related source constraints when hovering over a diagram constraint', async () => {
      const user = userEvent.setup()
      render(<ErrorMessageModal systemError={positionalError} />)

      // Find the diagram constraint element
      const diagramConstraint = screen.getByText('Node2 is above Node1').parentElement!

      // Hover over the diagram constraint
      await user.hover(diagramConstraint)

      // Check that the diagram constraint gets highlighted
      expect(diagramConstraint).toHaveClass('highlight-diagram')

      // Check that related source constraint gets highlighted
      const sourceConstraint = screen.getByText('OrientationConstraint with directions [below] and selector Node2->Node1').parentElement!
      const unrelatedSourceConstraint = screen.getByText('OrientationConstraint with directions [directlyRight] and selector ~v').parentElement!

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
      const sourceConstraints = screen.getAllByText(/OrientationConstraint/)
      expect(sourceConstraints[0].parentElement).toHaveAttribute('data-constraint-id', 'source-0')
      expect(sourceConstraints[1].parentElement).toHaveAttribute('data-constraint-id', 'source-1')

      // Check diagram constraint data attributes
      const diagramConstraints = screen.getAllByText(/Node2 is above Node1|Node1 is horizontally|Node2 is horizontally/)
      expect(diagramConstraints[0].parentElement).toHaveAttribute('data-constraint-id', 'diagram-0-0')
      expect(diagramConstraints[1].parentElement).toHaveAttribute('data-constraint-id', 'diagram-1-0')
      expect(diagramConstraints[2].parentElement).toHaveAttribute('data-constraint-id', 'diagram-1-1')
    })

    it('should handle mouse events correctly', async () => {
      const user = userEvent.setup()
      render(<ErrorMessageModal systemError={positionalError} />)

      const sourceConstraint = screen.getByText('OrientationConstraint with directions [below] and selector Node2->Node1').parentElement!
      const diagramConstraint = screen.getByText('Node2 is above Node1').parentElement!

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