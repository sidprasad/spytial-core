import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import '@testing-library/jest-dom'
import { ErrorMessageContainer } from '../../src/components/ErrorMessageModal/ErrorMessageContainer'
import { ErrorStateManager, SystemError } from '../../src/components/ErrorMessageModal'

// Mock the ErrorMessageModal component
vi.mock('../../src/components/ErrorMessageModal/ErrorMessageModal', () => ({
  ErrorMessageModal: vi.fn((props) => {
    return React.createElement('div', {
      'data-testid': 'error-message-modal',
      'data-system-error': JSON.stringify(props.systemError)
    }, 'Mocked ErrorMessageModal')
  })
}))

describe('ErrorMessageContainer Component', () => {
  let mockErrorManager: ErrorStateManager
  let mockSetCurrentError: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockErrorManager = new ErrorStateManager()
    mockSetCurrentError = vi.fn()
    
    // Reset all mocks
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    describe('Normal rendering behavior', () => {
      it('should render the ErrorMessageModal when error manager has a current error', () => {
        const testError: SystemError = {
          type: 'parse-error',
          message: 'Test parse error',
          source: 'test.yaml'
        }

        // Set up error manager with an error
        mockErrorManager.setError(testError)

        render(<ErrorMessageContainer errorManager={mockErrorManager} />)

        // Verify ErrorMessageModal is rendered
        const modal = screen.getByTestId('error-message-modal')
        expect(modal).toBeInTheDocument()
        
        // Verify the correct error is passed to ErrorMessageModal
        const passedError = JSON.parse(modal.getAttribute('data-system-error') || '{}')
        expect(passedError).toEqual(testError)
      })

      it('should render the ErrorMessageContainer with default wrapper div', () => {
        const testError: SystemError = {
          type: 'general-error',
          message: 'Test general error'
        }

        mockErrorManager.setError(testError)

        const { container } = render(<ErrorMessageContainer errorManager={mockErrorManager} />)

        // Find the container div
        const containerDiv = container.querySelector('.error-message-container')
        expect(containerDiv).toBeInTheDocument()
        expect(containerDiv).toHaveClass('error-message-container')
      })

      it('should reflect the className parameter in the component when provided', () => {
        const testError: SystemError = {
          type: 'parse-error',
          message: 'Test parse error'
        }
        const customClassName = 'custom-error-class another-class'

        mockErrorManager.setError(testError)

        const { container } = render(
          <ErrorMessageContainer 
            errorManager={mockErrorManager} 
            className={customClassName}
          />
        )

        // Find the container div and verify it has both default and custom classes
        const containerDiv = container.querySelector('.error-message-container')
        expect(containerDiv).toBeInTheDocument()
        expect(containerDiv).toHaveClass('error-message-container')
        expect(containerDiv).toHaveClass('custom-error-class')
        expect(containerDiv).toHaveClass('another-class')
      })

      it('should handle empty className gracefully', () => {
        const testError: SystemError = {
          type: 'parse-error',
          message: 'Test parse error'
        }

        mockErrorManager.setError(testError)

        const { container } = render(
          <ErrorMessageContainer 
            errorManager={mockErrorManager} 
            className=""
          />
        )

        const containerDiv = container.querySelector('.error-message-container')
        expect(containerDiv).toBeInTheDocument()
        expect(containerDiv).toHaveClass('error-message-container')
        // Should not have extra whitespace
        expect(containerDiv?.className).toBe('error-message-container')
      })
    })

    it('should render nothing when the error manager does not contain a current error', () => {
      // Error manager starts with no error
      expect(mockErrorManager.getCurrentError()).toBeNull()

      const { container } = render(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Should render nothing (null)
      expect(container.firstChild).toBeNull()
      expect(screen.queryByTestId('error-message-modal')).not.toBeInTheDocument()
    })

    it('should render nothing when error manager error is explicitly cleared', () => {
      const testError: SystemError = {
        type: 'parse-error',
        message: 'Test parse error'
      }

      // First set an error
      mockErrorManager.setError(testError)
      
      const { container, rerender } = render(<ErrorMessageContainer errorManager={mockErrorManager} />)
      
      // Verify it renders the modal initially
      expect(screen.getByTestId('error-message-modal')).toBeInTheDocument()

      // Clear the error and force re-render
      act(() => {
        mockErrorManager.clearError()
      })
      
      rerender(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Should now render nothing
      expect(container.firstChild).toBeNull()
      expect(screen.queryByTestId('error-message-modal')).not.toBeInTheDocument()
    })
  })

  describe('Interactions with the Error Manager', () => {
    it('should register callback with error manager and respond to state changes', () => {
      const onErrorChangeSpy = vi.spyOn(mockErrorManager, 'onErrorChange')
      
      const testError: SystemError = {
        type: 'group-overlap-error',
        message: 'Test group overlap error',
        source: 'layout.yaml'
      }

      const { rerender } = render(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Verify onErrorChange was called to register the callback
      expect(onErrorChangeSpy).toHaveBeenCalledTimes(1)
      expect(onErrorChangeSpy).toHaveBeenCalledWith(expect.any(Function))

      // Initially should render nothing
      expect(screen.queryByTestId('error-message-modal')).not.toBeInTheDocument()

      // Update error manager and verify component responds
      act(() => {
        mockErrorManager.setError(testError)
      })
      
      rerender(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Should now render the modal with the error
      const modal = screen.getByTestId('error-message-modal')
      expect(modal).toBeInTheDocument()
      
      const passedError = JSON.parse(modal.getAttribute('data-system-error') || '{}')
      expect(passedError).toEqual(testError)

      onErrorChangeSpy.mockRestore()
    })

    it('should update display when error manager changes its error state', () => {
      const firstError: SystemError = {
        type: 'parse-error',
        message: 'First error'
      }

      const secondError: SystemError = {
        type: 'general-error',
        message: 'Second error'
      }

      // Start with first error
      mockErrorManager.setError(firstError)

      const { rerender } = render(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Verify first error is displayed
      let modal = screen.getByTestId('error-message-modal')
      let passedError = JSON.parse(modal.getAttribute('data-system-error') || '{}')
      expect(passedError).toEqual(firstError)

      // Change to second error
      act(() => {
        mockErrorManager.setError(secondError)
      })
      rerender(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Verify second error is now displayed
      modal = screen.getByTestId('error-message-modal')
      passedError = JSON.parse(modal.getAttribute('data-system-error') || '{}')
      expect(passedError).toEqual(secondError)
    })

    it('should subscribe to error manager changes via onErrorChange', () => {
      const onErrorChangeSpy = vi.spyOn(mockErrorManager, 'onErrorChange')

      render(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Verify onErrorChange was called to subscribe to changes
      expect(onErrorChangeSpy).toHaveBeenCalledTimes(1)
      expect(onErrorChangeSpy).toHaveBeenCalledWith(expect.any(Function))

      onErrorChangeSpy.mockRestore()
    })

    it('should handle error manager clearing errors correctly', () => {
      const testError: SystemError = {
        type: 'positional-error',
        messages: {
          conflictingConstraint: 'Node2 is above Node1',
          conflictingSourceConstraint: 'Test constraint',
          minimalConflictingConstraints: new Map()
        }
      }

      // Start with an error
      mockErrorManager.setError(testError)

      const { rerender } = render(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Verify error is displayed
      expect(screen.getByTestId('error-message-modal')).toBeInTheDocument()

      // Clear the error
      act(() => {
        mockErrorManager.clearError()
      })
      rerender(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Verify nothing is displayed
      expect(screen.queryByTestId('error-message-modal')).not.toBeInTheDocument()
    })

    it('should properly initialize with error managers current state', () => {
      const initialError: SystemError = {
        type: 'parse-error',
        message: 'Initial error'
      }

      // Set error before rendering component
      mockErrorManager.setError(initialError)

      render(<ErrorMessageContainer errorManager={mockErrorManager} />)

      // Should immediately render the error that was already set
      const modal = screen.getByTestId('error-message-modal')
      expect(modal).toBeInTheDocument()
      
      const passedError = JSON.parse(modal.getAttribute('data-system-error') || '{}')
      expect(passedError).toEqual(initialError)
    })
  })
})