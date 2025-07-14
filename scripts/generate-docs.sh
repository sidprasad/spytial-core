#!/bin/bash

# Create a simple documentation site structure
mkdir -p docs/examples
mkdir -p docs/guides

echo "📚 Creating documentation site structure..."

# Create examples directory
cat > docs/examples/README.md << 'EOF'
# Examples

This directory contains practical examples of using cnd-core.

## Available Examples

- [Basic Usage](./basic-usage.md) - Getting started with data instances and layouts
- [Custom Evaluators](./custom-evaluators.md) - Creating custom evaluators for your data
- [Layout Configuration](./layout-configuration.md) - Configuring layouts and styling
- [WebCola Integration](./webcola-integration.md) - Using WebCola for advanced layouts

EOF

# Create guides directory
cat > docs/guides/README.md << 'EOF'
# Guides

This directory contains in-depth guides for using cnd-core effectively.

## Available Guides

- [Architecture Overview](./architecture.md) - Understanding the library structure
- [Data Format Support](./data-formats.md) - Working with different data formats
- [Customization](./customization.md) - Extending and customizing the library
- [Performance Considerations](./performance.md) - Optimizing for large datasets

EOF

# Generate documentation
echo "🔄 Generating API documentation..."
npm run docs

echo "✅ Documentation structure created successfully!"

# Serve the documentation if requested
if [ "$1" = "--serve" ]; then
    echo "🌐 Starting documentation server at http://localhost:8081"
    cd docs && python3 -m http.server 8081
fi