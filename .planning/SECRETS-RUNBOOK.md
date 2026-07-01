# SignalMint — Secrets Rotation Runbook

Operational guide for rotating credentials without downtime. All paths assume Super Admin access unless noted.

## Rotation schedule (recommended)

| Secret | Cadence | Owner |
|--------|---------|-------|
| `JWT_SECRET` | 90 days | Platform |
| `MASTER_ENCRYPTION_KEY` | Annual (requires re-encrypt) | Platform |
| `WORKER_SERVICE_TOKEN` | 90 days | Platform |
| Provider API keys | On compromise or vendor policy | Super Admin |
| `VONAGE_SIGNATURE_SECRET` | On compromise | Super Admin |
| `TWILIO_AUTH_TOKEN` | On compromise | Super Admin |

---

## 1. JWT_SECRET

**Impact:** All active sessions invalidated on change.

1. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. Update env on API host (Vercel / Render).
3. Redeploy API.
4. Users re-login (expected).

---

## 2. MASTER_ENCRYPTION_KEY

**Impact:** Provider credentials encrypted at rest cannot be decrypted with a new key without migration.

**Preferred:** Rotate provider keys in Super Admin UI instead of changing master key.

If master key must rotate:

1. Export provider list (masked) for audit.
2. Decrypt all `providers.encrypted_*` with old key (maintenance script).
3. Set new `MASTER_ENCRYPTION_KEY`, redeploy.
4. Re-enter live provider credentials via Super Admin → Add dialer / reconnect.
5. Run warm-up test per provider.

---

## 3. WORKER_SERVICE_TOKEN

**Impact:** API ↔ automation-worker auth breaks until both sides match.

1. Generate new token (32+ random bytes).
2. Update on **both** `signalmint-api` and `signalmint-worker` (Render syncs via `fromService` in `render.yaml`).
3. Redeploy worker first, then API (or simultaneous).
4. Verify: `npm run test:browser` against staging.

Local: set matching values in `server/.env` and worker env.

---

## 4. Vonage credentials

1. Create new API secret in Vonage dashboard (do not delete old until verified).
2. Vercel/Render: update `VONAGE_API_KEY`, `VONAGE_API_SECRET`.
3. If rotating webhook signing: update `VONAGE_SIGNATURE_SECRET` and Vonage console webhook config.
4. Redeploy API.
5. Super Admin → Providers → Test connection → Live test SMS (one recipient).
6. Revoke old Vonage secret.

---

## 5. Twilio credentials

1. Rotate Auth Token in Twilio console.
2. Update `TWILIO_AUTH_TOKEN` on API host.
3. Confirm `PUBLIC_BACKEND_URL` (or `RENDER_EXTERNAL_URL` on Render) matches webhook URL base.
4. Redeploy → Super Admin test SMS.
5. Revoke old token.

---

## 6. Database URL

**Neon / Render Postgres:**

1. Create new DB user/password in provider console.
2. Update `DATABASE_URL`, set `DATABASE_SSL=true` for cloud.
3. Redeploy API (migrations run on boot).
4. Revoke old DB credentials after health check passes.

---

## 7. Post-rotation verification

```powershell
Set-Location "D:\SMS Marketing App\server"
npm run smoke
npm run test:live-readiness
npm run test:deploy-readiness
```

Production:

- `GET /api/health` → `ok: true`
- Super Admin → Delivery mode banner correct
- One outbound + inbound webhook test per live provider

---

## Emergency: leaked secret in git

1. Rotate the secret immediately (steps above).
2. `git filter-repo` or BFG to purge history if needed.
3. Force-push only after team coordination.
4. Audit `audit_logs` and `webhook_logs` for anomalous activity.

---

## Environment reference

See `server/.env.example` and [TESTING.md](./TESTING.md) for full variable list.

Render auto-injects `RENDER_EXTERNAL_URL` — used as webhook base when `PUBLIC_BACKEND_URL` is unset.

Vercel auto-injects `VERCEL_URL` — resolved to `https://…` for webhooks when `PUBLIC_BACKEND_URL` is unset.
