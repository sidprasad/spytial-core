# spytial-core

A tree-shakable TypeScript implementation of `spytial`, usable for language integration.
- **Client-side only**: No Node.js dependencies and tree-shakable.
- **Custom Elements** for easy embedding in web apps
- **Constraint Inference**: Automatically infer spatial layout constraints from user interactions


---

## Features

### Constraint Inference System

The library includes a powerful constraint inference system that can automatically detect spatial relationships from user interactions:

- **8 spatial primitives**: leftOf, above, aligned_v/h, ordered_v/h, cyclic, group
- **5 UI action types**: drag, alignButton, distributeButton, ringGesture, multiSelect
- **Stability tracking**: Identifies reliable constraints that persist across interactions
- **Configurable thresholds**: Customize epsilon tolerance, minimum support, and ring detection

See [Constraint Inference Documentation](docs/constraint-inference.md) for detailed usage and API reference.

---

## Installation

```bash
npm install spytial-core
```

- [View on npm](https://www.npmjs.com/package/spytial-core)

---

## CDN

You can use the browser bundle directly from a CDN:

- **jsDelivr:**  
  [`https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js`](https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js)
- **unpkg:**  
  [`https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js`](https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js)

---

## Quick Start

### Basic Constraint Inference

```typescript
import { ConstraintInference } from 'spytial-core/layout';

const inference = new ConstraintInference({
  epsilon: 5,
  minSupport: 2
});

// Record user interaction
inference.addAction(
  { type: 'drag', timestamp: Date.now(), atomIds: ['A', 'B'] },
  { 
    timestamp: Date.now(), 
    positions: new Map([
      ['A', { x: 100, y: 100 }],
      ['B', { x: 200, y: 100 }]
    ])
  }
);

// Get inferred constraints
const stableFacts = inference.getStableFacts();
console.log(stableFacts);
// [{ type: 'leftOf', atomIds: ['A', 'B'], support: Set(1), ... }]
```

See [examples](docs/examples/) for more detailed usage.


## License

MIT

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---
