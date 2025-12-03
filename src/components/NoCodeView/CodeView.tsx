import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ConstraintData, DirectiveData } from './interfaces';
import jsyaml from 'js-yaml';
import { parseLayoutSpec } from '../../layout/layoutspec';
import './NoCodeView.css';

// TODO: Add unit tests for this function

/**
 * Converts constraint and directive data objects to YAML string
 * 
 * Generates a valid CND layout specification from structured data objects.
 * This function is the inverse of parseLayoutSpec and ensures round-trip
 * compatibility for the No Code View.
 * 
 * Following spytial-core guidelines:
 * - Tree-shakable named export
 * - Client-side optimized (no Node.js APIs)
 * - TypeScript strict typing
 * - Functional programming approach
 * 
 * @param constraints - Array of constraint data objects from No Code View
 * @param directives - Array of directive data objects from No Code View
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

    // Convert constraint type to YAML constraint type
    const yamlConstraints = constraints.map(c => {
        return {
            [toYamlConstraintType(c.type)]: c.params
        }
    });

    // Convert directive type to YAML directive type
    const yamlDirectives = directives.map(d => {
        // HACK: Special case for flag directives
        if (d.type === "flag") {
            return {
                [d.type]: d.params.flag as string
            }
        }
        return {
            [d.type]: d.params
        }
    });

    // Combine constraints and directives into a single YAML object
    let combinedSpec: any = {};
    if (constraints.length > 0) {
        combinedSpec.constraints = yamlConstraints;
    }
    if (directives.length > 0) {
        combinedSpec.directives = yamlDirectives;
    }

    // Convert combined spec object to YAML string
    let yamlStr = "";

    if (Object.keys(combinedSpec).length > 0) {
        yamlStr = jsyaml.dump(combinedSpec);
    }

    return yamlStr;
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

    // Validate YAML and Spytial spec when value changes
    useEffect(() => {
        const result = validateSpytialSpec(props.yamlValue);
        setValidationError(result.error);
        setValidationWarnings(result.warnings);
    }, [props.yamlValue]);

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
        const pre = textarea.parentElement?.querySelector('.yaml-highlight-overlay') as HTMLElement;
        if (pre) {
            pre.scrollTop = textarea.scrollTop;
            pre.scrollLeft = textarea.scrollLeft;
        }
    }, []);

  return (
    <div className="cnd-layout-interface__code-view" role="region" aria-label="YAML Code Editor">
        <div className="mb-2">
            <div id="cnd-layout-yaml-help" className="form-text text-muted fst-italic pb-3">
                Enter your CND layout specification in YAML format. 
                Use the toggle above to switch to the visual editor.
            </div>
            
            {/* Spytial spec validation error display */}
            {validationError && (
                <div 
                    className="alert alert-danger py-2 mb-2" 
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
                    className="alert alert-warning py-2 mb-2" 
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
            <div className="yaml-editor-container" style={{ position: 'relative' }}>
                {/* Syntax highlighted overlay (behind textarea) */}
                <pre 
                    className="yaml-highlight-overlay form-control cnd-layout-interface__textarea"
                    aria-hidden="true"
                    style={{ 
                        minHeight: '400px', 
                        resize: 'none',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        margin: 0,
                        padding: '0.375rem 0.75rem',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #ced4da',
                        borderRadius: '0.25rem',
                        pointerEvents: 'none',
                        zIndex: 0,
                    }}
                    dangerouslySetInnerHTML={{ __html: highlightedYaml || '&nbsp;' }}
                />
                
                {/* Actual textarea (transparent, on top for editing) */}
                <textarea
                    id="webcola-cnd"
                    className="form-control cnd-layout-interface__textarea"
                    value={props.yamlValue}
                    onChange={props.handleTextareaChange}
                    onScroll={handleScroll}
                    disabled={props.disabled}
                    rows={12}
                    spellCheck={false}
                    aria-label="CND Layout Specification YAML"
                    aria-describedby="cnd-layout-yaml-help"
                    aria-invalid={validationError ? 'true' : 'false'}
                    style={{ 
                        minHeight: '400px', 
                        resize: 'vertical',
                        position: 'relative',
                        zIndex: 1,
                        backgroundColor: 'transparent',
                        color: 'transparent',
                        caretColor: '#212529',
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                    }}
                />
            </div>
        </div>
    </div>
  )
}

export { CodeView }