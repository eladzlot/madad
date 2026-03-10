# Build & Tooling

## Prerequisites

- Node.js 20+
- npm 10+

## Getting Started

```bash
npm ci
```

## Scripts

```bash
npm run dev              # Start dev server at localhost:5173
npm run build            # Production build → dist/
npm run preview          # Serve dist/ locally to verify the build

npm test                 # Run unit tests (once)
npm run test:watch       # Run unit tests in watch mode
npm run coverage         # Run unit tests with coverage report → coverage/

npm run e2e              # Run Playwright E2E tests
npm run e2e:ui           # Run E2E with interactive Playwright UI

npm run lint             # Lint src/ and tests/
npm run lint:fix         # Lint and auto-fix

npm run validate:configs # Validate all /public/configs/**/*.json against schema
npm run size             # Assert bundle size budgets (run after build)
```
