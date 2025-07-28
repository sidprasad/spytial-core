import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { CndLayoutInterface } from '../../src/components/CndLayoutInterface'
import type { ConstraintData, DirectiveData } from '../../src/components/NoCodeView/interfaces'
import { useState } from 'react'

// Mock heavy dependencies
vi.mock('../../src/components/NoCodeView/CodeView', () => ({
  generateLayoutSpecYaml: vi.fn(() => 'generated: yaml'),
  CodeView: vi.fn((props) => (
    <div data-testid="mock-code-view">
      <textarea 
        value={props.yamlValue} 
        onChange={props.handleTextareaChange}
        disabled={props.disabled}
        role="textbox"
        aria-label="CND Layout Specification YAML"
      />
    </div>
  ))
}))

vi.mock('../../src/components/NoCodeView/NoCodeView', () => ({
  NoCodeView: vi.fn((props) => (
    <div data-testid="mock-no-code-view">
      <div role="region" aria-label="Constraints Section">
        <h2>Constraints</h2>
        {props.constraints.map((c) => (
          <div key={c.id}>{c.type}</div>
        ))}
        <button onClick={() => props.setConstraints((prev) => [...prev, { id: 'new', type: 'new' }])}>
          Add a new constraint
        </button>
      </div>
      <div role="region" aria-label="Directives Section">
        <h2>Directives</h2>
        {props.directives.map((d) => (
          <div key={d.id}>{d.type}</div>
        ))}
        <button onClick={() => props.setDirectives((prev) => [...prev, { id: 'new', type: 'new' }])}>
          Add a new directive
        </button>
      </div>
    </div>
  ))
}))

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

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<CndLayoutInterface {...defaultProps} />)
      
      // Should render main container
      expect(screen.getByRole('region', {name: 'CND Layout Specification Interface'})).toBeInTheDocument()
      
      // Should render toggle component and its labels
      expect(screen.getByRole('switch')).toBeInTheDocument()
      expect(screen.getByText("Code View")).toBeInTheDocument()
      expect(screen.getByText("No Code View")).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<CndLayoutInterface {...defaultProps} className="custom-class" />)
      
      const container = screen.getByLabelText('CND Layout Specification Interface')
      expect(container).toHaveClass('custom-class')
    })

    it('should show Code View by default', () => {
      render(<CndLayoutInterface {...defaultProps} />)
      
      // Should show textarea for code view
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      
      // Should not show No Code view elements
      expect(screen.queryByText(/constraints/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/directives/i)).not.toBeInTheDocument()
    })

    it('should show No Code View when isNoCodeView is true', () => {
      render(<CndLayoutInterface {...defaultProps} isNoCodeView={true} />)
      
      // Should not show textarea
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      
      // Should show No Code view elements
      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
    })

    it('should display textArea empty by default', () => {
      render(<CndLayoutInterface {...defaultProps} />)
      
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe('')
    })

    it('should display yamlValue in textarea, if given', () => {
      const testYaml = 'constraints:\n  - type: orientation'
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

    it('should call onViewChange when toggle is clicked', async () => {
      const user = userEvent.setup()
      const mockOnViewChange = defaultProps.onViewChange
      
      render(<CndLayoutInterface {...defaultProps} />)
      
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
      
      expect(() => render(<CndLayoutInterface {...propsWithoutCallbacks} />)).not.toThrow()
    })

    it('should handle large YAML values', () => {
      const largeYaml = 'constraints:\n'.repeat(1000)
      
      render(<CndLayoutInterface {...defaultProps} yamlValue={largeYaml} />)
      
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe(largeYaml)
    })

    it('should handle empty constraints and directives arrays', () => {
      render(<CndLayoutInterface 
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
  const TestWrapper = () => {
    const [isNoCodeView, setIsNoCodeView] = useState(false)
    const [yamlValue, setYamlValue] = useState('')

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

    it('should maintain state when switching views', async () => {
      const user = userEvent.setup()
      const testYaml = "constraints: \n - type: orientation\n \t- directions: right"

      render(<TestWrapper />)

      // Type some YAML in Code View
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await waitFor(async () => {
        await user.type(textarea, testYaml)
      })
      expect(textarea.value).toBe(testYaml)
      
      // Switch to No Code view
      const toggle = screen.getByRole('switch')
      await user.click(toggle)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      
      // Switch back to Code view
      await user.click(toggle)
      expect(screen.queryByRole('textbox')).toBeInTheDocument()

      // Check if textarea retains value
      const newTextarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(newTextarea.value).toBe(testYaml)
    })
  })
})
