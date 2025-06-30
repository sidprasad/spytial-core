/**
 * Type declarations for CSS modules
 * Enables TypeScript support for CSS module imports in the cnd-core library
 * 
 * @description
 * This module provides type safety for CSS module imports, ensuring that
 * class names are properly typed and available for tree-shaking optimization.
 * 
 * @example
 * ```tsx
 * import styles from './Component.module.css';
 * 
 * // TypeScript will know that styles has string properties
 * const className = styles.container; // string
 * ```
 */

/**
 * CSS Module interface for standard CSS module files
 * Provides read-only access to class name mappings
 */
interface CSSModule {
  readonly [key: string]: string;
}

/**
 * Type declaration for .module.css files
 * Enables importing CSS modules with full TypeScript support
 */
declare module '*.module.css' {
  const styles: CSSModule;
  export default styles;
}