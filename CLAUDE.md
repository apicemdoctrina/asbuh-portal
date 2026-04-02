# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

- ARC.md = то, что мы УЖЕ сделали.
- MVP.md = то, что нам НУЖНО сделать.
- DESIGN_SYSTEM.md = визуальные правила UI.
- BUSINESS_MODEL_LONG.md = как наше приложение соотносится с нашей бизнес-моделью и логикой.

## Commands

```bash
# Database (PostgreSQL 16 in Docker)
npm run dev:db                          # Start Postgres container
npm run db:migrate -w apps/api          # Apply migrations (prisma migrate deploy)
npm run db:seed -w apps/api             # Seed roles, permissions, admin user
npm run db:generate -w apps/api         # Regenerate Prisma client

# Dev servers
npm run dev:api                         # API on :3000 (tsx watch)
npm run dev:web                         # Frontend on :5173 (Vite)

# Quality
npm run lint                            # ESLint both apps
npm run lint:fix                        # ESLint --fix both apps
npm run format:check                    # Prettier check
npm run test                            # vitest (watch mode) both apps
npm run test:ci                         # vitest run (single pass)

# Run single test file
npx vitest run apps/api/src/routes/users.test.ts
npx vitest run apps/web/src/components/SomeComponent.test.jsx
```

Pre-commit hook (husky + lint-staged) runs eslint --fix + prettier on staged files.

## Architecture

**Monorepo** with npm workspaces: `apps/api` (Express 5 + TypeScript) and `apps/web` (React 18 + Vite).

### Backend (`apps/api/`)

- **Entry**: `src/index.ts` → `src/app.ts` (Express app with all route mounts)
- **Routes**: `src/routes/*.ts` — each file exports a Router, mounted at `/api/<name>` in app.ts. Current routes: auth, users, sections, organizations, stats, work-contacts, audit-logs, knowledge, management, tasks, telegram, notifications, messages, tickets, client-groups
- **Auth middleware**: `src/middleware/auth.ts` — `authenticate` (JWT Bearer), `requireRole(...names)`, `requirePermission(entity, action)` (checks DB via Prisma)
- **Prisma ORM**: schema at `prisma/schema.prisma`, singleton client at `src/lib/prisma.ts`
- **Libs** (`src/lib/`): `audit.ts` (audit logging), `tokens.ts` (JWT sign/verify), `password.ts` (bcrypt), `crypto.ts` (AES-256-GCM for bank secrets), `notify.ts` (in-app notifications + SSE push), `telegram.ts` (bot API), `mailer.ts` (SMTP), `task-notifier.ts` (cron-like reminders/escalation), `sse-manager.ts` (SSE connections), `validators.ts` (Zod schemas), `route-helpers.ts`, `upload.ts` (multer file uploads, serves `/uploads` static dir)

### Frontend (`apps/web/`)

- **Router**: `src/App.jsx` — React Router v7, public routes (login/forgot-password/invite) + protected routes wrapped in `<Layout />`
- **Auth**: `src/context/AuthContext.jsx` — `useAuth()` provides `{ user, login, logout, hasPermission, hasRole }`
- **API client**: `src/lib/api.js` — `api(path, opts)` with auto Bearer token + auto refresh on 401 (with mutex)
- **Notifications**: `src/context/NotificationContext.jsx` — SSE connection, toast notifications
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` plugin, icons from `lucide-react`

### Database migrations

Prisma migrate dev doesn't work in non-TTY. Manual workflow:

1. Edit `prisma/schema.prisma`
2. Create `prisma/migrations/<timestamp>_name/migration.sql` manually
3. `cd apps/api && npx prisma migrate deploy`
4. `npx prisma generate`

### Auth flow

JWT access token (short-lived) + refresh token (httpOnly cookie). Access token payload includes `userId` and `roles[]`. Refresh token stored hashed in DB. Frontend `api()` helper auto-refreshes on 401 with a mutex to prevent races.

### RBAC

Permission-based: `requirePermission(entity, action)` checks `RolePermission → Permission` via Prisma. Seeded roles: admin (all), manager, accountant, client. Frontend checks: `hasPermission("entity", "action")`.

## Workflow

- Делай маленькие изменения (1 задача = 1 PR/коммитный набор).
- Перед изменениями: краткий план (5–10 строк).
- После: запусти линтер/тесты и опиши как проверить руками.

## Safety

- Никогда не создавай/не проси реальные секреты. Только .env.example.
- Не трогай файлы из deny-листа (.claude/settings.json).

## Coding conventions

- Backend: Express Router pattern — `authenticate` → `requirePermission` → async handler with try/catch. All routes return JSON.
- Frontend: React 18 + Tailwind. `useState`/`useEffect` for data fetching via `api()`. Permission checks via `useAuth()`.
- UI style rules in DESIGN_SYSTEM.md. Primary color: `#6567F1`. Icons: `lucide-react`.
- Не добавляй новые зависимости без причины и объяснения.

## New models since initial setup

Schema additions not yet reflected everywhere in the codebase:

- **ClientGroup** — группировка организаций (`/api/client-groups`). `Organization.clientGroupId` FK.
- **Ticket / TicketMessage / TicketAttachment** — тикет-система (`/api/tickets`). Статусы: `NEW | IN_PROGRESS | WAITING_CLIENT | ON_HOLD | ESCALATED | CLOSED | REOPENED`. Типы: `QUESTION | DOCUMENT_REQUEST | PROBLEM | DOCUMENT_UPLOAD`.
- **MessageTemplate / MessageLog** — шаблоны сообщений и история отправок (`/api/messages`). Каналы: `EMAIL | TELEGRAM`.
- **CustomFieldDefinition / CustomFieldValue** — кастомные поля организаций (типы: `TEXT | NUMBER | DATE | BOOLEAN`).
- **RevenueSnapshot / Expense / Income** — финансовые снапшоты и расходы/доходы (управленческий учёт).
