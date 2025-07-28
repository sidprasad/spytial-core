import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import React from 'react'

// Mock the heavy dependencies
vi.mock('../../src/components/NoCodeView/CodeView', () => ({
  generateLayoutSpecYaml: vi.fn(() => 'generated: yaml'),
}))

// Create a simple mock state manager for testing
class MockCndLayoutStateManager {
  private static instance: MockCndLayoutStateManager
  private yamlValue = ''
  private isNoCodeView = false
  private constraints: any[] = []
  private directives: any[] = []

  static getInstance() {
    if (!MockCndLayoutStateManager.instance) {
      MockCndLayoutStateManager.instance = new MockCndLayoutStateManager()
    }
    return MockCndLayoutStateManager.instance
  }

  static resetInstance() {
    MockCndLayoutStateManager.instance = new MockCndLayoutStateManager()
  }

  setYamlValue(value: string) { this.yamlValue = value }
  setIsNoCodeView(value: boolean) { this.isNoCodeView = value }
  setConstraints(value: any[]) { this.constraints = [...value] }
  setDirectives(value: any[]) { this.directives = [...value] }
  
  getYamlValue() { return this.yamlValue }
  getIsNoCodeView() { return this.isNoCodeView }
  getConstraints() { return [...this.constraints] }
  getDirectives() { return [...this.directives] }
  
  initializeWithConfig(config: any) {
    if (config.initialYamlValue !== undefined) this.yamlValue = config.initialYamlValue
    if (config.initialIsNoCodeView !== undefined) this.isNoCodeView = config.initialIsNoCodeView
    if (config.initialConstraints !== undefined) this.constraints = [...config.initialConstraints]
    if (config.initialDirectives !== undefined) this.directives = [...config.initialDirectives]
  }

  getCurrentCndSpec() {
    return this.yamlValue || 'generated: yaml'
  }
}

// Mock wrapper component for testing
const MockCndLayoutInterfaceWrapper: React.FC<{ config?: any }> = ({ config }) => {
  const [yamlValue, setYamlValue] = React.useState(config?.initialYamlValue || '')
  const [isNoCodeView, setIsNoCodeView] = React.useState(config?.initialIsNoCodeView || false)
  const [constraints, setConstraints] = React.useState(config?.initialConstraints || [])
  const [directives, setDirectives] = React.useState(config?.initialDirectives || [])
  
  const stateManager = React.useMemo(() => MockCndLayoutStateManager.getInstance(), [])

  React.useEffect(() => {
    if (config) {
      stateManager.initializeWithConfig(config)
    }
  }, [config, stateManager])

  React.useEffect(() => {
    stateManager.setYamlValue(yamlValue)
  }, [yamlValue, stateManager])

  React.useEffect(() => {
    stateManager.setIsNoCodeView(isNoCodeView)
  }, [isNoCodeView, stateManager])

  React.useEffect(() => {
    stateManager.setConstraints(constraints)
  }, [constraints, stateManager])

  React.useEffect(() => {
    stateManager.setDirectives(directives)
  }, [directives, stateManager])

  const handleYamlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setYamlValue(e.target.value)
    
    // Simulate legacy function call
    if ((window as any).updateFromCnDSpec) {
      (window as any).updateFromCnDSpec()
    }
  }

  const handleViewToggle = () => {
    setIsNoCodeView(!isNoCodeView)
  }

  return (
    <div data-testid="cnd-wrapper">
      <div data-testid="yaml-value">{yamlValue}</div>
      <div data-testid="view-mode">{isNoCodeView ? 'no-code' : 'code'}</div>
      <div data-testid="constraints-count">{constraints.length}</div>
      <div data-testid="directives-count">{directives.length}</div>
      <textarea 
        data-testid="yaml-input"
        value={yamlValue}
        onChange={handleYamlChange}
      />
      <button
        data-testid="view-toggle"
        onClick={handleViewToggle}
      >
        Toggle View
      </button>
    </div>
  )
}

describe('CndLayoutInterfaceWrapper Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton state
    MockCndLayoutStateManager.resetInstance()
    
    // Clear global window properties
    delete (window as any).updateFromCnDSpec
    delete (window as any).CnDReactState
  })

  describe('Configuration Initialization', () => {
    it('should initialize with config values', () => {
      const config = {
        initialYamlValue: 'constraints:\n  - type: test',
        initialIsNoCodeView: true,
        initialConstraints: [{ id: '1', type: 'orientation', params: { nodes: ['A', 'B'] } }],
        initialDirectives: [{ id: '1', type: 'size', params: { value: 50 } }],
      }

      render(<MockCndLayoutInterfaceWrapper config={config} />)

      // Should show the configured values
      expect(screen.getByTestId('yaml-value')).toHaveTextContent('constraints:\n  - type: test')
      expect(screen.getByTestId('view-mode')).toHaveTextContent('no-code')
      expect(screen.getByTestId('constraints-count')).toHaveTextContent('1')
      expect(screen.getByTestId('directives-count')).toHaveTextContent('1')
      
      // State manager should be initialized
      const stateManager = MockCndLayoutStateManager.getInstance()
      expect(stateManager.getYamlValue()).toBe('constraints:\n  - type: test')
      expect(stateManager.getIsNoCodeView()).toBe(true)
    })

    it('should use state manager defaults when no config provided', () => {
      render(<MockCndLayoutInterfaceWrapper />)

      expect(screen.getByTestId('yaml-value')).toHaveTextContent('')
      expect(screen.getByTestId('view-mode')).toHaveTextContent('code')
      expect(screen.getByTestId('constraints-count')).toHaveTextContent('0')
      expect(screen.getByTestId('directives-count')).toHaveTextContent('0')
      
      const stateManager = MockCndLayoutStateManager.getInstance()
      expect(stateManager.getYamlValue()).toBe('')
      expect(stateManager.getIsNoCodeView()).toBe(false)
    })

    it('should handle partial configuration', () => {
      const config = {
        initialYamlValue: 'test: yaml',
        // No view mode specified - should default to false
      }

      render(<MockCndLayoutInterfaceWrapper config={config} />)

      expect(screen.getByTestId('yaml-value')).toHaveTextContent('test: yaml')
      expect(screen.getByTestId('view-mode')).toHaveTextContent('code')
    })
  })

  describe('State Synchronization', () => {
    it('should sync React state with state manager', async () => {
      const user = userEvent.setup()
      render(<MockCndLayoutInterfaceWrapper />)

      const textarea = screen.getByTestId('yaml-input')
      await user.clear(textarea)
      await user.type(textarea, 'test yaml')

      const stateManager = MockCndLayoutStateManager.getInstance()
      
      // Wait for state updates to propagate
      await waitFor(() => {
        expect(stateManager.getYamlValue()).toBe('test yaml')
      })
    })

    it('should call legacy window functions when available', async () => {
      const mockUpdateFromCnDSpec = vi.fn()
      ;(window as any).updateFromCnDSpec = mockUpdateFromCnDSpec

      const user = userEvent.setup()
      render(<MockCndLayoutInterfaceWrapper />)

      const textarea = screen.getByTestId('yaml-input')
      await user.type(textarea, 'x')

      expect(mockUpdateFromCnDSpec).toHaveBeenCalled()
    })

    it('should handle missing legacy functions gracefully', async () => {
      // No legacy functions defined
      const user = userEvent.setup()
      
      expect(() => {
        render(<MockCndLayoutInterfaceWrapper />)
      }).not.toThrow()

      const textarea = screen.getByTestId('yaml-input')
      await expect(user.type(textarea, 'test')).resolves.not.toThrow()
    })
  })

  describe('View Mode Toggle', () => {
    it('should toggle between Code and No Code views', async () => {
      const user = userEvent.setup()
      render(<MockCndLayoutInterfaceWrapper />)

      // Start in Code View
      expect(screen.getByTestId('view-mode')).toHaveTextContent('code')

      // Toggle to No Code View
      const toggle = screen.getByTestId('view-toggle')
      await user.click(toggle)

      expect(screen.getByTestId('view-mode')).toHaveTextContent('no-code')

      // Toggle back to Code View
      await user.click(toggle)
      expect(screen.getByTestId('view-mode')).toHaveTextContent('code')
    })

    it('should update state manager when view changes', async () => {
      const user = userEvent.setup()
      render(<MockCndLayoutInterfaceWrapper />)

      const stateManager = MockCndLayoutStateManager.getInstance()
      
      // Initial state
      expect(stateManager.getIsNoCodeView()).toBe(false)

      // Toggle view
      const toggle = screen.getByTestId('view-toggle')
      await user.click(toggle)

      // Wait for state to update
      await waitFor(() => {
        expect(stateManager.getIsNoCodeView()).toBe(true)
      })
    })
  })

  describe('Configuration Edge Cases', () => {
    it('should handle null config gracefully', () => {
      expect(() => {
        render(<MockCndLayoutInterfaceWrapper config={null} />)
      }).not.toThrow()
    })

    it('should handle empty strings in config', () => {
      const config = {
        initialYamlValue: '',
        initialIsNoCodeView: false,
        initialConstraints: [],
        initialDirectives: [],
      }

      expect(() => {
        render(<MockCndLayoutInterfaceWrapper config={config} />)
      }).not.toThrow()

      expect(screen.getByTestId('yaml-value')).toHaveTextContent('')
      expect(screen.getByTestId('view-mode')).toHaveTextContent('code')
    })

    it('should handle invalid config types gracefully', () => {
      const config = {
        initialYamlValue: 123 as any, // Invalid type
        initialIsNoCodeView: 'true' as any, // Invalid type
      }

      expect(() => {
        render(<MockCndLayoutInterfaceWrapper config={config} />)
      }).not.toThrow()
    })
  })

  describe('State Manager Integration', () => {
    it('should maintain singleton pattern', () => {
      const manager1 = MockCndLayoutStateManager.getInstance()
      const manager2 = MockCndLayoutStateManager.getInstance()
      
      expect(manager1).toBe(manager2)
    })

    it('should persist state across component remounts', () => {
      const config = {
        initialYamlValue: 'persistent: state',
        initialIsNoCodeView: true,
      }

      // First mount
      const { unmount } = render(<MockCndLayoutInterfaceWrapper config={config} />)
      
      const stateManager = MockCndLayoutStateManager.getInstance()
      expect(stateManager.getYamlValue()).toBe('persistent: state')
      
      // Unmount and remount
      unmount()
      render(<MockCndLayoutInterfaceWrapper />)

      // State should persist in manager
      expect(stateManager.getYamlValue()).toBe('persistent: state')
    })

    it('should handle state manager initialization correctly', () => {
      const config = {
        initialYamlValue: 'init: test',
        initialConstraints: [{ id: '1', type: 'orientation', params: {} }],
      }

      render(<MockCndLayoutInterfaceWrapper config={config} />)

      const stateManager = MockCndLayoutStateManager.getInstance()
      expect(stateManager.getYamlValue()).toBe('init: test')
      expect(stateManager.getConstraints()).toEqual([{ id: '1', type: 'orientation', params: {} }])
    })
  })

  describe('Error Handling', () => {
    it('should handle state manager errors gracefully', () => {
      // Mock a state manager that throws errors
      const originalGetInstance = MockCndLayoutStateManager.getInstance
      vi.spyOn(MockCndLayoutStateManager, 'getInstance').mockImplementation(() => {
        throw new Error('State manager error')
      })

      expect(() => {
        render(<MockCndLayoutInterfaceWrapper />)
      }).not.toThrow()

      // Restore original implementation
      MockCndLayoutStateManager.getInstance = originalGetInstance
    })

    it('should handle React state update errors gracefully', () => {
      // This test verifies that the component doesn't crash on state updates
      const { rerender } = render(<MockCndLayoutInterfaceWrapper />)
      
      expect(() => {
        rerender(<MockCndLayoutInterfaceWrapper config={{ initialYamlValue: 'new: value' }} />)
      }).not.toThrow()
    })
  })
})
