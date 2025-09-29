import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, within, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { mountCndLayoutInterface } from '../webcola-demo/react-component-integration'
import userEvent, { UserEvent } from '@testing-library/user-event'
import React from 'react'

vi.mock(import('../src/components/NoCodeView/CodeView'), async (importOriginal) => {
  const original = await importOriginal();

  return {
    ...original,
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
  }
})

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
      
      // Handle constraint removal - follows pattern from real component
      const handleRemoveConstraint = React.useCallback((constraintId: string) => {
        // Update local state
        setParsedConstraints(prevConstraints => 
          prevConstraints.filter(c => c.id !== constraintId)
        );
        
        // Update parent state through functional update pattern
        props.setConstraints((prev) => prev.filter((c) => c.id !== constraintId));
      }, [props.setConstraints]);
      
      return (
        <div data-testid="mock-no-code-view" role="region" aria-label="No Code View Container">
          <div data-testid="no-code-view-constraints">
            <h2>Constraints</h2>
            {parsedConstraints.map((constraint) => (
              <div key={constraint.id} data-testid={`constraint-${constraint.id}`} className="constraint-card">
                <span>{constraint.type}</span>
                <span>{JSON.stringify(constraint.params)}</span>
                <button 
                  data-testid={`remove-constraint-${constraint.id}`}
                  aria-label={`Remove ${constraint.type} constraint`}
                  onClick={() => handleRemoveConstraint(constraint.id)}
                  type="button"
                  className="btn-remove"
                >
                  Remove
                </button>
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

  /** Testing Constants */
  
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
    selector: 'Node'
    key: 'key'
    valueSelector: 'Node.key'
- flag: hideDisconnectedBuiltIns
`

  const testConstraints = [
    { id: '1', type: 'orientation', params: { selector: 'right', directions: ['right', 'below'] } },
    { id: '2', type: 'orientation', params: { selector: 'left', directions: ['left', 'below'] } },
  ]

  const testDirectives = [
    { id: '1', type: 'attribute', params: { selector: 'Node', key: 'key', valueSelector: 'Node.key' } },
    { id: '2', type: 'flag', params: { flag: 'hideDisconnectedBuiltIns' } }
  ]

  /** Test Helpers */
  function mountComponent() {
    // Create the test container element
    const container = document.createElement('div');
    container.setAttribute('id', 'test-cnd-layout-interface');
    container.setAttribute('data-testid', 'test-cnd-layout-interface');
    document.body.appendChild(container);

    act(() => {
      mountCndLayoutInterface('test-cnd-layout-interface')
    })

    // Confirm that the CnD Layout Interface is mounted
    const cndLayoutInterface = document.getElementById('test-cnd-layout-interface') as HTMLElement;
    expect(cndLayoutInterface).toBeInTheDocument();
    expect(cndLayoutInterface).toHaveAttribute('data-testid', 'test-cnd-layout-interface');
  }

  async function typeYaml(yaml: string) {
    // Type the YAML into the Code View
      const testContainer = screen.getByTestId('test-cnd-layout-interface') as HTMLTextAreaElement;
      const textarea = within(testContainer).getByRole('textbox') as HTMLTextAreaElement;
  
      await waitFor(async () => {
        fireEvent.change(textarea, { target: { value: yaml } })
      })
      expect(textarea.value).toBe(yaml)
  }

  async function switchToNoCodeView(user: UserEvent) {
    // Switch to No Code view
      const testContainer = screen.getByTestId('test-cnd-layout-interface') as HTMLElement;
      const toggle = within(testContainer).getByRole('switch');
      await user.click(toggle);

      // Verify No Code View is displayed
      expect(screen.getByTestId('mock-no-code-view')).toBeInTheDocument()
      expect(screen.queryByTestId('mock-code-view')).not.toBeInTheDocument();
  }

  /** Setup and Teardown */

  beforeEach(() => {
    vi.clearAllMocks();
    mountComponent();
  })

  afterEach(() => {
    // TODO: Clean up the test container
  })

  /** Test Suites */
  
  describe('Rendering', () => {
  
    it('should render CnD Layout Interface correctly', () => {
      // The component is rendered correctly
      const cndLayoutInterface = document.getElementById('test-cnd-layout-interface') as HTMLElement;
      expect(cndLayoutInterface).toBeInTheDocument();
      const toggle = within(cndLayoutInterface).getByRole('switch');
      expect(toggle).toBeInTheDocument();
      expect(within(cndLayoutInterface).getByTestId('mock-code-view')).toBeInTheDocument();
      expect(within(cndLayoutInterface).getByRole('textbox')).toBeInTheDocument();
    })
  
  })

  describe('Interactions', () => {

    it('injecting some default CnD spec should render correctly', async () => {
      // Type the test YAML into the Code View
      await typeYaml(testYaml);
      
      // Switch to No Code view
      const testContainer = screen.getByTestId('test-cnd-layout-interface') as HTMLTextAreaElement;
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
      expect(screen.getByText(/"selector":"Node"/)).toBeInTheDocument();
      expect(screen.getByText(/"key":"key"/)).toBeInTheDocument();
      expect(screen.getByText(/"valueSelector":"Node.key"/)).toBeInTheDocument();
      expect(screen.getByText(/"flag":"hideDisconnectedBuiltIns"/)).toBeInTheDocument();
    })

  })

  describe('CnD Spec Retrieval', () => {

    it('should retrieve the current CnD spec from React component in both Code and No Code View', async () => {
      // Type the test YAML into the Code View
      await typeYaml(testYaml);

      // Call the function to get the current CND spec in Code View
      let currentSpec = await import('../webcola-demo/react-component-integration').then(m => m.DataAPI.getCurrentCndSpec());
      expect(currentSpec?.trim()).toBe(testYaml.trim());

      // Switch to No Code view
      const user = userEvent.setup();
      await switchToNoCodeView(user);
  
      // Call the function to get the current CND spec in No Code View
      currentSpec = await import('../webcola-demo/react-component-integration').then(m => m.DataAPI.getCurrentCndSpec());
      expect(currentSpec).toBe(testYaml);
    })

    it('should retrieve the current CnD spec from React component while in No Code View after changes have been made', async () => {
      // TYpe the test YAML into the Code View
      await typeYaml(testYaml);

      // Switch to No Code view
      const user = userEvent.setup();
      await switchToNoCodeView(user);

      // Modify the constraints and directives in No Code View
      const constraintsSection = screen.getByTestId('no-code-view-constraints');

      const constraintElements = within(constraintsSection).getAllByTestId(/^constraint-/);
      expect(constraintElements).toHaveLength(2);
      await act(async () => {
        const removeButton = within(constraintElements[0]).getByRole('button', { name: /Remove orientation constraint/ })
        expect(removeButton).toBeInTheDocument();
        await user.click(removeButton);
      })
      const newConstraintElements = within(constraintsSection).getAllByTestId(/^constraint-/);
      expect(newConstraintElements).toHaveLength(1);

      // Call the function to get the current CND spec in No Code View
      const currentSpec = await import('../webcola-demo/react-component-integration').then(m => m.DataAPI.getCurrentCndSpec());
      expect(currentSpec).not.toBe(testYaml);
    })

  })

})