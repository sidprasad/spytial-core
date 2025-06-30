import React, { useState } from "react";
import { ConstraintCard } from "./ConstraintCard";
import { DirectiveCard } from "./DirectiveCard";

interface NoCodeViewProps {
    /** Callback when YAML value changes */
    onChange: (value: string) => void;
}

const NoCodeView = (props: NoCodeViewProps) => {
    const [constraintIds, setConstraintIds] = useState<string[]>([]);
    const [directiveIds, setDirectiveIds] = useState<string[]>([]);

    // Utility function to generate simple unique IDs for constraints
    const generateId = () => {
        return Date.now().toString();
    }

    const addConstraint = () => {
        const newConstraintId = generateId();
        setConstraintIds([...constraintIds, newConstraintId])
    }

    const addDirective = () => {
        // addElement("directiveContainer", "directive", DIRECTIVE_SELECT);
        const newDirectiveId = generateId();
        setDirectiveIds([...directiveIds, newDirectiveId]);
    }

    const addElement = () => {
        const container = document.getElementById(containerId);
        const div = document.createElement("div");
        div.classList.add(className);
        div.innerHTML = template;

        container.prepend(div); // Add the new element to the top
        updateFields(div.querySelector("select"));

        // Add a highlight effect
        div.classList.add("highlight");
        setTimeout(() => {
            div.classList.remove("highlight");
        }, 1000); // Remove the highlight after 1 second
    }


    return (
        <div className="container-fluid" id="noCodeViewContainer">
            <div className="container-fluid">
                <h5>Constraints  <button type="button" onClick={ addConstraint } title="Click to add a new constraint">+</button></h5>
                <div id="constraintContainer">
                    {/* Constraints will be added here dynamically */ }
                    { 
                        constraintIds.map((id) => (
                            <ConstraintCard 
                                key={id} 
                                onRemove={() => {
                                    setConstraintIds(constraintIds.filter((cid) => cid !== id));
                                }} />
                        ))
                    }
                </div>
            </div>
            <hr />
            <div className="container-fluid">
                <h5>Directives  <button type="button" onClick={ addDirective } title="Click to add a new directive">+</button></h5>
                <div id="directiveContainer">
                    { 
                        directiveIds.map((id) => (
                            <DirectiveCard 
                                key={id} 
                                onRemove={() => {
                                    setDirectiveIds(directiveIds.filter((did) => did !== id));
                                }} />
                        ))
                    }
                </div>
            </div>
        </div>
    )
}

export { NoCodeView };