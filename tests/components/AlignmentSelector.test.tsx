import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlignmentSelector } from '../../src/components/NoCodeView/Selectors/AlignmentSelector';
import { ConstraintData } from '../../src/components/NoCodeView/interfaces';

describe('AlignmentSelector Component', () => {

  const defaultConstraintData: ConstraintData = {
    id: '1',
    type: 'align',
    params: {
      selector: 'Node',
      direction: ['horizontal']
    }
  };

  const defaultOnUpdate = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render selector input and direction dropdown', () => {
      render(<AlignmentSelector constraintData={defaultConstraintData} onUpdate={defaultOnUpdate} />);

      expect(screen.getByDisplayValue('Node')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('horizontal');
      expect(screen.getByText('Selector')).toBeInTheDocument();
      expect(screen.getByText('Direction')).toBeInTheDocument();
    });

    it('should render with empty values', () => {
      const emptyData: ConstraintData = {
        id: '1',
        type: 'align',
        params: {}
      };

      render(<AlignmentSelector constraintData={emptyData} onUpdate={defaultOnUpdate} />);

      expect(screen.getByRole('textbox')).toHaveValue('');
      expect(screen.getByRole('combobox')).toHaveValue('');
    });

    it('should handle direction as string instead of array', () => {
      const stringDirectionData: ConstraintData = {
        id: '1',
        type: 'align',
        params: {
          selector: 'Edge',
          direction: 'vertical'
        }
      };

      render(<AlignmentSelector constraintData={stringDirectionData} onUpdate={defaultOnUpdate} />);

      expect(screen.getByDisplayValue('Edge')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('vertical');
    });
  });

  describe('Interactions', () => {
    it('should call onUpdate when selector input changes', () => {
      render(<AlignmentSelector constraintData={defaultConstraintData} onUpdate={defaultOnUpdate} />);

      const selectorInput = screen.getByDisplayValue('Node');
      fireEvent.change(selectorInput, { target: { name: 'selector', value: 'Edge' } });

      expect(defaultOnUpdate).toHaveBeenCalledWith({
        params: {
          selector: 'Edge',
          direction: ['horizontal']
        }
      });
    });

    it('should call onUpdate when direction select changes', () => {
      render(<AlignmentSelector constraintData={defaultConstraintData} onUpdate={defaultOnUpdate} />);

      const directionSelect = screen.getByRole('combobox');
      fireEvent.change(directionSelect, { target: { name: 'direction', value: 'vertical' } });

      expect(defaultOnUpdate).toHaveBeenCalledWith({
        params: {
          selector: 'Node',
          direction: ['vertical']
        }
      });
    });

    it('should display all direction options', () => {
      render(<AlignmentSelector constraintData={defaultConstraintData} onUpdate={defaultOnUpdate} />);

      expect(screen.getByText('Select direction...')).toBeInTheDocument();
      expect(screen.getByText('Horizontal')).toBeInTheDocument();
      expect(screen.getByText('Vertical')).toBeInTheDocument();
    });
  });

  describe('TypeScript Integration', () => {
    it('should handle proper typing for constraint data', () => {
      const typedConstraintData: ConstraintData = {
        id: '1',
        type: 'align',
        params: {
          selector: 'TestSelector',
          direction: ['horizontal'] as string[]
        }
      };

      render(<AlignmentSelector constraintData={typedConstraintData} onUpdate={defaultOnUpdate} />);

      expect(screen.getByDisplayValue('TestSelector')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('horizontal');
    });
  });
});