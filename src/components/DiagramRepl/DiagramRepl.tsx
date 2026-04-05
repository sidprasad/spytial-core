/**
 * DiagramRepl — a REPL for querying the spatial constraint system of a layout.
 *
 * Parallel to EvaluatorRepl (which queries the datum via IEvaluator), this REPL
 * queries the layout via ILayoutEvaluator. Users pose modal spatial queries:
 *
 *   must leftOf(Node0)          — what must be left of Node0?
 *   can ^above(Node0)           — what can be above Node0 (transitive)?
 *   cannot xAligned(Node0)      — what cannot be x-aligned with Node0?
 *   must grouped(Node0)         — what must be grouped with Node0?
 *
 * The query language is a diagram logic (Fisler-inspired) with:
 *   - Spatial predicates matching constraint types
 *   - ^ for transitive closure (Forge convention)
 *   - must/can/cannot modalities (Margrave-inspired)
 */

import React from 'react';
import type { ILayoutEvaluator } from '../../evaluators/interfaces';
import { parseSpatialQuery, formatParsedQuery, evaluateCompoundQuery } from './spatial-query-parser';
import './DiagramRepl.css';

interface DiagramReplProps {
    /** The layout evaluator (must be initialized with an InstanceLayout) */
    evaluator: ILayoutEvaluator;
    /** All node IDs in the layout (needed for 'not' complement) */
    allNodeIds?: Set<string>;
}

type ReplLine = {
    type: 'input' | 'output' | 'error';
    text: string;
};

type ReplExecution = ReplLine[];

export const DiagramRepl: React.FC<DiagramReplProps> = ({ evaluator, allNodeIds }) => {
    const [textInput, setTextInput] = React.useState('');
    const [history, setHistory] = React.useState<ReplExecution[]>([]);

    React.useEffect(() => {
        setTextInput('');
        setHistory([]);
    }, [evaluator]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = textInput.trim();
            if (!input) return;

            const execution: ReplLine[] = [{ type: 'input', text: `> ${input}` }];

            // Parse the query
            const parsed = parseSpatialQuery(input);
            if (!parsed.ok) {
                execution.push({ type: 'error', text: `Parse error: ${parsed.error.message}` });
                if (parsed.error.hint) {
                    execution.push({ type: 'error', text: `  Hint: ${parsed.error.hint}` });
                }
            } else {
                // Evaluate the query (supports compound expressions)
                const { modality, expression } = parsed.value;
                try {
                    const isCompound = expression.type !== 'atomic';
                    let result;

                    if (isCompound) {
                        // Compound expression — use set-based evaluation
                        const nodeIds = allNodeIds ?? new Set<string>();
                        result = evaluateCompoundQuery(evaluator, modality, expression, nodeIds);
                    } else {
                        // Simple atomic query — direct evaluator call
                        const query = expression.query;
                        result =
                            modality === 'must' ? evaluator.must(query) :
                            modality === 'can' ? evaluator.can(query) :
                            evaluator.cannot(query);
                    }

                    if (result.isError()) {
                        execution.push({ type: 'error', text: result.prettyPrint() });
                    } else if (result.noResult()) {
                        execution.push({ type: 'output', text: '(empty set)' });
                    } else {
                        execution.push({ type: 'output', text: result.prettyPrint() });
                    }
                } catch (err: any) {
                    execution.push({ type: 'error', text: `Error: ${err.message}` });
                }
            }

            setHistory(prev => [execution, ...prev]);
            setTextInput('');
        }
    };

    return (
        <div className="diagram-repl-container">
            <p className="diagram-repl-label">Diagram Logic</p>
            <input
                className="diagram-repl-input"
                type="text"
                placeholder="must leftOf(Node0)"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Spatial query input"
            />
            <p className="diagram-repl-help">
                Modalities: must | can | cannot &nbsp;&middot;&nbsp; Relations: leftOf, rightOf, above, below, xAligned, yAligned, grouped, contains &nbsp;&middot;&nbsp; ^ = transitive &nbsp;&middot;&nbsp; Combinators: and | or | not
            </p>
            <div className="diagram-repl-output" role="log" aria-live="polite">
                {history.map((execution, execIdx) => (
                    <React.Fragment key={execIdx}>
                        {execution.map((line, lineIdx) => (
                            <p
                                key={`${execIdx}-${lineIdx}`}
                                className={`diagram-repl-line ${
                                    line.type === 'input' ? 'diagram-repl-line-input' :
                                    line.type === 'error' ? 'diagram-repl-line-error' :
                                    'diagram-repl-line-output'
                                }`}
                            >
                                {line.text}
                            </p>
                        ))}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};
