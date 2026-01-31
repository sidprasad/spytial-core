import React from 'react';
import { UNARY_SELECTOR_TEXT, TUPLE_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

interface TagSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for tag directive selection.
 * 
 * Tag directives add computed attributes to nodes based on n-ary selector evaluation.
 * Unlike attribute directives which work with edges/fields, tag directives are purely
 * selector-based and don't remove edges.
 * 
 * - toTag: Selector to determine which atoms get this tag
 * - name: The attribute name to display
 * - value: N-ary selector whose result becomes the attribute value
 * 
 * For n-ary results:
 * - Binary (2-ary): name: value
 * - Ternary (3-ary): name[middle]: value
 * - Higher arity: name[mid1][mid2]...: value
 */
export const TagSelector: React.FC<TagSelectorProps> = (props: TagSelectorProps) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value || undefined
      }
    });
  };

  const handleSelectorChange = (event: SelectorChangeEvent) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value || undefined
      }
    });
  };

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={UNARY_SELECTOR_TEXT}>
            To Tag
          </span>
        </div>
        <SelectorInput
          name="toTag"
          value={props.directiveData.params.toTag as string || ''}
          onChange={handleSelectorChange}
          placeholder="Atoms to receive this tag (e.g., Person)"
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Name</span>
        </div>
        <input
          type="text"
          name="name"
          className="form-control"
          defaultValue={props.directiveData.params.name as string || ''}
          onChange={handleInputChange}
          placeholder="Attribute name to display"
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>
            Value
          </span>
        </div>
        <SelectorInput
          name="value"
          value={props.directiveData.params.value as string || ''}
          onChange={handleSelectorChange}
          placeholder="N-ary selector for tag values (e.g., age, score)"
        />
      </div>
    </>
  );
};
