import { useState, useEffect } from "react";

/**
 * Custom hook for handling highlight animation timing
 * Automatically manages highlight state with configurable duration
 * 
 * @param duration - How long to show highlight in milliseconds
 * @returns Object with isHighlighted boolean state
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const { isHighlighted } = useHighlight(1000);
 *   
 *   return (
 *     <div className={isHighlighted ? 'highlight' : ''}>
 *       Content here
 *     </div>
 *   );
 * };
 * ```
 * 
 * @public
 */
export const useHighlight = (duration: number = 1000) => {
  const [isHighlighted, setIsHighlighted] = useState(true);

  useEffect(() => {
    // Automatically clear highlight after specified duration
    const timer = setTimeout(() => {
      setIsHighlighted(false);
    }, duration);

    // Cleanup timer on unmount (client-side optimization)
    return () => clearTimeout(timer);
  }, [duration]);

  return { isHighlighted };
};