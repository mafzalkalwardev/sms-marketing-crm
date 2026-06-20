# SMS CRM Audit

## What Exists

- Root contains `README.md`, `.gitignore`, `sms_marketing_crm_app_plan.md`, `server/`, `client-app/`, and an old partial `client/` folder.
- Git remote is configured as `https://github.com/mafzalkalwardev/sms-marketing-crm.git`.
- Current branch is `saas-rebuild`.
- Backend is an Express app in `server/` with routes for auth, contacts, manual SMS, campaigns, inbox, numbers, reports, and Vonage webhooks.
- Backend uses `better-sqlite3`, JWT auth, bcrypt password hashing, dotenv, CORS, Express rate limiting, and Vonage SDK.
- SQLite tables exist for users, workspaces, contacts, campaigns, messages, replies, conversations, numbers, suppression list, and webhook logs.
- `server/.env.example` documents Vonage and JWT variables.
- `client-app/` currently has React dependencies but is not using a normal React `src/` structure.
- `client-app/public/` currently contains a compiled/static single-file React app from earlier recovery work.
- The old `client/` folder is a partial Vite/React app and is not the app currently being served.

## What Is Broken

- Frontend violates the requested structure: the app lives in `public/app.js` instead of `client-app/src/`.
- Frontend still depends on CDN React scripts in `public/index.html`.
- `client-app` no longer uses CRA/React scripts normally because `package.json` was changed to a custom static build/server.
- Old `client/` folder is incomplete and confusing.
- Backend SMS route always tries Vonage, so local testing fails when credentials are missing.
- Manual SMS does not return `mode`, provider message id, or `sent_mock` status.
- Manual SMS does not create/update conversations consistently.
- Manual SMS does not expose `GET /api/manual-sms/history/:phone`.
- Campaign API is missing detail, preview, send, pause, and cancel endpoints.
- Inbox API is missing `GET /api/inbox/conversations/:id/messages`.
- Numbers API is missing update and delete endpoints.
- Reports are minimal and do not include delivery/reply rates or recent activity.
- Webhooks do not create/update conversations or unread counts.
- Database schema is missing required `messages.conversation_id` and `conversations.unread_count` for existing databases.
- `JWT_SECRET` is used without an explicit startup check.
- README points to the old `client` folder and does not explain mock SMS mode.
- There is no backend smoke test script.
- There is no frontend E2E smoke test or TESTING.md.

## What Is Missing

- Professional React app structure under `client-app/src/`.
- Pages for Settings and Compliance.
- Reusable UI components such as Sidebar, Topbar, StatCard, Button, Input, EmptyState, MessageBubble, and Dialpad.
- OpenPhone/Google Voice style manual SMS page with conversation rail, thread, dialpad, sender selector, segment/cost display, and contact detail panel.
- Inbox with search, unread count, last preview, selected thread, message bubbles, reply composer, and notes/tags UI.
- Contacts search/filter/edit UX.
- Campaign recipient preview and mock campaign send flow.
- Sender number default selector and status controls.
- Mock SMS mode for local development.
- Delivery webhook simulation flow.
- Smoke tests and setup/testing docs.
- Clean staged commits and push to GitHub.

## Rebuild Plan

1. Clean project structure:
   - Rebuild `client-app` as the real React app with `src/`.
   - Remove generated/static frontend artifacts from `public/`.
   - Remove the stale partial `client/` folder.
   - Update `.gitignore` to ignore `.env`, SQLite DB files, build outputs, node modules, and test artifacts.

2. Stabilize backend:
   - Add explicit startup validation for `JWT_SECRET`.
   - Add database migrations for missing columns.
   - Add shared backend helpers for validation, SMS segment/cost calculation, mock/Vonage provider mode, contacts, and conversations.
   - Implement all required route endpoints.
   - Make manual SMS use mock mode when Vonage credentials are missing.
   - Enforce suppression/unsubscribe checks.
   - Create/update conversations for sent and inbound messages.
   - Add webhook logging, inbound STOP handling, and delivery status updates.

3. Rebuild frontend:
   - Create `client-app/src/` structure with pages, components, auth context, API client, and CSS.
   - Implement Dashboard, Contacts, Manual SMS, Inbox, Campaigns, Numbers, Reports, Settings, and Compliance.
   - Use a polished SaaS layout with sidebar/topbar, cards, tables, modals, empty/loading/error states.
   - Make Manual SMS feel like a real business phone app.
   - Make Inbox feel like a real two-way messaging app.

4. Add tests:
   - Add `server/scripts/smoke-test.js`.
   - Add frontend Playwright smoke test script if available.
   - Add `TESTING.md` with automated and manual test steps.

5. Documentation and git:
   - Update README with setup, mock mode, Vonage setup, and run commands.
   - Run backend smoke test, frontend build, and browser smoke test.
   - Commit in clean stages.
   - Push `saas-rebuild` to GitHub.

## Commands I Will Run

```powershell
Set-Location "D:\SMS Marketing App\server"
npm install
npm run dev
node scripts/smoke-test.js

Set-Location "D:\SMS Marketing App\client-app"
npm install
npm run build
npm start
npx playwright test

Set-Location "D:\SMS Marketing App"
git status --short
git add .
git commit -m "..."
git push -u origin saas-rebuild
```

## Known MVP Limitations

- Campaign sending will be database-backed mock/serial MVP logic, not Redis/BullMQ queue yet.
- SQLite remains the MVP database, per project scope.
- Vonage sends require valid `VONAGE_API_KEY`, `VONAGE_API_SECRET`, and sender number in `server/.env`.
- Webhook testing is local unless exposed through ngrok or a deployed HTTPS backend.
