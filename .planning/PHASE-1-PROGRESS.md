# Phase 1 — M1 Core Hardening (progress)

**Status: ✅ Complete**

Track step-by-step delivery. See [ROADMAP-BIG.md](./ROADMAP-BIG.md) for full phase scope.

| Step | Task | Status |
|------|------|--------|
| 1a | Message timeline UI (inbox) | ✅ Done |
| 1b | Monthly usage in workspace API + inbox | ✅ Done |
| 1c | Subscription limit enforcement on send | ✅ Done |
| 2 | DB idempotency keys for `sendSms` | ✅ Done |
| 3 | Full audit on message state transitions | ✅ Done |
| 4 | Campaign broadcast queue stub | ✅ Done |
| 5 | Load test harness (10k msgs/day) | ✅ Done |

## Step 5 — what shipped

- **`scripts/load-test.js`** — concurrent sandbox sends with idempotency + limit checks
- **`npm run test:load`** — default 100 messages
- **`npm run test:load:stress`** — 1000 messages locally
- Env: `LOAD_TEST_COUNT`, `LOAD_TEST_CONCURRENCY`, `LOAD_TEST_DAILY_TARGET` (default 10000)
- CI runs 30-message subset

## Phase 1 exit criteria

| Criterion | Met |
|-----------|-----|
| Limits enforced on send | ✅ |
| No duplicate sends (idempotency keys) | ✅ |
| 10k msgs/day capacity (projected throughput) | ✅ |
| Campaign async queue | ✅ |
| Message audit trail | ✅ |

## Next: Phase 2 — M2 Live API dialers

See [ROADMAP-BIG.md](./ROADMAP-BIG.md) Phase 2.
