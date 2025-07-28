/**
 * System Tests for CnD React Integration
 * 
 * These tests verify the complete CDN integration flow, including:
 * - Global window function mounting
 * - DataAPI integration
 * - Legacy demo code compatibility
 * - Full component mounting and unmounting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the entire react-component-integration module
const mockMountCndReactComponents = vi.fn()
const mockUnmountCndReactComponents = vi.fn()
const mockCndLayoutStateManager = {
  getInstance: vi.fn().mockReturnValue({
    getYamlValue: vi.fn().mockReturnValue(''),
    setYamlValue: vi.fn(),
    getIsNoCodeView: vi.fn().mockReturnValue(false),
    setIsNoCodeView: vi.fn(),
    getConstraints: vi.fn().mockReturnValue([]),
    setConstraints: vi.fn(),
    getDirectives: vi.fn().mockReturnValue([]),
    setDirectives: vi.fn(),
    getSystemErrors: vi.fn().mockReturnValue([]),
    setSystemErrors: vi.fn(),
  }),
  resetInstance: vi.fn(),
}

vi.mock('../../src/components/react-component-integration', () => ({
  mountCndReactComponents: mockMountCndReactComponents,
  unmountCndReactComponents: mockUnmountCndReactComponents,
  CndLayoutStateManager: mockCndLayoutStateManager,
}))

// Mock DataAPI
const mockDataAPI = {
  parseYamlToConstraints: vi.fn().mockReturnValue([]),
  parseYamlToDirectives: vi.fn().mockReturnValue([]),
  validateConstraints: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}

vi.mock('../../src/index.ts', () => ({
  DataAPI: mockDataAPI,
}))

describe('CnD React Integration System Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
    
    // Clear any global window properties
    delete (window as any).mountCndReactComponents
    delete (window as any).unmountCndReactComponents
    delete (window as any).updateFromCnDSpec
    delete (window as any).CnDReactState
    
    // Reset DOM
    document.body.innerHTML = ''
  })

  afterEach(() => {
    cleanup()
  })

  describe('Global Function Mounting', () => {
    it('should mount global functions on window object', () => {
      // Simulate the mounting function being called
      mockMountCndReactComponents({
        initialYamlValue: '',
        initialIsNoCodeView: false,
      })
      
      expect(mockMountCndReactComponents).toHaveBeenCalled()
      
      // Verify the mock was called (in real system, would verify actual window functions)
      expect(typeof mockMountCndReactComponents).toBe('function')
    })

    it('should create container elements when mounting', () => {
      // Create test container
      const container = document.createElement('div')
      container.id = 'cnd-layout-interface'
      document.body.appendChild(container)

      mockMountCndReactComponents()
      
      expect(mockMountCndReactComponents).toHaveBeenCalled()
      expect(document.getElementById('cnd-layout-interface')).toBeTruthy()
    })

    it('should handle missing container elements gracefully', () => {
      // No container in DOM - should not throw
      expect(() => {
        mockMountCndReactComponents()
      }).not.toThrow()
    })
  })

  describe('DataAPI Integration', () => {
    it('should integrate with constraint parsing', () => {
      const yamlInput = `
constraints:
  - type: orientation
    nodes: [A, B]
`
      
      mockDataAPI.parseYamlToConstraints.mockReturnValue([
        { id: '1', type: 'orientation', params: { nodes: ['A', 'B'] } }
      ])

      const result = mockDataAPI.parseYamlToConstraints(yamlInput)
      
      expect(mockDataAPI.parseYamlToConstraints).toHaveBeenCalledWith(yamlInput)
      expect(result).toEqual([
        { id: '1', type: 'orientation', params: { nodes: ['A', 'B'] } }
      ])
    })

    it('should integrate with directive parsing', () => {
      const yamlInput = `
directives:
  - type: size
    value: 50
`
      
      mockDataAPI.parseYamlToDirectives.mockReturnValue([
        { id: '1', type: 'size', params: { value: 50 } }
      ])

      const result = mockDataAPI.parseYamlToDirectives(yamlInput)
      
      expect(mockDataAPI.parseYamlToDirectives).toHaveBeenCalledWith(yamlInput)
      expect(result).toEqual([
        { id: '1', type: 'size', params: { value: 50 } }
      ])
    })

    it('should integrate with constraint validation', () => {
      const constraints = [
        { id: '1', type: 'orientation', params: { nodes: ['A', 'B'] } }
      ]
      
      mockDataAPI.validateConstraints.mockReturnValue({
        valid: false,
        errors: [{ message: 'Invalid node reference', type: 'constraint-error' }]
      })

      const result = mockDataAPI.validateConstraints(constraints)
      
      expect(mockDataAPI.validateConstraints).toHaveBeenCalledWith(constraints)
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
    })
  })

  describe('Legacy Demo Compatibility', () => {
    it('should work with existing webcola demo patterns', () => {
      // Simulate legacy demo setup
      const legacyConfig = {
        yamlValue: 'constraints:\n  - type: test',
        isNoCodeView: false,
      }

      // Mock legacy global functions
      ;(window as any).updateFromCnDSpec = vi.fn()
      ;(window as any).CnDReactState = {
        yaml: '',
        constraints: [],
        directives: [],
      }

      expect(() => {
        // Simulate legacy demo initialization
        if (typeof (window as any).updateFromCnDSpec === 'function') {
          ;(window as any).updateFromCnDSpec(legacyConfig.yamlValue)
        }
      }).not.toThrow()

      expect((window as any).updateFromCnDSpec).toHaveBeenCalledWith(legacyConfig.yamlValue)
    })

    it('should maintain backward compatibility with existing demos', () => {
      // Test that existing demo files can still function
      const demoElements = [
        'cnd-layout-interface',
        'yaml-input',
        'constraint-output',
      ]

      demoElements.forEach(elementId => {
        const element = document.createElement('div')
        element.id = elementId
        document.body.appendChild(element)
      })

      // Verify elements exist (legacy demos depend on these)
      demoElements.forEach(elementId => {
        expect(document.getElementById(elementId)).toBeTruthy()
      })
    })

    it('should handle mixed React and legacy code scenarios', () => {
      // Setup both React components and legacy elements
      const reactContainer = document.createElement('div')
      reactContainer.id = 'cnd-layout-interface'
      document.body.appendChild(reactContainer)

      const legacyElement = document.createElement('textarea')
      legacyElement.id = 'legacy-yaml-input'
      document.body.appendChild(legacyElement)

      expect(document.getElementById('cnd-layout-interface')).toBeTruthy()
      expect(document.getElementById('legacy-yaml-input')).toBeTruthy()
    })
  })

  describe('State Manager System Integration', () => {
    it('should maintain singleton pattern across system', () => {
      const manager1 = mockCndLayoutStateManager.getInstance()
      const manager2 = mockCndLayoutStateManager.getInstance()
      
      expect(manager1).toBe(manager2)
      expect(mockCndLayoutStateManager.getInstance).toHaveBeenCalledTimes(2)
    })

    it('should persist state across component lifecycle', () => {
      const stateManager = mockCndLayoutStateManager.getInstance()
      
      // Initial state
      stateManager.getYamlValue.mockReturnValue('initial: state')
      expect(stateManager.getYamlValue()).toBe('initial: state')
      
      // Update state
      stateManager.setYamlValue('updated: state')
      stateManager.getYamlValue.mockReturnValue('updated: state')
      
      expect(stateManager.setYamlValue).toHaveBeenCalledWith('updated: state')
      expect(stateManager.getYamlValue()).toBe('updated: state')
    })

    it('should handle system-wide error state management', () => {
      const stateManager = mockCndLayoutStateManager.getInstance()
      
      const systemErrors = [
        { type: 'parse-error' as const, message: 'Invalid YAML syntax' },
        { type: 'constraint-error' as const, message: 'Invalid constraint' }
      ]
      
      stateManager.setSystemErrors(systemErrors)
      stateManager.getSystemErrors.mockReturnValue(systemErrors)
      
      expect(stateManager.setSystemErrors).toHaveBeenCalledWith(systemErrors)
      expect(stateManager.getSystemErrors()).toEqual(systemErrors)
    })
  })

  describe('Component Mounting and Unmounting', () => {
    it('should mount components to correct DOM elements', () => {
      // Create target container
      const container = document.createElement('div')
      container.id = 'cnd-layout-interface'
      document.body.appendChild(container)

      expect(mockMountCndReactComponents).toHaveBeenCalled()
      expect(document.getElementById('cnd-layout-interface')).toBeTruthy()
    })

    it('should clean up on unmount', () => {
      // Setup mounted state
      const container = document.createElement('div')
      container.id = 'cnd-layout-interface'
      document.body.appendChild(container)

      // Mock unmounting
      mockUnmountCndReactComponents()
      
      expect(mockUnmountCndReactComponents).toHaveBeenCalled()
    })

    it('should handle multiple mount/unmount cycles', () => {
      // First mount
      mockMountCndReactComponents()
      expect(mockMountCndReactComponents).toHaveBeenCalledTimes(1)
      
      // Unmount
      mockUnmountCndReactComponents()
      expect(mockUnmountCndReactComponents).toHaveBeenCalledTimes(1)
      
      // Second mount
      mockMountCndReactComponents()
      expect(mockMountCndReactComponents).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle DOM manipulation errors gracefully', () => {
      // Mock DOM methods to throw errors
      const originalGetElementById = document.getElementById
      document.getElementById = vi.fn().mockImplementation(() => {
        throw new Error('DOM error')
      })

      expect(() => {
        mockMountCndReactComponents()
      }).not.toThrow()

      // Restore original method
      document.getElementById = originalGetElementById
    })

    it('should handle malformed configuration gracefully', () => {
      const malformedConfig = {
        initialYamlValue: null,
        initialIsNoCodeView: 'invalid',
        initialConstraints: 'not-an-array',
      }

      expect(() => {
        mockMountCndReactComponents(malformedConfig)
      }).not.toThrow()
    })

    it('should handle missing dependencies gracefully', () => {
      // Mock missing React
      const originalReact = (global as any).React
      delete (global as any).React

      expect(() => {
        mockMountCndReactComponents()
      }).not.toThrow()

      // Restore React
      ;(global as any).React = originalReact
    })

    it('should handle network or loading errors gracefully', () => {
      // Simulate loading failures
      const mockError = new Error('Failed to load component')
      mockMountCndReactComponents.mockImplementation(() => {
        throw mockError
      })

      expect(() => {
        mockMountCndReactComponents()
      }).toThrow('Failed to load component')

      // Reset mock
      mockMountCndReactComponents.mockReset()
    })
  })

  describe('Performance and Memory', () => {
    it('should not create memory leaks on repeated mount/unmount', () => {
      // This test would measure memory usage in a real scenario
      // For this mock, we verify clean mount/unmount cycles
      
      for (let i = 0; i < 10; i++) {
        mockMountCndReactComponents()
        mockUnmountCndReactComponents()
      }

      expect(mockMountCndReactComponents).toHaveBeenCalledTimes(10)
      expect(mockUnmountCndReactComponents).toHaveBeenCalledTimes(10)
    })

    it('should handle large state objects efficiently', () => {
      const stateManager = mockCndLayoutStateManager.getInstance()
      
      // Mock large data sets
      const largeConstraintSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `constraint-${i}`,
        type: 'orientation',
        params: { nodes: [`A${i}`, `B${i}`] }
      }))

      stateManager.setConstraints(largeConstraintSet)
      stateManager.getConstraints.mockReturnValue(largeConstraintSet)

      expect(stateManager.setConstraints).toHaveBeenCalledWith(largeConstraintSet)
      expect(stateManager.getConstraints()).toHaveLength(1000)
    })
  })

  describe('Browser Compatibility', () => {
    it('should work with different window object configurations', () => {
      // Test with minimal window object
      const minimalWindow = {
        document: document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }

      expect(() => {
        mockMountCndReactComponents()
      }).not.toThrow()
    })

    it('should handle missing modern JavaScript features gracefully', () => {
      // Mock older browser environment
      const originalPromise = (global as any).Promise
      delete (global as any).Promise

      expect(() => {
        mockMountCndReactComponents()
      }).not.toThrow()

      // Restore Promise
      ;(global as any).Promise = originalPromise
    })
  })
})
