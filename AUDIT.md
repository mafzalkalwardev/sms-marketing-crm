# SignalMint Platform Audit (v3.2)

Snapshot of the codebase as of Phase 5 completion. For historical rebuild notes, see git history prior to `signalmint-v3-platform`.

## Stack

| Layer | Technology |
|-------|------------|
| API | Node 20, Express 5, PostgreSQL 16 |
| Frontend | React (CRA), opaque dialer UX |
| Browser lane | Python 3.12, FastAPI, Playwright |
| Deploy | Vercel (API/frontend), Render blueprint (`render.yaml`), GitHub Actions CI |
| Local | `docker-compose.yml` — Postgres :5434, worker :5055 |

## Module status

| Module | Status | Notes |
|--------|--------|-------|
| **M1 Core** | ✅ | State machine, idempotency, audit, campaign queue stub, load test |
| **M2 API dialers** | ✅ sandbox | 9 adapters; live readiness + health cron + webhook dead letters |
| **M3 Browser lane** | ✅ sandbox | Session persistence, selector migration, Render worker config |
| **M4 Admin** | ✅ | Team admin + Super Admin consoles |
| **M5 Customer UX** | ✅ | Inbox, compliance, reports, mobile patterns |
| **M6 Ops** | ✅ | CI, deploy readiness, secrets runbook, docs |
| **M7 Queue** | ✅ | BullMQ fan-out, progress UI, dead letters |
| **Enterprise** | ✅ | Multi-org, branding, API keys, audit export, retention |

## Security controls

- JWT auth, bcrypt passwords, role-based routes (`user` / `admin` / `super_admin`)
- Provider credentials encrypted at rest (`MASTER_ENCRYPTION_KEY`)
- Webhook signature verification (Vonage JWT, Twilio HMAC)
- Per-user data isolation (contacts, numbers, conversations)
- Suppression list + STOP keyword auto-block
- Audit logs on admin actions and message status transitions
- Rate limiting on API
- Sandbox mode default (`SMS_SANDBOX_MODE=true`)

## API surface (high level)

- `/api/auth/*` — register, login, profile
- `/api/conversations/*`, `/api/messages/*` — messaging + timeline
- `/api/contacts`, `/api/numbers`, `/api/campaigns`
- `/api/compliance/*` — suppression stats + CSV export
- `/api/reports/*` — dashboard metrics + message log
- `/api/admin/*` — org users, usage, audit logs
- `/api/super/*` — providers, browser profiles, observability
- `/webhooks/{provider}/*` — inbound + status
- `/api/internal/worker/*` — service-token worker bridge

## Database

Migrations `001`–`005` in `server/migrations/`:

- Multi-tenant org/workspace schema
- State machine columns + `message_status_events`
- Browser profiles + jobs
- Provider health + `webhook_dead_letters`

## Test coverage

CI green path: migrate → seed → 12+ unit/integration scripts → smoke with live API.

See [TESTING.md](./TESTING.md) for commands.

## Known limitations

- Campaign broadcast uses in-process queue stub (not Redis/BullMQ)
- Live SMS requires manual credential setup on host
- Browser lane Google Voice needs manual login in worker profile (sandbox simulates)
- Playwright E2E optional, not in CI gate
- Single-workspace default (`organization_id = 1`) for new registrations

## Production readiness checklist

| Item | Sandbox | Live |
|------|---------|------|
| Postgres | ✅ Docker / Neon / Render | ✅ |
| API deploy | ✅ Vercel / Render | ✅ |
| Worker deploy | ✅ Render / Docker | Needs `WORKER_SANDBOX_MODE=false` |
| Vonage/Twilio creds | N/A | Manual |
| `PUBLIC_BACKEND_URL` | Optional | Required (or Render/Vercel auto) |
| Webhook registration | Simulated in tests | Manual at provider |

## Docs map

- [README.md](./README.md) — setup and deploy
- [TESTING.md](./TESTING.md) — test matrix
- [.planning/MODULES.md](./.planning/MODULES.md) — architecture modules
- [.planning/ROADMAP-BIG.md](./.planning/ROADMAP-BIG.md) — phased roadmap
- [.planning/SECRETS-RUNBOOK.md](./.planning/SECRETS-RUNBOOK.md) — credential rotation
