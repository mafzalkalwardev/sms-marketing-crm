# SignalMint

White-label business texting platform with an **opaque multi-provider backend**. Customers use the SignalMint dialer UI only — Vonage, Twilio, Telnyx, Bandwidth, Zoom, Google Voice (browser automation), RingoX, and 3CX run behind the scenes under Super Admin control.

## Live demo (no Docker required)

Test the full platform online — no local Postgres or Docker needed.

| Service | URL |
|---------|-----|
| **App (login here)** | https://client-app-alpha-livid.vercel.app |
| **API** | https://signalmint-api.vercel.app |
| **Health** | https://signalmint-api.vercel.app/api/health |
| **API root** | https://signalmint-api.vercel.app/ |

Open the **frontend URL** to sign in. The API URL is for health checks and integrations only (visiting `/` in a browser shows JSON, not the app).

### Demo logins (production, after seed)

| Role | Email | Password | What you can do |
|------|-------|----------|-----------------|
| Super Admin | `super_admin@signalmint.local` | `password123` | All orgs, providers, impersonation, approvals |
| Admin (FT Solutions) | `admin@ftsolutions.local` | `password123` | Manage own users, branding, API keys |
| Admin (Acme) | `admin@acme.local` | `password123` | Separate org — cannot see FT users |
| User (FT) | `user1@demo.local` | `password123` | Inbox, dialpad, contacts |
| User (Acme) | `user2@demo.local` | `password123` | Inbox in Acme org only |

## What's new in v3.5 — Governance & live-ready auth

- **OTP signup** — email + SMS verification codes, then admin approval before account activates
- **Role hierarchy** — Super Admin → Admin (per org) → User with strict data isolation
- **Super Admin powers** — create/suspend/delete admins & users, approve signups, **Login as** any user
- **Admin powers** — create/delete users in own org only; cannot see other admins' teams
- **JWT sessions** — server-side revocation on suspend; logout endpoint
- **Per-org delivery mode** — Super Admin toggles sandbox/live per organization
- **API root** — `GET /` returns service info (fixes confusing "Cannot GET /" error)

## What's new in v3.4

- **Inbox polling** — conversations refresh every 12s without manual reload
- **TONY AI Agent** moved to standalone repo: `D:\TONY AI AGENT`

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system diagram, roles, live delivery gates, and deploy URLs.

```text
React dialer UI  →  Node API (PostgreSQL)  →  Provider router
                                              ├─ Twilio / Vonage / Mock (API lane)
                                              └─ automation-worker (browser lane)
```

### Go live (Twilio)

1. Unpause your Twilio account and buy an SMS-capable number
2. Set Vercel env on `signalmint-api`:
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_DEFAULT_FROM`
   - `SMS_SANDBOX_MODE=false`, `VONAGE_MOCK_MODE=false`
   - `PUBLIC_BACKEND_URL=https://signalmint-api.vercel.app`
   - `AUTO_LIVE_ORGS=true` (promotes active orgs to live on boot)
3. Configure Twilio webhooks:
   - Inbound: `https://signalmint-api.vercel.app/webhooks/twilio/inbound`
   - Status: `https://signalmint-api.vercel.app/webhooks/twilio/status`
4. Redeploy API → Super Admin → Test connection / warm-up SMS

**Security:** Never commit Twilio tokens to git. Rotate the Auth Token if it was pasted into chat or tickets.

## Public signup flow

1. **Create account** — name, email, phone (E.164), password; optional org invite code
2. **Verify email** — 6-digit OTP (in production: email; dev: server console when `OTP_LOG_TO_CONSOLE=true`)
3. **Verify phone** — SMS OTP
4. **Pending approval** — Admin or Super Admin approves in Team admin / Platform console
5. **Sign in** — account becomes `active`

Admins can also **create users directly** (skips OTP) from Team admin → Users.

## Super Admin quick guide

1. Log in as `super_admin@signalmint.local`
2. Open **Platform** in the sidebar
3. **Pending approvals** — approve new signups
4. **Create admin** — provisions a new organization automatically
5. **Organizations** — toggle per-org sandbox/live delivery
6. **Login as** — impersonate any active user to see their inbox

## Admin quick guide

1. Log in as `admin@ftsolutions.local`
2. Open **Team admin**
3. **Create user** — adds a user to your org (you are their manager)
4. **Pending approvals** — approve signups assigned to your org
5. **Branding** — white-label name and colors for your org

## Integration API

```http
Authorization: Bearer smk_…
GET  /api/v1/contacts
POST /api/v1/messages/send  { "to", "from", "message" }
```

Create keys in **Team admin → API keys**.

## Local development (optional)

If you have Docker and disk space:

```powershell
docker compose up -d   # Postgres :5434, Redis :6380, worker :5055
cd server
Copy-Item .env.example .env
npm install && npm run dev
```

```powershell
cd client-app
npm install && npm run dev
```

Without Docker, use the **live URLs** above for testing.

## Environment variables (API)

See `server/.env.example`. Key production vars:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon / Postgres connection |
| `JWT_SECRET` | Auth tokens |
| `MASTER_ENCRYPTION_KEY` | Encrypt provider credentials |
| `AUTO_SEED=true` | Demo users on first boot |
| `OTP_LOG_TO_CONSOLE=true` | Log OTP codes to Vercel logs (for testing without email SMTP) |
| `REQUIRE_ADMIN_APPROVAL=true` | Signups need admin approval (default) |
| `SMS_SANDBOX_MODE=true` | Mock SMS delivery (safe for testing) |
| `PUBLIC_BACKEND_URL` | Webhook base URL |

## Deploy to Vercel

### API (`server/`)

```powershell
cd server
vercel link
vercel deploy --prod
```

Set env vars in Vercel dashboard for `signalmint-api`. Migrations run automatically on boot.

### Frontend (Vite)

```bash
cd client-app
npm install
npm run dev          # http://localhost:3000
```

Set `VITE_API_URL` (production default: `https://signalmint-api.vercel.app`). Legacy `REACT_APP_API_URL` is still aliased in Vite config.

Stack: React 18, Vite, TypeScript/JSX, Tailwind, shadcn/ui, Framer Motion, GSAP. (`client-app/`)

```powershell
cd client-app
vercel link
vercel deploy --prod
```

Set `VITE_API_URL=https://signalmint-api.vercel.app`

## Verification

```powershell
cd server
npm run test:all
npm run smoke
```

CI runs on push to `main`.

## Roles

| Role | Can see providers? | Capabilities |
|------|-------------------|--------------|
| **User** | No | Inbox, dialpad, contacts, assigned numbers |
| **Admin** | No | Manage org users, numbers, reports, branding |
| **Super Admin** | Yes | All providers, all orgs, impersonation, approvals |

## Docs

- [TESTING.md](./TESTING.md) — manual + automated tests
- [PRD.md](./PRD.md) — full product spec
- [.planning/SECRETS-RUNBOOK.md](.planning/SECRETS-RUNBOOK.md) — credential rotation
