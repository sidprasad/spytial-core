import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, within, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { mountCndLayoutInterface } from '../webcola-demo/react-component-integration'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('../src/components/NoCodeView/CodeView', () => ({
  CodeView: vi.fn((props) => (
      <div data-testid="mock-code-view">
        <textarea 
          value={props.yamlValue} 
          onChange={props.handleTextareaChange}
          disabled={props.disabled}
          role="textbox"
          aria-label="CND Layout Specification YAML"
        />
      </div>
    ))
}))

vi.mock(import('../src/components/NoCodeView/NoCodeView'), async (importOriginal) => {
  const original = await importOriginal();

  return {
    ...original,
    NoCodeView: vi.fn((props) => {
      // Parse YAML when component mounts (simulating the real component's useEffect)
      const [parsedConstraints, setParsedConstraints] = React.useState(props.constraints);
      const [parsedDirectives, setParsedDirectives] = React.useState(props.directives);
      
      React.useEffect(() => {
        if (props.yamlValue) {
          try {
            const parsed = original.parseLayoutSpecToData(props.yamlValue);
            setParsedConstraints(parsed.constraints);
            setParsedDirectives(parsed.directives);
          } catch (error) {
            console.error("Failed to parse YAML in mock", error);
          }
        }
      }, [props.yamlValue]);
      
      return (
        <div data-testid="mock-no-code-view" role="region" aria-label="No Code View Container">
          <div data-testid="no-code-view-constraints">
            <h2>Constraints</h2>
            {parsedConstraints.map((constraint) => (
              <div key={constraint.id} data-testid={`constraint-${constraint.id}`}>
                <span>{constraint.type}</span>
                <span>{JSON.stringify(constraint.params)}</span>
              </div>
            ))}
          </div>
          <div data-testid="no-code-view-directives">
            <h2>Directives</h2>
            {parsedDirectives.map((directive) => (
              <div key={directive.id} data-testid={`directive-${directive.id}`}>
                <span>{directive.type}</span>
                <span>{JSON.stringify(directive.params)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    })
  };
})

describe('CnD Layout Interface Integration Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  })

  it('should render CnD Layout Interface correctly', () => {

    // Create the test container element
    const container = document.createElement('div');
    container.setAttribute('id', 'test-cnd-layout-interface');
    document.body.appendChild(container);

    act(() => {
      mountCndLayoutInterface('test-cnd-layout-interface')
    })

    // Confirm that the CnD Layout Interface is mounted
    const cndLayoutInterface = document.getElementById('test-cnd-layout-interface') as HTMLElement;
    expect(cndLayoutInterface).toBeInTheDocument();

    // The component is rendered correctly
    screen.debug();
    const toggle = within(cndLayoutInterface).getByRole('switch');
    expect(toggle).toBeInTheDocument();
    expect(within(cndLayoutInterface).getByTestId('mock-code-view')).toBeInTheDocument();
    expect(within(cndLayoutInterface).getByRole('textbox')).toBeInTheDocument();
  })

  it('example integration test', async () => {

    const testYaml = 
`constraints:
  - orientation:
      selector: right
      directions:
        - right
        - below
  - orientation:
      selector: left
      directions:
        - left
        - below
directives:
  - attribute:
      field: key
  - flag: hideDisconnectedBuiltIns
`
    
    const testConstraints = [
      { id: '1', type: 'orientation', params: { selector: 'right', directions: ['right', 'below'] } },
      { id: '2', type: 'orientation', params: { selector: 'left', directions: ['left', 'below'] } },
    ]
    const testDirectives = [
      { id: '1', type: 'attribute', params: { field: 'key' } },
      { id: '2', type: 'flag', params: { flag: 'hideDisconnectedBuiltIns' } }
    ]

    // Create the test container element
    const container = document.createElement('div');
    container.setAttribute('id', 'test-cnd-layout-interface');
    container.setAttribute('data-testid', 'test-cnd-layout-interface');
    document.body.appendChild(container);

    act(() => {
      mountCndLayoutInterface('test-cnd-layout-interface')
    })

    // Type the YAML into the Code View
    const testContainer = screen.getByTestId('test-cnd-layout-interface') as HTMLTextAreaElement;
    const textarea = within(testContainer).getByRole('textbox') as HTMLTextAreaElement;

    await waitFor(async () => {
      fireEvent.change(textarea, { target: { value: testYaml } })
    })
    expect(textarea.value).toBe(testYaml)

    // Switch to No Code view
    const toggle = within(testContainer).getByRole('switch');
    const user = userEvent.setup();
    await user.click(toggle);

    // Verify No Code View is displayed
    expect(screen.getByTestId('mock-no-code-view')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-code-view')).not.toBeInTheDocument();

    // Verify the correct constraints and directives are displayed
    const constraintsSection = screen.getByTestId('no-code-view-constraints');
    const directivesSection = screen.getByTestId('no-code-view-directives');

    const constraintElements = within(constraintsSection).getAllByTestId(/^constraint-/);
    expect(constraintElements).toHaveLength(2);

    expect(screen.getByText(/"selector":"right"/)).toBeInTheDocument();
    expect(screen.getByText(/"selector":"left"/)).toBeInTheDocument();

    const directiveElements = within(directivesSection).getAllByTestId(/^directive-/);
    expect(directiveElements).toHaveLength(2);
    expect(screen.getByText(/"field":"key"/)).toBeInTheDocument();
    expect(screen.getByText(/"flag":"hideDisconnectedBuiltIns"/)).toBeInTheDocument();
  })

})