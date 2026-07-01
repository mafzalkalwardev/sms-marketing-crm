# SignalMint

White-label business texting platform with an **opaque multi-provider backend**. Customers use the SignalMint dialer UI only — Vonage, Twilio, Telnyx, Bandwidth, Zoom, Google Voice (browser automation), RingoX, and 3CX run behind the scenes under Super Admin control.

## What's new in v3.4

- **TONY AI Agent** — full autonomous agent platform in [`tony-agent/`](tony-agent/) (memory, skills, tools, gateway, crew)
- **Inbox polling** — conversations refresh every 12s without manual reload

## What's new in v3.3

**Milestone complete** — all 7 roadmap phases shipped in sandbox mode.

- **Phase 6** — BullMQ campaign fan-out, progress UI, dead-letter retry
- **Phase 7** — Multi-org tenancy, white-label branding, API keys (`/api/v1`), SOC2 audit CSV export, message retention
- **`npm run test:all`** — runs the full automated verification suite
- See [.planning/MILESTONE-v3.3-COMPLETE.md](.planning/MILESTONE-v3.3-COMPLETE.md) for the full summary

## What's new in v3.2

- **Phase 4 UX** — Compliance page, reports date filters, mobile inbox, full nav wiring
- **Phase 5 Ops** — Deploy readiness test, secrets runbook, `RENDER_EXTERNAL_URL` webhook fallback
- **Full local stack** — `docker compose` runs Postgres + automation-worker together
- **Render blueprint** — API + worker + Postgres with health checks (`render.yaml`)

Prior v3.1: PostgreSQL, provider router, Super Admin, Twilio, browser lane scaffold, CI.

## TONY AI Agent

Personal AI operating system at [`tony-agent/`](tony-agent/README.md):

```powershell
cd tony-agent
npm install
npm test
npm run chat
```

Patterns from JARVIS, OpenClaw, CrewAI, LangGraph, AutoGPT, and 15+ other OSS agents. Integrates with SignalMint for SMS ops.

## Architecture

```text
React dialer UI  →  Node API (PostgreSQL)  →  Provider router
                                              ├─ Vonage / Twilio / Mock (API lane)
                                              └─ automation-worker (browser lane)
```

## Demo logins (after seed)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `super_admin@signalmint.local` | `password123` |
| Admin | `admin@ftsolutions.local` | `password123` |
| User | `user1@demo.local` | `password123` |

## Quick start (local)

### 1. PostgreSQL + worker (recommended)

```powershell
Set-Location "D:\SMS Marketing App"
docker compose up -d
```

Starts Postgres on **5434**, Redis on **6380**, and automation-worker on **5055**.

### 2. Backend

```powershell
Set-Location "D:\SMS Marketing App\server"
Copy-Item .env.example .env
# Edit .env — set JWT_SECRET, DATABASE_URL
npm install
npm run dev
```

Default `DATABASE_URL` (Docker maps host port **5434** to avoid conflicts with other local Postgres):

```text
postgresql://signalmint:signalmint@localhost:5434/signalmint
```

On first boot the API runs migrations and auto-seeds demo users when `AUTO_SEED=true`.

### 3. Frontend

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npm install
npm start
```

Open http://localhost:3000

### 4. Smoke test

```powershell
Set-Location "D:\SMS Marketing App\server"
npm run test:all
npm run smoke
```

Full test matrix: [TESTING.md](./TESTING.md)

## Environment variables

See `server/.env.example` for full list. Key vars:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Auth tokens |
| `MASTER_ENCRYPTION_KEY` | Encrypt provider credentials at rest |
| `VONAGE_MOCK_MODE` | `true` for local mock SMS (default) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio bootstrap |
| `PUBLIC_BACKEND_URL` | Webhook base URL for providers |
| `AUTOMATION_WORKER_URL` | Browser lane Python worker |

## Provider webhooks

Configure at your provider (Super Admin console shows URLs):

```text
POST /webhooks/vonage/inbound
POST /webhooks/vonage/status
POST /webhooks/twilio/inbound
POST /webhooks/twilio/status
```

## Browser automation worker (Lane B)

For Google Voice and advertiser portals without APIs:

```powershell
Set-Location "D:\SMS Marketing App\automation-worker"
pip install -r requirements.txt
uvicorn main:app --port 5055
```

Set `AUTOMATION_WORKER_URL=http://localhost:5055` in server `.env`.

## Deploy live

### Live URLs (production)

| Service | URL |
|---------|-----|
| **Frontend** | https://client-app-alpha-livid.vercel.app |
| **API** | https://signalmint-api.vercel.app |
| **Health** | https://signalmint-api.vercel.app/api/health |

Demo logins work on production after seed (`AUTO_SEED=true` on first boot).

### Enable real live SMS (not sandbox)

Production is currently in **sandbox mode** — messages are stored in the app but **not delivered to real phones** until you configure a live provider:

1. Open **Super Admin** → check the **Delivery mode** banner (shows `sandbox` or `live`)
2. In Vercel project `signalmint-api`, set environment variables:
   - `VONAGE_API_KEY` and `VONAGE_API_SECRET` (or Twilio `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`)
   - `VONAGE_DEFAULT_FROM` = your approved sender number (E.164)
   - `VONAGE_MOCK_MODE=false` (disables sandbox)
   - `PUBLIC_BACKEND_URL=https://signalmint-api.vercel.app` (for delivery webhooks)
3. Redeploy the API, then send a **live test SMS** from Super Admin

Supported dialer backends (Super Admin → Add dialer backend):

| Lane | Dialers |
|------|---------|
| **API** | Vonage, Twilio, Telnyx, Bandwidth, Zoom Phone, RingoX, 3CX |
| **Browser** | Google Voice, Advertiser web dialers (via automation worker) |

Customers never see which backend is used — they only see Sent / Delivered / Failed in the dialer UI.

### Backend + PostgreSQL on Vercel + Neon

The API is deployed as a Vercel serverless Node project (`server/`) with Neon Postgres via the Vercel Marketplace integration.

```powershell
Set-Location "D:\SMS Marketing App\server"
vercel link
vercel integration add neon
vercel deploy --prod
```

Required env vars: `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `DATABASE_SSL=true`, `VONAGE_MOCK_MODE`, `PUBLIC_BACKEND_URL`.

### Backend + PostgreSQL + worker on Render

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → New Blueprint → connect repo
3. Applies `render.yaml`: `signalmint-api`, `signalmint-worker` (Docker + profile disk), `signalmint-db`
4. `WORKER_SERVICE_TOKEN` syncs API ↔ worker automatically
5. `RENDER_EXTERNAL_URL` is used for webhooks when `PUBLIC_BACKEND_URL` is unset
6. Set `VONAGE_*` / `TWILIO_*` and `SMS_SANDBOX_MODE=false` for live SMS

### Backend + PostgreSQL on Render (API only)

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → New Blueprint → connect repo
3. Uses `render.yaml` (API + free Postgres)
4. Set `VONAGE_*` / `TWILIO_*` in Render env

### Frontend on Vercel

1. Import repo in [Vercel](https://vercel.com)
2. Root directory: `client-app`
3. Environment: `REACT_APP_API_URL=https://signalmint-api.vercel.app`
4. Deploy

### GitHub Actions

CI runs on push to `main` / `vonage-live-sms-integration` — Postgres service, migrate, seed, smoke test, frontend build.

## Project structure

```text
server/              Node API, PostgreSQL, provider adapters
client-app/          React dialer UI
automation-worker/   Python browser automation (Lane B)
PRD.md               Product requirements v3.1
docker-compose.yml   Local PostgreSQL
render.yaml          Render deployment
.github/workflows/   CI pipeline
```

## Roles

| Role | Can see providers? | Capabilities |
|------|-------------------|--------------|
| **User** | No | Inbox, dialpad, contacts, assigned numbers |
| **Admin** | No | Manage org users, numbers, reports |
| **Super Admin** | Yes | All providers, suspend anyone, test SMS |

## Compliance

- STOP/unsubscribe auto-detection
- Suppression list blocks future sends
- US 10DLC / UK sender rules — configure per provider account

## Docs

- [PRD.md](./PRD.md) — full product spec
- [TESTING.md](./TESTING.md) — manual + automated tests
- [AUDIT.md](./AUDIT.md) — platform snapshot (v3.3)
- [.planning/MODULES.md](./.planning/MODULES.md) — module architecture
- [.planning/MILESTONE-v3.3-COMPLETE.md](./.planning/MILESTONE-v3.3-COMPLETE.md) — milestone summary
- [.planning/SECRETS-RUNBOOK.md](./.planning/SECRETS-RUNBOOK.md) — credential rotation
