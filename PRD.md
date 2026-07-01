# SignalMint — Product Requirements Document (PRD)

**Version:** 3.1  
**Status:** Approved direction — ready for implementation  
**Last updated:** 2026-06-28  
**Product:** SignalMint — white-label business texting platform with opaque multi-provider backend  
**Supersedes:** `sms_marketing_crm_app_plan.md`, PRD v2.0  
**Related:** `ROADMAP.md`, `AUDIT.md`, `README.md`

---

## 1. Executive Summary

SignalMint is a **white-label business texting platform**. End customers use **only the SignalMint dialer UI** (inbox, dialpad, contacts, numbers). They never see which carrier, API, PBX, or gateway delivers SMS behind the scenes.

A **Super Admin** operates the entire provider layer using **two integration classes**:

1. **API adapters** — Vonage, Twilio, Telnyx, Bandwidth, Zoom Phone, RingoX, 3CX, and any dialer with a documented REST/webhook API.
2. **Browser automation adapters** — PyQt6 or persistent headless browsers that drive web UIs via **DOM/BOM** (same pattern as prior Google Voice work). Used for **advertisers**, Google Voice, and any dialer with no public API.

**Admins** manage their assigned users. **Users** send and receive SMS through the branded UI only.

### Locked product decisions

| Decision | Choice |
|----------|--------|
| Database | **PostgreSQL now** — migrate off SQLite in Phase 1 |
| Credential bootstrap | **`.env` for initial boot**; production credentials in encrypted DB rows managed by Super Admin |
| Channel scope | **SMS only** — no voice calls, no power-dialer auto-dial in this product |
| Customer surface | **SignalMint dialer UI only** — no provider names, webhook URLs, or backend tech exposed |
| Backend visibility | **Fully opaque (headless)** — routing, adapters, and provider failures are internal; customers see generic delivery states |
| Governance | **Super Admin → Admin → User** hierarchy with platform-wide suspend |

### Primary goals

1. **One opaque backend, many providers** — Super Admin attaches any supported dialer/gateway without customers knowing.
2. **Two adapter lanes** — (A) REST/webhook API adapters; (B) browser automation workers (PyQt6 / persistent Chromium) using DOM/BOM for web-only dialers including Google Voice and advertiser accounts.
3. **Compliance-first** — STOP/unsubscribe, suppression, consent, audit logs across all providers.
4. **Headless internal API** — same messaging pipeline powers the UI; not marketed as a multi-provider integrator to end customers.

### Non-goals

- Voice calling, call recording, or IVR (even if underlying platforms support it)
- Customer-facing provider selection or BYO-carrier UI
- SIM-bank / carrier-limit bypass / spam blasting
- Public documentation revealing which providers the platform uses

---

## 2. Terminology

| Term | Meaning |
|------|---------|
| **Super Admin** | Platform owner. Configures all providers, suspends any account, manages Admins. Only role that sees backend provider details. |
| **Admin** | Tenant/organization manager. Creates and manages Users, assigns numbers, views org reports. **Cannot** see provider names, credentials, or routing. |
| **User** | Agent/end customer. Uses dialer UI only: send, reply, contacts, assigned numbers. |
| **Provider / dialer backend** | Internal gateway: Vonage, Twilio, Telnyx, etc. Never shown in customer UI. |
| **API adapter** | Node.js module: REST send + verified webhooks (Vonage, Twilio, Telnyx, etc.). |
| **Browser adapter** | Python worker: persistent browser session drives a web dialer via DOM/BOM selectors (Google Voice, advertiser portals). |
| **Automation worker** | Isolated process/service that runs browser adapters; Node API enqueues jobs and polls results. |
| **Advertiser backend** | Super Admin–assigned browser-automation lane for orgs that send through web-only advertiser/dialer UIs. |
| **Opaque routing** | System picks adapter by sender number + Super Admin rules; response to UI strips provider identity. |
| **Bootstrap config** | `server/.env` seeds DB, encryption keys, and optional default provider for first boot. |

---

## 3. Role Model & Governance

### 3.1 Hierarchy

```text
Super Admin
    ├── manages Admins (create, suspend, assign org limits)
    ├── configures ALL provider adapters (global)
    ├── assigns sender numbers to orgs/users
    ├── can suspend ANY account (Admin or User) instantly
    └── views platform audit logs, provider health, webhook logs

Admin (per organization / workspace)
    ├── manages Users within their org
    ├── assigns numbers to users (from pool Super Admin provisioned)
    ├── views org-level reports (no provider column)
    └── CANNOT access provider settings, webhook URLs, or adapter names

User
    ├── manual SMS / inbox / contacts (scoped to org)
    ├── sees only: sending, sent, delivered, failed (generic)
    └── CANNOT access admin or super-admin surfaces
```

### 3.2 Account status

| Status | Effect |
|--------|--------|
| `active` | Normal operation |
| `suspended` | Login blocked; in-flight sends cancelled; webhooks still logged but no new outbound |
| `trial` | Limits enforced per plan |

**FR-GOV-01:** Super Admin suspend cascades — suspending an Admin suspends all Users under that Admin’s org(s).  
**FR-GOV-02:** Super Admin can suspend individual Users without suspending Admin.  
**FR-GOV-03:** Suspended users receive generic message: *"Your account is temporarily unavailable. Contact support."* — never expose provider or internal reason.

### 3.3 UI access matrix

| Surface | Super Admin | Admin | User |
|---------|:-----------:|:-----:|:----:|
| Dialer / Inbox / Contacts | Optional | Yes | Yes |
| Org user management | Yes | Yes (own org) | No |
| Numbers assignment | Yes | Yes (pool only) | View assigned |
| Reports (generic delivery) | Yes | Yes | Limited |
| Provider console | **Yes only** | **No** | **No** |
| Webhook logs | **Yes only** | **No** | **No** |
| Platform audit | **Yes only** | No | No |

---

## 4. Opaque Backend & White-Label UX

### 4.1 What customers see

- Branded SignalMint dialer: Messages, New Text, Contacts, Numbers (their assigned lines), Settings.
- Message statuses: `sending`, `sent`, `delivered`, `failed`, `undeliverable` — **never** `vonage`, `twilio`, `telnyx`, etc.
- Errors: *"Message could not be sent. Try again or contact support."* — internal `provider` and `error_code` stored server-side only.

### 4.2 What customers never see

- Provider names, logos, or selection dropdowns (Numbers UI shows label + E.164 only).
- Webhook URLs, API keys, adapter configuration.
- Admin provider test tools, smoke-test provider mode in health endpoint (public health returns generic `ok` only).
- Raw provider payloads in API responses.

### 4.3 API response sanitization (FR-OPAQ)

| Field | Stored in DB | Returned to Admin/User API |
|-------|:------------:|:--------------------------:|
| `provider` | Yes | **No** |
| `provider_message_id` | Yes | **No** (use internal `message_id` only) |
| `provider_id` | Yes | **No** |
| `metadata.raw` | Yes | **No** |
| `mode` (mock/live) | Yes | **No** |

Super Admin API (`/api/super/providers/*`) may include provider fields.

### 4.4 Headless architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Customer-facing layer (React dialer UI)                     │
│  — no provider knowledge                                     │
└────────────────────────────┬────────────────────────────────┘
                             │ JWT (user/admin)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Messaging API (sanitized responses)                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Messaging Service → Compliance → PostgreSQL                 │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Provider Router (Super Admin config only)                   │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│  API adapter lane (Node)   │   │  Browser adapter lane (Py)   │
│  Vonage · Twilio · Telnyx  │   │  PyQt6 QWebEngine OR         │
│  Bandwidth · Zoom · 3CX    │   │  Playwright persistent ctx   │
│  RingoX · Mock             │   │  DOM/BOM automation          │
└───────────────┬───────────┘   │  Google Voice · advertisers  │
                │               └──────────────┬──────────────┘
                │                              │
                └──────────────┬───────────────┘
                               ▼
                        Carrier / web UI
```

**Lane A — API adapters:** standard REST + inbound/status webhooks.  
**Lane B — Browser adapters:** no customer-visible difference; Super Admin assigns numbers to a browser profile; worker automates the vendor web UI.

---

## 5. Provider Catalog (SMS Only)

All providers are **internal**. Super Admin enables/disables globally or per organization.

Providers fall into **two lanes** (see §5.4 for browser automation):

| Lane | When to use | Examples |
|------|-------------|----------|
| **A — API** | Vendor exposes REST + webhooks (or SMPP) | Vonage, Twilio, Telnyx, Bandwidth, Zoom |
| **B — Browser** | Vendor is web-only; send/receive via DOM/BOM | Google Voice, advertiser dialer portals |

Customers never see which lane is used.

### 5.1 Tier 1 — Phase 1 (launch blockers) — API lane

| ID | Provider | Integration technique | SMS send | Inbound | DLR/status | Notes |
|----|----------|----------------------|:--------:|:-------:|:----------:|-------|
| `mock` | Mock | In-process | ✓ | Simulated | Simulated | Dev/CI default |
| `vonage` | Vonage | REST SDK + JWT webhook | ✓ | JSON + JWT | JSON + JWT | **Implemented** |
| `twilio` | Twilio | REST SDK + form webhook | ✓ | Form + HMAC-SHA1 | Form + HMAC | Scaffold exists |

### 5.2 Tier 2 — Phase 2 — API lane

| ID | Provider | Integration technique | Notes |
|----|----------|----------------------|-------|
| `telnyx` | Telnyx | REST JSON + Ed25519 webhook | Standard CPaaS adapter |
| `bandwidth` | Bandwidth | REST JSON + callbacks | Standard CPaaS adapter |
| `zoom` | Zoom Phone | OAuth S2S + `POST /phone/sms/messages` + `phone.sms_received` webhook | Per-user sender mapping; CRC webhook validation |

### 5.3 Tier 3 — Phase 3 — mixed lanes

| ID | Provider | Lane | Integration technique | Notes |
|----|----------|------|----------------------|-------|
| `google_voice` | Google Voice | **B** | Browser worker — DOM/BOM on `voice.google.com` | No official API; same approach as prior repos |
| `browser_advertiser` | Advertiser / web dialer (generic) | **B** | Browser worker — configurable URL + selector map | Super Admin registers per advertiser portal |
| `ringox` | RingoX (ringox.cloud) | A or B | REST if API available; else browser lane | TBD with vendor |
| `3cx` | 3CX PBX | **A** | Generic SMS API bridge or proxy via Tier 2 CPaaS | PBX integration |

**Out of scope for now:** Vikye (deferred — no adapter work until vendor spec confirmed).

### 5.4 Browser automation lane (Lane B)

Used when a dialer has **no stable public API** or when Super Admin deliberately routes **advertiser accounts** through the vendor’s web UI.

#### 5.4.1 Prior art (internal reference)

The team has already built this pattern in **`Users Automation Google Workspace`** (`D:\Users Automation Google Workspace`):

- Playwright **`launch_persistent_context`** — logged-in session survives restarts
- Wait for user login + 2FA in visible or headless browser
- DOM selectors for compose, send, read inbox (`domcontentloaded`, role/text locators)
- Screenshot + structured result on failure

Google Voice and advertiser adapters **reuse this architecture**, not a one-off hack.

#### 5.4.2 Supported browser engines (Super Admin chooses per profile)

| Engine | Stack | Best for |
|--------|-------|----------|
| **Persistent Chromium** | Python + Playwright `launch_persistent_context` | Linux servers, headless VPS, CI; matches prior Google Workspace automation |
| **PyQt6 + QWebEngine** | Python desktop-style embedded browser | Windows hosts, manual 2FA login, long-lived sessions with visible window optional |

Both engines implement the same **`BrowserAdapter` contract** (send, list threads, read inbound, mark read).

#### 5.4.3 DOM/BOM automation contract

```python
# automation-worker/adapters/base_browser_adapter.py

class BrowserAdapter:
    adapter_id: str          # e.g. google_voice, browser_advertiser
    profile_path: str        # encrypted persistent profile dir

    async def ensure_session(self) -> SessionStatus
    async def send_sms(self, to: str, text: str) -> SendResult
    async def poll_inbound(self, since: datetime) -> list[InboundEvent]
    async def health(self) -> HealthStatus
```

Selector maps stored in DB (`browser_profiles.selector_json`) so Super Admin can update DOM paths without redeploying when a vendor tweaks CSS.

#### 5.4.4 Worker service architecture

```text
Node Messaging API
      │  enqueue job (Redis/BullMQ or HTTP to worker)
      ▼
automation-worker/          ← Python service (FastAPI or queue consumer)
      ├── profiles/         ← encrypted Chromium user-data dirs
      ├── adapters/
      │     ├── google_voice.py
      │     └── generic_web_dialer.py   ← advertiser template
      └── engines/
            ├── playwright_persistent.py
            └── pyqt6_webengine.py
      ▼
Web dialer UI (voice.google.com, advertiser portal, etc.)
```

**FR-BRW-01:** Browser jobs never block Node webhook handlers.  
**FR-BRW-02:** One persistent profile per sender number (or per advertiser account).  
**FR-BRW-03:** Super Admin triggers interactive login; session cookies stored encrypted on disk.  
**FR-BRW-04:** Inbound via `poll_inbound` on interval + optional email-forward fallback for Google Voice.  
**FR-BRW-05:** Rate limits stricter than API lane (e.g. 1 msg/sec, daily cap per profile).  
**FR-BRW-06:** Worker returns normalized `SendResult` — Node stores `provider=internal` only; never expose `google_voice` to customers.  
**FR-BRW-07:** Advertiser orgs assigned `adapter_type=browser` in Super Admin; Admin/User unchanged.

#### 5.4.5 Google Voice (primary browser adapter)

| Requirement | Detail |
|-------------|--------|
| URL | `https://voice.google.com` |
| Send | DOM: open conversation → fill message box → click send |
| Inbound | Poll conversation list + parse thread DOM; optional Gmail forward ingest as backup |
| Auth | Interactive login first run; persistent profile thereafter |
| Isolation | Dedicated worker pool; failure → generic customer error |
| Limits | Google-imposed SMS caps enforced internally |

#### 5.4.6 Advertiser / generic web dialer

Super Admin registers a **browser profile template**:

```json
{
  "adapter_id": "browser_advertiser",
  "base_url": "https://advertiser-portal.example.com",
  "selectors": {
    "login_email": "#email",
    "compose_button": "[data-action=compose]",
    "to_input": "input[name=phone]",
    "message_input": "textarea.message",
    "send_button": "button.send"
  },
  "poll_interval_seconds": 15
}
```

Used for any advertiser or dialer vendor that only offers a web console.

### 5.5 Adapter registration rules

**FR-PROV-07a:** API provider → `server/services/providers/{id}Provider.js` (Node).  
**FR-PROV-07b:** Browser provider → `automation-worker/adapters/{id}.py` (Python).  
**FR-PROV-07c:** Router treats both lanes uniformly — same `sendTextMessage` entry point, same sanitized customer response.  
**FR-PROV-07d:** **Zero changes** to customer UI when adding either lane.

### 5.6 3CX special requirements

3CX does not send SMS itself — it bridges to a provider. Two supported patterns:

1. **Proxy pattern (preferred):** SignalMint uses Twilio/Telnyx/Bandwidth adapter; 3CX trunk points webhooks to SignalMint; SignalMint forwards normalized events to 3CX Generic SMS webhook if dual-delivery needed.
2. **Native Generic SMS adapter:** SignalMint implements [3CX Generic SMS API](https://www.3cx.com/community/threads/generic-sms-api-response-format.126573/) as a provider that 3CX calls directly.

---

## 6. Credential & Bootstrap Strategy

### 6.1 `.env` bootstrap (locked)

On first boot, `server/.env` provides:

```text
# Core
PORT=5000
JWT_SECRET=
MASTER_ENCRYPTION_KEY=
DATABASE_URL=postgresql://...

# Bootstrap providers (optional — seeds Super Admin console)
VONAGE_MOCK_MODE=true
VONAGE_API_KEY=
VONAGE_API_SECRET=
VONAGE_SIGNATURE_SECRET=
VONAGE_DEFAULT_FROM=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Public URL for webhook registration (Super Admin only UI)
PUBLIC_BACKEND_URL=
```

**FR-CRED-01:** Startup migration reads env vars and **upserts** into `providers` table if empty (bootstrap once).  
**FR-CRED-02:** After bootstrap, **Super Admin DB credentials take precedence** over env for that provider row.  
**FR-CRED-03:** Env vars never returned via any non–Super Admin API.  
**FR-CRED-04:** All secrets encrypted at rest with `MASTER_ENCRYPTION_KEY`.

---

## 7. PostgreSQL Migration (Phase 1 — first priority)

### 7.1 Why now

SQLite blocks concurrent webhook writes, multi-tenant isolation, and production scaling. **No further feature work ships on SQLite.**

### 7.2 Migration requirements

| ID | Requirement |
|----|-------------|
| FR-DB-01 | Replace `better-sqlite3` with `pg` + query layer (keep SQL similar; optional Drizzle/Knex) |
| FR-DB-02 | `DATABASE_URL` in `.env`; Docker Compose with Postgres for local dev |
| FR-DB-03 | Versioned migrations (`server/migrations/*.sql`) |
| FR-DB-04 | Seed script ported to Postgres |
| FR-DB-05 | Smoke tests run against Postgres |
| FR-DB-06 | SQLite deprecated; remove after migration verified |

### 7.3 Schema additions for v3

```sql
-- Roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';  -- or TEXT check constraint

-- Users
ALTER TABLE users ADD COLUMN managed_by_admin_id INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN organization_id INTEGER REFERENCES organizations(id);

-- Organizations (replaces loose workspace concept for Admin scope)
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  admin_user_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Providers (Super Admin global)
ALTER TABLE providers ADD COLUMN organization_id INTEGER;  -- NULL = platform global
ALTER TABLE providers ADD COLUMN adapter_type TEXT NOT NULL;
ALTER TABLE providers ADD COLUMN capabilities_json JSONB;
ALTER TABLE providers ADD COLUMN rate_limit_per_second INTEGER DEFAULT 1;
ALTER TABLE providers ADD COLUMN is_enabled BOOLEAN DEFAULT true;

-- Numbers
ALTER TABLE numbers ADD COLUMN provider_id INTEGER REFERENCES providers(id);
ALTER TABLE numbers ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE numbers ADD COLUMN provider_number_sid TEXT;

-- Messages — strip from customer APIs at ORM/serializer layer
ALTER TABLE messages ADD COLUMN idempotency_key TEXT UNIQUE;
ALTER TABLE messages ADD COLUMN provider_id INTEGER REFERENCES providers(id);
ALTER TABLE messages ADD COLUMN internal_error_code TEXT;

-- Webhook idempotency
CREATE TABLE webhook_deliveries (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider_message_id TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, event_id)
);

-- Suspension audit
CREATE TABLE suspension_events (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  target_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,  -- suspend | unsuspend
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Browser automation profiles (Lane B)
CREATE TABLE browser_profiles (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER REFERENCES providers(id),
  organization_id INTEGER REFERENCES organizations(id),
  adapter_id TEXT NOT NULL,
  engine TEXT NOT NULL,
  profile_path_encrypted TEXT,
  base_url TEXT,
  selector_json JSONB,
  session_status TEXT DEFAULT 'logged_out',
  poll_interval_seconds INTEGER DEFAULT 15,
  rate_limit_per_second INTEGER DEFAULT 1,
  daily_cap INTEGER,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Functional Requirements (consolidated)

### 8.1 Governance (FR-GOV)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-GOV-01 | Super Admin suspends Admin → all org Users suspended | P0 |
| FR-GOV-02 | Super Admin suspends individual User | P0 |
| FR-GOV-03 | Generic suspension message; no internal leak | P0 |
| FR-GOV-04 | Super Admin CRUD for Admin accounts | P0 |
| FR-GOV-05 | Admin CRUD for Users in own org only | P0 |
| FR-GOV-06 | Role enforced on every route via middleware | P0 |

### 8.2 Opaque messaging (FR-OPAQ)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-OPAQ-01 | User/Admin API never returns `provider`, `provider_message_id`, `mode` | P0 |
| FR-OPAQ-02 | Numbers UI: show `label`, `phone_number`, `status` — not provider | P0 |
| FR-OPAQ-03 | Public `/api/health` returns `{ ok, version }` only | P0 |
| FR-OPAQ-04 | Error messages customer-safe; details in `internal_error_code` | P0 |

### 8.3 Provider management — Super Admin only (FR-PROV)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROV-01 | Super Admin CRUD providers with encrypted credentials | P0 |
| FR-PROV-02 | Router resolves by sender number → `provider_id` → adapter | P0 |
| FR-PROV-03 | Test connection + test SMS in Super Admin console only | P0 |
| FR-PROV-04 | Webhook URLs shown only in Super Admin console | P0 |
| FR-PROV-05 | Multiple enabled providers per platform | P0 |
| FR-PROV-06 | Env bootstrap on first run | P0 |
| FR-PROV-07 | Plugin adapter pattern for new providers | P0 |

### 8.4 Messaging (FR-MSG) — SMS only

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MSG-01 | All sends via provider router (API lane **or** browser worker) | P0 |
| FR-MSG-02 | Normalized internal status enum | P0 |
| FR-MSG-03 | Inbound → contact + conversation + unread | P0 |
| FR-MSG-04 | Idempotent webhook processing (API lane) | P0 |
| FR-MSG-05 | Suppression + consent checks before send | P0 |
| FR-MSG-06 | No MMS in v1 customer UI (adapters may accept; UI ignores) | P1 |

### 8.5 Browser automation (FR-BRW) — Super Admin only

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BRW-01 | Python `automation-worker` isolated from Node API process | P1 |
| FR-BRW-02 | Playwright persistent context **or** PyQt6 QWebEngine per profile | P1 |
| FR-BRW-03 | DOM/BOM selector maps stored in DB; hot-updatable | P1 |
| FR-BRW-04 | Super Admin interactive login flow for new browser profiles | P1 |
| FR-BRW-05 | Google Voice adapter (send + poll inbound) | P2 |
| FR-BRW-06 | Generic advertiser web-dialer template | P2 |
| FR-BRW-07 | Customer API identical regardless of lane — no leakage | P0 |

### 8.6 Webhooks (FR-HOOK)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-HOOK-01 | `/webhooks/{provider}/inbound` and `/status` | P0 |
| FR-HOOK-02 | Provider-specific verification middleware | P0 |
| FR-HOOK-03 | Unmatched inbound logged; HTTP 200 | P0 |
| FR-HOOK-04 | Raw payload in `webhook_logs` — Super Admin read only | P0 |

---

## 9. Target Architecture

### 9.1 Lane A — API adapter (Node)

```javascript
// server/services/providers/ProviderAdapter.js
class ProviderAdapter {
  static id;
  static lane = 'api';
  async sendSms({ to, from, text }) {}
  normalizeInbound(req) {}
  normalizeStatus(req) {}
  verifyWebhook(req) {}
}
```

### 9.2 Lane B — Browser adapter (Python worker)

Node router detects `adapter_type: browser` → `browserLaneDispatcher` → HTTP/queue to `automation-worker`:

```javascript
async function sendViaBrowser({ profileId, to, text }) {
  return workerClient.post('/send', { profileId, to, text });
}
```

Python side implements `BrowserAdapter` with Playwright persistent or PyQt6 (see §5.4).

### 9.3 Repo layout

```text
server/services/providers/       # Lane A
  providerRouter.js
  browserLaneDispatcher.js
  vonageProvider.js, twilioProvider.js, ...

automation-worker/               # Lane B
  adapters/google_voice.py
  adapters/generic_web_dialer.py
  engines/playwright_persistent.py   # prior art: Users Automation Google Workspace
  engines/pyqt6_webengine.py
```

---

## 10. Normalized Internal Model

All adapters map to the same internal types (stored in full; sanitized on outbound API):

```text
MessageStatus: sending | sent | delivered | failed | undeliverable | unsubscribed

OutboundSendResult {
  ok, provider, providerMessageId, status, internalErrorCode?, raw?
}

InboundEvent { from, to, body, providerMessageId, receivedAt }

StatusEvent { providerMessageId, status, internalErrorCode?, errorMessage? }
```

Customer API maps `accepted` → `sent`, `rejected` → `failed`, etc.

---

## 11. API Surface

### 10.1 Customer & Admin (sanitized)

| Method | Path | Roles |
|--------|------|-------|
| POST | `/api/manual-sms/send` | User, Admin |
| GET | `/api/manual-sms/history/:phone` | User, Admin |
| GET/POST | `/api/conversations/*` | User, Admin |
| GET/POST | `/api/contacts/*` | User, Admin |
| GET/POST | `/api/numbers/*` | Admin (manage), User (read assigned) |
| GET | `/api/reports/*` | Admin (no provider breakdown) |
| POST | `/api/auth/login` | Public |

### 10.2 Admin org management

| Method | Path | Roles |
|--------|------|-------|
| GET/POST/PUT/DELETE | `/api/admin/users/*` | Admin (own org), Super Admin (all) |
| POST | `/api/admin/users/:id/suspend` | Admin (own org Users), Super Admin (all) |

### 10.3 Super Admin only

| Method | Path |
|--------|------|
| GET/POST/PUT/DELETE | `/api/super/providers/*` |
| POST | `/api/super/providers/:id/test-sms` |
| GET | `/api/super/webhook-logs` |
| GET | `/api/super/audit` |
| POST | `/api/super/admins` |
| POST | `/api/super/admins/:id/suspend` |
| POST | `/api/super/users/:id/suspend` |
| GET | `/api/super/health/detail` |
| POST | `/api/super/browser-profiles/*` — CRUD Lane B profiles, trigger login |
| POST | `/api/super/browser-profiles/:id/login` — open interactive session |

### 10.4 Internal webhooks (public internet, verified)

| Method | Path |
|--------|------|
| POST | `/webhooks/vonage/inbound` · `/status` |
| POST | `/webhooks/twilio/inbound` · `/status` |
| POST | `/webhooks/telnyx/inbound` · `/status` |
| POST | `/webhooks/bandwidth/inbound` · `/status` |
| POST | `/webhooks/zoom/inbound` · `/status` |
| POST | `/webhooks/3cx/inbound` · `/status` |
| POST | `/webhooks/ringox/inbound` · `/status` |
| POST | `/webhooks/mock/inbound` · `/status` |

Internal worker (Lane B — not public customer webhooks):

| Method | Path |
|--------|------|
| POST | `/internal/worker/send` — Node → Python worker (auth: service token) |
| GET | `/internal/worker/health` |
| POST | `/internal/worker/session/login` — Super Admin triggers interactive login |

---

## 12. Implementation Phases

### Phase 1 — Foundation (current sprint)

**Goal:** PostgreSQL + roles + opaque API + provider router + Vonage/Twilio.

| # | Task | Exit criteria |
|---|------|---------------|
| 1 | PostgreSQL + migrations + Docker Compose | Smoke tests pass on Postgres |
| 2 | Roles: `super_admin`, `admin`, `user` + middleware | Route matrix enforced |
| 3 | Organizations + Admin manages Users | Admin cannot access `/api/super/*` |
| 4 | Super Admin suspend ( cascade + individual ) | Suspended user cannot send |
| 5 | API response sanitization layer | No provider fields in user/admin JSON |
| 6 | `ProviderAdapter` contract + `providerRouter` | Router picks by number |
| 7 | Env bootstrap → `providers` table | First boot seeds from `.env` |
| 8 | Refactor Vonage + complete Twilio adapter | Live send per number provider |
| 9 | Super Admin provider console (move from current admin) | Webhooks + test SMS |
| 10 | Remove SQLite | Single DB path |

### Phase 2 — Expanded providers + queue

| Task | Providers |
|------|-----------|
| Telnyx + Bandwidth adapters | Tier 2 |
| Zoom Phone SMS adapter | Tier 2 |
| Redis + BullMQ outbound queue | Rate limits per provider |
| Campaign send through unified pipeline | FR-MSG |

### Phase 3 — Browser lane + special backends

| Task | Notes |
|------|-------|
| `automation-worker/` Python service | Playwright persistent + PyQt6 engine abstraction |
| Google Voice browser adapter | DOM/BOM on voice.google.com; prior-repo pattern |
| Generic `browser_advertiser` adapter | Configurable selector map for advertiser portals |
| RingoX adapter | API if available; else browser lane |
| 3CX Generic SMS bridge | PBX integration |

### Phase 4 — Production

- HTTPS, monitoring, backups
- 10DLC / compliance flags per org
- Billing hooks (optional)

---

## 13. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | PostgreSQL | Required all environments |
| NFR-02 | Webhook p95 latency | < 500ms |
| NFR-03 | Secret encryption | AES-256 at rest |
| NFR-04 | Provider isolation | Adapter crash ≠ API crash |
| NFR-05 | Customer API | Zero provider leakage in responses/logs visible to users |
| NFR-06 | Observability | Structured logs with provider fields **Super Admin logs only** |
| NFR-07 | SMS only | Voice endpoints rejected / not implemented |

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Google Voice / browser UI changes | Selector maps in DB; Super Admin hot-update; screenshot on failure |
| RingoX API unknown | API lane if docs exist; else browser lane |
| 3CX dual-webhook complexity | Prefer proxy through Tier 2 CPaaS |
| Provider leakage via errors | Central error sanitizer; code review gate |
| Super Admin credential exposure | Separate `/api/super/*` router; audit all access |

---

## 15. Resolved decisions (formerly open questions)

| # | Question | **Decision** |
|---|----------|--------------|
| Q1 | Database timing | **PostgreSQL now** (Phase 1 task #1) |
| Q2 | Credentials | **`.env` bootstrap** → encrypted DB; Super Admin manages live creds |
| Q3 | Multi-tenant | **Organizations** with Admin scope; Super Admin platform-wide |
| Q4 | Voice | **SMS only** |
| Q5 | Provider list | **Zoom, Vonage, Twilio, Telnyx, Bandwidth, RingoX, 3CX, Google Voice** + **browser lane for advertisers** |
| Q6 | Customer backend visibility | **Fully opaque** — dialer UI only |
| Q7 | Who configures providers | **Super Admin only** |
| Q8 | Non-API dialers | **PyQt6 or Playwright persistent browser** — DOM/BOM automation worker |
| Q9 | Vikye | **Deferred** — out of scope until further notice |

### Open item

| # | Item | Action |
|---|------|--------|
| O1 | **RingoX** REST API docs | Request from ringox.cloud; use browser lane until available |

---

## 16. Acceptance Checklist

### Platform ready

- [ ] PostgreSQL live; SQLite removed
- [ ] `super_admin`, `admin`, `user` roles enforced
- [ ] Super Admin suspends any account; cascade works
- [ ] Customer API responses contain **zero** provider identifiers
- [ ] Numbers UI shows no provider names
- [ ] Env bootstrap seeds providers on first run
- [ ] Provider router sends via correct adapter per number
- [ ] Vonage + Twilio + Mock fully working
- [ ] Super Admin console exclusive for provider config
- [ ] SMS only — no voice endpoints

### Provider expansion ready (Phase 2+)

- [ ] Telnyx, Bandwidth, Zoom adapters pass smoke tests
- [ ] Browser worker service (`automation-worker/`) with Playwright persistent engine
- [ ] Google Voice adapter sends/receives via DOM/BOM
- [ ] Generic advertiser browser profile (configurable selectors)
- [ ] 3CX bridge documented and tested
- [ ] RingoX adapter when API or browser profile confirmed

---

## 17. Appendix — Current code gaps

| Component | Path | Required change |
|-----------|------|-----------------|
| SQLite database | `server/config/database.js` | Replace with Postgres |
| Vonage-only send | `server/services/smsService.js` | Provider router + sanitize responses |
| Admin = provider UI | `client-app/src/pages/AdminConsole.jsx` | Split Super Admin vs Admin surfaces |
| Provider in numbers UI | `client-app/src/pages/Numbers.jsx` | Remove provider dropdown for Admin/User |
| Twilio stubs | `server/routes/webhooks.js` | Complete + user lookup |
| Role `admin` only | `server/middleware/auth.js` | Add `super_admin`, org scoping |

---

*End of PRD v3.1*
