# spytial-core

A tree-shakable TypeScript implementation of `spytial`, usable for language integration.
- **Client-side only**: No Node.js dependencies and tree-shakable.
- **Custom Elements** for easy embedding in web apps
- **Accessible by Design**: Full support for screen readers, keyboard navigation, and alternative text descriptions

---

## Features

### 🎯 Core Capabilities
- Constraint-based graph layout using WebCola
- Support for Alloy, DOT, Racket, and Pyret data formats
- Declarative layout specifications
- React components for easy integration

### ♿ Accessibility Features
- **Screen Reader Support**: Full ARIA labels and live regions
- **Keyboard Navigation**: Navigate graphs using arrow keys
- **Alternative Text**: Comprehensive text descriptions of graph structure
- **Multi-modal Output**: Compatible with sonification and haptic feedback tools

Learn more in the [Accessibility Documentation](src/components/AccessibleGraph/README.md).

---

## Installation

```bash
npm install spytial-core
```

- [View on npm](https://www.npmjs.com/package/spytial-core)

---

## Quick Start

### Using the AccessibleGraph Component

```tsx
import { AccessibleGraph } from 'spytial-core';

function MyApp() {
  return (
    <AccessibleGraph
      width={800}
      height={600}
      ariaLabel="Network visualization"
      ariaDescription="A graph showing connections between users"
    />
  );
}
```

### Using the Custom Element

```html
<webcola-cnd-graph 
  id="my-graph"
  width="800" 
  height="600"
  aria-label="Interactive graph visualization">
</webcola-cnd-graph>

<script src="https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js"></script>
```

---

## CDN

You can use the browser bundle directly from a CDN:

- **jsDelivr:**  
  [`https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js`](https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js)
- **unpkg:**  
  [`https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js`](https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js)

---

## Documentation

- [Accessibility Guide](src/components/AccessibleGraph/README.md) - Screen readers, keyboard navigation
- [Data Navigator Integration](docs/DATA_NAVIGATOR_INTEGRATION.md) - Sonification and haptic feedback
- [Demo Pages](webcola-demo/) - Interactive examples

---

## Demos

Try the accessible graph demo:
```bash
npm install
npm run serve
# Open http://localhost:8080/webcola-demo/accessible-graph-demo.html
```

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Accessibility Guidelines

When contributing, please ensure:
- All visual content has text alternatives
- Keyboard navigation works for all features
- ARIA labels are meaningful and contextual
- Changes are tested with screen readers

---
