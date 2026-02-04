import React, { useState, useEffect } from 'react';
import { ErrorMessageModal } from './ErrorMessageModal';
import { ErrorStateManager, type SystemError } from './ErrorStateManager';

/**
 * Props for the ErrorMessageContainer component
 */
export interface ErrorMessageContainerProps {
  /** Error state manager instance */
  errorManager: ErrorStateManager;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Container component that manages error message display
 * Handles both simple parse errors and complex constraint conflicts
 */
export const ErrorMessageContainer: React.FC<ErrorMessageContainerProps> = ({
  errorManager,
  className = ''
}) => {
  const [currentError, setCurrentError] = useState<SystemError | null>(
    errorManager.getCurrentError()
  );

  useEffect(() => {
    // Subscribe to error state changes
    const handleErrorChange = (error: SystemError | null) => {
      console.log('ErrorMessageContainer received error change:', error);
      setCurrentError(error);
    };
    errorManager.onErrorChange(handleErrorChange);
    console.log('ErrorMessageContainer subscribed to error changes');
  }, [errorManager]);

  console.log('ErrorMessageContainer rendering, currentError:', currentError);

  // Don't render anything if no error
  if (!currentError) {
    return null;
  }

  const containerClassName = `error-message-container ${className}`.trim();
  
  return (
    <div className={containerClassName}>
      <ErrorMessageModal 
        systemError={currentError}
      />
    </div>
  );
};

export default ErrorMessageContainer;