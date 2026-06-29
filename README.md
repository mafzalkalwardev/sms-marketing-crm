# SignalMint

White-label business texting platform with an **opaque multi-provider backend**. Customers use the SignalMint dialer UI only — Vonage, Twilio, Telnyx, Bandwidth, Zoom, Google Voice (browser automation), RingoX, and 3CX run behind the scenes under Super Admin control.

## What's new in v3.1

- **PostgreSQL** replaces SQLite (production-ready multi-tenant storage)
- **Provider router** — outbound SMS routes by sender number to Vonage, Twilio, or mock
- **Super Admin** role — provider backends, user suspension, platform audit (`/api/super/*`)
- **Opaque API** — customers never see provider names or backend details in responses
- **Twilio adapter** — send + inbound/status webhooks with signature verification
- **Browser automation lane** — Python `automation-worker/` scaffold for Google Voice / advertiser web dialers (DOM/BOM)
- **Deploy configs** — Render (API + Postgres), Vercel (React frontend), GitHub Actions CI

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

### 1. PostgreSQL

```powershell
Set-Location "D:\SMS Marketing App"
docker compose up -d
```

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
npm run smoke
```

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

### Backend + PostgreSQL on Vercel + Neon

The API is deployed as a Vercel serverless Node project (`server/`) with Neon Postgres via the Vercel Marketplace integration.

```powershell
Set-Location "D:\SMS Marketing App\server"
vercel link
vercel integration add neon
vercel deploy --prod
```

Required env vars: `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `DATABASE_SSL=true`, `VONAGE_MOCK_MODE`, `PUBLIC_BACKEND_URL`.

### Backend + PostgreSQL on Render (alternative)

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
