# CnD Core TypeScript Library

CnD Core is a fully-typed, tree-shakable TypeScript implementation of "Cope and Drag" for client-side applications. It supports multiple languages (Alloy, Forge, DOT, Racket, Pyret) with pluggable evaluators and layouts for extensibility.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap, Build, and Test the Repository
- `npm install` -- takes 2 minutes. NEVER CANCEL. Set timeout to 180+ seconds.
- `npm run build:all` -- takes 25 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
  - This runs both `npm run build:browser` and `npm run build:components`
  - Browser build takes ~14 seconds and creates `dist/browser/cnd-core-complete.global.js` (5.92MB)
  - Components build takes ~11 seconds and creates demo components in `dist/components/`
- `npm run test:run` -- takes 37 seconds. Some tests fail but this is expected. NEVER CANCEL. Set timeout to 60+ seconds.

### Run the Application
- ALWAYS run the build steps first before serving
- `npm run serve` -- starts Python HTTP server on port 8080
- Demo URLs (after serving):
  - **Integrated Demo**: http://localhost:8080/webcola-demo/webcola-integrated-demo.html
  - **DOT Demo**: http://localhost:8080/webcola-demo/webcola-dot-demo.html  
  - **Combined Input**: http://localhost:8080/webcola-demo/combined-input-demo.html
  - **Pyret REPL**: http://localhost:8080/webcola-demo/webcola-pyret-repl-demo.html

### Development Commands
- `npm run typecheck` -- takes 8 seconds. Currently FAILS with 41 TypeScript errors but builds still work. This is expected.
- `npm run lint` -- takes 5 seconds. Currently FAILS with 294 linting problems but builds still work. This is expected.
- `npm run format` -- formats code with Prettier
- `npm run clean` -- removes dist folder

## Validation

- **NEVER skip build validation** - Always run `npm run build:all` after making changes to ensure builds succeed
- **Manual testing required** - Always test at least one demo after building:
  1. Run `npm run build:all` 
  2. Run `npm run serve`
  3. Open http://localhost:8080/webcola-integrated-demo.html
  4. Verify the interface loads and you can interact with the demo
- **TypeScript and linting failures are expected** - The codebase currently has TypeScript errors and linting issues but builds and runs successfully. Do NOT attempt to fix these unless specifically asked.
- Always test your changes in the browser demos to ensure functionality works correctly

## Build Timing Expectations

- **NEVER CANCEL any build or test command** - All commands may take significant time
- `npm install`: 2 minutes (set timeout to 180+ seconds)
- `npm run build:all`: 25 seconds (set timeout to 60+ seconds)  
- `npm run test:run`: 37 seconds (set timeout to 60+ seconds)
- `npm run typecheck`: 8 seconds (set timeout to 30+ seconds)
- `npm run lint`: 5 seconds (set timeout to 30+ seconds)

## Project Structure

### Key Directories
- `src/` - Main TypeScript source code
  - `src/components/` - React components (REPL, InstanceBuilder, layout interfaces)
  - `src/data-instance/` - Data instance implementations (Alloy, DOT, Racket, Pyret, etc.)
  - `src/evaluators/` - Query evaluators (Forge, Simple Graph Query)
  - `src/layout/` - Layout specification and generation
  - `src/translators/` - Output translators (WebCola, etc.)
- `webcola-demo/` - Demo HTML files and React component exports
- `tests/` - Vitest test files
- `dist/` - Build outputs (browser bundle, components)

### Key Files
- `package.json` - Project configuration and npm scripts
- `tsconfig.json` - TypeScript configuration (target: ES2021, strict mode)
- `vitest.config.ts` - Test configuration (jsdom environment, React support)
- `tsup.config.ts` - Main build configuration
- `tsup.browser.config.ts` - Browser bundle configuration (IIFE format, global: CndCore)
- `tsup.components.config.ts` - Demo components build configuration
- `eslint.config.js` - ESLint configuration (currently has 294 issues)
- `.prettierrc` - Code formatting rules

## Build Outputs

The build creates multiple outputs:
- **Browser Bundle**: `dist/browser/cnd-core-complete.global.js` - Complete library as IIFE with global `CndCore`
- **Components**: `dist/components/*.global.js` - Demo components for HTML integration  
- **Standard NPM**: `dist/index.js` - Standard ESM/CJS exports for npm consumption

## Common Development Tasks

### Adding New Features
1. Make changes in `src/`
2. Run `npm run build:all` to verify builds succeed
3. Test in browser demos at http://localhost:8080 after `npm run serve`
4. Run `npm run test:run` to verify tests still pass (some failures expected)

### Working with Components
- React components are in `src/components/`
- Key components: `ReplInterface`, `InstanceBuilder`, `CndLayoutInterface`, `CombinedInput`
- Components export both as TypeScript modules and browser-ready bundles

### Working with Data Instances
- All data instance types implement `IInputDataInstance` interface
- Located in `src/data-instance/` with subdirectories for each format
- Key types: `AlloyDataInstance`, `DotDataInstance`, `RacketGDataInstance`, `PyretDataInstance`

## Dependencies and Environment

- **Node.js**: Version 16+ required
- **Package Manager**: npm (package-lock.json committed)
- **Runtime Target**: Modern browsers (ES2020+), client-side only
- **Key Dependencies**: React, TypeScript, vitest, tsup, webcola, d3, graphlib
- **Build Tool**: tsup for multiple output formats
- **Test Framework**: vitest with jsdom environment

## Current Known Issues

- **TypeScript errors**: 41 errors in 15 files (builds still succeed)
- **ESLint errors**: 294 problems (builds still succeed)  
- **Test failures**: Some component tests fail (core functionality tests pass)
- These issues do NOT prevent the library from building and running correctly

## Validation Scenarios

After making changes, always validate:
1. **Build succeeds**: `npm run build:all` completes without errors
2. **Demo works**: Open integrated demo and verify basic interaction
3. **Tests run**: `npm run test:run` executes (some failures expected)
4. **Manual testing**: Create a simple data instance and render it in a demo

Do NOT attempt to fix existing TypeScript, linting, or test failures unless specifically requested - focus on ensuring your changes work correctly within the existing codebase.