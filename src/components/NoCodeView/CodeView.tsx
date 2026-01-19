import React, { useState, useEffect, useCallback } from 'react'
import { ConstraintData, DirectiveData } from './interfaces';
import jsyaml from 'js-yaml';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { normalizeConstraintParams, normalizeDirectiveParams } from './paramDefaults';
import './NoCodeView.css';

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
            const normalizedParams = normalizeConstraintParams(c.type, c.params as Record<string, unknown>);
            // Use flow style for the entire constraint object to keep it on one line
            const constraintObj = { [yamlType]: normalizedParams };
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
            const normalizedParams = normalizeDirectiveParams(d.type, d.params as Record<string, unknown>);
            // HACK: Special case for flag directives
            if (d.type === "flag") {
                const flagValue = normalizedParams.flag as string || '';
                lines.push(`  - ${d.type}: ${flagValue}`);
            } else {
                const directiveObj = { [d.type]: normalizedParams };
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

/**
 * Simple code editor for CND layout specifications
 * 
 * A straightforward textarea-based editor without complex overlays.
 * Validates YAML on blur to avoid performance issues during typing.
 */
const CodeView: React.FC<CodeViewProps> = (props: CodeViewProps) => {
    const [validationError, setValidationError] = useState<string | null>(null);

    // Validate on blur instead of every keystroke for better performance
    const handleBlur = useCallback(() => {
        const result = validateSpytialSpec(props.yamlValue);
        setValidationError(result.error);
    }, [props.yamlValue]);

    // Also validate on initial mount
    useEffect(() => {
        const result = validateSpytialSpec(props.yamlValue);
        setValidationError(result.error);
    }, []); // Only on mount

    return (
        <div className="cnd-layout-interface__code-view" role="region" aria-label="YAML Code Editor">
            <div className="code-view-card">
                {/* Validation error display */}
                {validationError && (
                    <div 
                        className="alert alert-danger py-2 mb-2" 
                        role="alert"
                    >
                        <small>
                            <strong>❌ </strong>
                            {validationError}
                        </small>
                    </div>
                )}
                
                {/* Simple textarea editor */}
                <textarea
                    id="webcola-cnd"
                    className="form-control code-view-textarea"
                    value={props.yamlValue}
                    onChange={props.handleTextareaChange}
                    onBlur={handleBlur}
                    disabled={props.disabled}
                    rows={16}
                    spellCheck={false}
                    aria-label="CND Layout Specification YAML"
                    aria-invalid={validationError ? 'true' : 'false'}
                    placeholder=""
                />
            </div>
        </div>
    );
}

export { CodeView }
