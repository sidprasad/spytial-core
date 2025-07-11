# Hide Atom Directive

The `hideAtom` directive provides a flexible, selector-based approach to hiding atoms in your graph layout, replacing the legacy `hideDisconnected` and `hideDisconnectedBuiltIns` flags from Sterling.

## Basic Usage

```yaml
directives:
  - hideAtom:
      selector: TypeName  # Hide all atoms of type 'TypeName'
```

## Examples

### Hide by Type
```yaml
directives:
  - hideAtom:
      selector: Int  # Hide all integer atoms
  - hideAtom:
      selector: String  # Hide all string atoms
```

### Hide Specific Atoms
```yaml
directives:
  - hideAtom:
      selector: Atom1 + Atom2  # Hide specific atoms by name
```

### Complex Selectors
```yaml
directives:
  - hideAtom:
      selector: BuiltinType  # Hide all builtin type atoms
```

### Multiple Directives
You can use multiple `hideAtom` directives together:

```yaml
directives:
  - hideAtom:
      selector: Int
  - hideAtom:
      selector: String
  - hideAtom:
      selector: Boolean
```

## Migration from Legacy Flags

### Before (Legacy)
```yaml
directives:
  - flag: hideDisconnected
  - flag: hideDisconnectedBuiltIns
```

### After (New)
```yaml
directives:
  # More flexible - hide specific types instead of all disconnected
  - hideAtom:
      selector: univ  # Hide builtin 'univ' type atoms
  # Or hide disconnected atoms using appropriate selector syntax
  # (exact syntax depends on your evaluator's capabilities)
```

## Backwards Compatibility

Legacy flags are still supported for backwards compatibility:

```yaml
directives:
  # New approach (recommended)
  - hideAtom:
      selector: SomeType
      
  # Legacy approach (still works)
  - flag: hideDisconnectedBuiltIns
```

The new `hideAtom` directives work alongside legacy flags, giving you the best of both worlds during migration.

## Advantages

1. **Flexibility**: Hide atoms based on any selector expression, not just disconnected status
2. **Precision**: Target specific types or atoms instead of broad categories
3. **Composability**: Use multiple `hideAtom` directives for fine-grained control
4. **Expressiveness**: Leverage the full power of selector syntax
5. **Future-proof**: Works with any selector syntax supported by your evaluator

## Error Handling

If a selector in a `hideAtom` directive fails to evaluate, the error is logged but the layout generation continues. This ensures that invalid selectors don't break the entire layout process.