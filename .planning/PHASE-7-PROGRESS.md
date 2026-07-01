# Phase 7 — Enterprise & compliance (progress)

**Status: ✅ Complete** (sandbox)

| Step | Task | Status |
|------|------|--------|
| 7a | Multi-org tenancy hardening | ✅ `tenancyService`, workspace backfill, org guards |
| 7b | SOC2 audit CSV export | ✅ `GET /api/admin/audit-logs/export` |
| 7c | White-label branding per org | ✅ Admin UI + `/api/user/branding` |
| 7d | API keys for integrations | ✅ `/api/v1/*` + Admin key management |
| 7e | Message retention / HIPAA hook | ✅ Scheduler + org `message_retention_days` |

## What shipped

### Tenancy (`007_enterprise.sql`)
- `users.workspace_id` backfilled from organization
- Second seed org: **Acme Field Services** (workspace 2) for isolation tests
- `assertUserInOrg` on admin user mutations
- JWT auth enriches `workspace_id` + `organization_id` on every request

### Branding
- Org fields: `brand_name`, `logo_url`, `primary_color`, `support_email`
- Customer UI applies `--brand` CSS variable via `useBranding`
- Sidebar logo shows white-label name

### API keys
- Format: `smk_<hex>` — scopes `contacts:read`, `messages:send`
- `GET /api/v1/contacts`, `POST /api/v1/messages/send`
- Admin: create / list / revoke keys

### Compliance / retention
- `message_retention_days` per org — daily purge scheduler
- `hipaa_mode` flag — purge events logged to `audit_logs`
- Audit export: CSV with actor, target, action, details (up to 5000 rows)

### Tests
- `npm run test:enterprise`

## SignalMint roadmap complete (Phases 1–7)

All modules M1–M7 delivered in sandbox mode. Live SMS + worker deploy when credentials are ready.
