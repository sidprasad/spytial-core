# RelationHighlighter Component Tests

This document provides a comprehensive summary of the test suite for the RelationHighlighter component, including the purpose behind each test and suggestions for additional testing.

## Test Coverage Summary

The test suite includes **24 tests** organized into **8 categories** that comprehensively validate the RelationHighlighter component specification.

## Test Categories and Purpose

### 1. Initial Rendering (3 tests)
**Purpose:** Validates basic component rendering and default state behavior.

- **renders with default collapsed state:** Ensures the component renders with proper structure, shows collapsed state by default, displays relations count, and shows "No relations available" message.
- **shows relations count in header:** Verifies the relations count is properly displayed in the header.
- **has proper ARIA labels for accessibility:** Confirms accessibility attributes are correctly set for screen readers.

### 2. Graph Element Integration (3 tests)
**Purpose:** Tests the component's ability to find and interact with the webcola-cnd-graph element.

- **successfully finds and references graph element:** Validates that `document.getElementById` is called correctly and event listeners are attached.
- **handles missing graph element gracefully:** Ensures the component gracefully handles missing graph elements with appropriate console warnings and no crashes.
- **does not attach event listener when graph element is missing:** Confirms no event listeners are attached when the target element doesn't exist.

### 3. Event Listener Management (4 tests)
**Purpose:** Verifies proper lifecycle management of event listeners.

- **attaches relations-available event listener on mount:** Ensures event listener is properly attached during component mount.
- **removes event listener on unmount:** Validates cleanup behavior when component unmounts.
- **handles cleanup when graph element is missing:** Tests cleanup behavior when no graph element exists.
- **reattaches event listener when graphElementId changes:** Verifies event listeners are properly managed when the prop changes.

### 4. Relations State Management (3 tests)
**Purpose:** Tests how the component handles relations-available events and state updates.

- **updates relations state when relations-available event is fired:** Validates that custom events properly update the component's internal state.
- **handles empty relations array:** Tests behavior with empty relations data.
- **handles relations-available event with undefined relations:** Ensures graceful handling of undefined relations data.

### 5. Collapsible Container Functionality (2 tests)
**Purpose:** Tests the expand/collapse behavior of the relations container.

- **toggles collapsed state when header is clicked:** Validates click behavior and proper ARIA label updates.
- **shows relations list when expanded and has relations:** Ensures relations are properly displayed when the container is expanded.

### 6. Mouse Hover Highlighting Behavior (3 tests)
**Purpose:** Tests the core highlighting functionality when hovering over relation items.

- **calls highlightRelation when hovering over relation item:** Validates that hover events call the correct graph element methods with proper positioning calculations.
- **calls clearHighlightRelation when mouse leaves relation item:** Ensures highlighting is cleared when mouse leaves.
- **handles hover positioning calculations correctly:** Tests complex positioning logic to prevent highlighting when hovering over scrollbars.

### 7. Graph Element Without Methods (1 test)
**Purpose:** Tests behavior when the graph element lacks required methods.

- **does not highlight when graph element methods are not available:** Ensures the component doesn't crash when graph element methods are missing.

### 8. Long Relation Names and Styling (2 tests)
**Purpose:** Validates styling requirements and handling of long relation names.

- **handles very long relation names:** Tests that extremely long relation names are properly handled and displayed.
- **applies correct CSS classes for styling:** Verifies that proper CSS classes are applied for styling, including horizontal overflow behavior.

### 9. Edge Cases and Error Handling (3 tests)
**Purpose:** Tests resilience against malformed data and error conditions.

- **handles malformed relations-available event:** Documents current behavior when receiving malformed event data.
- **handles highlight and clear methods that return false:** Tests behavior when graph element methods return false (indicating failure).
- **handles missing parent list in hover calculations:** Ensures no crashes when DOM structure is unexpected.

## Key Testing Patterns Used

1. **Mock DOM Elements:** Custom mock webcola-cnd-graph element with all required methods
2. **Event Simulation:** Testing custom event handling and DOM event interactions
3. **State Management Testing:** Verifying React state updates from external events
4. **Positioning Calculations:** Complex testing of mouse position relative to content areas
5. **Lifecycle Testing:** Mount/unmount behavior and cleanup
6. **Error Boundary Testing:** Graceful handling of missing elements and malformed data

## Component Specification Coverage

✅ **Input:** Tests accept and properly use the `webcola-cnd-graph` HTML element ID  
✅ **HTML:** Validates collapsible container with unordered list, collapsed by default  
✅ **Missing Element:** Confirms nothing breaks when graph container isn't found  
✅ **Styling:** Tests horizontal overflow behavior for long relation names  
✅ **useRef Hook:** Validates proper element reference management  
✅ **Event Listeners:** Tests 'relations-available' event listener attachment/cleanup  
✅ **State Updates:** Verifies relation list updates from events  
✅ **Hover Highlighting:** Tests mouse enter/leave highlighting behavior  
✅ **Graph Integration:** Validates calls to graph element highlight methods  

## Additional Test Suggestions

While the current test suite is comprehensive, here are additional tests that could further strengthen the coverage:

### Performance and Load Testing
- **Large relation lists:** Test performance with 100+ relations
- **Rapid hover events:** Test behavior with rapid mouse movements
- **Memory leak detection:** Verify no memory leaks during rapid mount/unmount cycles

### Advanced User Interactions
- **Keyboard navigation:** Test accessibility with Tab/Enter key navigation
- **Focus management:** Test focus states and ARIA live regions
- **Screen reader testing:** Automated testing with screen reader simulation

### Integration Testing
- **Real webcola-cnd-graph element:** Integration tests with actual graph component
- **Multiple instances:** Test multiple RelationHighlighter components on same page
- **Browser compatibility:** Cross-browser testing for positioning calculations

### Error Resilience
- **Network failures:** Test behavior when graph element becomes unavailable mid-session
- **DOM mutations:** Test resilience when graph element is modified externally
- **Concurrent events:** Test behavior with overlapping custom events

### Visual Regression Testing
- **Screenshot testing:** Visual regression tests for different states
- **CSS animation testing:** Test expand/collapse animations
- **Responsive design:** Test behavior across different screen sizes

### Accessibility Enhancement
- **Voice control testing:** Test with voice navigation tools
- **High contrast mode:** Test visibility in high contrast modes
- **Reduced motion:** Test with reduced motion preferences

## Running the Tests

```bash
# Run all RelationHighlighter tests
npm run test:run -- tests/RelationHighlighter.test.tsx

# Run tests in watch mode
npm run test -- tests/RelationHighlighter.test.tsx

# Run tests with UI
npm run test:ui
```

## Test Dependencies

The test suite uses:
- **Vitest** - Test runner
- **@testing-library/react** - React component testing utilities
- **@testing-library/user-event** - User interaction simulation
- **@testing-library/jest-dom** - DOM-specific matchers
- **jsdom** - DOM environment for Node.js

## Notes

- All tests pass successfully with comprehensive coverage
- Warning messages about `act()` wrapping are non-critical and common in React Testing Library
- Tests are designed to be independent and can run in any order
- Mock implementations closely mirror the actual webcola-cnd-graph element API