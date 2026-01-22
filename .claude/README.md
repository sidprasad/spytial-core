# Claude Skills for CnD-Core

This directory contains documentation optimized for LLM consumption to help AI assistants work effectively with the CnD (Constraint and Directive) layout system.

## Quick Start for LLMs

When working with this codebase:

1. **Read** [architecture.md](./architecture.md) to understand the system structure
2. **Reference** [constraint-syntax.md](./constraint-syntax.md) for constraint writing
3. **Check** [common-patterns.md](./common-patterns.md) for typical use cases
4. **Use** [api-reference.md](./api-reference.md) for specific API calls
5. **Debug** with [troubleshooting.md](./troubleshooting.md) when issues arise

## File Overview

- **architecture.md** - System architecture, pipeline, and data flow
- **constraint-syntax.md** - Complete constraint language reference with examples
- **directive-syntax.md** - Visual styling directives reference
- **common-patterns.md** - Frequently used patterns and recipes
- **api-reference.md** - TypeScript API for programmatic usage
- **troubleshooting.md** - Common errors and how to fix them
- **examples.md** - Real-world examples with explanations

## Key Concepts

### The Pipeline
```
Data Instance → Selector Evaluation → Constraint Generation → Layout Validation → Visual Rendering
```

### Constraint Types
1. **Orientation** - Spatial relationships (left, above, below, right)
2. **Alignment** - Nodes sharing same x or y coordinate
3. **Grouping** - Nodes contained within boundaries
4. **Cyclic** - Circular arrangements

### Error Handling
The system provides structured errors with:
- **PositionalConstraintError** - Unsatisfiable constraint conflicts
- **GroupOverlapError** - Groups with conflicting membership
- **Minimal conflicting set** - Smallest set of constraints causing conflict

## When to Use This System

✅ **Good for:**
- Graph layouts with spatial constraints
- Diagrams with alignment requirements
- Hierarchical visualizations with grouping
- Interactive model viewers

❌ **Not suitable for:**
- Free-form drawings
- Pixel-perfect positioning
- Real-time animations
- Non-graph visualizations
