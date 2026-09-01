# Repository Guidelines

## Project Overview

**EHSIM – GITSIS** is a Requirements Management & Traceability (RMT) tool, DO-178C compliant, serving as a modern web-based alternative to IBM DOORS. The system manages hierarchical requirements (User → System → Software/Hardware), test cases (Acceptance / System / Sub-system), traceability links (Satisfies / Verifies / Assigned To), glossary terms, role-based approvals, and AI-assisted document analysis.

## Architecture & Data Flow

```
Browser (React + Vite) ──HTTP/JSON──► Express REST API (backend:4001) ──Prisma──► PostgreSQL 15
       │                                                  │
       │ (optional AI)                                    │
       ▼                                                  │
FastAPI Bridge (ai-bridge:8008) ──► LM Studio + Gemma (:1234)
```

**Layers:**

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Frontend | React 18 + Vite + Tailwind | UI; all data access via `src/services/apiClient.js` |
| Backend | Node.js + Express + Prisma | Project-isolated REST API; JWT auth; **IDOR protection** (`projectAccessGuard` — personnel only access assigned projects); audit log |
| Database | PostgreSQL 15 (Docker volume) | Persistent storage; `docker compose down -v` wipes data |
| AI Bridge (optional) | Python FastAPI (`ai-bridge/`) | PDF/text → requirement drafts; only calls LM Studio, no DB connection |

**Key architectural decisions:**
- **Project isolation**: All data scoped to `projectId`; cascading deletes on project removal
- **Backend-owned cascade**: Requirement status computed from linked test results (bulk SQL, not N+1)
- **Consensus approvals**: PM + authorized personnel must all vote → `Approved` + `locked`
- **Text ID immutability**: Once generated, a `text_id` is never reused (audit log preserves deleted IDs)
- **Two AI engines**: Offline (browser regex heuristics) vs Online (Gemma via FastAPI bridge)

## Key Directories

```
├── backend/                    # Express + Prisma API
│   ├── src/
│   │   ├── server.js          # Main entry, route mounting, middleware
│   │   ├── auth.js            # JWT, bcrypt, middleware (requireAuth, requirePM, projectAccessGuard)
│   │   ├── cascade.js         # Bulk status/approval recomputation (Issue #15)
│   │   ├── constants.js       # Taxonomy: REQ_TYPE, TEST_TYPE, LINK_TYPE, SATISFIES_PARENT_OF, VERIFIES_TARGET_TYPES
│   │   ├── logic.js           # Hierarchy validation, coverage calc
│   │   ├── impact.js          # Recursive CTE impact analysis (Issue #46)
│   │   ├── traceability.js    # Traceability export/import (ReqIF)
│   │   ├── reqifParser.js     # ReqIF XML parsing
│   │   ├── sanitize.js        # HTML sanitization
│   │   └── seed.js            # Default Drone/IHA demo project (72 reqs, 16 tests)
│   ├── prisma/schema.prisma   # Database schema
│   └── tests/                 # node:test + supertest (7 tests)
│
├── frontend/                   # React + Vite + Tailwind SPA
│   ├── src/
│   │   ├── main.jsx           # App bootstrap, provider nesting
│   │   ├── App.jsx            # Routing: Login → ProjectSelect → Workspace
│   │   ├── context/           # React contexts (Auth, Project, App, Language)
│   │   ├── services/          # API layer (apiClient.js, dataService.js, authService.js, aiEngineService.js)
│   │   ├── pages/             # Page components (Dashboard, Hierarchy, TestCases, Traceability, etc.)
│   │   ├── components/        # Reusable UI components
│   │   ├── hooks/             # Custom hooks (useBulkSelection, useUndoableDelete)
│   │   ├── utils/             # Pure functions (constants, coverage, format, permissions)
│   │   └── i18n/              # TR/EN translations
│   └── nginx/default.conf     # Reverse proxy config for Docker
│
├── ai-bridge/                  # Optional Python FastAPI bridge
│   ├── api_server.py          # /analyze, /regenerate, /health endpoints
│   └── config.py              # LM_STUDIO_URL, MODEL_NAME
│
├── scripts/                    # Utility scripts
│   ├── seed-coffee-project.mjs # Optional Espresso demo (58 reqs, 32 tests)
│   ├── run-dev.sh/.bat        # Dev stack (compose + compose.dev)
│   ├── run-prod.sh/.bat       # Prod stack (compose only)
│   └── pre-push-check.sh/.bat # Format, lint, test (runs pre-push)
│
├── compose.yaml                # Base: db (5433→5432) + backend + frontend (nginx on 5173)
├── compose.dev.yaml            # Dev overlay: frontend bind-mount + Vite dev server
├── .github/workflows/ci.yml    # Detect-changes → parallel frontend/backend → aggregate
└── .env.example                # Root env template (POSTGRES_PASSWORD, JWT_SECRET)
```

## Development Commands

### Backend (`backend/`)
```bash
npm ci                     # Install (CI uses this)
npm run dev                # node src/server.js (requires JWT_SECRET)
npx prisma generate        # Generate Prisma client (required before test/build)
npx prisma db push         # Push schema to DB (dev: --force-reset)
npm test                   # node --test --test-concurrency=1 (tests/*.test.js; needs DB)
npm run lint               # eslint .
npm run format             # prettier --write .
npm run format:check       # prettier --check .
```

### Frontend (`frontend/`)
```bash
npm ci                     # Install
npm run dev                # Vite dev server
npm run build              # Production build
npm test                   # vitest run (JSDOM)
npm run lint               # eslint .
npm run format             # prettier --write .
npm run format:check       # prettier --check .
```

### Docker (root)
```bash
docker compose up --build                    # Prod-like: db + migrate+seed + backend + frontend (nginx on 5173)
docker compose -f compose.yaml -f compose.dev.yaml up --build  # Dev: hot reload
docker compose down                          # Stop (preserves volume)
docker compose down -v                       # Stop + wipe volume (fresh seed on next up)
```

### Windows (PowerShell/cmd)
```bat
scripts\pre-push-check.bat    # Format, lint, test (backend + frontend)
scripts\run-dev.bat [--force] # Dev stack
scripts\run-prod.bat [--force]# Prod stack
node scripts/seed-coffee-project.mjs  # Load optional Espresso demo (backend must be running)
```

### CI Pipeline (`.github/workflows/ci.yml`)
- `detect-changes` (paths-filter) → runs only changed packages
- Frontend job: `format:check → lint → test → build` (Node 24)
- Backend job: `format:check → lint → test` with PostgreSQL service container (Node 24)
- `ci-status` aggregates; required for branch protection on `main`

## Code Conventions & Common Patterns

### Formatting & Linting
- **Prettier**: Single quotes, trailing commas, 2-space indent (config in `.prettierrc.json`)
- **ESLint 9 flat config**: `no-unused-vars: error` (args/vars prefixed `_` ignored)
- **Unused imports/variables = error** — fix or prefix with `_`
- **Run order**: `format → lint → test` (CI and pre-push)

### Naming
- **Files**: PascalCase for React components (`Modal.jsx`), camelCase for utilities (`apiClient.js`)
- **Constants**: `UPPER_SNAKE_CASE` in `backend/src/constants.js` and `frontend/src/utils/constants.js`
- **Database**: `snake_case` columns, PascalCase models (`Requirement`, `TraceabilityLink`)
- **API**: RESTful, `/api/projects/:pid/...` for project-scoped resources

### Error Handling
- **Backend**: `wrap(fn)` middleware catches async errors → `fail(res, err)` returns JSON `{ error: string }`
- **Frontend**: `apiClient.js` interceptors attach JWT; 401 → clear session + redirect to Login
- **Validation**: `bad(msg, status)` helper creates error with `.status` property

### Async Patterns
- **Backend**: `async/await` throughout; Prisma transactions for multi-step ops (batch delete, link creation)
- **Frontend**: `dataService.js` wraps `apiClient` calls; `AppContext` actions call service → `refresh()` after mutation
- **No client-side cascade**: Backend recomputes status/approvals; frontend only refetches

### Dependency Injection / State Management
- **Backend**: Single `PrismaClient` instance at module top; passed to cascade functions
- **Frontend**: Four React Context providers (Language → Auth → Project → App)
  - `AuthContext`: `currentUser` (PM or personnel), `login`, `passcodeLogin`, `can(perm, component)`
  - `ProjectContext`: `projects[]`, `activeProjectId`, `openProject`, `createProject`
  - `AppContext`: All collections for active project (`requirements`, `testCases`, `links`, `glossary`, `auditLog`, `roles`, `personnel`, `approvals`, `snapshots`) + `refresh()` + CRUD actions
  - `LanguageContext`: `t(key)` i18n, `toggleLang()`

### Security
- **JWT_SECRET required**: Backend throws on startup if missing (no fallback in production)
- **Rate limiting**: `/api/auth` endpoints limited
- **IDOR protection**: `app.param('pid', projectAccessGuard)` — personnel restricted to assigned project
- **Register endpoint closed by default**: Requires `PM_REGISTRATION_KEY` env + `x-registration-key` header
- **Personnel auth**: 5-char passcode (no ambiguous chars), direct project drop-in

## Important Files

| File | Purpose |
|------|---------|
| `backend/src/server.js` | Route definitions, middleware chain, all REST endpoints |
| `backend/src/auth.js` | JWT sign/verify, bcrypt, middleware (`requireAuth`, `requirePM`, `projectAccessGuard`) |
| `backend/src/cascade.js` | Bulk status (`recomputeStatusesBulk`) & approval (`recomputeApprovalsBulk`) recomputation |
| `backend/src/constants.js` | Single source of truth for taxonomy, hierarchy rules, link rules |
| `backend/prisma/schema.prisma` | Full DB schema (User, Project, Requirement, TestCase, TraceabilityLink, GlossaryTerm, Role, Personnel, Approval, ProjectSnapshot, AuditLog, ProjectField) |
| `backend/src/seed.js` | Default Drone/IHA demo project (auto-runs on empty DB via Docker `migrate` service) |
| `frontend/src/main.jsx` | Provider nesting order, font imports, `?reset` URL param clears localStorage |
| `frontend/src/App.jsx` | Three-gate routing: Login → ProjectSelect (PM only) → Workspace |
| `frontend/src/services/apiClient.js` | Axios instance (`/api` base), JWT interceptor, 401 handling, `get/post/put/patch/del/upload` |
| `frontend/src/services/dataService.js` | Project-scoped API calls (list/create/update/delete for all entities) |
| `frontend/src/context/AppContext.jsx` | Central state + actions for active project; calls `dataService`; `refresh()` after mutations |
| `frontend/src/utils/permissions.js` | 12-tier permission matrix; `hasPermission(rolePerms, permKey, componentKey)` |
| `ai-bridge/api_server.py` | FastAPI: `/analyze` (PDF/text → requirements), `/regenerate` (avoid duplicates), `/health` |

## Runtime/Tooling Preferences

- **Node**: 20 (Docker) / 24 (CI) — ESM (`"type": "module"` in both packages)
- **Package Manager**: npm (lockfiles committed: `package-lock.json`)
- **Database**: PostgreSQL 15 via Docker; Prisma ORM
- **Testing**: 
  - Backend: `node --test` + supertest (integration against real DB)
  - Frontend: Vitest + Testing Library (JSDOM)
- **CI**: GitHub Actions, Node 24, `npm ci`, PostgreSQL service container for backend
- **Docker**: Multi-stage builds; `builder` target runs `prisma db push --skip-generate && node src/seed.js`

## Testing & QA

### Backend Tests (`backend/tests/`)
- `api.test.js`: Auth (login, passcode), IDOR protection (personnel cross-project access), register guard
- Run locally: `docker compose up -d db` then `npm test` (uses `localhost:5433`)
- CI: PostgreSQL service container, `TEST_DATABASE_URL` + `DATABASE_URL` env

### Frontend Tests (`frontend/src/**/__tests__/`)
- Unit: `coverage.test.js`, `impact.test.js` (pure functions)
- Component: `Badge.test.jsx`, `ImpactAnalysisModal.test.jsx`, `smoke.test.jsx` (Modal, ViewModal render)
- Hooks: `useBulkSelection.test.jsx`, `useUndoableDelete.test.jsx`
- Run: `npm test` (vitest run)

### Coverage Expectations
- Backend: 7 integration tests covering auth + IDOR
- Frontend: 22 tests (pure functions + RTL smoke)
- No enforced coverage threshold; focus on regression prevention

### Demo Data
- **Default (auto)**: Drone/IHA project — 72 requirements, 16 tests, 58 links (from `backend/src/seed.js`, runs on empty DB)
- **Optional**: Espresso Coffee Machine — 58 requirements, 32 tests, 119 links (run `node scripts/seed-coffee-project.mjs` against running backend)

---

## Quick Reference for AI Assistants

| Task | Where to Look |
|------|---------------|
| Add new REST endpoint | `backend/src/server.js` (route pattern + `wrap`) |
| Modify requirement hierarchy rules | `backend/src/constants.js` (`SATISFIES_PARENT_OF`, `VERIFIES_TARGET_TYPES`) |
| Change approval logic | `backend/src/cascade.js` (`recomputeApprovalsBulk`) |
| Add frontend page | `frontend/src/pages/`, register in `App.jsx` |
| Add new entity type | Prisma schema → backend routes → `dataService.js` → `AppContext.jsx` actions → UI |
| Fix IDOR issue | `backend/src/auth.js` `projectAccessGuard` |
| Update taxonomy | `backend/src/constants.js` + `frontend/src/utils/constants.js` (keep in sync) |
| Debug AI bridge | `ai-bridge/api_server.py` `/health`, check LM Studio `:1234/v1` |
| Run single test | Backend: `node --test tests/api.test.js`; Frontend: `npm test -- <file>` |

**Key invariants to preserve:**
1. Project isolation — every query filters by `projectId`
2. Backend owns cascade/approval recomputation — frontend only refreshes
3. `text_id` never reused (audit log blacklist)
4. JWT_SECRET mandatory at startup
5. Personnel can only access their assigned project