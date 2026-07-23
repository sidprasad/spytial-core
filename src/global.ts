/**
 * CDN (IIFE) entry — source of dist/browser/spytial-core-complete.global.js.
 *
 * Everything the npm barrel exports, plus the historical stylesheet. The
 * stylesheet imports exist because dist/browser/spytial-core-complete.css is a
 * published artifact that consumers vendor by path (spytial-rust include_str!s
 * it into every generated page). The React components that own these styles
 * moved out of the default entry in 4.0.0, so without these side-effect
 * imports the CSS file would silently stop being emitted. CSS-only imports:
 * they pull no component code into the bundle.
 */
import './components/ErrorMessageModal/ErrorMessageModal.css';
import './components/InstanceBuilder/InstanceBuilder.css';
import './components/ReplInterface/ReplInterface.css';
import './components/ProjectionControls/ProjectionControls.css';
import './components/ProjectionControls/ProjectionOrchestrator.css';

export * from './index';
