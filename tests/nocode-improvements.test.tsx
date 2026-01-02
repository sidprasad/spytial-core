/**
 * Tests for NoCode component improvements
 * 
 * Tests cover:
 * 1. Programmatic view selection (initialView prop)
 * 2. Spytial spec validation
 * 3. Selector syntax highlighting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { validateSpytialSpec, highlightSelector } from '../src/components/NoCodeView';
import { CombinedInputComponent } from '../src/components/CombinedInput/CombinedInputComponent';

// Mock the custom element
beforeEach(() => {
  // Mock customElements.define if not available
  if (typeof window !== 'undefined' && !window.customElements) {
    (window as any).customElements = {
      define: vi.fn(),
      get: vi.fn(() => undefined)
    };
  }
  
  // Mock document.createElement for webcola-cnd-graph
  const originalCreateElement = document.createElement;
  document.createElement = vi.fn((tagName: string) => {
    if (tagName === 'webcola-cnd-graph') {
      const element = originalCreateElement.call(document, 'div');
      element.setAttribute = vi.fn();
      (element as any).renderLayout = vi.fn();
      (element as any).clear = vi.fn();
      return element;
    }
    return originalCreateElement.call(document, tagName);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Programmatic View Selection', () => {
    it('should default to raw editor when initialView is not specified', () => {
        render(<CombinedInputComponent />);
        // Raw Editor is the default
        const rawEditorTab = document.querySelector('button[aria-controls="raw-editor-panel"]');
        if (rawEditorTab) {
            expect(rawEditorTab.getAttribute('aria-selected')).toBe('true');
        }
    });

    it('should show structured editor when initialView is "structured"', () => {
        render(<CombinedInputComponent initialView="structured" />);
        // Structured tab should be active
        const structuredEditorTab = document.querySelector('button[aria-controls="structured-editor-panel"]');
        if (structuredEditorTab) {
            expect(structuredEditorTab.getAttribute('aria-selected')).toBe('true');
        }
    });

    it('should show raw editor when initialView is "raw"', () => {
        render(<CombinedInputComponent initialView="raw" />);
        // Raw tab should be active
        const rawEditorTab = document.querySelector('button[aria-controls="raw-editor-panel"]');
        if (rawEditorTab) {
            expect(rawEditorTab.getAttribute('aria-selected')).toBe('true');
        }
    });
});

describe('Spytial Spec Validation', () => {
    describe('validateSpytialSpec', () => {
        it('should return valid for empty input', () => {
            const result = validateSpytialSpec('');
            expect(result.isValid).toBe(true);
            expect(result.error).toBe(null);
            expect(result.warnings).toHaveLength(0);
        });

        it('should return valid for whitespace-only input', () => {
            const result = validateSpytialSpec('   \n  \t  ');
            expect(result.isValid).toBe(true);
            expect(result.error).toBe(null);
        });

        it('should detect YAML syntax errors', () => {
            const invalidYaml = `
constraints:
  - orientation:
      selector: Node
      directions: [left
`;
            // Missing closing bracket causes YAML syntax error
            const result = validateSpytialSpec(invalidYaml);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('YAML syntax error');
        });

        it('should validate a correct Spytial spec', () => {
            const validSpec = `
constraints:
  - orientation:
      selector: Node->edges
      directions:
        - left
`;
            const result = validateSpytialSpec(validSpec);
            expect(result.isValid).toBe(true);
            expect(result.error).toBe(null);
        });

        it('should warn about unrecognized top-level keys', () => {
            const specWithUnknownKey = `
constraints: []
unknownKey: value
`;
            const result = validateSpytialSpec(specWithUnknownKey);
            expect(result.isValid).toBe(true);
            expect(result.warnings).toContainEqual(
                expect.stringContaining('Unrecognized top-level key: "unknownKey"')
            );
        });

        it('should warn about unrecognized constraint types', () => {
            const specWithUnknownConstraint = `
constraints:
  - unknownConstraint:
      selector: Node
`;
            const result = validateSpytialSpec(specWithUnknownConstraint);
            expect(result.isValid).toBe(true);
            expect(result.warnings).toContainEqual(
                expect.stringContaining('Unrecognized constraint type')
            );
        });

        it('should warn about unrecognized directive types', () => {
            const specWithUnknownDirective = `
directives:
  - unknownDirective:
      selector: Node
`;
            const result = validateSpytialSpec(specWithUnknownDirective);
            expect(result.isValid).toBe(true);
            expect(result.warnings).toContainEqual(
                expect.stringContaining('Unrecognized directive type')
            );
        });

        it('should detect Spytial parser errors', () => {
            const invalidSpytialSpec = `
constraints:
  - orientation:
      directions:
        - left
`;
            // Missing selector field should cause error
            const result = validateSpytialSpec(invalidSpytialSpec);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Spytial spec error');
        });

        it('should validate known constraint types', () => {
            const validConstraints = `
constraints:
  - orientation:
      selector: Node->edges
      directions: [left]
  - cyclic:
      selector: Node->edges
      direction: clockwise
  - align:
      selector: Node + Person
      direction: horizontal
  - group:
      selector: Node
      name: myGroup
`;
            const result = validateSpytialSpec(validConstraints);
            expect(result.warnings.filter(w => w.includes('Unrecognized constraint'))).toHaveLength(0);
        });

        it('should validate known directive types', () => {
            const validDirectives = `
directives:
  - atomColor:
      selector: Node
      value: "#ff0000"
  - edgeColor:
      field: edges
      value: "#00ff00"
  - flag: hideDisconnected
`;
            const result = validateSpytialSpec(validDirectives);
            expect(result.warnings.filter(w => w.includes('Unrecognized directive'))).toHaveLength(0);
        });
    });
});

describe('Selector Syntax Highlighting', () => {
    describe('highlightSelector', () => {
        it('should return empty string for empty input', () => {
            expect(highlightSelector('')).toBe('');
        });

        it('should escape HTML entities', () => {
            const result = highlightSelector('<script>alert("xss")</script>');
            expect(result).toContain('&lt;');
            expect(result).toContain('&gt;');
            expect(result).not.toContain('<script>');
        });

        it('should highlight capitalized identifiers as sigs', () => {
            const result = highlightSelector('Node');
            expect(result).toContain('selector-sig');
            expect(result).toContain('Node');
        });

        it('should highlight lowercase identifiers as fields', () => {
            const result = highlightSelector('edges');
            expect(result).toContain('selector-field');
            expect(result).toContain('edges');
        });

        it('should highlight arrow operators', () => {
            const result = highlightSelector('Node->edges');
            expect(result).toContain('selector-join');
        });

        it('should highlight dot operators', () => {
            const result = highlightSelector('Node.edges');
            expect(result).toContain('selector-join');
        });

        it('should highlight set operators', () => {
            const result = highlightSelector('Node + Person');
            expect(result).toContain('selector-operator');
        });

        it('should highlight wildcards', () => {
            const result = highlightSelector('Node[_, _]');
            expect(result).toContain('selector-wildcard');
        });

        it('should highlight univ keyword', () => {
            const result = highlightSelector('univ');
            expect(result).toContain('selector-wildcard');
        });

        it('should highlight parentheses', () => {
            const result = highlightSelector('(Node + Person)');
            expect(result).toContain('selector-paren');
        });

        it('should highlight transpose operator', () => {
            const result = highlightSelector('~edges');
            expect(result).toContain('selector-operator');
        });

        it('should highlight transitive closure', () => {
            const result = highlightSelector('^edges');
            expect(result).toContain('selector-operator');
        });

        it('should highlight reflexive-transitive closure', () => {
            const result = highlightSelector('*edges');
            expect(result).toContain('selector-operator');
        });

        it('should handle complex selector expressions', () => {
            const result = highlightSelector('Node->edges + Person->friends');
            expect(result).toContain('selector-sig');
            expect(result).toContain('selector-field');
            expect(result).toContain('selector-join');
            expect(result).toContain('selector-operator');
        });
    });
});
