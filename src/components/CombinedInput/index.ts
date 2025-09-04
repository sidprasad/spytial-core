/**
 * Combined Input Component Module
 * 
 * Export the CombinedInputComponent and related interfaces
 */

export { CombinedInputComponent, default } from './CombinedInputComponent';
export type { 
  CombinedInputConfig, 
  CombinedInputProps 
} from './CombinedInputComponent';

// Export multi-language component
export { MultiLanguageCombinedInputComponent } from './MultiLanguageCombinedInputComponent';
export type { 
  MultiLanguageCombinedInputConfig, 
  MultiLanguageCombinedInputProps, 
  SupportedLanguage 
} from './MultiLanguageCombinedInputComponent';

// Export mounting function for easy integration
export { mountCombinedInput } from './mounting';
export type { CombinedInputMountConfig } from './mounting';