/**
 * Renderer coverage for the nested `group` field kind (progressive "+" blocks).
 * Verifies the add-chip → onChange({}) and the present-block fieldset → remove,
 * i.e. the Builder UI for lineStyle/textStyle/… blocks.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldRenderer } from '../src/spec-editor/ui/FieldRenderer';
import type { FieldSpec } from '../src/spec-editor/core/types';

const lineStyleGroup: FieldSpec = {
    key: 'lineStyle',
    kind: 'group',
    label: 'Line style',
    children: [
        { key: 'color', kind: 'color', label: 'Color' },
        { key: 'pattern', kind: 'enum', options: ['solid', 'dashed', 'dotted'], label: 'Pattern' },
    ],
};

describe('FieldRenderer — nested group blocks', () => {
    it('renders an "add" chip when the optional block is absent, and adds it on click', () => {
        const onChange = vi.fn();
        render(<FieldRenderer fields={[lineStyleGroup]} values={{}} onChange={onChange} />);
        const add = screen.getByRole('button', { name: /\+ line style/i });
        fireEvent.click(add);
        expect(onChange).toHaveBeenCalledWith('lineStyle', {});
    });

    it("renders the block's children when present, and removes the whole block", () => {
        const onChange = vi.fn();
        render(
            <FieldRenderer
                fields={[lineStyleGroup]}
                values={{ lineStyle: { color: '#3366cc' } }}
                onChange={onChange}
            />,
        );
        // child fields are shown
        expect(screen.getByText('Color')).toBeTruthy();
        expect(screen.getByText('Pattern')).toBeTruthy();
        // the remove control drops the entire block (sets it undefined)
        const remove = screen.getByRole('button', { name: /remove line style/i });
        fireEvent.click(remove);
        expect(onChange).toHaveBeenCalledWith('lineStyle', undefined);
    });
});
