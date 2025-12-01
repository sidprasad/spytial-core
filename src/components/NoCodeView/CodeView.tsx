import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ConstraintData, DirectiveData } from './interfaces';
import jsyaml from 'js-yaml';

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

interface CodeViewProps {
    constraints: ConstraintData[];
    directives: DirectiveData[];
    yamlValue: string;
    handleTextareaChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
}

const CodeView: React.FC<CodeViewProps> = (props: CodeViewProps) => {
    const [validationError, setValidationError] = useState<string | null>(null);

    // Validate YAML when value changes
    useEffect(() => {
        const error = validateYaml(props.yamlValue);
        setValidationError(error);
    }, [props.yamlValue]);

    // Apply basic YAML syntax highlighting to text
    const highlightedYaml = useMemo(() => {
        if (!props.yamlValue) return '';
        
        // Escape HTML entities first
        let highlighted = props.yamlValue
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // Highlight comments (lines starting with #)
        highlighted = highlighted.replace(/^(#.*)$/gm, '<span class="yaml-comment">$1</span>');
        
        // Highlight keys (word followed by colon)
        highlighted = highlighted.replace(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(:\s*)/gm, '$1<span class="yaml-key">$2</span>$3');
        
        // Highlight string values in quotes
        highlighted = highlighted.replace(/(["'])([^"']*)\1/g, '<span class="yaml-string">$1$2$1</span>');
        
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
            
            {/* YAML validation error display */}
            {validationError && (
                <div 
                    className="alert alert-warning py-2 mb-2" 
                    role="alert"
                    aria-live="polite"
                >
                    <small>
                        <strong>⚠️ </strong>
                        {validationError}
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
        
        {/* CSS for YAML syntax highlighting */}
        <style>{`
            .yaml-highlight-overlay .yaml-key {
                color: #0550ae;
                font-weight: 600;
            }
            .yaml-highlight-overlay .yaml-string {
                color: #0a3069;
            }
            .yaml-highlight-overlay .yaml-number {
                color: #0550ae;
            }
            .yaml-highlight-overlay .yaml-boolean {
                color: #cf222e;
                font-weight: 600;
            }
            .yaml-highlight-overlay .yaml-null {
                color: #cf222e;
                font-style: italic;
            }
            .yaml-highlight-overlay .yaml-comment {
                color: #6e7781;
                font-style: italic;
            }
            .yaml-highlight-overlay .yaml-list-item {
                color: #cf222e;
                font-weight: bold;
            }
            .yaml-editor-container textarea:focus {
                outline: 2px solid #0969da;
                outline-offset: -2px;
            }
            .yaml-editor-container textarea:focus + .yaml-highlight-overlay,
            .yaml-editor-container textarea:focus ~ .yaml-highlight-overlay {
                border-color: #0969da;
            }
        `}</style>
    </div>
  )
}

export { CodeView }