# Phase 5 — M6 Ops & scale (progress)

**Status: ✅ Complete** (sandbox / no live API keys)

| Step | Task | Status |
|------|------|--------|
| 5a | CI expanded (state, dialers, browser, compliance) | ✅ |
| 5b | `render.yaml` API + worker + Postgres + health checks | ✅ |
| 5c | Secrets rotation runbook | ✅ `.planning/SECRETS-RUNBOOK.md` |
| 5d | `TESTING.md` + `AUDIT.md` refresh | ✅ |
| 5e | Deploy readiness test | ✅ `npm run test:deploy-readiness` |
| 5f | `RENDER_EXTERNAL_URL` / `VERCEL_URL` webhook fallback | ✅ |

## What shipped

### Deploy parity
- `render.yaml`: health checks on API (`/api/health`) and worker (`/health`)
- `docker-compose.yml`: Postgres + automation-worker with healthchecks (local prod parity)
- `server/lib/publicUrl.js` — resolves public URL from env, Render, or Vercel

### Ops docs
- [SECRETS-RUNBOOK.md](./SECRETS-RUNBOOK.md) — rotation procedures
- [TESTING.md](../TESTING.md) — full automated test matrix
- [AUDIT.md](../AUDIT.md) — current platform snapshot (v3.2)

### Tests
- `npm run test:deploy-readiness` — blueprint, Docker, API/worker health

## One-click deploy path (Render)

1. Push to GitHub
2. Render Dashboard → New Blueprint → connect repo
3. Blueprint applies `render.yaml` (API + worker + DB)
4. Optional: set `VONAGE_*` / `TWILIO_*`, flip `SMS_SANDBOX_MODE=false`
5. Verify: `GET https://<api-host>/api/health`

Worker disk (`/data/profiles`) persists browser sessions across deploys.

## Next: Phase 6 — M7 Queue & campaigns

Redis + BullMQ worker, campaign fan-out, progress UI, pause/resume.

See [ROADMAP-BIG.md](./ROADMAP-BIG.md).
