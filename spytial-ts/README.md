# spytial-ts

TypeScript decorator-first helpers for SpyTial/Spytial Core.

## Goals
- Provide a decorator API that maps directly to SpyTial operators.
- Keep runtime thin by delegating execution to `spytial-core`.
- Offer non-decorator helpers for environments that cannot enable decorators.

## Status
Scaffolding only. Implementation will live in `src/` as the API is designed.

## Development
```bash
npm install
npm run build
```

## Roadmap
- Define decorator contracts and core operator registry.
- Add runtime adapters for diagram invocation.
- Publish as a companion package to `spytial-core`.
