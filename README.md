# cnd-core

A TypeScript library for client-side applications.

## Installation

```bash
npm install cnd-core
```

## Usage

### Basic Usage

```typescript
import { CndCore, createCndCore } from 'cnd-core';

// Create an instance
const core = new CndCore({
  debug: true,
  version: '1.0.0'
});

// Initialize
core.init();

// Or use the factory function
const core2 = createCndCore({ debug: false });
```

### Sub-module Usage

The library provides specialized sub-modules that can be imported individually for better tree-shaking:

#### Alloy Graph Module

```typescript
// Import the entire sub-module
import * as AlloyGraph from 'cnd-core/alloy-graph';

// Or import specific functionality
import { AlloyGraph, createAlloyGraph } from 'cnd-core/alloy-graph';

const graph = createAlloyGraph({ directed: true });
graph.addNode({ id: 'node1', label: 'First Node' });
graph.addNode({ id: 'node2', label: 'Second Node' });
graph.addEdge({ id: 'edge1', source: 'node1', target: 'node2' });
```

#### Alloy Instance Module

```typescript
// Import the entire sub-module
import * as AlloyInstance from 'cnd-core/alloy-instance';

// Or import specific functionality
import { CndAlloyInstance, createCndAlloyInstance } from 'cnd-core/alloy-instance';

const instance = createCndAlloyInstance({ validateTuples: true });
instance.addSignature({
  name: 'Person',
  atoms: [{ id: 'Person1', signature: 'Person' }]
});
```

### Tree-shaking Benefits

When you import only what you need, bundlers can eliminate unused code:

```typescript
// Only imports graph functionality
import { createAlloyGraph } from 'cnd-core/alloy-graph';

// Only imports instance functionality  
import { createCndAlloyInstance } from 'cnd-core/alloy-instance';
```

### Configuration

```typescript
import { CndCore, CoreConfig } from 'cnd-core';

const config: CoreConfig = {
  debug: true,
  version: '1.0.0'
};

const core = new CndCore(config);

// Update configuration
core.updateConfig({ debug: false });

// Get current configuration
const currentConfig = core.getConfig();
```

## API Reference

### `CndCore`

The main class for the library.

#### Constructor

```typescript
new CndCore(config?: CoreConfig)
```

#### Methods

- `init(): void` - Initialize the core library
- `getConfig(): CoreConfig` - Get the current configuration
- `updateConfig(newConfig: Partial<CoreConfig>): void` - Update the configuration

### `createCndCore`

Factory function to create a CndCore instance.

```typescript
createCndCore(config?: CoreConfig): CndCore
```

### `CoreConfig`

Configuration interface for the library.

```typescript
interface CoreConfig {
  debug?: boolean;
  version?: string;
}
```

## Development

### Prerequisites

- Node.js >= 16
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Development mode (watch)
npm run dev
```

### Scripts

- `npm run build` - Build the library for production
- `npm run dev` - Build in watch mode for development
- `npm test` - Run tests
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:run` - Run tests once
- `npm run lint` - Lint the code
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Type check without emitting
- `npm run clean` - Clean build directory

## Publishing

```bash
npm run prepublishOnly
npm publish
```

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


### TODO:

- ERROR handling
- Other backends (SMTLIB, DOT, PYRET, ...)
- What about other ...