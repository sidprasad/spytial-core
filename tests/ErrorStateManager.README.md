# ErrorStateManager Test Suite

This document summarizes the unit tests for the `ErrorStateManager` class, which provides error state management functionality for the CnD Core library.

## Overview

The `ErrorStateManager` is a class that manages error states and notifies registered callbacks when errors change. It supports different types of system errors and provides a clean API for error handling across the application.

## Test Coverage

### `setError` Method Tests

**Purpose**: Validates that the `setError` method correctly updates the current error state and notifies all registered callbacks.

**Tests**:
- ✅ Should set currentError with a SystemError object
- ✅ Should set currentError with null
- ✅ Should notify all error callbacks when setting an error
- ✅ Should notify all error callbacks when setting error to null
- ✅ Should handle different SystemError types (parse-error, positional-error, group-overlap-error, general-error)

**Why these tests matter**: These tests ensure that the error state is properly managed and that all components listening for error changes are notified correctly, regardless of the error type or null state.

### `clearError` Method Tests

**Purpose**: Validates that the `clearError` method resets the error state to null and notifies callbacks.

**Tests**:
- ✅ Should set currentError to null
- ✅ Should notify all error callbacks 
- ✅ Should clear error even when currentError is already null

**Why these tests matter**: These tests ensure that error clearing is reliable and consistent, even in edge cases where the error is already cleared.

### `getCurrentError` Method Tests

**Purpose**: Validates that the `getCurrentError` method returns the correct current error state.

**Tests**:
- ✅ Should return currentError when an error is set
- ✅ Should return null when no error is set
- ✅ Should return null after clearing an error

**Why these tests matter**: These tests ensure that error state retrieval is accurate and reflects the current state of the manager.

### `onErrorChange` Method Tests

**Purpose**: Validates that the callback subscription mechanism works correctly.

**Tests**:
- ✅ Should add the given callback to errorCallbacks
- ✅ Should add multiple callbacks
- ✅ Should preserve order of callbacks

**Why these tests matter**: These tests ensure that the observer pattern is implemented correctly and that multiple components can reliably subscribe to error state changes.

### `hasError` Method Tests

**Purpose**: Validates the boolean error checking functionality.

**Tests**:
- ✅ Should return true if currentError is not null
- ✅ Should return false if currentError is null
- ✅ Should return false after clearing an error
- ✅ Should return true for all SystemError types

**Why these tests matter**: These tests ensure that the boolean error checking logic is correct for all scenarios and error types.

### `notifyCallbacks` Method Tests (Indirect Testing)

**Purpose**: Validates that the private notification system works correctly under different callback scenarios.

**Tests**:
- ✅ Should work when errorCallbacks is empty (no exceptions thrown)
- ✅ Should call callback when errorCallbacks has one element
- ✅ Should call each callback when errorCallbacks has multiple elements
- ✅ Should call callbacks with current error state for both setError and clearError
- ✅ Should handle callback exceptions by propagating them

**Why these tests matter**: Since `notifyCallbacks` is private, these tests verify its behavior indirectly through public methods. They ensure robust notification handling across different callback configurations.

## Testing Strategy

### Mock Functions
The tests use Vitest's `vi.fn()` to create mock callback functions, allowing us to verify:
- That callbacks are called with the correct arguments
- That callbacks are called the expected number of times
- The order in which callbacks are executed

### Type Safety
All tests use proper TypeScript types, ensuring that:
- SystemError union types are handled correctly
- Null handling is type-safe
- Callback signatures match expected types

### Edge Case Coverage
The tests cover important edge cases including:
- Setting errors when no callbacks are registered
- Clearing errors that are already null
- Multiple callback registrations
- Exception handling in callbacks

## Suggestions for Additional Tests

### Integration Tests
- **Error State Persistence**: Test that error state persists correctly across multiple operations
- **Memory Management**: Test that callbacks don't create memory leaks in long-running applications
- **Concurrent Operations**: Test behavior when multiple operations occur rapidly

### Error Type-Specific Tests  
- **ErrorMessages Structure**: Add more detailed tests for the `positional-error` type's messages structure
- **Source Field Validation**: Test that optional `source` fields are handled correctly across all error types
- **Error Message Formatting**: Test that error messages are properly formatted for display

### Performance Tests
- **Large Callback Lists**: Test performance with many registered callbacks (100+)
- **Frequent Updates**: Test performance with rapid error state changes
- **Memory Usage**: Test that the callback array doesn't grow unbounded

### Callback Management Tests
- **Callback Removal**: Add support for and test callback unsubscription
- **Duplicate Callbacks**: Test behavior when the same callback is registered multiple times
- **Null Callbacks**: Test error handling for null/undefined callback registrations

### Error Transition Tests
- **Error Type Changes**: Test transitioning between different error types
- **Complex Error Sequences**: Test sequences of setError/clearError calls
- **State Consistency**: Test that state remains consistent during rapid changes

## Conclusion

The current test suite provides comprehensive coverage of the `ErrorStateManager`'s core functionality. The tests follow best practices for unit testing including:
- Clear test descriptions and organization
- Proper setup and teardown with `beforeEach`
- Isolated test cases that don't depend on each other
- Verification of both state changes and side effects (callbacks)
- Type safety and edge case coverage

The suggested additional tests would further strengthen the test suite by covering integration scenarios, performance characteristics, and extended functionality.