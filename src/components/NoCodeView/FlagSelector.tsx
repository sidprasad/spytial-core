import React from 'react';
import { DirectiveData } from './interfaces';

interface FlagSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for visibility flag directive.
 * Dropdown for predefined visibility flag options.
 */
export const FlagSelector: React.FC<FlagSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const flag = (directiveData.params.flag as string) || '';

  return (
    <div className="input-group">
      <select
        name="flag"
        className="form-control"
        value={flag}
        onChange={(e) => onUpdate({ params: { ...directiveData.params, flag: e.target.value } })}
      >
        <option value="">Select flag...</option>
        <option value="hideDisconnectedBuiltIns">Hide disconnected built ins.</option>
        <option value="hideDisconnected">Hide all disconnected.</option>
      </select>
    </div>
  );
};
