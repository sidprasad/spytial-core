import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectionControls, ProjectionChoice } from '../src/components/ProjectionControls';
import React from 'react';

describe('ProjectionControls', () => {
  const mockProjectionData: ProjectionChoice[] = [
    {
      type: 'State',
      projectedAtom: 'State0',
      atoms: ['State0', 'State1', 'State2']
    },
    {
      type: 'Process',
      projectedAtom: 'P1',
      atoms: ['P1', 'P2']
    }
  ];

  it('should render projection controls with correct data', () => {
    const onProjectionChange = vi.fn();
    
    render(
      <ProjectionControls
        projectionData={mockProjectionData}
        onProjectionChange={onProjectionChange}
      />
    );

    // Check that the title is rendered
    expect(screen.getByText('Projections')).toBeInTheDocument();
    
    // Check that both projection types are rendered
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Process')).toBeInTheDocument();
    
    // Check that the correct atoms are selected
    const stateSelect = screen.getByLabelText('Select atom to project for State') as HTMLSelectElement;
    const processSelect = screen.getByLabelText('Select atom to project for Process') as HTMLSelectElement;
    
    expect(stateSelect.value).toBe('State0');
    expect(processSelect.value).toBe('P1');
  });

  it('should call onProjectionChange when selection changes', () => {
    const onProjectionChange = vi.fn();
    
    render(
      <ProjectionControls
        projectionData={mockProjectionData}
        onProjectionChange={onProjectionChange}
      />
    );

    const stateSelect = screen.getByLabelText('Select atom to project for State');
    
    fireEvent.change(stateSelect, { target: { value: 'State1' } });
    
    expect(onProjectionChange).toHaveBeenCalledWith('State', 'State1');
  });

  it('should render null when no projection data', () => {
    const onProjectionChange = vi.fn();
    
    const { container } = render(
      <ProjectionControls
        projectionData={[]}
        onProjectionChange={onProjectionChange}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should disable select when disabled prop is true', () => {
    const onProjectionChange = vi.fn();
    
    render(
      <ProjectionControls
        projectionData={mockProjectionData}
        onProjectionChange={onProjectionChange}
        disabled={true}
      />
    );

    const stateSelect = screen.getByLabelText('Select atom to project for State') as HTMLSelectElement;
    
    expect(stateSelect.disabled).toBe(true);
  });

  it('should render all available atoms as options', () => {
    const onProjectionChange = vi.fn();
    
    render(
      <ProjectionControls
        projectionData={mockProjectionData}
        onProjectionChange={onProjectionChange}
      />
    );

    const stateSelect = screen.getByLabelText('Select atom to project for State') as HTMLSelectElement;
    const options = Array.from(stateSelect.options).map(opt => opt.value);
    
    expect(options).toEqual(['State0', 'State1', 'State2']);
  });

  it('should handle projection with no atoms', () => {
    const onProjectionChange = vi.fn();
    const emptyProjectionData: ProjectionChoice[] = [
      {
        type: 'EmptyType',
        projectedAtom: '',
        atoms: []
      }
    ];
    
    render(
      <ProjectionControls
        projectionData={emptyProjectionData}
        onProjectionChange={onProjectionChange}
      />
    );

    const select = screen.getByLabelText('Select atom to project for EmptyType') as HTMLSelectElement;
    
    expect(select.disabled).toBe(true);
    expect(screen.getByText('No atoms available')).toBeInTheDocument();
  });
});
