import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        d3: 'readonly',
        cola: 'readonly',
        HTMLElement: 'readonly',
        customElements: 'readonly',
        CustomElementRegistry: 'readonly',
        CustomEvent: 'readonly',
        SVGElement: 'readonly',
        SVGGElement: 'readonly',
        SVGTextElement: 'readonly',
        SVGRectElement: 'readonly',
        SVGPathElement: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript itself flags undefined identifiers; the core rule only
      // produces false positives on TS sources.
      'no-undef': 'off',
      // Core rule stays off so the TS-aware rule is the only reporter.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },
  {
    // Spec-editor UI primitives (WP3): React components that touch the DOM.
    // Provide the browser + ES2021 globals so DOM/timer types resolve under
    // the flat-config `no-undef` rule.
    files: ['src/spec-editor/ui/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      '*.config.js',
      '*.config.ts',
      // Vendored third-party bundles — not ours to lint.
      'src/vendor/',
      // Peggy-generated parser (has its own eslint-disable, but skip parsing
      // its 3.4k lines entirely).
      'src/evaluators/layout/layout-query-parser.ts',
    ],
  },
]
