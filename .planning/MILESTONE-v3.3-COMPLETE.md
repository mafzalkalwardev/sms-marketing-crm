# SignalMint v3.3 — Milestone Complete

**Sandbox platform: Phases 1–7 delivered.** Ready for live credential flip when available.

## Platform at a glance

| Layer | Stack | Status |
|-------|-------|--------|
| API | Node 20, Express 5, PostgreSQL 16 | ✅ |
| Queue | BullMQ + Redis (memory fallback) | ✅ |
| Browser lane | Python FastAPI + Playwright | ✅ |
| Frontend | React dialer (opaque UX) | ✅ |
| Enterprise | Multi-org, branding, API keys, audit export | ✅ |
| CI | GitHub Actions — 15+ test scripts + smoke | ✅ |

## Phase delivery log

| Phase | Module | Delivered |
|-------|--------|-----------|
| 1 | M1 Core | State machine, idempotency, audit, campaign queue, load test, timeline |
| 2 | M2 Live API | Health cron, dead letters, live readiness, webhook replay |
| 3 | M3 Browser | Session store, selector migration, Render worker config |
| 4 | M4/M5 UX | Compliance, reports, mobile inbox, full nav |
| 5 | M6 Ops | Deploy readiness, secrets runbook, docs refresh |
| 6 | M7 Queue | Per-recipient fan-out, progress UI, retry failed |
| 7 | Enterprise | Tenancy hardening, branding, API keys, retention |

## Module map (learning / deep-dive)

See [.planning/MODULES.md](./MODULES.md) for boundaries, paths, and test commands per module.

## Local quick start

```powershell
docker compose up -d
cd server
Copy-Item .env.example .env   # first time
npm install && npm run dev
```

```powershell
cd client-app
npm install && npm start
```

Open http://localhost:3000 — login `user1@demo.local` / `password123`

## Verification

```powershell
cd server
npm run test:all      # unit + integration (API on :5000)
npm run smoke         # full E2E API path
```

With Redis: `REDIS_URL=redis://localhost:6380 npm run test:campaign-bullmq`

## Go-live checklist (when you have API keys)

1. Vercel / Render: set `SMS_SANDBOX_MODE=false`, provider credentials
2. `PUBLIC_BACKEND_URL` or rely on `RENDER_EXTERNAL_URL` / `VERCEL_URL`
3. Deploy `automation-worker` with `WORKER_SANDBOX_MODE=false` for browser lane
4. Super Admin → connection test → one live SMS
5. Register webhooks at provider (URLs in Super Admin console)

See [.planning/SECRETS-RUNBOOK.md](./SECRETS-RUNBOOK.md).

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `super_admin@signalmint.local` | `password123` |
| Admin | `admin@ftsolutions.local` | `password123` |
| User | `user1@demo.local` | `password123` |

## Integration API

```http
Authorization: Bearer smk_…
GET  /api/v1/contacts
POST /api/v1/messages/send  { "to", "from", "message" }
```

Keys created in Team Admin → API keys.

## What's intentionally sandbox-only

- Live SMS delivery (needs Vonage/Twilio creds)
- Google Voice browser login (needs worker + manual session)
- 50k campaign soak (infra ready; run with Redis + tuned concurrency)

## Docs index

- [README.md](../README.md) — setup & deploy
- [TESTING.md](../TESTING.md) — full test matrix
- [AUDIT.md](../AUDIT.md) — platform snapshot
- [ROADMAP-BIG.md](./ROADMAP-BIG.md) — phased history
- Phase progress: `PHASE-1-PROGRESS.md` … `PHASE-7-PROGRESS.md`
