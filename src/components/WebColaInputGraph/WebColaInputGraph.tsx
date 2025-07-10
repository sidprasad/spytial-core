import React, { useEffect, useRef, useState } from 'react';
import { IInputDataInstance, IAtom, ITuple } from '../../data-instance/interfaces';
import { setupLayout } from '../../layout';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { EditableWebColaGraph } from '../../translators/webcola/editable-webcola-cnd-graph';
import './WebColaInputGraph.css';

export interface WebColaInputGraphProps {
  /** Data instance to edit */
  instance: IInputDataInstance;
  /** Layout specification in YAML */
  cndSpec: string;
  /** Callback when instance changes */
  onChange?: (instance: IInputDataInstance) => void;
  /** Width of graph */
  width?: number;
  /** Height of graph */
  height?: number;
}

/**
 * React component that renders an editable WebCola graph.
 *
 * The component wraps {@link EditableWebColaGraph} and provides simple forms
 * for adding atoms and relation tuples. Clicking on a node will prompt for a
 * new label.
 */
export const WebColaInputGraph: React.FC<WebColaInputGraphProps> = ({
  instance,
  cndSpec,
  onChange,
  width = 800,
  height = 600,
}) => {
  const graphRef = useRef<EditableWebColaGraph>(null);
  const [currentInstance, setCurrentInstance] = useState<IInputDataInstance>(instance);

  // Render layout whenever instance changes
  useEffect(() => {
    const graphEl = graphRef.current;
    if (!graphEl) return;
    try {
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: currentInstance });
      const { layout } = setupLayout(cndSpec, currentInstance, evaluator);
      graphEl.renderLayout(layout);
    } catch (err) {
      console.error('Failed to render layout:', err);
    }
  }, [currentInstance, cndSpec]);

  // Node click handler to update label
  useEffect(() => {
    const graphEl = graphRef.current;
    if (!graphEl) return;
    const handle = (e: any) => {
      const id = e.detail.id as string;
      const atom = currentInstance.getAtoms().find((a) => a.id === id);
      if (!atom) return;
      const label = window.prompt('New label for ' + id, atom.label || '');
      if (label !== null) {
        const updated: IAtom = { ...atom, label };
        currentInstance.removeAtom(atom.id);
        currentInstance.addAtom(updated);
        setCurrentInstance(currentInstance);
        onChange?.(currentInstance);
      }
    };
    graphEl.addEventListener('node-click', handle);
    return () => {
      graphEl.removeEventListener('node-click', handle);
    };
  }, [currentInstance, onChange]);

  const [atomType, setAtomType] = useState('Atom');
  const [relationName, setRelationName] = useState('');
  const [relSource, setRelSource] = useState('');
  const [relTarget, setRelTarget] = useState('');

  const addAtom = (e: React.FormEvent) => {
    e.preventDefault();
    const id = generateAtomId(currentInstance, atomType);
    const atom: IAtom = { id, type: atomType };
    currentInstance.addAtom(atom);
    setCurrentInstance(currentInstance);
    onChange?.(currentInstance);
  };

  const addRelation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!relSource || !relTarget || !relationName) return;
    const tuple: ITuple = { atoms: [relSource, relTarget], types: [] };
    currentInstance.addRelationTuple(relationName, tuple);
    setCurrentInstance(currentInstance);
    onChange?.(currentInstance);
  };

  return (
    <div className="webcola-input-graph">
      <div className="graph-wrapper">
        <editable-webcola-graph ref={graphRef as any} width={width} height={height}></editable-webcola-graph>
      </div>
      <div>
        <form onSubmit={addAtom}>
          <div>
            <label>Atom Type:</label>
            <input value={atomType} onChange={(e) => setAtomType(e.target.value)} />
            <button type="submit">Add Atom</button>
          </div>
        </form>
        <form onSubmit={addRelation}>
          <div>
            <label>Relation:</label>
            <input value={relationName} onChange={(e) => setRelationName(e.target.value)} />
          </div>
          <div>
            <label>Source ID:</label>
            <input value={relSource} onChange={(e) => setRelSource(e.target.value)} />
          </div>
          <div>
            <label>Target ID:</label>
            <input value={relTarget} onChange={(e) => setRelTarget(e.target.value)} />
          </div>
          <button type="submit">Add Relation</button>
        </form>
      </div>
    </div>
  );
};

function generateAtomId(instance: IInputDataInstance, typeName: string): string {
  const existingAtoms = instance.getAtoms();
  const existingIds = new Set(existingAtoms.map((atom) => atom.id));
  let counter = 1;
  let candidateId = `${typeName}-${counter}`;
  while (existingIds.has(candidateId)) {
    counter++;
    candidateId = `${typeName}-${counter}`;
  }
  return candidateId;
}
