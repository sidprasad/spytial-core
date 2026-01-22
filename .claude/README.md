# Claude Skills for CnD-Core

This directory contains documentation optimized for LLM consumption to help AI assistants work effectively with the CnD (Constraint and Directive) layout system.

## Quick Start for LLMs

When working with this codebase:

1. **Integrate** [integration-guide.md](./integration-guide.md) - Extract your language's data (START HERE)
2. **Understand** [architecture.md](./architecture.md) - System structure and pipeline
3. **Write** [constraint-syntax.md](./constraint-syntax.md) - Define spatial constraints
4. **Style** [directive-syntax.md](./directive-syntax.md) - Apply visual directives
5. **Reference** [api-reference.md](./api-reference.md) - TypeScript API details
6. **Pattern** [common-patterns.md](./common-patterns.md) - Use proven layouts
7. **Debug** [troubleshooting.md](./troubleshooting.md) - Fix errors

## File Overview

- **integration-guide.md** - **START HERE**: Extract your language data and integrate with pipeline
- **examples.md** - Complete working examples from simple to advanced
- **architecture.md** - System architecture, pipeline, and data flow
- **constraint-syntax.md** - Complete constraint language reference
- **directive-syntax.md** - Visual styling directives reference
- **common-patterns.md** - Frequently used layout patterns and recipes
- **api-reference.md** - TypeScript API for programmatic usage
- **troubleshooting.md** - Common errors and debugging guide

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
