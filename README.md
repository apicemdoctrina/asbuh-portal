# ASBUH Portal

Web-portal for managing accounting organizations, documents, and team access.

## Prerequisites

- Node.js >= 20
- npm >= 10

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start API server (port 3001)
npm run dev:api

# Start web client (port 5173)
npm run dev:web
```

## Scripts

| Command                | Description               |
| ---------------------- | ------------------------- |
| `npm run dev:web`      | Start web dev server      |
| `npm run dev:api`      | Start API dev server      |
| `npm run build`        | Build all apps            |
| `npm run lint`         | Run ESLint                |
| `npm run lint:fix`     | Run ESLint with auto-fix  |
| `npm run format`       | Format with Prettier      |
| `npm run format:check` | Check Prettier formatting |
| `npm test`             | Run tests in watch mode   |
| `npm run test:ci`      | Run tests once (CI mode)  |

## Testing

```bash
# Run all tests
npm run test:ci

# Run only API tests
npm run test:ci -w apps/api

# Run only web tests
npm run test:ci -w apps/web
```

## Project Structure

```
asbuh-portal/
├── apps/
│   ├── api/          # Express API server
│   │   └── src/
│   │       ├── app.js        # Express app
│   │       ├── index.js      # Server entry
│   │       └── app.test.js   # API tests
│   └── web/          # React SPA
│       └── src/
│           ├── App.jsx       # Root component
│           ├── main.jsx      # Entry point
│           └── App.test.jsx  # Component tests
├── docs/             # Project documentation
│   ├── PROJECT_BRIEF.md
│   ├── ROADMAP.md
│   └── DESIGN_SYSTEM.md
├── CLAUDE.md         # Rules for Claude Code
└── .github/workflows/ci.yml  # CI pipeline
```

## CI

GitHub Actions runs lint + format check + tests on every push and PR to `main`/`master`.

## Contributing

1. Create a feature branch from `main`.
2. Make small, focused changes (one task per PR).
3. Ensure `npm run lint` and `npm run test:ci` pass before pushing.
4. Pre-commit hook runs lint-staged automatically.
