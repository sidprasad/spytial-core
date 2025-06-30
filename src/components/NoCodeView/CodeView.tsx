import React, { useEffect } from 'react'
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
 * Following cnd-core guidelines:
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
        if (type === "groupfield" || type === "groupselector") {
            return "group";
        }
        return "unknown";
    }

    // Convert constraint type to YAML constraint type
    const yamlConstraints = constraints.forEach(c => {
        return {
            [toYamlConstraintType(c.type)]: c.params
        }
    });

    // Convert directive type to YAML directive type
    const yamlDirectives = directives.forEach(d => {
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

interface CodeViewProps {
    constraints: ConstraintData[];
    directives: DirectiveData[];
    yamlValue: string;
    handleTextareaChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
}

const CodeView: React.FC<CodeViewProps> = (props: CodeViewProps) => {
    // Populate the textarea on initial render if constraints/directives exist
    // useEffect(() => {
    //     if (props.constraints.length > 0 || props.directives.length > 0) {
    //         const generatedYaml = generateLayoutSpecYaml(props.constraints, props.directives);
    //         if (generatedYaml !== props.yamlValue) {
    //             props.handleTextareaChange({
    //                 target: { value: generatedYaml }
    //             } as React.ChangeEvent<HTMLTextAreaElement>);
    //         }
    //     }
    // }, []);

  return (
    <div className="cnd-layout-interface__code-view" role="region" aria-label="YAML Code Editor">
        <div className="mb-2">
            <textarea
            id="webcola-cnd"
            className="form-control cnd-layout-interface__textarea"
            value={props.yamlValue}
            onChange={props.handleTextareaChange}
            disabled={props.disabled}
            rows={12}
            spellCheck={false}
            aria-label="CND Layout Specification YAML"
            aria-describedby="cnd-layout-yaml-help"
            style={{ minHeight: '400px', resize: 'vertical' }}
            />
        </div>
        <div id="cnd-layout-yaml-help" className="form-text text-muted fst-italic">
            Enter your CND layout specification in YAML format. 
            Use the toggle above to switch to the visual editor.
        </div>
    </div>
  )
}

export { CodeView }