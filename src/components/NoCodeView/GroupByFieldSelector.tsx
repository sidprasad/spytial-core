import React from 'react';

interface GroupByFieldSelectorProps {
  /** Field name */
  field?: string;
  /** Group on index */
  groupOn?: number;
  /** Add to group index */
  addToGroup?: number;
  /** Callback when field changes */
  onFieldChange?: (value: string) => void;
  /** Callback when groupOn changes */
  onGroupOnChange?: (value: number) => void;
  /** Callback when addToGroup changes */
  onAddToGroupChange?: (value: number) => void;
}

/**
 * Minimal React component for group-by-field constraint configuration.
 * Groups elements based on a field with configurable indices.
 */
export const GroupByFieldSelector: React.FC<GroupByFieldSelectorProps> = ({
  field = '',
  groupOn = 0,
  addToGroup = 0,
  onFieldChange,
  onGroupOnChange,
  onAddToGroupChange
}) => {
  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Field</span>
        </div>
        <input
          type="text"
          name="field"
          className="form-control"
          value={field}
          onChange={(e) => onFieldChange?.(e.target.value)}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title="Which 0-indexed element of the field to use as the group key.">
            Group On
          </span>
        </div>
        <input
          type="number"
          name="groupOn"
          className="form-control"
          value={groupOn}
          onChange={(e) => onGroupOnChange?.(Number(e.target.value))}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title="Which 0-indexed element of the field are group members.">
            Add to Group
          </span>
        </div>
        <input
          type="number"
          name="addToGroup"
          className="form-control"
          value={addToGroup}
          onChange={(e) => onAddToGroupChange?.(Number(e.target.value))}
          required
        />
      </div>
    </>
  );
};
