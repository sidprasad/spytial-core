import React, { useState, useCallback, useRef } from 'react';
import IEvaluator from '../../evaluators/interfaces';
import './EvaluatorRepl.css';

export interface EvaluatorReplProps {
  /** Evaluator implementing the IEvaluator interface */
  evaluator: IEvaluator;
  /** Placeholder for the input box */
  placeholder?: string;
  /** Optional CSS class */
  className?: string;
  /** Optional style */
  style?: React.CSSProperties;
}

interface ReplLine {
  id: string;
  type: 'command' | 'result' | 'error';
  text: string;
}

export const EvaluatorRepl: React.FC<EvaluatorReplProps> = ({
  evaluator,
  placeholder = 'Enter expression and press Ctrl+Enter',
  className = '',
  style
}) => {
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<ReplLine[]>([]);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  };

  const addLine = useCallback((line: Omit<ReplLine, 'id'>) => {
    setLines(prev => [...prev, { ...line, id: `${Date.now()}-${Math.random()}` }]);
    setTimeout(scrollToBottom, 0);
  }, []);

  const execute = useCallback(() => {
    const expr = input.trim();
    if (!expr) return;

    addLine({ type: 'command', text: expr });
    setInput('');

    try {
      const result = evaluator.evaluate(expr);
      if (result.isError()) {
        addLine({ type: 'error', text: result.prettyPrint() });
      } else {
        addLine({ type: 'result', text: result.prettyPrint() });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLine({ type: 'error', text: msg });
    }
  }, [input, evaluator, addLine]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      execute();
    }
  };

  return (
    <div className={`evaluator-repl ${className}`} style={style}>
      <div className="evaluator-repl__output" ref={outputRef}>
        {lines.map(l => (
          <div key={l.id} className={`evaluator-repl__line ${l.type}`}>{l.text}</div>
        ))}
      </div>
      <div className="evaluator-repl__input">
        <textarea
          value={input}
          placeholder={placeholder}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
        />
        <button onClick={execute} disabled={!input.trim()}>
          Run
        </button>
      </div>
    </div>
  );
};

export default EvaluatorRepl;
