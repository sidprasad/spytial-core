# Prominent Attributes

This document describes the prominent attributes feature that allows making specific attributes more visually prominent than the node label itself.

## Overview

By default, node attributes are rendered smaller than the main node label. The prominent attributes feature allows you to override this behavior for specific attributes, making them larger and more visually prominent than the label.

## Configuration

Add the `prominent: true` field to any attribute directive to make that attribute prominent:

```yaml
directives:
  - attribute:
      field: 'name'
      prominent: true  # This attribute will be rendered prominently
  - attribute:
      field: 'age'     # This attribute will be rendered normally
```

## Visual Appearance

### Regular Attributes
- Font size: 80% of main label size
- Font weight: Normal
- Color: Default text color

### Prominent Attributes  
- Font size: 130% of main label size (larger than the main label)
- Font weight: Bold
- Color: Default text color
- Rendered before regular attributes

## Usage with Selectors

Prominent attributes work seamlessly with the existing selector system:

```yaml
directives:
  # Make name prominent only for Person atoms
  - attribute:
      field: 'name'
      selector: 'Person'
      prominent: true
      
  # Make title prominent only for Company atoms
  - attribute:
      field: 'title'
      selector: 'Company' 
      prominent: true
      
  # Regular attribute for everyone
  - attribute:
      field: 'id'
```

## Example

Given this data:

```json
{
  "atoms": [
    { "id": "John", "type": "Person", "label": "Person" },
    { "id": "JohnDoe", "type": "String", "label": "John Doe" },
    { "id": "30", "type": "Number", "label": "30" }
  ],
  "relations": [
    {
      "name": "name",
      "tuples": [{ "atoms": ["John", "JohnDoe"] }]
    },
    {
      "name": "age", 
      "tuples": [{ "atoms": ["John", "30"] }]
    }
  ]
}
```

And this layout specification:

```yaml
directives:
  - attribute:
      field: 'name'
      prominent: true
  - attribute:
      field: 'age'
```

The resulting node will show:
- **"John Doe"** (large, bold - the prominent name attribute)
- "Person" (medium size - the original label)  
- "age: 30" (small - regular attribute)

## Use Cases

- **Person names**: Make the actual name more prominent than the generic "Person" label
- **Company titles**: Highlight company names in business process diagrams
- **Key identifiers**: Emphasize the most important identifying attribute
- **Primary labels**: When the attribute contains more useful information than the type

## Backward Compatibility

This feature is fully backward compatible:
- Existing attribute directives without `prominent: true` work exactly as before
- The `prominent` field is optional and defaults to `false`
- All existing layouts and configurations remain unchanged

## Implementation Notes

- Prominent attributes are processed before regular attributes during rendering
- The prominence is determined at the layout generation stage, not during rendering
- Font size calculations ensure text fits within node boundaries
- Multiple attributes can be marked as prominent on the same node