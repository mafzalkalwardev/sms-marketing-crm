# SignalMint — Big Project Roadmap (Module Deep-Dives)

**Status: ✅ v3.3 milestone complete** (sandbox). See [MILESTONE-v3.3-COMPLETE.md](./MILESTONE-v3.3-COMPLETE.md).

Phased plan to evolve SignalMint from **v3.2 sandbox-complete** to **production-scale white-label platform**. Each phase deep-dives one module; phases can overlap when dependencies are met.

---

## Current baseline (v3.2)

- ✅ 9/9 API dialer adapters (sandbox)
- ✅ Message/campaign/conversation state machines
- ✅ Browser lane scaffold (Playwright worker + profiles)
- ✅ Super Admin: dialers, browser profiles, observability
- ✅ Team Admin: users, usage, audit (org-scoped)
- ✅ CI: smoke + state + dialers + browser tests

---

## Phase 1 — M1 Core hardening (2 weeks)

**Goal:** Production-ready messaging core.

| Task | Priority |
|------|----------|
| Redis idempotency keys for `sendSms` | P1 |
| Message timeline UI in customer inbox | P1 |
| Campaign broadcast through queue stub | P2 |
| Subscription limit enforcement on send | P1 |
| Full audit on message state transitions | P2 |

**Exit criteria:** 10k messages/day in load test without duplicate sends; limits enforced.

---

## Phase 2 — M2 Live API dialers (2–3 weeks)

**Goal:** Flip `SMS_SANDBOX_MODE=false` with confidence.

| Task | Priority |
|------|----------|
| Vercel env: Vonage + Twilio live creds | P0 |
| `PUBLIC_BACKEND_URL` for Twilio signature validation | P0 |
| Per-provider connection health cron | P1 |
| Webhook replay + dead-letter for failed processing | P1 |
| Cost estimate accuracy per provider | P2 |

**Exit criteria:** Live send + inbound + status webhooks for Vonage and Twilio in staging.

---

## Phase 3 — M3 Browser lane production (3–4 weeks)

**Goal:** Google Voice send/receive without manual poll.

| Task | Priority |
|------|----------|
| Playwright `chromium` in production worker image | ✅ |
| Automated inbound poll scheduler | ✅ |
| Session persistence + re-login detection | P1 |
| Selector version migration tool | P1 |
| PyQt6 engine spike (optional PRD path) | P3 |
| Render/Railway worker deploy | P1 |

**Exit criteria:** 24h soak test — send + receive via Google Voice profile without manual Super Admin poll.

---

## Phase 4 — M4/M5 Customer & admin UX (2 weeks)

**Goal:** Complete surfaces; wire orphan pages.

| Task | Priority |
|------|----------|
| Admin Console full API wiring | ✅ |
| Super Admin observability panel | ✅ |
| Wire `Campaigns.jsx`, `Reports.jsx`, `Dashboard.jsx` into nav | P1 |
| Compliance page + STOP audit export | P2 |
| Mobile-responsive inbox | P2 |

**Exit criteria:** Admin can manage team without Super Admin; customer never sees provider names.

---

## Phase 5 — M6 Ops & scale (2 weeks)

**Goal:** Deploy automation-worker; staging/prod parity.

| Task | Priority |
|------|----------|
| CI expanded (state + dialers + browser) | ✅ |
| `render.yaml` automation-worker service | P1 |
| Secrets rotation runbook | P1 |
| `AUDIT.md` / `TESTING.md` refresh | P2 |
| Playwright E2E in CI (optional) | P3 |

**Exit criteria:** One-click deploy API + worker + DB; green CI on main.

---

## Phase 6 — M7 Queue & campaigns (3–4 weeks)

**Goal:** High-volume broadcast with pause/resume.

| Task | Priority |
|------|----------|
| Redis + BullMQ worker process | P0 |
| Campaign job fan-out from `campaignService` | P0 |
| Rate limiting per provider/org | P1 |
| Campaign progress UI | P1 |
| Dead-letter + manual retry | P2 |

**Exit criteria:** 50k recipient campaign completes with visible progress and pause/resume.

---

## Phase 7 — Enterprise & compliance (ongoing)

| Task | Priority |
|------|----------|
| Multi-org tenancy hardening | P1 |
| SOC2-oriented audit export | P2 |
| HIPAA mode (message retention policies) | P3 |
| White-label branding per org | P2 |
| API keys for customer integrations | P2 |

---

## Module ownership map

| Module | Primary dirs | Lead concern |
|--------|--------------|--------------|
| M1 | `server/services/`, `server/domain/` | Correctness, idempotency |
| M2 | `server/services/providers/` | Provider parity |
| M3 | `automation-worker/` | Session reliability |
| M4 | `client-app/src/pages/Admin*.jsx` | RBAC UX |
| M5 | `client-app/src/pages/Inbox*.jsx` | Opaque dialer UX |
| M6 | `docker-compose`, `.github/` | Deploy confidence |
| M7 | *new* `server/workers/` | Throughput |

---

## Next immediate actions (post-milestone)

1. Set live Vonage/Twilio on Vercel when credentials are ready (`SMS_SANDBOX_MODE=false`)
2. Deploy `automation-worker` to Render with `WORKER_SANDBOX_MODE=false`
3. Optional: Playwright E2E in CI gate
4. Optional: 50k campaign soak with Redis + tuned `CAMPAIGN_WORKER_CONCURRENCY`

Completed: Campaigns/Dashboard nav, M7 Redis queue, enterprise features (Phase 7).

See [MODULES.md](./MODULES.md) for boundaries and test commands.
