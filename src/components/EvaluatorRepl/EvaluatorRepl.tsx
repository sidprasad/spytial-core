import React from 'react'
import { IEvaluator } from '../../evaluators'
import "./EvaluatorRepl.css"

interface EvaluatorReplProps {
  // IEvaluator instance
  evaluator: IEvaluator
  // Instance index for the evaluator
  instanceNumber: number
}

type EvaluatorExecution = [string, string]

export const EvaluatorRepl: React.FC<EvaluatorReplProps> = ({ evaluator, instanceNumber }) => {
  const [textInput, setTextInput] = React.useState('');
  const [evaluatorOutput, setEvaluatorOutput] = React.useState<EvaluatorExecution[]>([]);

  React.useEffect(() => {
    // Clear input and output when evaluator or instance number changes
    setTextInput('');
    setEvaluatorOutput([]);
  }, [evaluator, instanceNumber]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Evaluate the input expression
      const output = evaluator.evaluate(textInput, { instanceIndex: instanceNumber });
      setEvaluatorOutput(prev => [[textInput, output.prettyPrint()], ...prev]);
      setTextInput(''); // Clear input after evaluation
    }
  }

  return (
    <div id="evaluator-repl-container">
      <input 
        className="code-input"
        id="evaluator-input" 
        type="text" 
        placeholder="Enter expression to evaluate..." 
        value={textInput} 
        onChange={(e) => setTextInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div id="repl-output">
        {evaluatorOutput.map(([textInput, output], index) => (
          <React.Fragment key={index}>
            <p className="repl-output-line">{`> ${textInput}`}</p>
            <p className="repl-output-line">{output}</p>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}