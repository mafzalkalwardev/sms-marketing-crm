# Phase 2 — M2 Live API Dialers (progress)

See [ROADMAP-BIG.md](./ROADMAP-BIG.md) Phase 2.

| Step | Task | Status |
|------|------|--------|
| 2a | Live readiness checklist + `PUBLIC_BACKEND_URL` | ✅ Done |
| 2b | Provider health cron | ✅ Done |
| 2c | Webhook dead-letter + retry | ✅ Done |
| 2d | Per-provider cost estimates | ✅ Done |
| 2e | Vercel live creds (Vonage/Twilio) | 🔲 Manual — set in Vercel dashboard |
| 2f | Flip `SMS_SANDBOX_MODE=false` in prod | 🔲 After creds |

## What shipped

### Live readiness (`liveReadinessService.js`)
- `getLiveReadiness()` — sandbox flag, credential checks, `PUBLIC_BACKEND_URL`, blockers list
- Exposed on `GET /api/super/health/detail` and `GET /api/super/providers/status`
- Super Admin shows blockers in delivery banner

### Provider health cron (`providerHealthScheduler.js`)
- Polls enabled API providers every 5 min (configurable)
- Stores `health_ok`, `health_mode`, `health_error` on `providers` row
- Super Admin table shows health badge

### Webhook dead letters (`webhookDeadLetterService.js`)
- Failed status/inbound webhooks → `webhook_dead_letters` table
- Delivery recorded only after successful processing (safe retry)
- `GET /api/super/webhook-dead-letters` + `POST .../retry`
- Super Admin dead-letter panel with Retry button

### Cost estimates
- `estimateCost()` uses per-provider rates (Vonage, Twilio, Telnyx, etc.)

### Tests
- `npm run test:live-readiness`
- `npm run test:webhook-replay`

## Go live checklist (manual)

1. Vercel env: `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_SIGNATURE_SECRET`, `VONAGE_DEFAULT_FROM`
2. Vercel env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_DEFAULT_FROM`
3. Vercel env: `PUBLIC_BACKEND_URL=https://signalmint-api.vercel.app`
4. Set `SMS_SANDBOX_MODE=false` and `VONAGE_MOCK_MODE=false`
5. Register webhook URLs from Super Admin catalog with Vonage/Twilio consoles
6. Send warm-up from Super Admin → verify inbound + status webhooks
