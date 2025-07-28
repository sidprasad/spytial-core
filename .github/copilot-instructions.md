<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Copilot Instructions for cnd-core

## Project Overview
This is a TypeScript library designed to be published as an npm package for client-side applications. The library should be:
- Tree-shakable and optimized for modern bundlers
- Compatible with both CommonJS and ES modules
- Fully typed with TypeScript
- Well-tested and documented

## Code Style Guidelines
- Use TypeScript with strict type checking
- Follow functional programming principles where possible
- Write comprehensive JSDoc comments for all public APIs
- Prefer named exports over default exports for better tree-shaking
- Use descriptive variable and function names
- Keep functions small and focused on a single responsibility

## Build and Testing
- Use `tsup` for building multiple output formats (CJS, ESM)
- Use `vitest` for unit testing with jsdom environment
- Ensure all code is properly typed and passes TypeScript compiler checks
- Write tests for all public APIs and edge cases
- Aim for high test coverage

## Client-Side Considerations
- Avoid Node.js-specific APIs (fs, path, etc.)
- Keep bundle size minimal
- Ensure code works in modern browsers (ES2020+)
- Consider performance implications of all code
- Use modern JavaScript features appropriately

## Documentation
- Update README.md with clear usage examples
- Document all public APIs with JSDoc
- Include TypeScript examples in documentation
- Provide migration guides for breaking changes


## Demos
- Demos should go in the `webcola-demo` directory.