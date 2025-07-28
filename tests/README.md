# CnD Testing Framework

This directory contains comprehensive tests for the CnD (Constraints and Directives) React integration components. The testing strategy follows a three-tier approach: Unit Tests, Integration Tests, and System Tests.

## Testing Architecture

### Testing Framework
- **Vitest**: Primary testing framework with fast execution and TypeScript support
- **React Testing Library**: For React component testing with accessibility-first queries
- **jsdom**: Browser environment simulation for DOM manipulation testing
- **Conditional Setup**: React tests and legacy tests run in separate environments to avoid conflicts

### Test Structure

```
tests/
├── setup.ts                          # Conditional test environment setup
├── components/                       # React component tests
│   ├── CndLayoutInterface.test.tsx   # Unit tests for main component
│   └── CndLayoutInterfaceWrapper.test.tsx # Integration tests
├── system/                           # End-to-end system tests
│   └── CnDReactIntegration.test.tsx  # CDN integration and compatibility tests
└── legacy tests...                   # Existing non-React tests
```

## Test Categories

### 1. Unit Tests (`components/CndLayoutInterface.test.tsx`)

**Purpose**: Test individual React components in isolation

**Coverage**:
- Component rendering with different prop configurations
- State management through `CndLayoutStateManager` singleton
- Error state handling and display
- User interaction handling (view toggles, input changes)
- Configuration validation and edge cases

**Key Features**:
- Mocked dependencies for true isolation
- Comprehensive prop testing scenarios
- Error boundary and edge case handling
- State synchronization verification

### 2. Integration Tests (`components/CndLayoutInterfaceWrapper.test.tsx`)

**Purpose**: Test component interactions and CDN wrapper functionality

**Coverage**:
- Configuration initialization from CDN mounting
- State synchronization between React components and global state
- Legacy demo code compatibility
- View mode transitions and persistent state
- Error handling across component boundaries

**Key Features**:
- Mock state manager with realistic behavior
- Component lifecycle testing (mount/unmount)
- Configuration edge cases and validation
- Inter-component communication testing

### 3. System Tests (`system/CnDReactIntegration.test.tsx`)

**Purpose**: Test complete system integration including CDN, DataAPI, and legacy compatibility

**Coverage**:
- Global window function mounting and cleanup
- DataAPI integration (constraint/directive parsing, validation)
- Legacy demo code compatibility and coexistence
- Full component mounting lifecycle
- Performance and memory leak prevention
- Browser compatibility scenarios

**Key Features**:
- End-to-end CDN integration testing
- Legacy code compatibility validation
- System-wide error handling
- Performance regression prevention

## Testing Decisions and Rationale

### Mock Strategy
We use a **hybrid mocking approach**:
- **Unit Tests**: Heavy mocking for isolation
- **Integration Tests**: Selective mocking to test real interactions
- **System Tests**: Minimal mocking to test real system behavior

### State Management Testing
The `CndLayoutStateManager` singleton is thoroughly tested because:
- It's the central coordination point for React/legacy integration
- State persistence across component lifecycles is critical
- Error state management affects the entire system

### Legacy Compatibility Focus
Extensive legacy compatibility testing ensures:
- Existing demo code continues to work
- Gradual migration path from legacy to React components
- No breaking changes to existing CDN integration

### Conditional Setup Architecture
The `setup.ts` file uses conditional imports because:
- React Testing Library setup interferes with legacy tests
- Different test types need different DOM environments
- Maintains compatibility with existing test infrastructure

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only  
npm run test:integration

# System tests only
npm run test:system

# Legacy tests only
npm run test:legacy
```

### Test Development
```bash
# Watch mode for active development
npm run test:watch

# Coverage report
npm run test:coverage

# UI mode for interactive debugging
npm run test:ui
```

## Test Configuration

### Vitest Configuration (`vitest.config.ts`)
- **Environment**: jsdom for DOM manipulation testing
- **Setup Files**: Conditional setup for React vs legacy tests
- **Coverage**: Istanbul-based coverage with comprehensive reporting
- **TypeScript**: Full TypeScript support with path mapping

### Global Test Setup (`tests/setup.ts`)
- **Conditional Loading**: Only loads React Testing Library for React tests
- **Environment Detection**: Determines test type from file path/name
- **Cleanup Management**: Automatic cleanup after each test
- **Global Extensions**: jest-dom matchers for better assertions

## Common Testing Patterns

### Component Testing
```typescript
// Basic component rendering
render(<CndLayoutInterface />)
expect(screen.getByRole('main')).toBeInTheDocument()

// With configuration
const config = { initialYamlValue: 'test' }
render(<CndLayoutInterface config={config} />)
expect(screen.getByDisplayValue('test')).toBeInTheDocument()
```

### State Manager Testing
```typescript
// Singleton behavior
const manager1 = CndLayoutStateManager.getInstance()
const manager2 = CndLayoutStateManager.getInstance()
expect(manager1).toBe(manager2)

// State persistence
manager.setYamlValue('test')
expect(manager.getYamlValue()).toBe('test')
```

### Error State Testing
```typescript
// Error display
const errors = [{ type: 'parse-error', message: 'Invalid YAML' }]
render(<ErrorMessageModal errors={errors} />)
expect(screen.getByText('Invalid YAML')).toBeInTheDocument()
```

### User Interaction Testing
```typescript
// User input simulation
const user = userEvent.setup()
const input = screen.getByRole('textbox')
await user.type(input, 'new content')
expect(input).toHaveValue('new content')
```

## Coverage Goals

- **Unit Tests**: >90% line coverage for individual components
- **Integration Tests**: >80% coverage for component interactions
- **System Tests**: >70% coverage for full system scenarios
- **Overall**: >85% combined coverage across all test types

## Debugging Tests

### Common Issues
1. **Mock Setup**: Ensure mocks are cleared between tests
2. **Async Behavior**: Use `waitFor` for state updates
3. **DOM Cleanup**: Tests should clean up DOM state
4. **Global State**: Reset singletons between tests

### Debug Commands
```bash
# Run specific test with debug output
npm test -- --reporter=verbose ComponentName

# Run with browser dev tools
npm run test:debug

# Generate coverage with uncovered lines
npm run test:coverage -- --reporter=html
```

## Continuous Integration

Tests are designed to run reliably in CI environments:
- **Deterministic**: No reliance on timing or external services
- **Fast**: Unit tests complete in <1s, integration in <5s
- **Isolated**: No test interdependencies
- **Comprehensive**: Covers happy path and edge cases

## Future Enhancements

1. **Visual Regression Tests**: Screenshot comparison for UI components
2. **Performance Tests**: Memory usage and rendering speed benchmarks
3. **Accessibility Tests**: Extended a11y testing with axe-core
4. **Cross-Browser Tests**: Automated testing in multiple browsers
5. **Property-Based Tests**: Generative testing for edge case discovery

## Troubleshooting

### TypeScript Errors
- Ensure all test files import proper types
- Check mock definitions match actual interfaces
- Verify tsconfig includes test files

### React Testing Library Issues
- Use `screen.debug()` to inspect rendered DOM
- Check component is rendered before queries
- Use `findBy*` for async elements

### Mock Problems
- Clear mocks in `beforeEach` hooks
- Verify mock implementations match expected behavior
- Check mock call order and arguments

---

This testing framework ensures the CnD React integration is robust, maintainable, and compatible with existing systems while providing confidence for future development.
