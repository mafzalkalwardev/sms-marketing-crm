# Phase 3 — M3 Browser Lane Production (progress)

See [ROADMAP-BIG.md](./ROADMAP-BIG.md) Phase 3.

| Step | Task | Status |
|------|------|--------|
| 3a | Playwright chromium in Docker image | ✅ Done |
| 3b | Automated inbound poll scheduler | ✅ Done |
| 3c | Session persistence + re-login detection | ✅ Done |
| 3d | Selector version migration (v1 → v2) | ✅ Done |
| 3e | Render worker deploy config | ✅ Done |
| 3f | Live worker (`WORKER_SANDBOX_MODE=false`) | 🔲 Manual deploy |

## What shipped

### Worker v1.1 (`automation-worker/`)
- **Session store** — in-process cache per profile
- **Login detection** — `login_form` vs `login_indicator` selectors
- **`POST /session/status`** — real session check with full profile payload
- **Send/poll** — block when logged out; return `needsRelogin`
- **Pre-send session gate** — avoids silent failures

### API
- `browserLaneDispatcher` uses `POST /session/status` (not stale GET)
- Poll scheduler logs `needsRelogin` warnings
- **`POST /api/super/browser-profiles/:id/migrate-selectors`**
- Migration `005_browser_lane_prod.sql` — `selector_version`, `inbound_cursor`
- **`browserSelectorMigration.js`** — v1/v2 selector sets

### Super Admin UI
- Selector version column
- **Check session**, **Upgrade selectors** buttons

### Deploy
- **`render.yaml`** — `signalmint-worker` Docker service with persistent profile disk
- **`automation-worker/.env.example`**

### Tests
- `npm run test:browser-session`

## Go live (browser lane)

1. Deploy `signalmint-worker` on Render (or Docker Compose locally)
2. Set `WORKER_SANDBOX_MODE=false` on worker
3. Set `AUTOMATION_WORKER_URL` + matching `WORKER_SERVICE_TOKEN` on API
4. Super Admin → add Google Voice backend → **Login** → complete auth in persistent profile
5. **Check session** → should show `logged_in`
6. Poll scheduler handles inbound automatically

## Next: Phase 4 remaining

- Compliance page + STOP audit export
- Mobile-responsive inbox
