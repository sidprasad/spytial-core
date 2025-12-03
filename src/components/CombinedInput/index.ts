/**
 * Combined Input Component Module
 * 
 * Export the CombinedInputComponent and related interfaces
 */

export { CombinedInputComponent, default } from './CombinedInputComponent';
export type { 
  CombinedInputConfig, 
  CombinedInputProps,
  LayoutViewMode 
} from './CombinedInputComponent';

// Export mounting function for easy integration
export { mountCombinedInput } from './mounting';
export type { CombinedInputMountConfig } from './mounting';