import React, { useEffect, useRef } from 'react';
import { parseLayoutSpec } from '../layout/layoutspec';
import { LayoutInstance } from '../layout/layoutinstance';
import { SGraphQueryEvaluator } from '../evaluators/sgq-evaluator';
import { IInputDataInstance } from '../data-instance/interfaces';

export interface WebcolaWidgetProps {
  /** Data instance to visualize */
  dataInstance: IInputDataInstance;
  /** CND layout specification in YAML */
  cndSpec: string;
  /** Width of the graph element */
  width?: number;
  /** Height of the graph element */
  height?: number;
  /** Layout format attribute for the custom element */
  layoutFormat?: string;
}

/**
 * React wrapper around the <webcola-cnd-graph> custom element.
 * This component mirrors the demo pipeline: it parses the CND spec,
 * runs the SGraphQueryEvaluator, generates the layout and renders
 * using the WebCola custom element.
 */
export const WebcolaWidget: React.FC<WebcolaWidgetProps> = ({
  dataInstance,
  cndSpec,
  width = 800,
  height = 600,
  layoutFormat = 'default'
}) => {
  const graphRef = useRef<any>(null);

  useEffect(() => {
    const element = graphRef.current as any;
    if (!element) return;

    try {
      // Parse layout specification
      const layoutSpec = parseLayoutSpec(cndSpec);

      // Run evaluation pipeline using SGQ evaluator
      const evaluator = new SGraphQueryEvaluator();
      evaluator.initialize({ dataInstance });

      const layoutInstance = new LayoutInstance(
        layoutSpec,
        evaluator,
        0,
        true
      );

      const { layout } = layoutInstance.generateLayout(dataInstance, {});
      element.renderLayout(layout);
    } catch (err) {
      console.error('WebcolaWidget render failed:', err);
    }
  }, [dataInstance, cndSpec]);

  return (
    <webcola-cnd-graph
      ref={graphRef}
      width={width}
      height={height}
      layoutFormat={layoutFormat}
    ></webcola-cnd-graph>
  );
};
