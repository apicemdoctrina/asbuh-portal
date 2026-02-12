# ASBUH Portal

Web-portal for managing accounting organizations, documents, and team access.

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker (for PostgreSQL)

## Quick Start

```bash
# Install dependencies
npm install

# Start PostgreSQL
npm run dev:db

# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Run database migrations and seed
npm run db:migrate -w apps/api
npm run db:seed -w apps/api

# Start API server (port 3001)
npm run dev:api

# Start web client (port 5173, proxies /api to :3001)
npm run dev:web
```

## Default Admin (dev only)

The seed creates an admin user from environment variables:

- `ADMIN_EMAIL` (default: `admin@asbuh.local`)
- `ADMIN_PASSWORD` (default: `Admin123!`)

**In production, always set these via env vars. Do not use defaults.**

## Auth Flow

- **Access token**: JWT (15 min), stored in memory on the client
- **Refresh token**: HttpOnly cookie (7 days), `Secure` in production
- On login: server returns access token in JSON + sets refresh cookie
- On 401: client auto-refreshes via cookie, retries request
- On logout: cookie cleared, refresh token deleted from DB

## Scripts

| Command                | Description                       |
| ---------------------- | --------------------------------- |
| `npm run dev:web`      | Start web dev server              |
| `npm run dev:api`      | Start API dev server              |
| `npm run dev:db`       | Start PostgreSQL (Docker Compose) |
| `npm run build`        | Build all apps                    |
| `npm run lint`         | Run ESLint                        |
| `npm run lint:fix`     | Run ESLint with auto-fix          |
| `npm run format`       | Format with Prettier              |
| `npm run format:check` | Check Prettier formatting         |
| `npm test`             | Run tests in watch mode           |
| `npm run test:ci`      | Run tests once (CI mode)          |

### API-specific scripts (run with `-w apps/api`)

| Command       | Description              |
| ------------- | ------------------------ |
| `db:migrate`  | Run Prisma migrations    |
| `db:seed`     | Seed roles/permissions   |
| `db:generate` | Regenerate Prisma client |
| `db:reset`    | Reset database           |

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
│   ├── api/                 # Express API (TypeScript)
│   │   ├── prisma/
│   │   │   ├── schema.prisma  # Database schema
│   │   │   └── seed.ts        # Roles, permissions, admin
│   │   └── src/
│   │       ├── app.ts          # Express app
│   │       ├── routes/         # auth.ts, users.ts
│   │       ├── middleware/     # auth.ts, rate-limit.ts
│   │       └── lib/            # prisma, tokens, password, audit, cookie
│   └── web/                 # React SPA
│       └── src/
│           ├── pages/          # LoginPage, DashboardPage, NotFoundPage
│           ├── context/        # AuthContext
│           ├── components/     # ProtectedRoute
│           └── lib/            # api.js (fetch wrapper)
├── docs/                    # PROJECT_BRIEF, ROADMAP, DESIGN_SYSTEM
├── docker-compose.yml       # PostgreSQL 16
├── CLAUDE.md                # Rules for Claude Code
└── .github/workflows/ci.yml # CI: lint + test + PostgreSQL
```

## API Endpoints

| Method | Path               | Auth     | Description                   |
| ------ | ------------------ | -------- | ----------------------------- |
| GET    | /api/health        | -        | Health check                  |
| POST   | /api/auth/login    | -        | Login (email + password)      |
| POST   | /api/auth/refresh  | cookie   | Refresh access token          |
| POST   | /api/auth/logout   | Bearer   | Logout, clear refresh         |
| POST   | /api/auth/staff    | admin    | Create staff user             |
| POST   | /api/auth/invite   | org:edit | Create invite token           |
| POST   | /api/auth/register | -        | Client self-register (invite) |
| GET    | /api/users/me      | Bearer   | Current user profile          |

## CI

GitHub Actions runs lint + format check + tests on every push/PR to `main`.
Includes PostgreSQL service container for integration tests.

## Contributing

1. Create a feature branch from `main`.
2. Make small, focused changes (one task per PR).
3. Ensure `npm run lint` and `npm run test:ci` pass before pushing.
4. Pre-commit hook runs lint-staged automatically.
