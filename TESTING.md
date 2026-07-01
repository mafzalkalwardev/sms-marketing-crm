# Testing

SignalMint v3.3 test matrix. All backend scripts run from `server/` with Postgres up (`docker compose up -d`).

## Prerequisites

```powershell
Set-Location "D:\SMS Marketing App"
docker compose up -d

Set-Location "D:\SMS Marketing App\server"
Copy-Item .env.example .env   # first time only
npm install
npm run migrate
npm run seed
npm run dev                   # terminal 1
```

Optional worker (browser lane):

```powershell
docker compose up -d automation-worker
# or: cd automation-worker && uvicorn main:app --port 5055
```

---

## Quick verification

| Command | What it checks |
|---------|----------------|
| `npm run smoke` | End-to-end API: auth, send, webhooks, STOP, campaigns, audit |
| `npm run test:all` | Full automated suite (see below) |

---

## Full automated suite

```powershell
Set-Location "D:\SMS Marketing App\server"

npm run test:state              # Message/campaign/conversation state machines
npm run test:message-audit      # Audit log on status transitions
npm run test:dialers:unit       # All 9 adapter unit tests (no API)
npm run test:dialers            # Integration send per adapter (API running)
npm run test:browser            # Browser lane dispatch (worker required)
npm run test:browser-session    # Session store + re-login detection
npm run test:campaign-queue     # Async campaign enqueue
npm run test:campaign-fanout    # Multi-recipient fan-out
npm run test:campaign-bullmq    # BullMQ + Redis (skips without REDIS_URL)
npm run test:compliance         # Suppression summary + export API
npm run test:live-readiness     # Live mode blockers checklist
npm run test:webhook-replay     # Dead-letter retry
npm run test:deploy-readiness   # Deploy blueprint + health
npm run test:enterprise         # Org isolation, branding, API keys

# Or run the bundled suite:
npm run test:all

# Load (adjust counts for your machine)
$env:LOAD_TEST_COUNT=50; $env:LOAD_TEST_CONCURRENCY=5; npm run test:load
npm run test:load:stress        # 1000 messages
```

Smoke test refuses live SMS unless `SMOKE_ALLOW_LIVE=true`.

CI runs the full suite on push (see `.github/workflows/deploy.yml`).

---

## Frontend

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npm install
npm run build
npm start                       # http://localhost:3000
```

Playwright E2E (optional):

```powershell
npx playwright install chromium
npm run test:e2e
```

---

## Manual — mock mode

1. Login: `user1@demo.local` / `password123` (after seed).
2. Messages → open conversation → send reply.
3. Contacts → add opted-in contact.
4. Numbers → add sender, set default.
5. New Text → send → status `sent_mock`.
6. Compliance → view suppressions, export CSV.
7. Reports → filter by date range.
8. Mobile: narrow viewport → inbox list/chat toggle.

---

## Manual — live Vonage / Twilio

1. Rotate any exposed secrets first ([SECRETS-RUNBOOK.md](./.planning/SECRETS-RUNBOOK.md)).
2. Set in `server/.env`:
   - `SMS_SANDBOX_MODE=false`, `VONAGE_MOCK_MODE=false`
   - Provider credentials + `PUBLIC_BACKEND_URL`
3. Restart API.
4. Super Admin → Providers → connection test → one live SMS.
5. Configure provider webhooks to URLs shown in Super Admin.

---

## Webhook tests

### Inbound (ngrok)

1. `ngrok http 5000`
2. Set Vonage inbound URL to `https://<ngrok>/webhooks/vonage/inbound`
3. SMS your sender number → appears in Messages.
4. Reply `STOP` → contact unsubscribed, future sends blocked.

### Signed webhooks

- With `VONAGE_SIGNATURE_SECRET`: unsigned requests → `401`.
- Without secret in development: allowed with warning.
- Production without secret: `401`.

### Status callback

POST `/webhooks/vonage/status` with provider message ID + `delivered` → message status updates.

### Dead letters

Failed webhook processing → `webhook_dead_letters` table. Super Admin observability → replay.

---

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `super_admin@signalmint.local` | `password123` |
| Admin | `admin@ftsolutions.local` | `password123` |
| User | `user1@demo.local` | `password123` |
