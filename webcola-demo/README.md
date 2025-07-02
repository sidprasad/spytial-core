# CND WebCola Demo

This directory contains all files needed to run the WebCola Cope-and-Drag demo, plus documentation and examples for CND core components.

## Demos Available

### 🚀 **Integrated Demo** (Recommended)
- **File**: `webcola-integrated-demo.html`
- **Features**: Complete workflow with InstanceBuilder + CndLayoutInterface + WebCola visualization
- **Use Case**: Build data instances visually, configure layouts, and render graphs

### 📝 **DOT Demo** 
- **File**: `webcola-dot-demo.html` 
- **Features**: DOT specification input → Layout → WebCola rendering
- **Use Case**: Traditional DOT-based graph creation

### 🏗️ **InstanceBuilder Demo**
- **File**: `instance-builder-demo.html`
- **Features**: Standalone InstanceBuilder component documentation
- **Use Case**: Understanding the InstanceBuilder API

## How to Run

1. Bundle the React components.
```shell
npm run build:all
```
2. Serve the browser
```shell
npm run serve
```
3. Open demos:
   - **Integrated Demo**: http://localhost:8080/webcola-integrated-demo.html
   - **DOT Demo**: http://localhost:8080/webcola-dot-demo.html
   - **InstanceBuilder**: http://localhost:8080/instance-builder-demo.html

## Components

### `CndLayoutInterface`

A React component that provides a toggle interface between Code View and No Code View for editing CND layout specifications.

#### Integration with HTML Demo

The component is designed to integrate with the existing `webcola-demo.html`. The `getCurrentCNDSpec()` function will expose the current CND spec as a YAML.

### `InstanceBuilder`

A reusable React component for constructing IDataInstance objects. See [INSTANCE_BUILDER.md](./INSTANCE_BUILDER.md) for detailed documentation and usage examples.

- **File**: `instance-builder-example.tsx` - Complete usage examples
- **Documentation**: `INSTANCE_BUILDER.md` - Component API and architecture
