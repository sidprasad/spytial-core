# Migration Guide: cnd-core to spytial-core

## Overview

The package has been renamed from `cnd-core` to `spytial-core`. This guide will help you migrate your code to use the new package name.

## Why the Name Change?

The package is being renamed to better reflect its purpose and branding. The name "spytial-core" better represents the spatial computation and visualization capabilities of the library.

## Backward Compatibility

For existing users, we recommend migrating to `spytial-core` for future updates. The `cnd-core` package will remain available on npm at version 1.4.8, but new features and updates will be published under `spytial-core`.

## Migration Steps

### 1. Update Your package.json

Replace `cnd-core` with `spytial-core`:

```bash
npm uninstall cnd-core
npm install spytial-core
```

Or update your `package.json` directly:

```diff
{
  "dependencies": {
-   "cnd-core": "^1.4.8"
+   "spytial-core": "^1.4.8"
  }
}
```

### 2. Update Import Statements

The package name has changed, but the API remains the same. Update your imports:

```diff
- import { AlloyDataInstance, ForgeEvaluator } from 'cnd-core';
+ import { AlloyDataInstance, ForgeEvaluator } from 'spytial-core';
```

```diff
- import { RacketGDataInstance } from 'cnd-core/racket';
+ import { RacketGDataInstance } from 'spytial-core/racket';
```

### 3. Update CDN References

If you're using the CDN version, update your script tags:

**jsDelivr:**
```diff
- <script src="https://cdn.jsdelivr.net/npm/cnd-core/dist/browser/cnd-core-complete.global.js"></script>
+ <script src="https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js"></script>
```

**unpkg:**
```diff
- <script src="https://unpkg.com/cnd-core/dist/browser/cnd-core-complete.global.js"></script>
+ <script src="https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js"></script>
```

### 4. Update Component Imports

If you're using the React components:

```diff
- <script src="https://cdn.jsdelivr.net/npm/cnd-core/dist/components/react-component-integration.global.js"></script>
- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/cnd-core/dist/components/react-component-integration.css">
+ <script src="https://cdn.jsdelivr.net/npm/spytial-core/dist/components/react-component-integration.global.js"></script>
+ <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/spytial-core/dist/components/react-component-integration.css">
```

## What Stays the Same

- **Global Variable Name**: The global variable name remains `CndCore` when using the browser bundle
- **API**: All APIs, classes, functions, and types remain exactly the same
- **File Structure**: The internal file structure and exports remain unchanged
- **Functionality**: All features work exactly as before

## Example Migration

### Before (using cnd-core):

```typescript
import { 
  AlloyDataInstance, 
  ForgeEvaluator, 
  LayoutInstance, 
  parseAlloyXML, 
  parseLayoutSpec 
} from 'cnd-core';

const alloyDatum = parseAlloyXML(alloyXmlString);
const dataInstance = new AlloyDataInstance(alloyDatum.instances[0]);
const evaluator = new ForgeEvaluator();
const layoutSpec = parseLayoutSpec(layoutSpecString);
const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
```

### After (using spytial-core):

```typescript
import { 
  AlloyDataInstance, 
  ForgeEvaluator, 
  LayoutInstance, 
  parseAlloyXML, 
  parseLayoutSpec 
} from 'spytial-core';

const alloyDatum = parseAlloyXML(alloyXmlString);
const dataInstance = new AlloyDataInstance(alloyDatum.instances[0]);
const evaluator = new ForgeEvaluator();
const layoutSpec = parseLayoutSpec(layoutSpecString);
const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
```

**Note:** Only the import statement changed; all the code remains identical!

## Need Help?

If you encounter any issues during migration, please:

1. Check that you've updated all import statements
2. Verify your CDN URLs if using the browser bundle
3. Make sure you're using version 1.4.8 or later
4. Open an issue on [GitHub](https://github.com/sidprasad/cnd-core/issues)

## Timeline

- **Now**: Both `cnd-core` and `spytial-core` work at version 1.4.8
- **Future**: New versions will be published under `spytial-core` only
- **Recommendation**: Migrate to `spytial-core` as soon as convenient
