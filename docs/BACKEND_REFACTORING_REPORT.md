# Backend Refactoring Report

Scope: backend only (`server/`). No frontend, infrastructure, deployment, or database-schema changes. The existing technology stack, all 45 API endpoints and their contracts, the 14-event SSE protocol, and every database record are preserved.

## Previous architecture

A flat layout with business logic inline in route handlers:

```text
server/src/
├── index.ts            # app wiring + inline error handler + listen
├── db.ts, env.ts, crypto.ts, anthropic.ts, models.ts, domain.ts
├── prompt.ts, interviewService.ts, validation.ts, resumeTemplate.ts
├── auth/{middleware,password,permissions,tokens}.ts
├── realtime/{hub,generate}.ts
└── routes/{auth,admin,people,resumes,interviews,room}.ts   # logic lived here
```

Characteristics: Express 4 + raw `pg` + zod + JWT; a partial service layer, but SQL, transactions, Anthropic SDK calls, and SSE broadcasts were interleaved inside controllers. Two route files exceeded 300 lines; `routes/room.ts` held a ~100-line generation god-function.

## Improved architecture

A **modular monolith** organized by business domain, with transport and the AI provider isolated at the edges and cross-cutting concerns centralized. See [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) for the full picture.

```text
server/src/{config, infrastructure, common, modules/*}
  modules: auth · users · resumes · interviews · room · ai
```

Controllers are thin and delegate to services; services use `withTransaction`/`buildUpdate`/`query`; all Anthropic SDK usage lives in `modules/ai`; SSE transport (`room/sse-hub.ts`) is separate from generation business logic (`room/room.service.ts`).

## Problems identified and resolved

| # | Problem (previous) | Resolution |
|---|---|---|
| 1 | `loadForRead`/`getIv` duplicated verbatim in `interviews.ts` and `room.ts`; interview endpoints split across two files | Single shared access middleware `requireInterviewRead`/`requireInterviewManage` in `interviews/interview.access.ts`, used by both routers |
| 2 | `canAccessResume` repeated at the top of 7 resume handlers | One `requireResumeAccess` middleware |
| 3 | Resume-ownership checked two ways (helper vs ad-hoc SQL in interview create) | Single `canAccessResume` helper everywhere |
| 4 | Five hand-rolled dynamic-UPDATE builders | `common/sql.ts#buildUpdate` (column-whitelisted) |
| 5 | Four copies of `BEGIN/COMMIT/ROLLBACK` boilerplate | `infrastructure/db.ts#withTransaction` |
| 6 | `runAnswer` god-function mixed SSE + SQL + SDK + auth + business rules | Split: `room.service.generateAnswer` (orchestration) → `ai.service` (SDK) + `sse-hub` (transport) + `interview.context` (data) |
| 7 | Anthropic SDK calls scattered across 5 files; hardcoded model ids (`claude-sonnet-5-5`, `claude-haiku-5-5`) | All SDK calls in `ai.service`; model ids in `config/models.ts` (added `UTILITY_MODEL`) |
| 8 | **TOCTOU race in the single-flight lock** — two concurrent asks could both pass `aborters.has()` before either set the lock, yielding two generations clobbering shared state | Lock acquired **synchronously** (`beginGeneration`) in the controller before any `await`; single release path in `generateAnswer`'s `finally` |
| 9 | Dual, overlapping cleanup of the abort/inflight state | One release per request (finally on success, controller on pre-gen failure) |
| 10 | Only one custom error; `MissingApiKeyError` caught ad-hoc in every AI handler; async rejections not forwarded by Express 4 | `common/errors.ts` AppError hierarchy + `asyncHandler` + central `errorMiddleware`; provider errors return a generic 502 (no internal leak) |
| 11 | Several write endpoints bypassed zod with manual `String()` coercion (notes, status, resume text, api-key) | zod schemas + `parse()` for those endpoints |
| 12 | `(req as any).interview` casts; `any` in streaming params/blocks | Typed `Express.Request.interview`; typed SDK params confined to the `ai.service` boundary |
| 13 | Stale `.env.example` reference to a non-existent `002_seed_admin.sql` | Corrected to `001_init.sql` |

## Files created, modified, removed

- **Removed (27)**: the entire flat layout — `db.ts, env.ts, crypto.ts, anthropic.ts, models.ts, domain.ts, prompt.ts, interviewService.ts, validation.ts, resumeTemplate.ts`, `auth/*`, `realtime/*`, `routes/*`, and the 5 old unit test files.
- **Created (41 app files + 15 test files)**: `config/*`, `infrastructure/*`, `common/*`, `modules/{auth,users,resumes,interviews,room,ai}/*`, `app.ts`; relocated unit tests under `__tests__/unit/` plus new unit tests (`sql`, `errors`, `generation-lock`) and the `__tests__/integration/` suite with its DB harness.
- **Modified in place**: `index.ts` (now thin: build + listen), `migrate.ts` (import path), `types/express.d.ts` (typed `interview`), `.env.example` (comment fix). `package.json`, `tsconfig.json`, and `ecosystem.config.cjs` were **not** changed — `dist/index.js` remains the entrypoint.
- **Added config**: `vitest.config.ts` (points tests at a `<db>_test` database; serializes files).

Application code is ~2,810 LOC (was ~2,285), the increase being explicit error/validation/transaction helpers and typed service interfaces that removed duplication. Test code grew from ~215 to ~850 LOC.

## Important architectural decisions

- Adopted a **pragmatic** 6-module layout rather than the 13-module reference — the codebase size does not justify one-file-per-layer everywhere; related concerns were combined (assignments→`users`, prep/summary→`interviews`, sessions/messages/realtime→`room`).
- **SSE retained**; no WebSockets, Redis, or queues introduced. The in-memory hub/lock keep the server single-instance (see Remaining technical debt).
- **No schema changes**; the refactor is code-only to protect live data.
- Kept **raw SQL** with thin helpers instead of adding an ORM.

## Dependencies

None added, none removed. (`supertest` was already a dev dependency and is now used by the new integration tests.)

## Test & build results

| Check | Result |
|---|---|
| `npx tsc --noEmit` (app) | ✅ clean |
| `npx tsc` (build) | ✅ clean; `dist/index.js` entrypoint intact |
| Typecheck including tests | ✅ clean |
| `npx vitest run` | ✅ **12 files, 61 tests passing** (26 original unit tests preserved + new unit tests + DB-backed integration tests) |
| Route-table diff (before vs after) | ✅ identical — 45 endpoints, same methods/paths |
| SSE event names | ✅ all 14 preserved |

New test coverage: auth/login gating, role-scoped listing, interview CRUD + lifecycle + versioning, interview/resume access & manage boundaries (403/404), the ask→202→transcript path, note authorization, the generation lock, the dynamic-update builder, and error→status mapping.

Integration tests run against a dedicated `interview_assistant_test` database (created and migrated automatically; Postgres on `localhost:9013`), truncated between tests, with no real Anthropic key required. They self-skip if the database server is unreachable.

## Remaining technical debt

- **Single-instance state.** The SSE hub, generation lock, and per-key client cache are in-memory, so the backend does not scale horizontally. A second instance would split rooms and lose the cross-request lock. Acceptable for current scale; would need a shared broker (e.g. Postgres LISTEN/NOTIFY or Redis) to scale out — intentionally not added.
- **Crypto key derivation.** The API-key encryption key is derived from `JWT_SECRET`, coupling session signing and secret encryption; rotating `JWT_SECRET` invalidates stored keys. Left unchanged to avoid a data migration; a dedicated `ENCRYPTION_KEY` is the future fix.
- **No SSE `Last-Event-ID` replay.** Reconnection relies on a full transcript refetch rather than event replay — simple and correct, but heavier on reconnect.
- **Per-key client cache is unbounded** (one entry per distinct key ever seen). Bounded by user count in practice; an LRU would make it strictly bounded.
- **`qa_ref` / `history_summary_upto`** remain UUID columns without FK constraints (additive hardening was deliberately deferred to avoid touching the live schema).
