import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { SpytialLayoutInterface } from '../../src/components/SpytialLayoutInterface'
import type { ConstraintData, DirectiveData } from '../../src/components/NoCodeView/interfaces'
import { useState } from 'react'

// Mock heavy dependencies
vi.mock(import('../../src/components/NoCodeView/CodeView'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    CodeView: vi.fn((props) => (
      <div data-testid="mock-code-view">
        <textarea 
          value={props.yamlValue} 
          onChange={props.handleTextareaChange}
          disabled={props.disabled}
          role="textbox"
          aria-label="Spytial Layout Specification YAML"
        />
      </div>
    ))
  }
})

describe('SpytialLayoutInterface Component', () => {
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

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<SpytialLayoutInterface {...defaultProps} />)
      
      // Should render main container
      expect(screen.getByRole('region', {name: 'Spytial Layout Specification Interface'})).toBeInTheDocument()
      
      // Should render toggle component and its labels
      expect(screen.getByRole('switch')).toBeInTheDocument()
      expect(screen.getByText("Code View")).toBeInTheDocument()
      expect(screen.getByText("No Code View")).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<SpytialLayoutInterface {...defaultProps} className="custom-class" />)
      
      const container = screen.getByLabelText('Spytial Layout Specification Interface')
      expect(container).toHaveClass('custom-class')
    })

    it('should show Code View by default', () => {
      render(<SpytialLayoutInterface {...defaultProps} />)
      
      // Should show textarea for code view
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      
      // Should not show No Code view elements
      expect(screen.queryByText(/constraints/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/directives/i)).not.toBeInTheDocument()
    })

    it('should show No Code View when isNoCodeView is true', () => {
      render(<SpytialLayoutInterface {...defaultProps} isNoCodeView={true} />)
      
      // Should not show textarea
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      
      // Should show No Code view elements
      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
    })

    it('should display textArea empty by default', () => {
      render(<SpytialLayoutInterface {...defaultProps} />)
      
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe('')
    })

    it('should display yamlValue in textarea, if given', () => {
      const testYaml = 'constraints:\n  - type: orientation'
      render(<SpytialLayoutInterface {...defaultProps} yamlValue={testYaml} />)
      
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe(testYaml)
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when textarea value changes', async () => {
      const user = userEvent.setup()
      const mockOnChange = defaultProps.onChange
      
      render(<SpytialLayoutInterface {...defaultProps} />)
      
      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'test content')
      
      expect(mockOnChange).toHaveBeenCalled()
    })

    it('should call onViewChange when toggle is clicked', async () => {
      const user = userEvent.setup()
      const mockOnViewChange = defaultProps.onViewChange
      
      render(<SpytialLayoutInterface {...defaultProps} />)
      
      // Find and click the view toggle
      const toggle = screen.queryByRole('button', { name: /toggle view/i }) || 
                    screen.queryByRole('switch') ||
                    screen.queryByText(/no code view/i)
      
      expect(toggle).toBeInTheDocument()

      // Click the toggle to switch to No Code View
      await user.click(toggle as HTMLElement)
      
      expect(mockOnViewChange).toHaveBeenCalledWith(true)
    })

    it('should not call onChange when disabled', async () => {
      const user = userEvent.setup()
      const mockOnChange = defaultProps.onChange
      
      render(<SpytialLayoutInterface {...defaultProps} disabled={true} />)
      
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeDisabled()
      
      await user.type(textarea, 'test')
      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SpytialLayoutInterface {...defaultProps} aria-label="Custom ARIA label" />)
      
      expect(screen.getByLabelText('Custom ARIA label')).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      // TODO: Implement keyboard navigation tests
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
      
      expect(() => render(<SpytialLayoutInterface {...propsWithoutCallbacks} />)).not.toThrow()
    })

    it('should handle large YAML values', () => {
      const largeYaml = 'constraints:\n'.repeat(1000)
      
      render(<SpytialLayoutInterface {...defaultProps} yamlValue={largeYaml} />)
      
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe(largeYaml)
    })

    it('should handle empty constraints and directives arrays', () => {
      render(<SpytialLayoutInterface 
        {...defaultProps} 
        isNoCodeView={true}
        constraints={[]}
        directives={[]}
      />)
      
      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
    })
  })

  // A controlled test wrapper
  interface TestWrapperProps {
    initialIsNoCodeView?: boolean
    initialYamlValue?: string
    initialDirectives?: DirectiveData[]
  }

  const TestWrapper = ({
    initialIsNoCodeView = false, 
    initialYamlValue = '',
    initialDirectives = [] 
  }: TestWrapperProps) => {
    const [isNoCodeView, setIsNoCodeView] = useState(initialIsNoCodeView)
    const [yamlValue, setYamlValue] = useState(initialYamlValue)
    const [directives, setDirectives] = useState<DirectiveData[]>(initialDirectives)

    return (
      <SpytialLayoutInterface 
        {...defaultProps}
        isNoCodeView={isNoCodeView}
        onViewChange={setIsNoCodeView}
        yamlValue={yamlValue}
        onChange={setYamlValue}
        directives={directives}
        setDirectives={setDirectives}
      />
    )
  }

  describe('Integration with NoCodeView', () => {
    it('should switch between views correctly', async () => {
      const user = userEvent.setup()

      // Render the controlled test wrapper
      render(<TestWrapper />)

      // Start in Code View
      expect(screen.getByRole('textbox')).toBeInTheDocument()

      // Find and click the toggle to switch to No Code View
      const toggle = screen.getByRole('switch')
      await user.click(toggle)

      // Expect No Code View to be active
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
    })

    it('No Code View should update when Code View changes', async () => {
      const user = userEvent.setup()
      const testYaml = "constraints:\n  - orientation: {}"

      render(<TestWrapper />)

      // Type some YAML in Code View
      expect(screen.queryByTestId('mock-code-view')).toBeInTheDocument()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await waitFor(async () => {
        fireEvent.change(textarea, { target: { value: testYaml } })
      })
      expect(textarea.value).toBe(testYaml)
      
      // Switch to No Code view
      const toggle = screen.getByRole('switch')
      await user.click(toggle)
      expect(screen.queryByTestId('mock-code-view')).not.toBeInTheDocument()
      expect(screen.getByRole('region', {name: 'No Code View Container'})).toBeInTheDocument()
      expect(screen.getByText(/orientation/i)).toBeInTheDocument()
      
      // Switch back to Code view
      await user.click(toggle)
      expect(screen.queryByRole('textbox')).toBeInTheDocument()

      // Check if textarea retains value
      const newTextarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(newTextarea.value).toBe(testYaml)
    })

    it('Code View should update when No Code View changes', async () => {
      const user = userEvent.setup()
      const directives: DirectiveData[] = [{ id: '1', type: 'attribute', params: {field: 'key'} }]

      // Render the controlled test wrapper
      render(<TestWrapper initialDirectives={directives} initialIsNoCodeView={true} />)

      // Confirm No Code View is active
      expect(screen.getByRole('region', {name: 'No Code View Container'})).toBeInTheDocument()
      expect(screen.getByText(/attribute/i)).toBeInTheDocument()

      // Switch to Code View
      const toggle = screen.getByRole('switch')
      await user.click(toggle)

      expect(screen.queryByTestId('mock-no-code-view')).not.toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeInTheDocument()

      // Check if textarea has the correct YAML representation
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toContain('attribute')

      // Switch to No Code View
      await user.click(toggle)
      expect(screen.getByRole('region', {name: 'No Code View Container'})).toBeInTheDocument()
      expect(screen.queryByTestId('mock-code-view')).not.toBeInTheDocument()

      // Remove the directive
      const removeButtons = screen.getAllByRole('button', { name: /Remove directive/i })
      expect(removeButtons.length).toBe(1)
      await user.click(removeButtons[0])

      // Check that the directives list has no children
      const directivesList = screen.getByRole('region', {name: 'Directives List'})
      expect(directivesList).toBeEmptyDOMElement()


      // Switch back to Code View
      await user.click(toggle)

      // Check if textarea is empty after removing directive
      expect(screen.getByTestId('mock-code-view')).toBeInTheDocument()
      const newTextarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(newTextarea.value).toBe('') // Assuming removing directive clears the textarea
    })
  })
})
