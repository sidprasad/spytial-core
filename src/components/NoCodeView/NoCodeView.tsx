import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ConstraintCard } from "./ConstraintCard";
import { DirectiveCard } from "./DirectiveCard";
import { ConstraintData, DirectiveData } from "./interfaces";
import jsyaml from "js-yaml";
import { normalizeConstraintParams, normalizeDirectiveParams } from "./paramDefaults";
import { ConstraintType, DirectiveType } from "./types";

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

const DUAL_USE_TYPES: ReadonlySet<'size' | 'hideAtom'> = new Set(['size', 'hideAtom']);
const SUPPORTED_DIRECTIVE_TYPES: ReadonlySet<DirectiveType> = new Set([
    'attribute',
    'hideField',
    'icon',
    'atomColor',
    'edgeColor',
    'size',
    'projection',
    'flag',
    'inferredEdge',
    'hideAtom',
    'tag',
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeYamlSection(section: unknown): unknown[] {
    if (Array.isArray(section)) {
        return section;
    }
    if (isObjectRecord(section)) {
        return Object.entries(section).map(([key, value]) => ({ [key]: value }));
    }
    return [];
}

function toParamObject(value: unknown): Record<string, unknown> {
    if (!isObjectRecord(value)) {
        return {};
    }
    return { ...value };
}

function isDualUseType(type: string): type is 'size' | 'hideAtom' {
    return DUAL_USE_TYPES.has(type as 'size' | 'hideAtom');
}

function isDualUseDirective(
    directive: DirectiveData
): directive is DirectiveData & { type: 'size' | 'hideAtom' } {
    return isDualUseType(directive.type);
}

function getConstraintTypeFromYaml(constraint: Record<string, unknown>): ConstraintType | "unknown" {
    const type = Object.keys(constraint)[0];
    if (!type) {
        return "unknown";
    }

    if (type === "cyclic" || type === "orientation" || type === "align" || type === "size" || type === "hideAtom") {
        return type;
    }

    if (type === "group") {
        const groupParams = constraint[type];
        if (!isObjectRecord(groupParams)) {
            return "unknown";
        }
        if (groupParams.field !== undefined) {
            return "groupfield";
        }
        if (groupParams.selector !== undefined) {
            return "groupselector";
        }
    }

    return "unknown";
}

function getDirectiveTypeFromYaml(directive: Record<string, unknown>): DirectiveType | "unknown" {
    const type = Object.keys(directive)[0];
    if (!type) {
        return "unknown";
    }
    if (SUPPORTED_DIRECTIVE_TYPES.has(type as DirectiveType)) {
        return type as DirectiveType;
    }
    return "unknown";
}

// TODO: Add unit tests for this function
// Specifically for the Flag Selector

/**
 * Converts YAML string to structured constraint and directive data objects
 * 
 * Parses a CND layout specification YAML and extracts constraint and directive
 * data suitable for the Structured Builder interface. This function complements
 * parseLayoutSpec by providing data in a format optimized for visual editing.
 * 
 * Following spytial-core guidelines:
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

    const parsedYaml = (jsyaml.load(yamlString) ?? {}) as Record<string, unknown>;

    const yamlConstraints = normalizeYamlSection(parsedYaml?.constraints);
    const yamlDirectives = normalizeYamlSection(parsedYaml?.directives);

    // Extract comments from YAML string
    // Comments are associated with the item that follows them
    const extractComments = (yamlStr: string, sectionName: string): Map<number, string> => {
        const commentMap = new Map<number, string>();
        const lines = yamlStr.split('\n');
        let inSection = false;
        let currentComment = '';
        let itemIndex = -1;

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Check if we're entering the section
            if (trimmed === `${sectionName}:`) {
                inSection = true;
                continue;
            }
            
            // Check if we're leaving the section (new top-level key)
            if (inSection && /^[a-zA-Z]/.test(trimmed) && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
                inSection = false;
                continue;
            }

            if (!inSection) continue;

            // Check for comment line
            if (trimmed.startsWith('#')) {
                // Accumulate comment (strip the # and leading space)
                const commentText = trimmed.slice(1).trim();
                currentComment = currentComment 
                    ? currentComment + ' ' + commentText 
                    : commentText;
            } else if (trimmed.startsWith('-')) {
                // This is an item line
                itemIndex++;
                if (currentComment) {
                    commentMap.set(itemIndex, currentComment);
                    currentComment = '';
                }
            }
        }

        return commentMap;
    };

    const constraintComments = extractComments(yamlString, 'constraints');
    const directiveComments = extractComments(yamlString, 'directives');

    // Convert YAML constraints to structured data
    if (yamlConstraints.length > 0) {
        constraints = yamlConstraints.map((constraint, index) => {
            if (!isObjectRecord(constraint)) {
                throw new Error(`Invalid constraint at index ${index}: expected an object entry`);
            }

            const type = getConstraintTypeFromYaml(constraint);
            if (type === "unknown") {
                throw new Error(`Unsupported constraint type in YAML: ${JSON.stringify(constraint)}`);
            }
            const yamlType = Object.keys(constraint)[0];
            const params = toParamObject(constraint[yamlType]);

            // Return structured constraint data with comment if present
            return {
                id: generateId(),
                type,
                params,
                comment: constraintComments.get(index),
            } as ConstraintData;
        });
    }

    // Convert YAML directives to structured data
    if (yamlDirectives.length > 0) {
        const migratedConstraints: ConstraintData[] = [];

        directives = yamlDirectives.map((directive, index) => {
            if (!isObjectRecord(directive)) {
                throw new Error(`Invalid directive at index ${index}: expected an object entry`);
            }

            const type = getDirectiveTypeFromYaml(directive);
            if (type === "unknown") {
                throw new Error(`Unsupported directive type in YAML: ${JSON.stringify(directive)}`);
            }
            const yamlType = Object.keys(directive)[0];
            const rawParams = directive[yamlType];
            const params = type === "flag" && typeof rawParams === "string"
                ? { flag: rawParams }
                : toParamObject(rawParams);
            const comment = directiveComments.get(index);

            if (isDualUseType(type)) {
                migratedConstraints.push({
                    id: generateId(),
                    type,
                    params,
                    comment,
                });
                return null;
            }

            // Return structured directive data with comment if present
            return {
                id: generateId(),
                type,
                params,
                comment,
            } as DirectiveData;
        }).filter((directive): directive is DirectiveData => directive !== null);

        constraints = [...constraints, ...migratedConstraints];
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
    /** Disabled flag */
    disabled?: boolean;
}

const NoCodeView = ({
    yamlValue,
    constraints,
    setConstraints,
    directives,
    setDirectives,
    disabled = false,
}: NoCodeViewProps) => {
    // Drag and drop state
    const [draggedConstraintId, setDraggedConstraintId] = useState<string | null>(null);
    const [draggedDirectiveId, setDraggedDirectiveId] = useState<string | null>(null);
    const visibleDirectives = useMemo(
        () => directives.filter((directive) => !isDualUseDirective(directive)),
        [directives]
    );

    const addConstraint = () => {
        const newConstraint: ConstraintData = {
            id: generateId(),
            type: "orientation",
            params: {},
        };
        setConstraints((prev) => [newConstraint, ...prev]);
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
                const mergedParams = updates.params !== undefined 
                    ? { ...constraint.params, ...updates.params }
                    : constraint.params;
                const mergedConstraint = {
                    ...constraint,
                    ...updates,
                    params: mergedParams
                };
                const shouldNormalizeParams = updates.params !== undefined || updates.type !== undefined;
                return {
                    ...mergedConstraint,
                    params: shouldNormalizeParams
                        ? normalizeConstraintParams(mergedConstraint.type, mergedConstraint.params as Record<string, unknown>)
                        : mergedConstraint.params
                };
            }
            return constraint;
        }));
    }, [setConstraints]);

    /**
     * Collapse or expand all constraints
     */
    const setAllConstraintsCollapsed = useCallback((collapsed: boolean) => {
        setConstraints((prev) => prev.map((c) => ({ ...c, collapsed })));
    }, [setConstraints]);

    /**
     * Handle constraint drag start
     */
    const handleConstraintDragStart = useCallback((e: React.DragEvent, id: string) => {
        setDraggedConstraintId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        // Add dragging class for visual feedback
        (e.target as HTMLElement).classList.add('dragging');
    }, []);

    /**
     * Handle constraint drag end
     */
    const handleConstraintDragEnd = useCallback((e: React.DragEvent) => {
        setDraggedConstraintId(null);
        (e.target as HTMLElement).classList.remove('dragging');
    }, []);

    /**
     * Handle constraint drag over
     */
    const handleConstraintDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    /**
     * Handle constraint drop - reorder constraints
     */
    const handleConstraintDrop = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedConstraintId || draggedConstraintId === targetId) return;

        setConstraints((prev) => {
            const draggedIndex = prev.findIndex((c) => c.id === draggedConstraintId);
            const targetIndex = prev.findIndex((c) => c.id === targetId);
            if (draggedIndex === -1 || targetIndex === -1) return prev;

            const newConstraints = [...prev];
            const [dragged] = newConstraints.splice(draggedIndex, 1);
            newConstraints.splice(targetIndex, 0, dragged);
            return newConstraints;
        });
    }, [draggedConstraintId, setConstraints]);

    const addDirective = () => {
        const newDirective: DirectiveData = {
            id: generateId(),
            type: "flag",
            params: {},
        };
        setDirectives((prev) => [newDirective, ...prev]);
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
        setDirectives((prevDirectives: DirectiveData[]) => prevDirectives.map((directive: DirectiveData) => {
            if (directive.id !== directiveId) {
                return directive;
            }
            const mergedParams = updates.params !== undefined
                ? { ...directive.params, ...updates.params }
                : directive.params;
            const mergedDirective = {
                ...directive,
                ...updates,
                params: mergedParams
            };
            const shouldNormalizeParams = updates.params !== undefined || updates.type !== undefined;
            return {
                ...mergedDirective,
                params: shouldNormalizeParams
                    ? normalizeDirectiveParams(mergedDirective.type, mergedDirective.params as Record<string, unknown>)
                    : mergedDirective.params
            };
        }));
    }, [setDirectives]);

    // Migrate legacy dual-use directives so the structured builder only exposes them under constraints.
    useEffect(() => {
        const legacyDualUseDirectives = directives.filter(isDualUseDirective);
        if (legacyDualUseDirectives.length === 0) {
            return;
        }

        const migratedConstraints: ConstraintData[] = legacyDualUseDirectives.map((directive) => ({
            id: directive.id,
            type: directive.type,
            params: { ...directive.params },
            collapsed: directive.collapsed,
            comment: directive.comment,
        }));

        setConstraints((prev) => {
            const existingIds = new Set(prev.map((constraint) => constraint.id));
            const toAdd = migratedConstraints.filter((constraint) => !existingIds.has(constraint.id));
            if (toAdd.length === 0) {
                return prev;
            }
            return [...prev, ...toAdd];
        });
        setDirectives((prev) => prev.filter((directive) => !isDualUseDirective(directive)));
    }, [directives, setConstraints, setDirectives]);

    /**
     * Collapse or expand all directives
     */
    const setAllDirectivesCollapsed = useCallback((collapsed: boolean) => {
        setDirectives((prev) => prev.map((d) => ({ ...d, collapsed })));
    }, [setDirectives]);

    /**
     * Handle directive drag start
     */
    const handleDirectiveDragStart = useCallback((e: React.DragEvent, id: string) => {
        setDraggedDirectiveId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        (e.target as HTMLElement).classList.add('dragging');
    }, []);

    /**
     * Handle directive drag end
     */
    const handleDirectiveDragEnd = useCallback((e: React.DragEvent) => {
        setDraggedDirectiveId(null);
        (e.target as HTMLElement).classList.remove('dragging');
    }, []);

    /**
     * Handle directive drag over
     */
    const handleDirectiveDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    /**
     * Handle directive drop - reorder directives
     */
    const handleDirectiveDrop = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedDirectiveId || draggedDirectiveId === targetId) return;

        setDirectives((prev) => {
            const draggedIndex = prev.findIndex((d) => d.id === draggedDirectiveId);
            const targetIndex = prev.findIndex((d) => d.id === targetId);
            if (draggedIndex === -1 || targetIndex === -1) return prev;

            const newDirectives = [...prev];
            const [dragged] = newDirectives.splice(draggedIndex, 1);
            newDirectives.splice(targetIndex, 0, dragged);
            return newDirectives;
        });
    }, [draggedDirectiveId, setDirectives]);

    /**
     * Loads constraint and directive state from YAML specification
     * 
     * Parses a YAML string and updates the Structured Builder's internal state to reflect
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
        setConstraints(() => newConstraints);
        setDirectives(() => newDirectives);
    };

    // Load state from YAML when component mounts or when yamlValue changes
    useEffect(() => {
        // If switching to Structured Builder and have YAML, load it
        if (yamlValue) {
            try {
                loadStateFromYaml(yamlValue);
            } catch (error) {
                console.error("Failed to load YAML into Structured Builder:", error);
            }
        }
    }, [yamlValue])

    return (
        <section id="noCodeViewContainer" aria-label="Structured Builder Container">
            <div>
                <div className="sectionHeader">
                    <h5>Constraints  <button type="button" onClick={ addConstraint } title="Click to add a new constraint" aria-label="Click to add a new constraint" disabled={disabled}>+</button></h5>
                    {constraints.length > 0 && (
                        <div className="collapseAllButtons">
                            <button 
                                type="button" 
                                className="collapseAllButton"
                                onClick={() => setAllConstraintsCollapsed(true)}
                                title="Collapse all constraints"
                            >
                                Collapse All
                            </button>
                            <button 
                                type="button" 
                                className="collapseAllButton"
                                onClick={() => setAllConstraintsCollapsed(false)}
                                title="Expand all constraints"
                            >
                                Expand All
                            </button>
                        </div>
                    )}
                </div>
                <section className='cardContainer' id="constraintContainer" aria-label="Constraints List">
                    {/* Constraints will be added here dynamically */ }
                    { 
                        constraints.map((cd1) => (
                            <ConstraintCard 
                                key={cd1.id}
                                constraintData={cd1}
                                onUpdate={(updates) => updateConstraint(cd1.id, updates)}
                                onRemove={() => {
                                    setConstraints((prev) => prev.filter((cd2) => cd2.id !== cd1.id));
                                }}
                                dragHandleProps={{
                                    draggable: true,
                                    onDragStart: (e) => handleConstraintDragStart(e, cd1.id),
                                    onDragEnd: handleConstraintDragEnd,
                                    onDragOver: handleConstraintDragOver,
                                    onDrop: (e) => handleConstraintDrop(e, cd1.id),
                                }}
                            />
                        ))
                    }
                </section>
            </div>
            <hr />
            <div>
                <div className="sectionHeader">
                    <h5>Directives  <button type="button" onClick={ addDirective } title="Click to add a new directive" aria-label="Click to add a new directive" disabled={disabled}>+</button></h5>
                    {visibleDirectives.length > 0 && (
                        <div className="collapseAllButtons">
                            <button 
                                type="button" 
                                className="collapseAllButton"
                                onClick={() => setAllDirectivesCollapsed(true)}
                                title="Collapse all directives"
                            >
                                Collapse All
                            </button>
                            <button 
                                type="button" 
                                className="collapseAllButton"
                                onClick={() => setAllDirectivesCollapsed(false)}
                                title="Expand all directives"
                            >
                                Expand All
                            </button>
                        </div>
                    )}
                </div>
                <section className='cardContainer' id="directiveContainer" aria-label="Directives List">
                    { 
                        visibleDirectives.map((dd1) => (
                            <DirectiveCard 
                                key={dd1.id} 
                                directiveData={dd1}
                                onUpdate={(updates) => updateDirective(dd1.id, updates)}
                                onRemove={() => {
                                    setDirectives((prev) => prev.filter((dd2) => dd2.id !== dd1.id));
                                }}
                                dragHandleProps={{
                                    draggable: true,
                                    onDragStart: (e) => handleDirectiveDragStart(e, dd1.id),
                                    onDragEnd: handleDirectiveDragEnd,
                                    onDragOver: handleDirectiveDragOver,
                                    onDrop: (e) => handleDirectiveDrop(e, dd1.id),
                                }}
                            />
                        ))
                    }
                </section>
            </div>
        </section>
    )
}

export { NoCodeView };
