# CND Layout Interface Components

This directory contains React components for the CND (Constraint and Directive) layout specification interface.

## How to Run

1. Bundle the React components.
```shell
npm run build:all
```
2. Serve the browser
```shell
npm run serve
```
3. Open http://localhost:8080/webcola-demo.html

## Components

### `CndLayoutInterface`

A React component that provides a toggle interface between Code View and No Code View for editing CND layout specifications.

#### Features

- **Code View**: Direct YAML text editing with syntax highlighting
- **No Code View**: Visual interface for constraint and directive editing (placeholder)
- **iOS-style Toggle Switch**: Smooth transition between views
- **Controlled Component**: Requires parent state management for predictable behavior
- **Bootstrap Integration**: Uses Bootstrap classes for consistent styling
- **CSS Modules**: Scoped custom styles for component-specific elements
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Responsive Design**: Mobile-friendly layout

#### Usage

```tsx
import { CndLayoutInterface } from 'cnd-core/components';

function App() {
  const [yamlValue, setYamlValue] = useState('');
  const [isNoCodeView, setIsNoCodeView] = useState(false);

  return (
    <CndLayoutInterface
      value={yamlValue}
      onChange={setYamlValue}
      isNoCodeView={isNoCodeView}
      onViewChange={setIsNoCodeView}
    />
  );
}
```

#### Integration with HTML Demo

The component is designed to integrate with the existing `webcola-demo.html`:

1. **Replaces the commented-out textarea**: The Code View provides the same functionality as the original `#webcola-cnd` textarea
2. **Maintains compatibility**: The `getCurrentCNDSpec()` function will work with the component's textarea via the `id="webcola-cnd"` attribute
3. **Bootstrap compatibility**: Uses Bootstrap classes for consistent styling with the demo page

#### Props

- `value: string` - Current YAML value (required)
- `onChange: (value: string) => void` - YAML change callback (required)
- `isNoCodeView: boolean` - Current view mode (required)
- `onViewChange: (isNoCodeView: boolean) => void` - View mode change callback (required)
- `className?: string` - Additional CSS class
- `disabled?: boolean` - Whether the component is disabled
- `aria-label?: string` - ARIA label for accessibility

## Styling

The component uses a hybrid approach:

- **Bootstrap CSS**: Loaded via CDN for the demo page, provides utility classes
- **CSS Modules**: Component-specific styles in `CndLayoutInterface.module.css`

### Custom Styles Include:

- iOS-style toggle switch with smooth transitions
- Code editor styling with monospace font
- Visual placeholder for No Code View
- Responsive design breakpoints
- Focus states and accessibility indicators

## Future Integration

The No Code View is currently a placeholder that will integrate with the existing `NoCodeView` custom element:

```tsx
// Future implementation
{currentIsNoCodeView ? (
  <div className={styles.noCodeView}>
    <no-code-view
      value={currentValue}
      onChange={handleValueChange}
    />
  </div>
) : (
  // Current Code View implementation
)}
```

## Development Notes

- Component follows React best practices for controlled components
- TypeScript interfaces provide full type safety
- CSS Modules prevent style conflicts with Bootstrap
- Accessibility features include ARIA labels and keyboard navigation
- Responsive design works on mobile devices
