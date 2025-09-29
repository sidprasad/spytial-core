import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttributeSelector } from '../src/components/NoCodeView/Selectors/AttributeSelector';
import { DirectiveData } from '../src/components/NoCodeView/interfaces';

describe('New AttributeSelector UI', () => {
  it('should render new three-field attribute interface', () => {
    const mockDirectiveData: DirectiveData = {
      id: '1',
      type: 'attribute',
      params: {
        selector: 'Person',
        key: 'age',
        valueSelector: 'Person.age'
      }
    };

    const mockOnUpdate = vi.fn();

    render(
      <AttributeSelector 
        directiveData={mockDirectiveData}
        onUpdate={mockOnUpdate}
      />
    );

    // Check that all three new fields are present
    expect(screen.getByText('Target Selector')).toBeInTheDocument();
    expect(screen.getByText('Attribute Key')).toBeInTheDocument();
    expect(screen.getByText('Value Selector')).toBeInTheDocument();

    // Check that input fields have correct values
    expect(screen.getByDisplayValue('Person')).toBeInTheDocument();
    expect(screen.getByDisplayValue('age')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Person.age')).toBeInTheDocument();

    // Check placeholders
    expect(screen.getByPlaceholderText(/Selector for atoms to apply attribute to/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Name of the attribute/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Selector for values to collect/)).toBeInTheDocument();
  });
});