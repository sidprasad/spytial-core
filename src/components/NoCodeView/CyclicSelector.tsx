import React from 'react';
import { TUPLE_SELECTOR_TEXT } from './constants';

interface CyclicSelectorProps {

}

const CyclicSelector: React.FC<CyclicSelectorProps> = (props: CyclicSelectorProps) => {
  return (
    <>
    <div className="input-group">
        <div className="input-group-prepend">
            <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>Selector</span>
        </div>
        <input type="text" name="selector" className="form-control" required />
    </div>
    <div className="input-group">
        <div className="input-group-prepend">
            <span className="input-group-text">Direction</span>
        </div>
        <select name="direction">
            <option value="clockwise">Clockwise</option>
            <option value="counterclockwise">Counterclockwise</option>
        </select>
    </div>
    </>
  )
}

export { CyclicSelector }