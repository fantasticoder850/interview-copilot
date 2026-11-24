# Interview Assistant

A ChatGPT-style interview assistant. Create chat sessions, pick a Claude model per
session, and chat with **token-by-token streaming** responses. History is persisted in
Postgres.

- **Backend:** Node + TypeScript (Express) + the official `@anthropic-ai/sdk`, streaming
  over Server-Sent Events (SSE).
- **Frontend:** React + Vite.
- **Storage:** Postgres (`sessions` + `messages`).
- **Models:** Claude Opus 5.5 (default), Sonnet 5.5, Haiku 5.5.

## Prerequisites

- Node.js 18+
- Docker (for Postgres) — or your own Postgres instance
- An Anthropic API key

## Setup

1. **Start Postgres (Docker):**
   ```bash
   docker compose up -d
   ```
   This runs `postgres:16-alpine` with a healthcheck, mapped to host port **9013**.

2. **Configure environment:**
   ```bash
   cp .env.example server/.env
   # edit server/.env and set ANTHROPIC_API_KEY
   ```

3. **Install dependencies:**
   ```bash
   (cd server && npm install)
   (cd web && npm install)
   ```

4. **Create the database schema:**
   ```bash
   (cd server && npm run migrate)
   ```

## Run (one command)

From the repo root, this starts **both** the backend and frontend together:

```bash
npm install        # once, installs the root concurrently dev tool
npm run dev         # runs server + web concurrently
```

- Backend → http://localhost:9011
- Frontend → **http://localhost:9012** (open this)

Logs from both are prefixed (`[server]` / `[web]`); `Ctrl-C` stops both.

### First-time setup shortcut

```bash
npm run setup       # install:all + db:up (Docker Postgres) + migrate
```

Other root scripts: `npm run db:up` / `db:down` (Postgres), `npm run migrate`,
`npm run build`. You can still run each app on its own with
`npm --prefix server run dev` / `npm --prefix web run dev`.

Ports: backend **9011**, frontend **9012**, Postgres **9013** (talent uses 9000–9002;
9005–9007 were already in use).

Open the Vite URL printed in terminal 2. The dev server proxies `/api` to the backend.

## Production / PM2

PM2 runs the **built** artifacts (not the dev servers), mirroring the `~/talent` setup —
backend from `server/dist/index.js`, frontend served by `vite preview`:

```bash
npm run pm2:start      # build both, then pm2 start ecosystem.config.cjs
npm run pm2:restart    # restart both processes
npm run pm2:reload     # zero-downtime reload with --update-env
npm run pm2:stop       # stop both
npm run pm2:logs       # tail logs from both
```

Processes: `interview-api` (port 9011) and `interview-web` (port 9012), both in fork mode
with `autorestart`. The API's env (incl. `ANTHROPIC_API_KEY`) is loaded from `server/.env`
by [ecosystem.config.cjs](ecosystem.config.cjs). Postgres still runs via Docker
(`npm run db:up`). Rebuild + restart after code changes with `npm run pm2:start`.

## How it works

- Each **session** has its own model and message history.
- Sending a message POSTs to `/api/sessions/:id/messages`; the backend streams Claude's
  reply back as SSE `delta` events, which the UI appends token-by-token. A final `done`
  event carries token usage, and the full reply is saved to Postgres.
- Switching the **model selector** persists the choice on the session.
