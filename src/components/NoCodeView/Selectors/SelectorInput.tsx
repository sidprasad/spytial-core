import React from 'react';
import '../NoCodeView.css';

/** Event type that works for both input and textarea elements */
export type SelectorChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

interface SelectorInputProps {
    /** Current selector value */
    value: string;
    /** Name attribute for the input */
    name: string;
    /** Callback when value changes - accepts both input and textarea events */
    onChange: (event: SelectorChangeEvent) => void;
    /** Whether input is required */
    required?: boolean;
    /** Placeholder text */
    placeholder?: string;
    /** Additional CSS class */
    className?: string;
    /** Number of rows for the textarea (default: 1) */
    rows?: number;
}

/**
 * Highlights selector syntax with Alloy-esque coloring
 * 
 * NOTE: This function is kept for potential future use (e.g., tooltips, previews)
 * but is no longer used in the SelectorInput component. The overlay-based 
 * highlighting was removed due to scrolling and navigation issues in browsers.
 * 
 * Recognizes:
 * - Operators: ->, +, &, -, ~, *, ^, .
 * - Wildcards: _, univ, none, iden
 * - Parentheses and brackets
 * - Sig/atom names (capitalized identifiers)
 * - Field names (lowercase identifiers)
 * 
 * @param selector - The selector string to highlight
 * @returns HTML string with span elements for syntax highlighting
 */
export function highlightSelector(selector: string): string {
    if (!selector) return '';
    
    /**
     * Token pattern for selector syntax highlighting.
     * 
     * Pattern breakdown (order matters - more specific patterns first):
     * - \->       : Arrow operator (join)
     * - [+&\-~*^.]: Set operators (+, &, -), unary operators (~, *, ^), and dot
     * - [()[\]]   : Parentheses and brackets
     * - _\b       : Wildcard underscore (word boundary to avoid matching mid-identifier)
     * - univ\b    : Universal set keyword
     * - none\b    : Empty set keyword  
     * - iden\b    : Identity relation keyword
     * - [A-Z]...  : Capitalized identifiers (sigs/atoms like Node, Person)
     * - [a-z]...  : Lowercase identifiers (fields like edges, next)
     * - [0-9]+    : Numeric literals
     * - \s+       : Whitespace
     * - .         : Any other character (fallback)
     */
    const tokenPattern = /(\->|[+&\-~*^.]|[()[\]]|_\b|univ\b|none\b|iden\b|[A-Z][a-zA-Z0-9_]*|[a-z][a-zA-Z0-9_]*|[0-9]+|\s+|.)/g;
    
    // Use matchAll for safer iteration (returns iterator, no infinite loop risk)
    const tokens = Array.from(selector.matchAll(tokenPattern), m => m[0]);
    
    // Map each token to highlighted HTML
    const highlighted = tokens.map(token => {
        // First, escape HTML entities in the token
        const escaped = token
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Whitespace - no highlighting
        if (/^\s+$/.test(token)) {
            return escaped;
        }
        
        // Arrow and dot operators (join)
        if (token === '->' || token === '.') {
            return `<span class="selector-join">${escaped}</span>`;
        }
        
        // Set operators and unary operators
        if (/^[+&\-~*^]$/.test(token)) {
            return `<span class="selector-operator">${escaped}</span>`;
        }
        
        // Parentheses and brackets
        if (/^[()[\]]$/.test(token)) {
            return `<span class="selector-paren">${escaped}</span>`;
        }
        
        // Wildcards and special keywords
        if (/^(_|univ|none|iden)$/.test(token)) {
            return `<span class="selector-wildcard">${escaped}</span>`;
        }
        
        // Capitalized identifiers (sigs/atoms)
        if (/^[A-Z][a-zA-Z0-9_]*$/.test(token)) {
            return `<span class="selector-sig">${escaped}</span>`;
        }
        
        // Lowercase identifiers (fields)
        if (/^[a-z][a-zA-Z0-9_]*$/.test(token)) {
            return `<span class="selector-field">${escaped}</span>`;
        }
        
        // Numbers
        if (/^[0-9]+$/.test(token)) {
            return `<span class="selector-number">${escaped}</span>`;
        }
        
        // Default - just escape
        return escaped;
    });
    
    return highlighted.join('');
}

/**
 * SelectorInput component - resizable textarea for selector expressions
 * 
 * Provides a monospace textarea for entering selector expressions.
 * Uses a textarea instead of input for better handling of longer selectors:
 * - Visible scrollbar when content overflows
 * - Resizable (vertically) by the user
 * - Compact by default (1 row) but expandable
 * 
 * Prioritizes robustness over visual features:
 * - Standard text input behavior (scroll, arrow keys, selection all work correctly)
 * - Monospace font for readability
 * - Works reliably across all browsers
 * 
 * @example
 * ```tsx
 * <SelectorInput
 *   name="selector"
 *   value={selectorValue}
 *   onChange={handleChange}
 *   required
 *   rows={2}
 * />
 * ```
 */
export const SelectorInput: React.FC<SelectorInputProps> = ({
    value,
    name,
    onChange,
    required = false,
    placeholder,
    className = '',
    rows = 1
}) => {
    return (
        <textarea
            name={name}
            className={`form-control selector-input code-input ${className}`}
            value={value}
            onChange={onChange}
            required={required}
            placeholder={placeholder}
            rows={rows}
        />
    );
};
