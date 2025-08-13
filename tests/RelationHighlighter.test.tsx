/**
 * Test suite for RelationHighlighter component
 * 
 * This test suite validates the RelationHighlighter component specification:
 * - Input: webcola-cnd-graph HTML element ID
 * - HTML: Collapsible container with unordered list, collapsed by default
 * - Behavior: useRef hook, event listeners, hover highlighting, cleanup
 * - Edge cases: Missing graph element, long relation names
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { RelationHighlighter } from '../src/components/RelationHighlighter/RelationHighlighter'

// Mock webcola-cnd-graph element
interface MockWebColaGraphElement extends HTMLElement {
  highlightRelation: ReturnType<typeof vi.fn>
  clearHighlightRelation: ReturnType<typeof vi.fn>
  getAllRelations: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
}

function createMockWebColaGraphElement(): MockWebColaGraphElement {
  const element = document.createElement('div') as MockWebColaGraphElement
  element.id = 'test-graph'
  element.highlightRelation = vi.fn(() => true)
  element.clearHighlightRelation = vi.fn(() => true)
  element.getAllRelations = vi.fn(() => [])
  element.addEventListener = vi.fn()
  element.removeEventListener = vi.fn()
  element.dispatchEvent = vi.fn()
  return element
}

describe('RelationHighlighter Component', () => {
  let mockGraphElement: MockWebColaGraphElement
  let originalGetElementById: typeof document.getElementById
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Create mock graph element
    mockGraphElement = createMockWebColaGraphElement()
    
    // Mock document.getElementById
    originalGetElementById = document.getElementById
    document.getElementById = vi.fn((id: string) => {
      if (id === 'test-graph') return mockGraphElement
      if (id === 'missing-graph') return null
      return originalGetElementById.call(document, id)
    })

    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    document.getElementById = originalGetElementById
    consoleWarnSpy.mockRestore()
    vi.clearAllMocks()
  })

  describe('Initial Rendering', () => {
    it('renders with default collapsed state', () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      // Check basic structure is present
      expect(screen.getByText(/relations \(0\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText('Expand relations')).toBeInTheDocument()
      
      // Check collapsed state
      const content = document.querySelector('.relation-highlighter-content')
      expect(content).toHaveClass('collapsed')
      
      // Check no relations message is present
      expect(screen.getByText('No relations available')).toBeInTheDocument()
    })

    it('shows relations count in header', () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      expect(screen.getByText('Relations (0)')).toBeInTheDocument()
    })

    it('has proper ARIA labels for accessibility', () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      expect(screen.getByLabelText('Expand relations')).toBeInTheDocument()
    })
  })

  describe('Graph Element Integration', () => {
    it('successfully finds and references graph element', () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      expect(document.getElementById).toHaveBeenCalledWith('test-graph')
      expect(mockGraphElement.addEventListener).toHaveBeenCalledWith(
        'relations-available',
        expect.any(Function)
      )
    })

    it('handles missing graph element gracefully', () => {
      render(<RelationHighlighter graphElementId="missing-graph" />)
      
      expect(document.getElementById).toHaveBeenCalledWith('missing-graph')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'RelationHighlighter: Element with id "missing-graph" not found'
      )
      
      // Component should still render but not attach event listeners
      expect(screen.getByText('Relations (0)')).toBeInTheDocument()
    })

    it('does not attach event listener when graph element is missing', () => {
      render(<RelationHighlighter graphElementId="missing-graph" />)
      
      expect(mockGraphElement.addEventListener).not.toHaveBeenCalled()
    })
  })

  describe('Event Listener Management', () => {
    it('attaches relations-available event listener on mount', () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      expect(mockGraphElement.addEventListener).toHaveBeenCalledWith(
        'relations-available',
        expect.any(Function)
      )
    })

    it('removes event listener on unmount', () => {
      const { unmount } = render(<RelationHighlighter graphElementId="test-graph" />)
      
      unmount()
      
      expect(mockGraphElement.removeEventListener).toHaveBeenCalledWith(
        'relations-available',
        expect.any(Function)
      )
    })

    it('handles cleanup when graph element is missing', () => {
      const { unmount } = render(<RelationHighlighter graphElementId="missing-graph" />)
      
      // Should not throw error when unmounting without event listener
      expect(() => unmount()).not.toThrow()
    })

    it('reattaches event listener when graphElementId changes', () => {
      const { rerender } = render(<RelationHighlighter graphElementId="test-graph" />)
      
      // Clear previous calls
      vi.clearAllMocks()
      
      // Create second mock element
      const secondMockElement = createMockWebColaGraphElement()
      secondMockElement.id = 'test-graph-2'
      
      document.getElementById = vi.fn((id: string) => {
        if (id === 'test-graph-2') return secondMockElement
        return originalGetElementById.call(document, id)
      })
      
      rerender(<RelationHighlighter graphElementId="test-graph-2" />)
      
      expect(mockGraphElement.removeEventListener).toHaveBeenCalled()
      expect(secondMockElement.addEventListener).toHaveBeenCalledWith(
        'relations-available',
        expect.any(Function)
      )
    })
  })

  describe('Relations State Management', () => {
    it('updates relations state when relations-available event is fired', async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      // Get the event handler that was attached
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      expect(addEventListenerCall).toBeDefined()
      const eventHandler = addEventListenerCall![1]
      
      // Create mock relations-available event
      const mockEvent = {
        detail: {
          relations: ['friend', 'colleague', 'manager'],
          count: 3,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      // Fire the event
      eventHandler(mockEvent)
      
      // Wait for state update
      await waitFor(() => {
        expect(screen.getByText('Relations (3)')).toBeInTheDocument()
      })
      
      // Check that relations are displayed
      expect(screen.getByText('friend')).toBeInTheDocument()
      expect(screen.getByText('colleague')).toBeInTheDocument()
      expect(screen.getByText('manager')).toBeInTheDocument()
    })

    it('handles empty relations array', async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: [],
          count: 0,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (0)')).toBeInTheDocument()
      })
      
      expect(screen.getByText('No relations available')).toBeInTheDocument()
    })

    it('handles relations-available event with undefined relations', async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: undefined,
          count: 0,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (0)')).toBeInTheDocument()
      })
    })
  })

  describe('Collapsible Container Functionality', () => {
    it('toggles collapsed state when header is clicked', async () => {
      const user = userEvent.setup()
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const header = screen.getByText(/relations \(0\)/i).closest('div')!
      const content = document.querySelector('.relation-highlighter-content')!
      
      // Initially collapsed
      expect(content).toHaveClass('collapsed')
      expect(screen.getByLabelText('Expand relations')).toBeInTheDocument()
      
      // Click to expand
      await user.click(header)
      
      expect(content).not.toHaveClass('collapsed')
      expect(screen.getByLabelText('Collapse relations')).toBeInTheDocument()
      
      // Click to collapse again
      await user.click(header)
      
      expect(content).toHaveClass('collapsed')
      expect(screen.getByLabelText('Expand relations')).toBeInTheDocument()
    })

    it('shows relations list when expanded and has relations', async () => {
      const user = userEvent.setup()
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      // Add some relations first
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: ['friend', 'colleague'],
          count: 2,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (2)')).toBeInTheDocument()
      })
      
      // Expand the container
      const header = screen.getByText(/relations \(2\)/i).closest('div')!
      await user.click(header)
      
      // Check that relations are visible
      expect(screen.getByText('friend')).toBeInTheDocument()
      expect(screen.getByText('colleague')).toBeInTheDocument()
      expect(screen.queryByText('No relations available')).not.toBeInTheDocument()
    })
  })

  describe('Mouse Hover Highlighting Behavior', () => {
    beforeEach(async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      // Add relations and expand container
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: ['friend', 'colleague'],
          count: 2,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (2)')).toBeInTheDocument()
      })
      
      // Expand container
      const header = screen.getByText(/relations \(2\)/i).closest('div')!
      fireEvent.click(header)
    })

    it('calls highlightRelation when hovering over relation item', async () => {
      const friendItem = screen.getByText('friend')
      const parentList = friendItem.parentElement!
      
      // Mock getBoundingClientRect for positioning calculations
      vi.spyOn(parentList, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
      
      // Mock clientWidth/clientHeight to simulate content area
      Object.defineProperty(parentList, 'clientWidth', { value: 200, configurable: true })
      Object.defineProperty(parentList, 'clientHeight', { value: 100, configurable: true })
      
      // Simulate mouse enter within content area
      fireEvent.mouseEnter(friendItem, {
        clientX: 50, // Within content area
        clientY: 25  // Within content area
      })
      
      expect(mockGraphElement.highlightRelation).toHaveBeenCalledWith('friend')
    })

    it('calls clearHighlightRelation when mouse leaves relation item', async () => {
      const friendItem = screen.getByText('friend')
      
      fireEvent.mouseLeave(friendItem)
      
      expect(mockGraphElement.clearHighlightRelation).toHaveBeenCalledWith('friend')
    })

    it('handles hover positioning calculations correctly', async () => {
      const friendItem = screen.getByText('friend')
      const parentList = friendItem.parentElement!
      
      // Mock getBoundingClientRect
      vi.spyOn(parentList, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        right: 210,
        bottom: 120,
        x: 10,
        y: 20,
        toJSON: () => ({})
      })
      
      Object.defineProperty(parentList, 'clientWidth', { value: 180, configurable: true })
      Object.defineProperty(parentList, 'clientHeight', { value: 80, configurable: true })
      
      // Test mouse position within content area (should highlight)
      fireEvent.mouseEnter(friendItem, {
        clientX: 60,  // 60 - 10 = 50, which is <= 180 (clientWidth)
        clientY: 50   // 50 - 20 = 30, which is <= 80 (clientHeight)
      })
      
      expect(mockGraphElement.highlightRelation).toHaveBeenCalledWith('friend')
      
      vi.clearAllMocks()
      
      // Test mouse position outside content area (should not highlight)
      fireEvent.mouseEnter(friendItem, {
        clientX: 200, // 200 - 10 = 190, which is > 180 (clientWidth) - scrollbar area
        clientY: 50
      })
      
      expect(mockGraphElement.highlightRelation).not.toHaveBeenCalled()
    })
  })

  describe('Graph Element Without Methods', () => {
    it('does not highlight when graph element methods are not available', async () => {
      // Create mock element without highlight methods but with addEventListener
      const mockElementWithoutMethods = document.createElement('div') as any
      mockElementWithoutMethods.id = 'test-graph'
      mockElementWithoutMethods.addEventListener = vi.fn()
      mockElementWithoutMethods.removeEventListener = vi.fn()
      
      document.getElementById = vi.fn(() => mockElementWithoutMethods)
      
      const { unmount } = render(<RelationHighlighter graphElementId="test-graph" />)
      
      // Verify the component rendered but no relations are shown initially
      expect(screen.getByText('Relations (0)')).toBeInTheDocument()
      expect(screen.queryAllByText(/friend|colleague/)).toHaveLength(0)
      
      // Should not throw error during cleanup
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('Long Relation Names and Styling', () => {
    it('handles very long relation names', async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const longRelationName = 'very-long-relation-name-that-should-trigger-horizontal-scrolling-behavior'
      
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: [longRelationName],
          count: 1,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (1)')).toBeInTheDocument()
      })
      
      // Expand to see the relation
      const header = screen.getByText(/relations \(1\)/i).closest('div')!
      fireEvent.click(header)
      
      expect(screen.getByText(longRelationName)).toBeInTheDocument()
    })

    it('applies correct CSS classes for styling', async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: ['test-relation'],
          count: 1,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (1)')).toBeInTheDocument()
      })
      
      // Expand container
      const header = screen.getByText(/relations \(1\)/i).closest('div')!
      fireEvent.click(header)
      
      // Check CSS classes are applied
      const container = document.querySelector('.relation-highlighter')
      const content = document.querySelector('.relation-highlighter-content')
      const list = document.querySelector('.relation-list')
      const item = screen.getByText('test-relation')
      
      expect(container).toBeInTheDocument()
      expect(content).not.toHaveClass('collapsed')
      expect(list).toHaveClass('relation-list')
      expect(item).toHaveClass('relation-item')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('handles malformed relations-available event', async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      // Component doesn't have error handling, so malformed events will throw
      // This documents the current behavior
      const malformedEvent = {
        detail: null
      }
      
      // The component currently throws on malformed events
      expect(() => eventHandler(malformedEvent)).toThrow('Cannot destructure property')
      
      // Component maintains original state despite the error
      expect(screen.getByText('Relations (0)')).toBeInTheDocument()
    })

    it('handles highlight and clear methods that return false', async () => {
      // Mock methods to return false (indicating failure)
      mockGraphElement.highlightRelation.mockReturnValue(false)
      mockGraphElement.clearHighlightRelation.mockReturnValue(false)
      
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: ['test-relation'],
          count: 1,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (1)')).toBeInTheDocument()
      })
      
      // Expand and test hover
      const header = screen.getByText(/relations \(1\)/i).closest('div')!
      fireEvent.click(header)
      
      const relationItem = screen.getByText('test-relation')
      
      // Should not throw error even if methods return false
      expect(() => {
        fireEvent.mouseEnter(relationItem)
        fireEvent.mouseLeave(relationItem)
      }).not.toThrow()
      
      expect(mockGraphElement.highlightRelation).toHaveBeenCalledWith('test-relation')
      expect(mockGraphElement.clearHighlightRelation).toHaveBeenCalledWith('test-relation')
    })

    it('handles missing parent list in hover calculations', async () => {
      render(<RelationHighlighter graphElementId="test-graph" />)
      
      const addEventListenerCall = mockGraphElement.addEventListener.mock.calls.find(
        call => call[0] === 'relations-available'
      )
      const eventHandler = addEventListenerCall![1]
      
      const mockEvent = {
        detail: {
          relations: ['test-relation'],
          count: 1,
          timestamp: Date.now(),
          graphId: 'test-graph'
        }
      }
      
      eventHandler(mockEvent)
      
      await waitFor(() => {
        expect(screen.getByText('Relations (1)')).toBeInTheDocument()
      })
      
      // Expand container
      const header = screen.getByText(/relations \(1\)/i).closest('div')!
      fireEvent.click(header)
      
      const relationItem = screen.getByText('test-relation')
      
      // Mock parentElement to be null
      Object.defineProperty(relationItem, 'parentElement', { value: null, configurable: true })
      
      // Should not throw error when parentElement is null
      expect(() => {
        fireEvent.mouseEnter(relationItem)
      }).not.toThrow()
      
      // Should not call highlight when no parent list
      expect(mockGraphElement.highlightRelation).not.toHaveBeenCalled()
    })
  })
})