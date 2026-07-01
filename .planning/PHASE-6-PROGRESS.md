# Phase 6 — M7 Queue & campaigns (progress)

**Status: ✅ Complete** (sandbox; BullMQ when Redis available)

| Step | Task | Status |
|------|------|--------|
| 6a | Redis + BullMQ driver | ✅ |
| 6b | Per-recipient job fan-out | ✅ |
| 6c | Rate limit via staggered job delays (`send_rate`) | ✅ |
| 6d | Campaign progress API + UI polling | ✅ |
| 6e | Dead letters + retry failed | ✅ |
| 6f | Memory driver fallback (no Redis) | ✅ |

## What shipped

### Queue architecture
- `server/services/queue/campaignDriver/` — `memory` (in-process) or `bullmq` (Redis)
- Driver auto-select: `REDIS_URL` → BullMQ, else memory (`CAMPAIGN_QUEUE_DRIVER=auto`)
- One BullMQ job per recipient with idempotent `jobId`
- Standalone worker: `npm run campaign-worker` (scale workers separately)

### Campaign service
- `prepareCampaignSend` — seed pending recipients + stats
- `sendCampaignRecipient` — single send unit (used by both drivers)
- `maybeFinalizeCampaign` — auto-complete when no pending recipients
- `getCampaignProgress` — percent, sent/failed/pending
- `retryFailedRecipients` — re-queue failed + resolve dead letters

### API
- `GET /api/campaigns/:id` — includes `progress`, `deadLetters`
- `POST /api/campaigns/:id/retry-failed` — manual retry

### UI
- Campaigns page: progress bar, resume, retry failed, live polling (2.5s)

### Infra
- `docker-compose.yml` — Redis :6379
- Migration `006_campaign_queue.sql` — `campaign_job_dead_letters`

### Tests
- `npm run test:campaign-fanout` — 5-recipient memory/BullMQ fan-out
- `npm run test:campaign-bullmq` — BullMQ only (skips without `REDIS_URL`)

## Local with Redis

```powershell
docker compose up -d
# server/.env: REDIS_URL=redis://localhost:6379
npm run dev
npm run test:campaign-bullmq
```

## Scale path

1. Render Redis addon → set `REDIS_URL` on API
2. Run `npm run campaign-worker` as separate Render worker service
3. Increase `CAMPAIGN_WORKER_CONCURRENCY` for throughput

50k campaigns: fan-out creates N jobs; tune concurrency + `send_rate` per campaign/org.
