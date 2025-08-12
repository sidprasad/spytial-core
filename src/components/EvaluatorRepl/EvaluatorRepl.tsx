import React from 'react'
import { IEvaluator } from '../../evaluators'
import "./EvaluatorRepl.css"

interface EvaluatorReplProps {
  // IEvaluator instance
  evaluator: IEvaluator
  // Instance index for the evaluator
  instanceNumber: number
}

export const EvaluatorRepl: React.FC<EvaluatorReplProps> = ({ evaluator, instanceNumber }) => {

  const [textInput, setTextInput] = React.useState('');
  const [evaluatorOutput, setEvaluatorOutput] = React.useState<string[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Evaluate the input expression
      const output = evaluator.evaluate(textInput, { instanceIndex: instanceNumber });
      setEvaluatorOutput(prev => [output.prettyPrint(), ...prev]);
      setTextInput(''); // Clear input after evaluation
    }
  }

  return (
    <div id="evaluator-repl-container">
      <input 
        id="evaluator-input" 
        type="text" 
        placeholder="Enter expression to evaluate..." 
        value={textInput} 
        onChange={(e) => setTextInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div id="repl-output">
        {evaluatorOutput.map((line, index) => (
          <p key={index} className="repl-output-line">{line}</p>
        ))}
      </div>
    </div>
  )
}