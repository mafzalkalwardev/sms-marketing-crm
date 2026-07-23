# SignalMint Architecture

White-label business SMS CRM with opaque multi-provider delivery. Customers use the SignalMint dialer UI; Super Admin owns provider credentials, delivery mode, and tenancy.

## System diagram

```text
┌─────────────────────┐     HTTPS/JSON      ┌──────────────────────────┐
│  client-app (React) │ ──────────────────► │  server (Express / Node) │
│  Vercel             │ ◄────────────────── │  Vercel serverless       │
│  Landing → Login →  │                     │  JWT sessions + RBAC     │
│  Dialer workspace   │                     └────────────┬─────────────┘
└─────────────────────┘                                  │
                                                         │ SQL
                                                         ▼
                                              ┌──────────────────────┐
                                              │  PostgreSQL          │
                                              │  orgs · users · msgs │
                                              └──────────┬───────────┘
                                                         │
                                              Provider router
                                   ┌─────────────────────┼─────────────────────┐
                                   ▼                     ▼                     ▼
                              Twilio API            Vonage API           Browser lane
                              (primary live)        (optional)           automation-worker
```

## Roles & tenancy

| Role | Scope | Powers |
|------|-------|--------|
| `super_admin` | Platform | Providers, org live/sandbox, create admins/users, limits, impersonate, approvals |
| `admin` | Own `organization_id` | Create/approve/limit users, branding, org API keys |
| `user` | Own workspace under admin | Inbox, contacts, campaigns, numbers (within limits) |

Isolation: `organization_id` + `managed_by_admin_id`. Admins never see other orgs' data.

## Delivery mode (go-live)

Live SMS requires **all** of:

1. `SMS_SANDBOX_MODE=false` (and prefer `VONAGE_MOCK_MODE=false`)
2. Twilio (or Vonage) credentials on the API host
3. `TWILIO_DEFAULT_FROM` = SMS-capable E.164 number on the Twilio account
4. `PUBLIC_BACKEND_URL` = public API URL (webhook signature base)
5. Org `delivery_mode = 'live'` (Super Admin → Organizations → Toggle live)
6. User `status = 'active'`

`shouldUseMockSend()` in `server/services/providers/sandbox.js` short-circuits to mock when any gate fails.

## Auth flow

1. Register → email OTP → phone OTP → `pending_approval`
2. Admin or Super Admin approves → `active`
3. Login → JWT with `jti` session row (revocable on logout/suspend)

## Frontend surface

- **Marketing landing** (`/`) — product pitch + CTA
- **Login / signup** — auth wizard
- **Workspace** — inbox, dialpad, contacts, campaigns, reports, compliance, numbers, settings
- **Team admin** — admin-only
- **Platform** — super-admin-only (dialers, orgs, limits, observability)

## API surface (selected)

| Area | Prefix |
|------|--------|
| Auth | `/api/auth` |
| Dialer data | `/api/inbox`, `/api/messages`, `/api/contacts`, `/api/campaigns` |
| Admin | `/api/admin` |
| Super Admin | `/api/super` |
| Public integration | `/api/v1` |
| Health | `/api/health` |
| Twilio webhooks | `/webhooks/twilio/inbound`, `/webhooks/twilio/status` |

## Env (production)

See `server/.env.example`. Minimum live Twilio set:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_DEFAULT_FROM`
- `SMS_SANDBOX_MODE=false`
- `PUBLIC_BACKEND_URL=https://signalmint-api.vercel.app`
- `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `DATABASE_URL`

**Never commit secrets.** Set them in the Vercel project env for `signalmint-api`.

## Deploy

| App | Vercel project | URL |
|-----|----------------|-----|
| API | `signalmint-api` | https://signalmint-api.vercel.app |
| Frontend | `client-app` | https://client-app-alpha-livid.vercel.app |

Custom domain: point DNS to Vercel, then update `PUBLIC_BACKEND_URL`, `REACT_APP_API_URL`, and Twilio webhook URLs.
