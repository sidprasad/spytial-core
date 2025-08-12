import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { EvaluatorRepl } from '../../src/components/EvaluatorRepl/EvaluatorRepl'

// Minimal IEvaluator shape needed for the component
interface MockEvaluator {
  evaluate: (expr: string, config?: any) => { prettyPrint: () => string }
}

function createMockEvaluator(): MockEvaluator {
  return {
    evaluate: vi.fn((expr: string) => ({
      prettyPrint: () => `result(${expr})`
    }))
  }
}

describe('EvaluatorRepl Component', () => {
  let evaluator: MockEvaluator
  const instanceNumber = 0

  beforeEach(() => {
    evaluator = createMockEvaluator()
  })

  describe('Rendering', () => {
    it('renders input and output container', () => {
      render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      expect(screen.getByPlaceholderText('Enter expression to evaluate...')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveAttribute('id', 'evaluator-input')
      expect(document.getElementById('repl-output')).toBeInTheDocument()
    })

    it('output container is scrollable with max height style', () => {
      render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      const outputDiv = document.getElementById('repl-output')!
      expect(outputDiv).toHaveStyle({ overflowY: 'auto' })
      const computed = getComputedStyle(outputDiv)
      expect(computed.maxHeight).not.toBe('none')
    })
  })

  describe('Input behavior', () => {
    it('allows typing and updates value', async () => {
      const user = userEvent.setup()
      render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await user.type(input, 'foo')
      expect(input.value).toBe('foo')
    })

    it('evaluates on Enter, clears input, calls evaluator with instance number', async () => {
      const user = userEvent.setup()
      render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await user.type(input, 'abc{enter}')
      expect(evaluator.evaluate).toHaveBeenCalledWith('abc', { instanceIndex: instanceNumber })
      expect(input.value).toBe('')
      const lines = screen.getAllByText(/^(>|result\()/)
      expect(lines[0]).toHaveTextContent('> abc')
      expect(lines[1]).toHaveTextContent('result(abc)')
    })
  })

  describe('Output behavior', () => {
    it('shows command then result, newest at top', async () => {
      const user = userEvent.setup()
      render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await user.type(input, 'one{enter}')
      await user.type(input, 'two{enter}')
      const outputLines = screen.getAllByText(/^(>|result\()/)
      expect(outputLines[0]).toHaveTextContent('> two')
      expect(outputLines[1]).toHaveTextContent('result(two)')
    })

    it('retains previous output for same evaluator and instance', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await user.type(input, 'x{enter}')
      await user.type(input, 'y{enter}')
      rerender(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      const outputLines = screen.getAllByText(/^(>|result\()/)
      expect(outputLines.length).toBe(4)
    })

    it('repeats identical command outputs when run multiple times', async () => {
      const user = userEvent.setup()
      render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={instanceNumber} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await user.type(input, 'dup{enter}')
      await user.type(input, 'dup{enter}')
      const commandLines = screen.getAllByText(/^> dup$/)
      expect(commandLines.length).toBe(2)
    })

    it('clears output when instance number changes (expected behavior per plan)', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={0} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await user.type(input, 'a{enter}')
      rerender(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={1} />)
      const remaining = screen.queryAllByText(/^(>|result\()/)
      expect(remaining.length).toBe(0)
    })

    it('clears output when evaluator instance changes (expected behavior per plan)', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<EvaluatorRepl evaluator={evaluator as any} instanceNumber={0} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await user.type(input, 'a{enter}')
      const newEvaluator = createMockEvaluator()
      rerender(<EvaluatorRepl evaluator={newEvaluator as any} instanceNumber={0} />)
      const remaining = screen.queryAllByText(/^(>|result\()/)
      expect(remaining.length).toBe(0)
    })
  })
})
