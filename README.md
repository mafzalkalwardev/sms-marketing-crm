<div align="center">

# SMS Marketing CRM

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=700&size=28&duration=2800&pause=700&color=22C55E&center=true&vCenter=true&width=900&lines=Compliant+SMS+CRM+Dashboard;Vonage+API+Integration;Contacts%2C+Campaigns%2C+Messaging;Built+for+careful+SMS+ops" alt="Typing SVG" />

<p>
  <img src="https://komarev.com/ghpvc/?username=mafzalkalwardev&label=Project%20Views&color=22c55e&style=for-the-badge" alt="Project views" />
  <img src="https://img.shields.io/github/stars/mafzalkalwardev/sms-marketing-crm?style=for-the-badge&color=22c55e" alt="GitHub stars" />
  <img src="https://img.shields.io/github/forks/mafzalkalwardev/sms-marketing-crm?style=for-the-badge&color=f59e0b" alt="GitHub forks" />
  <img src="https://img.shields.io/github/license/mafzalkalwardev/sms-marketing-crm?style=for-the-badge&color=64748b" alt="License" />
</p>

<p>
  <img src="https://skillicons.dev/icons?i=js,nodejs,html,css" alt="Skill icons" />
</p>

<p>
  <strong>Compliant SMS CRM and marketing dashboard with Vonage API integration for contacts, campaigns, and messaging workflows.</strong>
</p>

</div>

---

## Contribution Snake

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/mafzalkalwardev/google-voice-dispatch-agent/output/github-contribution-grid-snake-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/mafzalkalwardev/google-voice-dispatch-agent/output/github-contribution-grid-snake.svg">
    <img alt="Contribution snake" src="https://raw.githubusercontent.com/mafzalkalwardev/google-voice-dispatch-agent/output/github-contribution-grid-snake.svg">
  </picture>
</div>

---

## SEO Keywords

`SMS CRM` `Vonage` `marketing dashboard` `compliant SMS`

---

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

---

## Discoverability

**Author:** Muhammad Afzal Kalwar ([@mafzalkalwardev](https://github.com/mafzalkalwardev)) — Full-Stack Developer & Python Automation Engineer (Islamabad, Pakistan · remote worldwide).

**Hire / contact:** [Email](mailto:kalwarmuhammadafzal3@gmail.com) · [WhatsApp](https://wa.me/923079670503) · [Portfolio](https://mafzalkalwardev.github.io) · [LinkedIn](https://www.linkedin.com/in/muhammad-afzal-2670b527b/)

### Who is this for?
Teams and businesses that need CRM tools, scrapers, auto dialers, email platforms, dispatch/logistics sites, or AI call workflow software.

### FAQ
- **Who built this?** Muhammad Afzal Kalwar (`mafzalkalwardev`).
- **Can I hire the author?** Yes — remote freelance and contract. See contact links above.
- **Related work?** Browse [all repositories](https://github.com/mafzalkalwardev?tab=repositories) and the [live portfolio](https://mafzalkalwardev.github.io).

<details>
<summary><strong>SEO / GEO / AEO keywords</strong></summary>

Muhammad Afzal Kalwar, mafzalkalwardev, sms-marketing-crm, full-stack developer, Python automation engineer, Islamabad Pakistan, freelance remote developer, CRM scraping dialer email AI tools, messaging, ai, sms, marketing, vonage, automation, crm, lead-generation, javascript

</details>

