import '@testing-library/jest-dom'

/** THIS MAY BE A BREAKING CHANGE */

/**
 * Vitest setup file for CnD Core testing
 * 
 * This setup file conditionally applies React Testing Library configuration
 * only when testing React components, ensuring zero impact on existing tests.
 */

import { afterEach, beforeEach } from 'vitest'

// Global setup that applies to all tests
if (typeof window !== 'undefined') {
  // Import and extend jest-dom matchers for DOM testing
  import('@testing-library/jest-dom/matchers').then((matchers) => {
    // @ts-ignore - expect is available globally in Vitest
    expect.extend(matchers.default)
  }).catch(() => {
    // Silently fail if jest-dom is not available (for non-React tests)
  })
  
  // Import React Testing Library cleanup for React tests
  import('@testing-library/react').then(({ cleanup }) => {
    // Clean up after each test that might use React Testing Library
    afterEach(() => {
      try {
        cleanup()
      } catch {
        // Silently fail if no React components were rendered
      }
    })
  }).catch(() => {
    // Silently fail if React Testing Library is not available
  })
  
  // Clear any global state before each test
  beforeEach(() => {
    // Clear localStorage, sessionStorage for all tests
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear()
    }
    
    // Clear any global window properties set by CnD components
    delete (window as any).CnDCore
    delete (window as any).CnDReactState
    delete (window as any).updateFromCnDSpec
    delete (window as any).updateFromBuilder
    delete (window as any).autoRenderGraph
    delete (window as any).showParseError
    delete (window as any).showConstraintError
    delete (window as any).clearAllErrors
  })
}

// Global test utilities that can be used by any test
export const createMockEvent = (type: string, data: any = {}) => {
  return new CustomEvent(type, { detail: data })
}

export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0))

// Console logging helpers for debugging tests
export const suppressConsoleWarnings = () => {
  const originalWarn = console.warn
  console.warn = () => {}
  return () => { console.warn = originalWarn }
}

export const suppressConsoleErrors = () => {
  const originalError = console.error
  console.error = () => {}
  return () => { console.error = originalError }
}
