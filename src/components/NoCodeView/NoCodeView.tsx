import React, { useCallback, useEffect } from "react";
import { ConstraintCard } from "./ConstraintCard";
import { DirectiveCard } from "./DirectiveCard";
import { ConstraintData, DirectiveData } from "./interfaces";
import jsyaml from "js-yaml";

import "./NoCodeView.css";

// Utility function to generate unique IDs for constraints
export function generateId(): string {
    // Check if Web Crypto API is available (modern browsers)
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        // Use native crypto.randomUUID() for maximum uniqueness
        return window.crypto.randomUUID();
    }

    console.error("Web Crypto API not available, falling back to Math.random for ID generation");
    
    // Final fallback for older environments
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const extraRandom = Math.random().toString(36).substring(2, 15);

    return `${timestamp}-${randomPart}-${extraRandom}`;
};

// TODO: Add unit tests for this function
// Specifically for the Flag Selector

/**
 * Converts YAML string to structured constraint and directive data objects
 * 
 * Parses a CND layout specification YAML and extracts constraint and directive
 * data suitable for the No Code View interface. This function complements
 * parseLayoutSpec by providing data in a format optimized for visual editing.
 * 
 * Following cnd-core guidelines:
 * - Error handling with structured error messages
 * - Client-side performance optimized
 * - Comprehensive type safety
 * - Tree-shakable export
 * 
 * @param yamlString - YAML string containing CND layout specification
 * @returns Object containing structured constraint and directive arrays
 * @throws {Error} When YAML is invalid or contains unsupported constraint types
 * 
 * @example
 * ```typescript
 * const yamlSpec = `
 * constraints:
 *   - orientation: { directions: [left], selector: Node }
 * directives:
 *   - color: { value: '#ff0000', selector: Node }
 * `;
 * const { constraints, directives } = parseLayoutSpecToData(yamlSpec);
 * ```
 * 
 * @public
 */
export function parseLayoutSpecToData(yamlString: string): {
  constraints: ConstraintData[];
  directives: DirectiveData[];
} {
    let constraints: ConstraintData[] = [];
    let directives: DirectiveData[] = [];

    const parsedYaml = jsyaml.load(yamlString) as any;

    const yamlConstraints = parsedYaml?.constraints;
    const yamlDirectives = parsedYaml?.directives;

    // Helper function to determine constraint type from YAML object
    // TODO: Make this a map??
    function get_constraint_type_from_yaml(constraint: any): string {
        const type = Object.keys(constraint)[0]; // Get the constraint type
        const params = constraint[type]; // Get the parameters for the constraint

        if (type === "cyclic" || type === "orientation") {
            return type;
        }
        if (type === "group") {
            if (params["selector"]) {
                return "groupselector";
            }
            if (params["field"]) {
                return "groupfield";
            }
        }
        return "unknown";
    }

    // Convert YAML constraints to structured data
    if (yamlConstraints) {
        if (!Array.isArray(yamlConstraints)) {
            throw new Error("Invalid YAML: 'constraints' should be an array");
        }

        constraints = yamlConstraints.map(constraint => {
            const type = get_constraint_type_from_yaml(constraint);
            if (type === "unknown") {
                throw new Error(`Unsupported constraint type in YAML: ${JSON.stringify(constraint)}`);
            }
            const params = constraint[Object.keys(constraint)[0]];

            // Return structured constraint data
            return {
                id: generateId(),
                type,
                params
            } as ConstraintData;
        })
    }

    // Convert YAML directives to structured data
    if (yamlDirectives) {
        if (!Array.isArray(yamlDirectives)) {
            throw new Error("Invalid YAML: 'directives' should be an array");
        }

        directives = yamlDirectives.map(directive => {
            const type = Object.keys(directive)[0]; // Get the directive type
            let params = directive[type]; // Get the parameters for the directive

            // HACK: This means that it's flag selector
            if (typeof params === "string") {
                params = { [type]: params};
            }

            // Return structured directive data
            return {
                id: generateId(),
                type,
                params
            } as DirectiveData;
        })
    }

    return {
        constraints,
        directives
    };
}

interface NoCodeViewProps {
    /** YAML string of CnD layout spec */
    yamlValue?: string;
    /** Constraints */
    constraints: ConstraintData[];
    /** Callback to set constraints */
    setConstraints: (updater: (prev: ConstraintData[]) => ConstraintData[]) => void;
    /** Directives */
    directives: DirectiveData[];
    /** Callback to set directives */
    setDirectives: (updater: (prev: DirectiveData[]) => DirectiveData[]) => void;
}

const NoCodeView = ({
    yamlValue,
    constraints,
    setConstraints,
    directives,
    setDirectives,
}: NoCodeViewProps) => {

    const addConstraint = () => {
        const newConstraint: ConstraintData = {
            id: generateId(),
            type: "orientation",
            params: {},
        };
        setConstraints((prev) => [...prev, newConstraint]);
    }

    /**
     * Update constraint data with immutable merge
     * 
     * @param constraintId - ID of constraint to update
     * @param updates - Partial constraint data to merge
     */
    const updateConstraint = useCallback((
        constraintId: string, 
        updates: Partial<Omit<ConstraintData, 'id'>>
    ) => {
        setConstraints((prevConstraints: ConstraintData[]) => prevConstraints.map((constraint: ConstraintData) => {
            if (constraint.id === constraintId) {
                return {
                    ...constraint,
                    ...updates,
                    params: {
                        ...constraint.params,
                        ...updates.params
                    }
                };
            }
            return constraint;
        }));
    }, [setConstraints]);

    const addDirective = () => {
        const newDirective: DirectiveData = {
            id: generateId(),
            type: "flag",
            params: {},
        };
        setDirectives((prev) => [...prev, newDirective]);
    }

    /**
     * Update directive data with immutable merge
     * 
     * @param directiveId - ID of directive to update
     * @param updates - Partial directive data to merge
     */
    const updateDirective = useCallback((
        directiveId: string, 
        updates: Partial<Omit<DirectiveData, 'id'>>
    ) => {
        setDirectives((prevDirectives: DirectiveData[]) => prevDirectives.map((directive: DirectiveData) =>
            directive.id === directiveId 
            ? {
                ...directive,
                ...updates,
                params: {
                    ...directive.params,
                    ...updates.params
                }
            }
            : directive
        ));
    }, [setDirectives]);

    /**
     * Loads constraint and directive state from YAML specification
     * 
     * Parses a YAML string and updates the No Code View's internal state to reflect
     * the constraints and directives defined in the specification. This enables
     * bidirectional synchronization between text and visual editing modes.
     * 
     * Following cnd-core component guidelines:
     * - Functional state updates with proper error handling
     * - Performance optimized with batched state updates
     * - Type-safe parsing with comprehensive validation
     * - Tree-shakable method design
     * 
     * @param yamlString - YAML specification to load into the visual interface
     * @throws {Error} When YAML contains invalid or unsupported constraint types
     * 
     * @example
     * ```typescript
     * try {
     *   noCodeViewRef.current?.loadStateFromYaml(textAreaValue);
     * } catch (error) {
     *   console.error('Failed to load YAML:', error);
     * }
     * ```
     */
    const loadStateFromYaml = (yamlString: string): void => {
        const { constraints: newConstraints, directives: newDirectives } = parseLayoutSpecToData(yamlString);
        setConstraints((prev) => newConstraints);
        setDirectives((prev) => newDirectives);
    };

    // Load initial state from YAML when component mounts
    useEffect(() => {
        // If switching to No Code View and have YAML, load it
        if (yamlValue) {
            try {
                loadStateFromYaml(yamlValue);
            } catch (error) {
                console.error("Failed to load YAML into No Code View:", error);
            }
        }
    }, [])

    return (
        <div id="noCodeViewContainer">
            <div>
                <h5>Constraints  <button type="button" onClick={ addConstraint } title="Click to add a new constraint">+</button></h5>
                <div className='cardContainer' id="constraintContainer">
                    {/* Constraints will be added here dynamically */ }
                    { 
                        constraints.map((cd1) => (
                            <ConstraintCard 
                                key={cd1.id}
                                constraintData={cd1}
                                onUpdate={(updates) => updateConstraint(cd1.id, updates)}
                                onRemove={() => {
                                    setConstraints((prev) => prev.filter((cd2) => cd2.id !== cd1.id));
                                }} />
                        ))
                    }
                </div>
            </div>
            <hr />
            <div>
                <h5>Directives  <button type="button" onClick={ addDirective } title="Click to add a new directive">+</button></h5>
                <div className='cardContainer' id="directiveContainer">
                    { 
                        directives.map((dd1) => (
                            <DirectiveCard 
                                key={dd1.id} 
                                directiveData={dd1}
                                onUpdate={(updates) => updateDirective(dd1.id, updates)}
                                onRemove={() => {
                                    setDirectives((prev) => prev.filter((dd2) => dd2.id !== dd1.id));
                                }} />
                        ))
                    }
                </div>
            </div>
        </div>
    )
}

export { NoCodeView };