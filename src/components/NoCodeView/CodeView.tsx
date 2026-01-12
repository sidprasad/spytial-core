import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ConstraintData, DirectiveData } from './interfaces';
import jsyaml from 'js-yaml';
import { parseLayoutSpec } from '../../layout/layoutspec';
import './NoCodeView.css';

const CODE_VIEW_HELP_TEXT =
    'Syntax highlighting updates as you type. Edits here sync with the Structured Builder.';
const CODE_VIEW_HELP_DISMISS_KEY = 'cnd-codeview-help-dismissed';

// TODO: Add unit tests for this function

/**
 * Converts constraint and directive data objects to YAML string
 * 
 * Generates a valid CND layout specification from structured data objects.
 * This function is the inverse of parseLayoutSpec and ensures round-trip
 * compatibility for the Structured Builder.
 * 
 * Following spytial-core guidelines:
 * - Tree-shakable named export
 * - Client-side optimized (no Node.js APIs)
 * - TypeScript strict typing
 * - Functional programming approach
 * 
 * @param constraints - Array of constraint data objects from Structured Builder
 * @param directives - Array of directive data objects from Structured Builder
 * @returns YAML string representation of the layout specification
 * 
 * @example
 * ```typescript
 * const constraints = [
 *   { type: 'orientation', directions: ['left'], selector: 'Node' }
 * ];
 * const directives = [
 *   { type: 'color', value: '#ff0000', selector: 'Node' }
 * ];
 * const yamlSpec = generateLayoutSpecYaml(constraints, directives);
 * ```
 * 
 * @public
 */
export function generateLayoutSpecYaml(
  constraints: ConstraintData[], 
  directives: DirectiveData[]
): string {

    // Helper function to determine YAML constraint type from structured data
    // TODO: Make this a map??
    function toYamlConstraintType(type: string): string {
        if (type === "cyclic") {
            return "cyclic";
        }
        if (type === "orientation") {
            return "orientation";
        }
        if (type === "align") {
            return "align";
        }
        if (type === "groupfield" || type === "groupselector") {
            return "group";
        }
        if (type === "size") {
            return "size";
        }
        if (type === "hideAtom") {
            return "hideAtom";
        }
        return "unknown";
    }

    // Build YAML string manually to support comments
    const lines: string[] = [];
    
    if (constraints.length > 0) {
        lines.push('constraints:');
        for (const c of constraints) {
            // Add comment as YAML comment if present
            if (c.comment) {
                lines.push(`  # ${c.comment}`);
            }
            const yamlType = toYamlConstraintType(c.type);
            // Use flow style for the entire constraint object to keep it on one line
            const constraintObj = { [yamlType]: c.params };
            const constraintYaml = jsyaml.dump([constraintObj], { flowLevel: 2 }).trim();
            // Remove the leading "- " since we'll add our own formatting
            lines.push('  ' + constraintYaml);
        }
    }

    if (directives.length > 0) {
        if (lines.length > 0) {
            lines.push(''); // blank line between sections
        }
        lines.push('directives:');
        for (const d of directives) {
            // Add comment as YAML comment if present
            if (d.comment) {
                lines.push(`  # ${d.comment}`);
            }
            // HACK: Special case for flag directives
            if (d.type === "flag") {
                const flagValue = d.params.flag as string || '';
                lines.push(`  - ${d.type}: ${flagValue}`);
            } else {
                const directiveObj = { [d.type]: d.params };
                const directiveYaml = jsyaml.dump([directiveObj], { flowLevel: 2 }).trim();
                lines.push('  ' + directiveYaml);
            }
        }
    }

    return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

/**
 * Validates YAML string and returns error message if invalid
 * 
 * @param yamlString - YAML string to validate
 * @returns Error message if invalid, null if valid
 */
export function validateYaml(yamlString: string): string | null {
    if (!yamlString || !yamlString.trim()) {
        return null; // Empty is valid
    }
    
    try {
        jsyaml.load(yamlString);
        return null;
    } catch (error) {
        if (error instanceof jsyaml.YAMLException) {
            const line = error.mark?.line !== undefined ? error.mark.line + 1 : undefined;
            const column = error.mark?.column !== undefined ? error.mark.column + 1 : undefined;
            const position = line && column ? ` (line ${line}, column ${column})` : '';
            return `YAML syntax error${position}: ${error.reason || error.message}`;
        }
        return `Invalid YAML: ${(error as Error).message}`;
    }
}

/**
 * Result of Spytial spec validation
 */
export interface SpytialValidationResult {
    /** Whether the spec is valid */
    isValid: boolean;
    /** Error message if spec has errors (will prevent parsing) */
    error: string | null;
    /** Warning messages for unrecognized elements (won't prevent parsing) */
    warnings: string[];
}

/**
 * Known constraint types in Spytial spec.
 * 
 * These types are derived from parseConstraints() in layoutspec.ts.
 * If new constraint types are added to the parser, update this list.
 * @see src/layout/layoutspec.ts#parseConstraints
 */
const KNOWN_CONSTRAINT_TYPES = ['orientation', 'cyclic', 'group', 'align', 'size', 'hideAtom'];

/**
 * Known directive types in Spytial spec.
 * 
 * These types are derived from parseDirectives() in layoutspec.ts.
 * If new directive types are added to the parser, update this list.
 * @see src/layout/layoutspec.ts#parseDirectives
 */
const KNOWN_DIRECTIVE_TYPES = [
    'atomColor', 'edgeColor', 'size', 'icon', 'projection', 
    'attribute', 'hideField', 'inferredEdge', 'hideAtom', 'flag'
];

/** Known top-level keys in Spytial spec */
const KNOWN_TOP_LEVEL_KEYS = ['constraints', 'directives'];

/**
 * Validates a Spytial spec YAML string and returns detailed validation results
 * 
 * This function performs lightweight validation of the Spytial specification:
 * 1. First validates YAML syntax
 * 2. Then validates the spec structure using parseLayoutSpec
 * 3. Also checks for unrecognized constraint/directive types
 * 
 * @param yamlString - YAML string to validate
 * @returns SpytialValidationResult with errors and warnings
 */
export function validateSpytialSpec(yamlString: string): SpytialValidationResult {
    const result: SpytialValidationResult = {
        isValid: true,
        error: null,
        warnings: []
    };

    if (!yamlString || !yamlString.trim()) {
        return result; // Empty is valid
    }

    // First check YAML syntax
    let parsed: any;
    try {
        parsed = jsyaml.load(yamlString);
    } catch (error) {
        if (error instanceof jsyaml.YAMLException) {
            const line = error.mark?.line !== undefined ? error.mark.line + 1 : undefined;
            const column = error.mark?.column !== undefined ? error.mark.column + 1 : undefined;
            const position = line && column ? ` (line ${line}, column ${column})` : '';
            result.isValid = false;
            result.error = `YAML syntax error${position}: ${error.reason || error.message}`;
        } else {
            result.isValid = false;
            result.error = `Invalid YAML: ${(error as Error).message}`;
        }
        return result;
    }

    // Check for unrecognized top-level keys
    if (parsed && typeof parsed === 'object') {
        const topLevelKeys = Object.keys(parsed);
        for (const key of topLevelKeys) {
            if (!KNOWN_TOP_LEVEL_KEYS.includes(key)) {
                result.warnings.push(`Unrecognized top-level key: "${key}". Expected: ${KNOWN_TOP_LEVEL_KEYS.join(', ')}`);
            }
        }

        // Check for unrecognized constraint types
        if (Array.isArray(parsed.constraints)) {
            for (let i = 0; i < parsed.constraints.length; i++) {
                const constraint = parsed.constraints[i];
                if (constraint && typeof constraint === 'object') {
                    const constraintType = Object.keys(constraint)[0];
                    if (constraintType && !KNOWN_CONSTRAINT_TYPES.includes(constraintType)) {
                        result.warnings.push(`Unrecognized constraint type at index ${i}: "${constraintType}". Known types: ${KNOWN_CONSTRAINT_TYPES.join(', ')}`);
                    }
                }
            }
        }

        // Check for unrecognized directive types
        if (Array.isArray(parsed.directives)) {
            for (let i = 0; i < parsed.directives.length; i++) {
                const directive = parsed.directives[i];
                if (directive && typeof directive === 'object') {
                    const directiveType = Object.keys(directive)[0];
                    if (directiveType && !KNOWN_DIRECTIVE_TYPES.includes(directiveType)) {
                        result.warnings.push(`Unrecognized directive type at index ${i}: "${directiveType}". Known types: ${KNOWN_DIRECTIVE_TYPES.join(', ')}`);
                    }
                }
            }
        }
    }

    // Now try to parse using the actual Spytial parser
    try {
        parseLayoutSpec(yamlString);
    } catch (error) {
        result.isValid = false;
        result.error = `Spytial spec error: ${(error as Error).message}`;
        return result;
    }

    return result;
}

interface CodeViewProps {
    constraints: ConstraintData[];
    directives: DirectiveData[];
    yamlValue: string;
    handleTextareaChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
}

const CodeView: React.FC<CodeViewProps> = (props: CodeViewProps) => {
    const [validationError, setValidationError] = useState<string | null>(null);
    const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
    const highlightRef = useRef<HTMLPreElement | null>(null);
    const helpWrapperRef = useRef<HTMLDivElement | null>(null);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isHelpDismissed, setIsHelpDismissed] = useState(false);

    // Validate YAML and Spytial spec when value changes
    useEffect(() => {
        const result = validateSpytialSpec(props.yamlValue);
        setValidationError(result.error);
        setValidationWarnings(result.warnings);
    }, [props.yamlValue]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const storedValue = window.localStorage.getItem(CODE_VIEW_HELP_DISMISS_KEY);
            setIsHelpDismissed(storedValue === 'true');
        } catch {
            setIsHelpDismissed(false);
        }
    }, []);

    useEffect(() => {
        if (!isHelpOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (!helpWrapperRef.current) return;
            if (!helpWrapperRef.current.contains(event.target as Node)) {
                setIsHelpOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isHelpOpen]);

    useEffect(() => {
        if (isHelpDismissed) {
            setIsHelpOpen(false);
        }
    }, [isHelpDismissed]);

    const dismissHelp = useCallback(() => {
        setIsHelpDismissed(true);
        setIsHelpOpen(false);
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(CODE_VIEW_HELP_DISMISS_KEY, 'true');
        } catch {
            // Ignore storage failures to avoid blocking UI.
        }
    }, []);

    // Apply basic YAML syntax highlighting to text
    const highlightedYaml = useMemo(() => {
        if (!props.yamlValue) return '';
        
        // Escape HTML entities first to prevent XSS
        // This must happen before any other string transformations
        let highlighted = props.yamlValue
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Highlight comments (lines starting with #)
        highlighted = highlighted.replace(/^(#.*)$/gm, '<span class="yaml-comment">$1</span>');
        
        // Highlight keys (word followed by colon)
        highlighted = highlighted.replace(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(:\s*)/gm, '$1<span class="yaml-key">$2</span>$3');
        
        // Highlight string values in escaped quotes
        highlighted = highlighted.replace(/(&quot;|&#39;)([^&]*)(\1)/g, '<span class="yaml-string">$1$2$3</span>');
        
        // Highlight numbers
        highlighted = highlighted.replace(/:\s+(-?\d+\.?\d*)\b/g, ': <span class="yaml-number">$1</span>');
        
        // Highlight boolean values
        highlighted = highlighted.replace(/:\s+(true|false)\b/gi, ': <span class="yaml-boolean">$1</span>');
        
        // Highlight null values
        highlighted = highlighted.replace(/:\s+(null|~)\b/gi, ': <span class="yaml-null">$1</span>');
        
        // Highlight list items (dash at start)
        highlighted = highlighted.replace(/^(\s*)(-)(\s)/gm, '$1<span class="yaml-list-item">$2</span>$3');
        
        return highlighted;
    }, [props.yamlValue]);

    // Sync scroll between textarea and highlighted overlay
    const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        if (highlightRef.current) {
            highlightRef.current.scrollTop = textarea.scrollTop;
            highlightRef.current.scrollLeft = textarea.scrollLeft;
        }
    }, []);

  return (
    <div className="cnd-layout-interface__code-view" role="region" aria-label="YAML Code Editor">
        <div className="code-view-card">
            {!isHelpDismissed && (
                <div className="code-view__header">
                    <div className="code-view__help" ref={helpWrapperRef}>
                        <button
                            type="button"
                            className="code-view__help-trigger"
                            onClick={() => setIsHelpOpen((prev) => !prev)}
                            aria-label="Code view help"
                            aria-expanded={isHelpOpen}
                            aria-controls="cnd-layout-yaml-help-popover"
                            title={CODE_VIEW_HELP_TEXT}
                        >
                            ?
                        </button>
                        {isHelpOpen && (
                            <div
                                id="cnd-layout-yaml-help-popover"
                                className="code-view__help-popover"
                                role="dialog"
                                aria-label="Code view help"
                            >
                                <p className="code-view__help-text">{CODE_VIEW_HELP_TEXT}</p>
                                <div className="code-view__help-actions">
                                    <button
                                        type="button"
                                        className="code-view__help-close"
                                        onClick={() => setIsHelpOpen(false)}
                                    >
                                        Close
                                    </button>
                                    <button
                                        type="button"
                                        className="code-view__help-dismiss"
                                        onClick={dismissHelp}
                                    >
                                        Don't show again
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {!isHelpDismissed && (
                <span id="cnd-layout-yaml-help" className="visually-hidden">
                    {CODE_VIEW_HELP_TEXT}
                </span>
            )}

            {/* Spytial spec validation error display */}
            {validationError && (
                <div 
                    className="alert alert-danger py-2 mb-2 code-view__notice" 
                    role="alert"
                    aria-live="polite"
                >
                    <small>
                        <strong>❌ </strong>
                        {validationError}
                    </small>
                </div>
            )}
            
            {/* Spytial spec validation warnings display */}
            {validationWarnings.length > 0 && (
                <div 
                    className="alert alert-warning py-2 mb-2 code-view__notice" 
                    role="alert"
                    aria-live="polite"
                >
                    <small>
                        <strong>⚠️ Warnings:</strong>
                        <ul className="mb-0 ps-3">
                            {validationWarnings.map((warning, index) => (
                                <li key={index}>{warning}</li>
                            ))}
                        </ul>
                    </small>
                </div>
            )}
            
            {/* Container for textarea with syntax highlighting overlay */}
            <div className="yaml-editor-container">
                <div className="yaml-editor">
                    <div className="yaml-editor-body">
                        {/* Syntax highlighted overlay (behind textarea) */}
                        <pre 
                            className="yaml-highlight-overlay"
                            aria-hidden="true"
                            ref={highlightRef}
                            dangerouslySetInnerHTML={{ __html: highlightedYaml || '&nbsp;' }}
                        />
                        
                        {/* Actual textarea (transparent, on top for editing) */}
                        <textarea
                            id="webcola-cnd"
                            className="form-control yaml-editor-textarea"
                            value={props.yamlValue}
                            onChange={props.handleTextareaChange}
                            onScroll={handleScroll}
                            disabled={props.disabled}
                            rows={12}
                            spellCheck={false}
                            aria-label="CND Layout Specification YAML"
                            aria-describedby={isHelpDismissed ? undefined : 'cnd-layout-yaml-help'}
                            aria-invalid={validationError ? 'true' : 'false'}
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
}

export { CodeView }
