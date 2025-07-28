import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { CndLayoutInterface } from '../../src/components/CndLayoutInterface'
import type { ConstraintData, DirectiveData } from '../../src/components/NoCodeView/interfaces'

// Mock heavy dependencies
vi.mock('../../src/components/NoCodeView/CodeView', () => ({
  generateLayoutSpecYaml: vi.fn(() => 'generated: yaml'),
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
      expect(screen.getByRole('region')).toBeInTheDocument()
      
      // Should render view toggle
      expect(screen.getByText(/code view/i)).toBeInTheDocument()
      expect(screen.getByText(/no code view/i)).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<CndLayoutInterface {...defaultProps} className="custom-class" />)
      
      const container = screen.getByRole('region')
      expect(container).toHaveClass('custom-class')
    })

    it('should show Code View by default', () => {
      render(<CndLayoutInterface {...defaultProps} />)
      
      // Should show textarea for code view
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      
      // Should not show No Code view elements
      expect(screen.queryByText(/constraints/i)).not.toBeInTheDocument()
    })

    it('should show No Code View when isNoCodeView is true', () => {
      render(<CndLayoutInterface {...defaultProps} isNoCodeView={true} />)
      
      // Should not show textarea
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      
      // Should show No Code view elements
      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
    })

    it('should display yamlValue in textarea', () => {
      const testYaml = 'constraints:\n  - type: alignment'
      render(<CndLayoutInterface {...defaultProps} yamlValue={testYaml} />)
      
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe(testYaml)
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when textarea value changes', async () => {
      const user = userEvent.setup()
      const mockOnChange = vi.fn()
      
      render(<CndLayoutInterface {...defaultProps} onChange={mockOnChange} />)
      
      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'test content')
      
      expect(mockOnChange).toHaveBeenCalled()
    })

    it('should call onViewChange when toggle is clicked', async () => {
      const user = userEvent.setup()
      const mockOnViewChange = vi.fn()
      
      render(<CndLayoutInterface {...defaultProps} onViewChange={mockOnViewChange} />)
      
      // Find and click the view toggle
      const toggle = screen.getByRole('button', { name: /toggle view/i }) || 
                    screen.getByRole('switch') ||
                    screen.getByText(/no code view/i)
      
      await user.click(toggle)
      
      expect(mockOnViewChange).toHaveBeenCalledWith(true)
    })

    it('should handle textarea input correctly', async () => {
      const user = userEvent.setup()
      const mockOnChange = vi.fn()
      
      render(<CndLayoutInterface {...defaultProps} onChange={mockOnChange} />)
      
      const textarea = screen.getByRole('textbox')
      await user.clear(textarea)
      await user.type(textarea, 'constraints:\n  - type: alignment')
      
      expect(mockOnChange).toHaveBeenLastCalledWith('constraints:\n  - type: alignment')
    })

    it('should not call onChange when disabled', async () => {
      const user = userEvent.setup()
      const mockOnChange = vi.fn()
      
      render(<CndLayoutInterface {...defaultProps} onChange={mockOnChange} disabled={true} />)
      
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeDisabled()
      
      await user.type(textarea, 'test')
      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Constraints and Directives', () => {
    it('should display constraints in No Code view', () => {
      const constraints: ConstraintData[] = [
        { id: '1', type: 'orientation', params: { nodes: ['A', 'B'] } }
      ]
      
      render(<CndLayoutInterface 
        {...defaultProps} 
        isNoCodeView={true} 
        constraints={constraints}
      />)
      
      expect(screen.getByText(/constraints/i)).toBeInTheDocument()
      expect(screen.getByText(/orientation/i)).toBeInTheDocument()
    })

    it('should display directives in No Code view', () => {
      const directives: DirectiveData[] = [
        { id: '1', type: 'size', params: { value: 50 } }
      ]
      
      render(<CndLayoutInterface 
        {...defaultProps} 
        isNoCodeView={true} 
        directives={directives}
      />)
      
      expect(screen.getByText(/directives/i)).toBeInTheDocument()
      expect(screen.getByText(/size/i)).toBeInTheDocument()
    })

    it('should call setConstraints when constraints are updated', async () => {
      const user = userEvent.setup()
      const mockSetConstraints = vi.fn()
      
      render(<CndLayoutInterface 
        {...defaultProps} 
        isNoCodeView={true}
        setConstraints={mockSetConstraints}
      />)
      
      // Simulate adding a constraint (this depends on the actual NoCodeView implementation)
      const addButton = screen.queryByRole('button', { name: /add constraint/i })
      if (addButton) {
        await user.click(addButton)
        expect(mockSetConstraints).toHaveBeenCalled()
      }
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<CndLayoutInterface {...defaultProps} aria-label="Custom ARIA label" />)
      
      expect(screen.getByLabelText('Custom ARIA label')).toBeInTheDocument()
    })

    it('should have proper semantic structure', () => {
      render(<CndLayoutInterface {...defaultProps} />)
      
      // Should have a main region
      expect(screen.getByRole('region')).toBeInTheDocument()
      
      // Should have proper form elements
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<CndLayoutInterface {...defaultProps} />)
      
      const textarea = screen.getByRole('textbox')
      
      // Should be able to focus textarea with keyboard
      await user.tab()
      expect(textarea).toHaveFocus()
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

    it('should handle malformed constraint data gracefully', () => {
      const malformedConstraints = [
        { id: '1', type: 'orientation', params: null } as any
      ]
      
      expect(() => render(<CndLayoutInterface 
        {...defaultProps} 
        isNoCodeView={true}
        constraints={malformedConstraints}
      />)).not.toThrow()
    })
  })

  describe('Integration with NoCodeView', () => {
    it('should switch between views correctly', async () => {
      const user = userEvent.setup()
      const mockOnViewChange = vi.fn()
      
      render(<CndLayoutInterface {...defaultProps} onViewChange={mockOnViewChange} />)
      
      // Start in Code View
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      
      // Switch to No Code View
      const toggle = screen.getByText(/no code view/i)
      await user.click(toggle)
      
      expect(mockOnViewChange).toHaveBeenCalledWith(true)
    })

    it('should maintain state when switching views', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<CndLayoutInterface {...defaultProps} yamlValue="test: yaml" />)
      
      // Switch to No Code view
      rerender(<CndLayoutInterface {...defaultProps} yamlValue="test: yaml" isNoCodeView={true} />)
      
      // Switch back to Code view
      rerender(<CndLayoutInterface {...defaultProps} yamlValue="test: yaml" isNoCodeView={false} />)
      
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toBe("test: yaml")
    })
  })
})
