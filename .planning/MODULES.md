# SignalMint — Modular Architecture

SignalMint is organized as **seven deep-learning modules** that compose into one white-label business texting platform. Each module has a clear boundary, owner surface, and verification suite.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  M4 Admin Surfaces          M5 Customer Dialer (opaque UX)              │
│  client-app/admin + super   client-app/inbox, contacts, compose         │
└───────────────┬─────────────────────────────┬───────────────────────────┘
                │                             │
┌───────────────▼─────────────────────────────▼───────────────────────────┐
│  M1 Core API (server/) — auth, messaging, state machine, sanitization   │
└───────────────┬─────────────────────────────┬───────────────────────────┘
                │                             │
     ┌──────────▼──────────┐       ┌──────────▼──────────┐
     │ M2 Provider Lane A  │       │ M3 Browser Lane B   │
     │ REST + webhooks     │       │ DOM/BOM + Playwright│
     │ server/providers/*  │       │ automation-worker/  │
     └──────────┬──────────┘       └──────────┬──────────┘
                │                             │
┌───────────────▼─────────────────────────────▼───────────────────────────┐
│  M6 Ops & Deploy — Docker, CI, Vercel/Render, env, migrations           │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ M7 Queue (future) │
                    │ Redis / BullMQ    │
                    └───────────────────┘
```

---

## M1 — Core API Platform

| Item | Detail |
|------|--------|
| **Path** | `server/` |
| **Responsibility** | JWT auth, org scoping, message pipeline, conversations, contacts, numbers, compliance hooks |
| **Key services** | `smsService`, `messageStateService`, `campaignStateService`, `conversationStateService`, `inboundProcessor`, `webhookProcessor` |
| **State machine** | `domain/states.js`, migrations `002_state_machine.sql` |
| **Tests** | `npm run test:state`, `npm run smoke` |
| **Deep-dive focus** | Idempotency, timeline APIs, audit trail, rate limits, encryption at rest |

---

## M2 — Provider Lane A (API dialers)

| Item | Detail |
|------|--------|
| **Path** | `server/services/providers/` |
| **Responsibility** | Vonage, Twilio, Telnyx, Bandwidth, Zoom, Ringox, 3CX adapters; webhook normalization; sandbox mode |
| **Registry** | `providerRegistry.js`, `providerRouter.js` |
| **Webhooks** | `server/routes/webhooks.js` + signature verification middleware |
| **Tests** | `npm run test:dialers:unit`, `npm run test:dialers` |
| **Deep-dive focus** | Live credential rotation, per-provider retry policy, cost estimation, webhook replay |

---

## M3 — Browser Lane B (DOM/BOM)

| Item | Detail |
|------|--------|
| **Path** | `automation-worker/` + `server/services/browserProfileService.js`, `browserLaneDispatcher.js` |
| **Responsibility** | Google Voice & advertiser portals via headless browser; profile CRUD; inbound poll scheduler |
| **Worker** | FastAPI + Playwright persistent contexts; selector templates |
| **Bridge** | `server/routes/internal/worker.js` (service token) |
| **Tests** | `npm run test:browser` |
| **Deep-dive focus** | Session recovery, selector versioning, PyQt6 alternate engine (PRD), captcha/2FA flows |

---

## M4 — Admin Surfaces

| Item | Detail |
|------|--------|
| **Path** | `client-app/src/pages/AdminConsole.jsx`, `SuperAdminConsole.jsx` |
| **Responsibility** | Team admin (users, usage, audit); Super Admin (dialer backends, browser profiles, observability) |
| **APIs** | `/api/admin/*`, `/api/super/*` |
| **Deep-dive focus** | Org-scoped RBAC UI, masked credentials, connection badges, webhook log viewer |

---

## M5 — Customer Dialer (opaque UX)

| Item | Detail |
|------|--------|
| **Path** | `client-app/src/pages/Inbox.jsx`, `ManualSms.jsx`, `Contacts.jsx`, `Numbers.jsx`, `Settings.jsx` |
| **Responsibility** | End-user texting workspace; no provider names exposed |
| **Deep-dive focus** | Real-time inbox, compose UX, STOP compliance, mobile layout, notification sounds |

---

## M6 — Ops & Deploy

| Item | Detail |
|------|--------|
| **Path** | `docker-compose.yml`, `.github/workflows/`, `render.yaml`, migrations |
| **Responsibility** | Postgres, automation-worker container, CI smoke + dialer + browser + state tests |
| **Targets** | API → Vercel/Render; frontend → Vercel; worker → Docker/Render private service |
| **Deep-dive focus** | Secrets management, `PUBLIC_BACKEND_URL` for Twilio sigs, worker token parity |

---

## M7 — Queue Layer

| Item | Detail |
|------|--------|
| **Path** | `server/services/queue/campaignDriver/` |
| **Responsibility** | BullMQ/Redis campaign fan-out; memory fallback for CI/local |
| **Worker** | Embedded in API or `npm run campaign-worker` |
| **Tests** | `npm run test:campaign-fanout`, `npm run test:campaign-bullmq` |
| **Deep-dive focus** | Pause/resume, dead-letter retry, progress UI, rate stagger |

---

## Cross-module contracts

| Contract | Producer | Consumer |
|----------|----------|----------|
| `ProviderAdapter.sendSms()` | M2/M3 | M1 `smsService` |
| `processInboundWebhook()` | M2 webhooks, M3 poll | M1 `inboundProcessor` |
| `buildWorkerPayload()` | M1 `browserProfileService` | M3 worker |
| Message status events | M1 state services | M4/M5 UI timelines |
| `WORKER_SERVICE_TOKEN` | M6 env | M1 internal routes, M3 auth |

---

## Verification matrix

| Module | Command | CI |
|--------|---------|-----|
| M1 | `npm run smoke`, `npm run test:state`, `npm run test:compliance` | ✅ |
| M2 | `npm run test:dialers:unit`, `npm run test:dialers` | ✅ |
| M3 | `npm run test:browser` | ✅ |
| M4/M5 | `client-app/tests/smoke.spec.js` | build only |
| M6 | `npm run test:deploy-readiness`, `.github/workflows/deploy.yml` | ✅ |

---

## Related docs

- [ROADMAP-BIG.md](./ROADMAP-BIG.md) — phased deep-dive plan per module
- [PRD.md](../PRD.md) — product requirements
- [TESTING.md](../TESTING.md) — local runbook
