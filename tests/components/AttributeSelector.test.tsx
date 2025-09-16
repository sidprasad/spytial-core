import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttributeSelector } from '../../src/components/NoCodeView/Selectors/AttributeSelector';
import { DirectiveData } from '../../src/components/NoCodeView/interfaces';

describe('AttributeSelector Component', () => {
  const mockOnUpdate = vi.fn();

  const createDirectiveData = (params: Record<string, unknown> = {}): DirectiveData => ({
    id: 'test-id',
    type: 'attribute',
    params
  });

  beforeEach(() => {
    mockOnUpdate.mockClear();
  });

  describe('Rendering', () => {
    it('should render field, selector, and prominent inputs', () => {
      const directiveData = createDirectiveData();
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      expect(screen.getByText('Field')).toBeInTheDocument();
      expect(screen.getByText('Selector')).toBeInTheDocument();
      expect(screen.getByText('Prominent')).toBeInTheDocument();
      expect(screen.getByText('Make this attribute larger and bolder than the node label')).toBeInTheDocument();
    });

    it('should display default values correctly', () => {
      const directiveData = createDirectiveData({
        field: 'name',
        selector: 'Person',
        prominent: true
      });
      
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      const fieldInput = screen.getByDisplayValue('name');
      const selectorInput = screen.getByDisplayValue('Person');
      const prominentCheckbox = screen.getByRole('checkbox', { name: /prominent/i });

      expect(fieldInput).toBeInTheDocument();
      expect(selectorInput).toBeInTheDocument();
      expect(prominentCheckbox).toBeChecked();
    });

    it('should render with empty values when no params provided', () => {
      const directiveData = createDirectiveData();
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      const fieldInput = screen.getByRole('textbox', { name: /field/i });
      const selectorInput = screen.getByPlaceholderText(/optional: target specific atoms/i);
      const prominentCheckbox = screen.getByRole('checkbox', { name: /prominent/i });

      expect(fieldInput).toHaveValue('');
      expect(selectorInput).toHaveValue('');
      expect(prominentCheckbox).not.toBeChecked();
    });
  });

  describe('User Interactions', () => {
    it('should call onUpdate when field input changes', () => {
      const directiveData = createDirectiveData();
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      const fieldInput = screen.getByRole('textbox', { name: /field/i });
      fireEvent.change(fieldInput, { target: { value: 'age' } });

      expect(mockOnUpdate).toHaveBeenCalledWith({
        params: { field: 'age' }
      });
    });

    it('should call onUpdate when selector input changes', () => {
      const directiveData = createDirectiveData();
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      const selectorInput = screen.getByPlaceholderText(/optional: target specific atoms/i);
      fireEvent.change(selectorInput, { target: { value: 'Company' } });

      expect(mockOnUpdate).toHaveBeenCalledWith({
        params: { selector: 'Company' }
      });
    });

    it('should call onUpdate when prominent checkbox is toggled', () => {
      const directiveData = createDirectiveData();
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      const prominentCheckbox = screen.getByRole('checkbox', { name: /prominent/i });
      fireEvent.click(prominentCheckbox);

      expect(mockOnUpdate).toHaveBeenCalledWith({
        params: { prominent: true }
      });
    });

    it('should preserve existing params when updating', () => {
      const directiveData = createDirectiveData({
        field: 'existingField',
        selector: 'existingSelector'
      });
      
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      const prominentCheckbox = screen.getByRole('checkbox', { name: /prominent/i });
      fireEvent.click(prominentCheckbox);

      expect(mockOnUpdate).toHaveBeenCalledWith({
        params: {
          field: 'existingField',
          selector: 'existingSelector',
          prominent: true
        }
      });
    });

    it('should handle unchecking prominent checkbox', () => {
      const directiveData = createDirectiveData({ prominent: true });
      render(<AttributeSelector directiveData={directiveData} onUpdate={mockOnUpdate} />);

      const prominentCheckbox = screen.getByRole('checkbox', { name: /prominent/i });
      fireEvent.click(prominentCheckbox);

      expect(mockOnUpdate).toHaveBeenCalledWith({
        params: { prominent: false }
      });
    });
  });
});